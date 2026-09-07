/**
 * The one place that opens a Postgres connection for the scripts in `scripts/`.
 *
 * ## The bug this module exists to make unrepeatable
 *
 * The first `smoke:admin` run leaked four disposable auth accounts. The cause
 * was not the assertion logic, and it was not a missing `finally` — it was
 * this:
 *
 *   A `pg.Client` is an EventEmitter. When its socket drops, it emits `error`.
 *   An EventEmitter that emits `error` with **no `error` listener attached**
 *   rethrows it as an uncaught exception, and Node tears the process down on
 *   the spot. That is not an exception travelling up the stack — nothing
 *   unwinds — so no `try/finally` anywhere runs, and the cleanup block that
 *   would have deleted the fixtures never executes.
 *
 * `try/finally` cannot defend against this. A listener can, because it turns a
 * process-killing event into an ordinary rejected promise that `finally` can
 * see. Every client this module hands out has one attached before it connects.
 *
 * The fix originally landed hand-copied into three of the eight scripts that
 * use `pg`; the other five kept the bug for exactly as long as the copy-paste
 * lasted. Hence one module.
 *
 * ## Pooler mode is a real choice, not boilerplate
 *
 * This project (created 2026-08) is pooler-only — `db.<ref>.supabase.co` does
 * not resolve — so everything goes through the connection pooler, which offers
 * two ports with genuinely different semantics:
 *
 *   "session"     port 5432. One backend held for the whole connection, so
 *                 `set local role` / `set_config(...)` behave exactly as they
 *                 would on a direct connection. **Required** by any script that
 *                 impersonates a role to exercise RLS.
 *   "transaction" port 6543. A backend is leased per transaction. Cheaper and
 *                 far more tolerant of connect/end churn, but session state
 *                 does not survive between statements — so it is only safe for
 *                 plain queries.
 *
 * Pick "session" if the script ever says `set local role`. Otherwise
 * "transaction".
 */
import pg from "pg";

import { assertTargetIsSafeForCI, projectRef, readEnvValue } from "./env";

export type PoolerMode = "session" | "transaction";

/**
 * The pooler host is REGION-specific — `aws-0-<region>.pooler.supabase.com` —
 * so a second project in another region needs a different one. Overridable for
 * exactly that reason; the default is this project's own region.
 */
const POOLER_HOST = readEnvValue("SUPABASE_DB_HOST") ?? "aws-0-eu-central-1.pooler.supabase.com";
const POOLER_PORT: Record<PoolerMode, number> = { session: 5432, transaction: 6543 };

function clientConfig(mode: PoolerMode): pg.ClientConfig {
  // The other chokepoint, alongside readServiceRoleKey(). Direct Postgres access
  // is write access, so CI must not reach production through it either.
  assertTargetIsSafeForCI();

  const password = readEnvValue("SUPABASE_DB_PASSWORD");
  if (!password) {
    throw new Error(
      "SUPABASE_DB_PASSWORD is missing. Put it in .env, like the smoke scripts expect.",
    );
  }

  return {
    host: POOLER_HOST,
    port: POOLER_PORT[mode],
    database: "postgres",
    user: `postgres.${projectRef}`,
    password,
    ssl: { rejectUnauthorized: false },
  };
}

/**
 * Did the *connection* fail, as opposed to the *statement*?
 *
 * The distinction decides whether retrying is honest. A dropped socket is
 * infrastructure noise and re-running the work gives the same answer. A SQL
 * error — a unique violation, a trigger's `raise`, RLS refusing an insert with
 * 42501 — is very often the exact answer an assertion is waiting for, so it
 * must propagate untouched. Retrying one of those would turn a passing test
 * into a confusing one.
 */
export function isConnectionError(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "57P01" || // admin_shutdown — the pooler recycled the backend
    /connection terminated|connection error|socket hang up|server closed the connection/i.test(
      message,
    )
  );
}

let crashGuardInstalled = false;

/**
 * Make a crash that skips cleanup *loud* instead of silent.
 *
 * Installed automatically the first time any client is created, so no script
 * can forget it. This does not change the outcome — an uncaught exception still
 * exits non-zero without running `finally` — it only ensures the run says so,
 * because the original leak was discovered by noticing stray rows days later
 * rather than by reading the output.
 */
function installCrashGuard() {
  if (crashGuardInstalled) return;
  crashGuardInstalled = true;
  process.on("uncaughtException", (error: Error) => {
    console.error("\n[pg] UNCAUGHT EXCEPTION — cleanup did NOT run. Check for leftover fixtures.");
    console.error(error);
    process.exit(1);
  });
}

const dropped = new WeakSet<pg.Client>();

/** Has this client's socket dropped? A dropped client can never be reused. */
export function isDropped(client: pg.Client) {
  return dropped.has(client);
}

/**
 * A `pg.Client` with an `error` listener already attached — the whole point of
 * this module. Not yet connected; see `connectGuarded`.
 *
 * `label` only shapes the warning text, so a script holding several
 * connections can tell which one died.
 */
export function createGuardedClient(mode: PoolerMode, label = "pg") {
  installCrashGuard();
  const client = new pg.Client(clientConfig(mode));
  client.on("error", (error: Error) => {
    dropped.add(client);
    console.warn(`[${label}] pooled connection dropped: ${error.message}`);
  });
  return client;
}

/** `createGuardedClient`, connected. */
export async function connectGuarded(mode: PoolerMode, label = "pg") {
  const client = createGuardedClient(mode, label);
  await client.connect();
  return client;
}

/**
 * End every client without letting cleanup throw.
 *
 * `end()` on an already-dead connection rejects. Inside a `finally` that
 * rejection would replace the real failure with a meaningless one, so it is
 * swallowed here on purpose — this is the last thing a script does.
 */
export async function endQuietly(...clients: (pg.Client | null | undefined)[]) {
  await Promise.all(clients.map((client) => client?.end().catch(() => {})));
}

export type PgSession = {
  /**
   * Run `work` on the shared connection, retrying **once** and **only** on a
   * connection failure.
   *
   * `work` may therefore run twice, so it must be idempotent — reads,
   * assertions and `delete` statements all are. For anything that is not
   * (an `insert ... returning id`, a multi-step fixture build) use `once`.
   */
  withPg<T>(work: (client: pg.Client) => Promise<T>): Promise<T>;
  /** Like `withPg`, but never retries. For work that is not idempotent. */
  once<T>(work: (client: pg.Client) => Promise<T>): Promise<T>;
  /** Close the shared connection. Safe to call more than once. */
  close(): Promise<void>;
};

/**
 * One lazily-opened, reconnecting connection shared by every call.
 *
 * Two reasons it is shared rather than one-per-query. First, connection churn
 * against the pooler is what provoked the drop in the first place. Second, and
 * more important: the connection that runs a script's cleanup must be reachable
 * *after* something has already gone wrong, and a session that transparently
 * reopens a dead connection gives cleanup that guarantee. A fresh unguarded
 * client opened inside a `finally` — which is what two of these scripts used to
 * do — is the single most dangerous shape available, because it is the one
 * connection whose death actually costs you rows.
 */
export function createPgSession(mode: PoolerMode, label = "pg"): PgSession {
  let shared: pg.Client | null = null;

  async function connect() {
    if (shared && !isDropped(shared)) return shared;
    shared = await connectGuarded(mode, label);
    return shared;
  }

  async function discard(client: pg.Client) {
    if (shared === client) shared = null;
    await client.end().catch(() => {});
  }

  async function once<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
    return work(await connect());
  }

  async function withPg<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const client = await connect();
      try {
        return await work(client);
      } catch (error) {
        if (attempt >= 1 || !isConnectionError(error)) throw error;
        await discard(client);
        console.warn(`[${label}] retrying on a fresh connection`);
      }
    }
  }

  async function close() {
    const client = shared;
    shared = null;
    if (client) await client.end().catch(() => {});
  }

  return { withPg, once, close };
}

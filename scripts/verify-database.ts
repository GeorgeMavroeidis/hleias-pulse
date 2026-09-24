import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import pg from "pg";
import { format, resolveConfig } from "prettier";
import { databaseCatalog, fixtureIdentities } from "./lib/database-catalog";
import { localStackEnv } from "./lib/local-stack";
import { isConnectionError } from "./lib/pg";

// No arbitrary CLI arguments: this entrypoint can only reset the local stack.
assert.equal(process.argv.length, 2, "db:verify accepts no target or reset flags");
function supabaseWithEnv(environment: NodeJS.ProcessEnv, ...args: string[]) {
  return execFileSync("npx", ["--no-install", "supabase", ...args], {
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 16 * 1024 * 1024,
  });
}
function supabase(...args: string[]) {
  return supabaseWithEnv(process.env, ...args);
}
function run(script: string, env: NodeJS.ProcessEnv, args: string[] = []) {
  console.log(`\n[verify] ${script} ${args.join(" ")}`);
  const result = spawnSync("npm", ["run", script, "--", ...args], {
    env,
    stdio: "inherit",
    timeout: 5 * 60_000,
  });
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT") {
    throw new Error(`${script} timed out after 5 minutes`, { cause: result.error });
  }
  if (result.error) throw new Error(`${script} could not start`, { cause: result.error });
  assert.equal(result.status, 0, `${script} exited with status ${result.status ?? result.signal}`);
}
async function catalog(env: NodeJS.ProcessEnv, fixtures = false) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const db = new pg.Client({
      host: env.SUPABASE_DB_HOST,
      port: Number(env.SUPABASE_DB_PORT),
      user: env.SUPABASE_DB_USER,
      password: env.SUPABASE_DB_PASSWORD,
      database: "postgres",
    });
    let dropped = false;
    // pg emits socket errors outside query promises. Without this listener,
    // Node exits before a failed smoke's cleanup snapshot can be reported.
    db.on("error", (error: Error) => {
      dropped = true;
      console.warn(`[verify] Snapshot connection dropped: ${error.message}`);
    });
    try {
      await db.connect();
      const snapshot = JSON.stringify(
        await (fixtures ? fixtureIdentities(db) : databaseCatalog(db)),
      );
      if (dropped) throw new Error("Snapshot connection dropped during catalog read");
      return snapshot;
    } catch (error) {
      if (attempt === 1 || (!dropped && !isConnectionError(error))) throw error;
      console.warn("[verify] Retry snapshot on a fresh local connection");
    } finally {
      await db.end().catch(() => {});
    }
  }
  throw new Error("Could not read local database snapshot");
}

console.log("[verify] Start disposable local Supabase");
// A loopback listener can be an SSH tunnel to production. The CLI may run
// initialization SQL before reporting a port collision, so check first.
const config = readFileSync("supabase/config.toml", "utf8");
const dbSection = config.split(/^\[db\]\s*$/m)[1]?.split(/^\[/m)[0];
const dbPort = Number(dbSection?.match(/^port\s*=\s*(\d+)/m)?.[1]);
assert(Number.isInteger(dbPort) && dbPort > 0 && dbPort < 65536, "Cannot read local DB port");
await new Promise<void>((resolve, reject) => {
  const listener = createServer();
  listener.once("error", () =>
    reject(
      new Error(
        `Local DB port ${dbPort} is occupied. Stop its listener and rerun db:verify; ` +
          "an SSH tunnel here could forward reset SQL to production.",
      ),
    ),
  );
  listener.listen(dbPort, "0.0.0.0", () => listener.close(() => resolve()));
});
// Studio and telemetry are optional UI/observability sidecars, not backend APIs.
supabase("start", "--exclude", "studio,logflare,vector");
const env = localStackEnv();
let firstSchema: string | undefined;
for (const iteration of [1, 2]) {
  console.log(`[verify] Reset ${iteration}/2 (local only)`);
  supabase("db", "reset", "--local", "--yes");
  const current = await catalog(env);
  if (iteration === 1) firstSchema = current;
  else {
    assert.equal(current, firstSchema, "Schema differs between clean resets");
    console.log(
      `[verify] Deterministic schema SHA-256: ${createHash("sha256").update(current).digest("hex")}`,
    );
  }
  run("db:contract", env);
}

const typesPath = "src/lib/supabase/database.types.ts";
assert(env.SUPABASE_DB_URL, "Local database URL missing from Supabase status");
const generated = await format(
  // CLI 2.106 checks only that this variable is present even for a direct DB URL.
  // Override any real token with an inert value; the URL is status-derived and
  // loopback-validated, so type generation cannot consult a hosted project.
  supabaseWithEnv(
    { ...process.env, SUPABASE_ACCESS_TOKEN: "local-only-placeholder" },
    "gen",
    "types",
    "--lang",
    "typescript",
    "--db-url",
    env.SUPABASE_DB_URL,
    "--schema",
    "public",
  ),
  {
    ...(await resolveConfig(typesPath)),
    filepath: typesPath,
  },
);
assert.equal(
  readFileSync(typesPath, "utf8"),
  generated,
  "Generated Supabase types drifted; regenerate locally",
);
const seed = execFileSync("npx", ["--no-install", "tsx", "scripts/generate-supabase-seed.ts"], {
  encoding: "utf8",
});
assert.equal(
  readFileSync("supabase/seed.sql", "utf8"),
  seed,
  "Committed seed differs from generator",
);
supabase(
  "db",
  "lint",
  "--local",
  "--schema",
  "public,private",
  "--level",
  "error",
  "--fail-on",
  "error",
);
const initialFixtures = await catalog(env, true);
console.log("[verify] Prove cleanup after a failure in a disposable fixture test");
const injectedFailure = spawnSync("npm", ["run", "smoke:block-enforcement"], {
  env: { ...env, HLEIAS_SMOKE_INJECT_FAILURE: "after-block-fixtures" },
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 5 * 60_000,
});
assert.equal(injectedFailure.error, undefined, "Injected smoke could not start or timed out");
assert.notEqual(injectedFailure.status, 0, "Injected smoke failure did not fire");
if (!injectedFailure.stderr.includes("Intentional failure after block fixtures")) {
  console.error(injectedFailure.stderr);
  throw new Error("Injected smoke failed before the fixture setup completed");
}
assert.deepEqual(
  JSON.parse(await catalog(env, true)),
  JSON.parse(initialFixtures),
  "Injected smoke failure left fixtures behind",
);
console.log("[verify] Expected failure cleaned up all fixtures");

async function runSmoke(script: string) {
  const before = JSON.parse(await catalog(env, true)) as Record<string, unknown[]>;
  let failure: unknown;
  try {
    run(script, env);
  } catch (error) {
    failure = error;
  }
  try {
    const after = JSON.parse(await catalog(env, true)) as Record<string, unknown[]>;
    const changedTables = Object.keys(before).filter(
      (table) => JSON.stringify(before[table]) !== JSON.stringify(after[table]),
    );
    assert.deepEqual(changedTables, [], `${script} left fixtures in: ${changedTables.join(", ")}`);
    console.log(`[verify] ${script}: fixture cleanup confirmed`);
  } catch (cleanupError) {
    if (failure)
      throw new AggregateError([failure, cleanupError], `${script} failed and leaked fixtures`);
    throw cleanupError;
  }
  if (failure) throw failure;
}
for (const script of [
  "smoke:auth-profile",
  "smoke:post-write",
  "smoke:live-surfaces",
  "smoke:moderation",
  "smoke:block-enforcement",
  "smoke:deal-race",
  "smoke:admin",
  "smoke:verification-guards",
  "smoke:routes",
  "smoke:push-security",
])
  await runSmoke(script);
run("audit:rls", env, ["--check"]);
// Exercise the gate against real catalog changes. Each probe is committed on
// the disposable database so the independent audit connection can see it.
async function expectAuditRejects(sql: string, cleanup: string, marker: string) {
  const db = new pg.Client({
    host: env.SUPABASE_DB_HOST,
    port: Number(env.SUPABASE_DB_PORT),
    user: env.SUPABASE_DB_USER,
    password: env.SUPABASE_DB_PASSWORD,
    database: "postgres",
  });
  await db.connect();
  try {
    await db.query(sql);
    if (marker === "rls_audit_ci_probe") {
      const privilege = await db.query<{ executable: boolean }>(
        "select has_function_privilege('anon', 'public.rls_audit_ci_probe()', 'execute') as executable",
      );
      assert.equal(
        privilege.rows[0]?.executable,
        false,
        "New functions must not be callable by anon",
      );
    }
    const audit = spawnSync("npm", ["run", "audit:rls", "--", "--check"], {
      env,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (audit.error) throw audit.error;
    assert.equal(audit.status, 1, `Audit accepted unexpected ${marker}`);
    assert.match(audit.stderr + audit.stdout, new RegExp(marker));
  } finally {
    await db.query(cleanup);
    await db.end();
  }
}
await expectAuditRejects(
  'create policy "rls_audit_ci_policy_probe" on public.posts for select to anon using (false)',
  'drop policy if exists "rls_audit_ci_policy_probe" on public.posts',
  "rls_audit_ci_policy_probe",
);
await expectAuditRejects(
  "create function public.rls_audit_ci_probe() returns integer language sql security definer set search_path = public as 'select 1'",
  "drop function if exists public.rls_audit_ci_probe()",
  "rls_audit_ci_probe",
);
run("db:contract", env, ["--after-smokes"]);
assert.deepEqual(
  JSON.parse(await catalog(env, true)),
  JSON.parse(initialFixtures),
  "Smoke cleanup changed seeded IDs or left rows behind, including audit logs",
);
console.log(
  "\n[verify] Clean resets, seed, schema, generated types, all smokes and cleanup passed.",
);

/**
 * Shared environment/credential readers for the scripts in `scripts/`.
 *
 * These four helpers were copy-pasted into six to eight scripts each. That
 * duplication is not just noise: when the pooled-connection fix landed in
 * PR #58 it was pasted into three of the eight `pg` scripts and the other five
 * silently kept the bug. One copy, imported everywhere, is the actual fix.
 *
 * Nothing here is secret. The publishable key is public by design; destructive
 * smokes receive the disposable stack's service_role key from local status.
 */
import { readFileSync } from "node:fs";

/**
 * Explicit process settings override `.env`. Local recovery never reads `.env`.
 *
 * Deliberately a hand-rolled parser rather than a dotenv dependency: these are
 * dev-only scripts and `.env` here holds one flat `KEY=value` per line.
 */
export function readEnvValue(name: string) {
  if (process.env.HLEIAS_LOCAL_ONLY === "1" || process.env[name] !== undefined) {
    return process.env[name];
  }
  try {
    const env = readFileSync(".env", "utf8");
    const value = env
      .split(/\n/)
      .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
      .find((match) => match?.[1] === name)?.[2]
      ?.trim()
      .replace(/^['"]|['"]$/g, "");
    return value || process.env[name];
  } catch {
    return process.env[name];
  }
}

/**
 * The live project reference is retained for read-only preflight and explicit,
 * approval-gated provisioning. Destructive smokes reject this target.
 */
export const PRODUCTION_PROJECT_REF = "kfxfnqryfmuxiwlswyyn";

/** Which project a non-smoke script acts on. Local smokes require ref=local. */
export const projectRef = readEnvValue("SUPABASE_PROJECT_REF") ?? PRODUCTION_PROJECT_REF;

/**
 * Refuse to touch production from CI.
 *
 * The smoke scripts create and delete real rows and real auth users. Running
 * them on every pull request is fine against the throwaway stack CI builds with
 * `supabase start`, and is not fine against the database serving users — and the
 * difference between those two is a handful of environment variables that
 * somebody will eventually get wrong. This makes that mistake loud instead of
 * destructive.
 *
 * Called from the two chokepoints every script passes through: the service_role
 * key (which grants write access over PostgREST) and the Postgres client config
 * (which grants it directly).
 */
export function assertTargetIsSafeForCI() {
  if (process.env.HLEIAS_LOCAL_ONLY === "1") {
    const url = new URL(process.env.SUPABASE_URL ?? "https://invalid.invalid");
    if (
      projectRef !== "local" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !["127.0.0.1", "localhost", "::1"].includes(process.env.SUPABASE_DB_HOST ?? "")
    ) {
      throw new Error("Local recovery requires loopback API and database targets and ref=local.");
    }
  }
  if (!process.env.CI) return;
  if (projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error(
      "Refusing to run against the production Supabase project from CI. These scripts " +
        "create and delete real rows and real auth users. CI is meant to run against the " +
        "local stack (`supabase start`) — see .github/workflows/smoke.yml, which sets " +
        "SUPABASE_PROJECT_REF, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_DB_HOST " +
        "and SUPABASE_DB_PASSWORD from `supabase status`. Reaching this error means one " +
        "of those did not get set, so the scripts fell back to the production default.",
    );
  }
}

/** Destructive acceptance tests must be launched with status-derived local settings. */
export function assertSmokeTargetIsLocal() {
  if (process.env.HLEIAS_LOCAL_ONLY !== "1") {
    throw new Error("Smoke tests require the disposable local stack; use npm run supabase:local.");
  }
  assertTargetIsSafeForCI();
}

/** The local URL and publishable key, supplied together by `supabase status`. */
export function readSupabaseClientConfig() {
  assertSmokeTargetIsLocal();
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Local smoke target requires both a loopback URL and local publishable key.");
  }
  return { publishableKey, url };
}

/**
 * The disposable local stack's service_role key, from the wrapper environment.
 *
 * It is never written to disk or looked up from a hosted project. A service_role
 * key bypasses RLS, so the smoke runner only accepts a loopback target.
 */
export function readServiceRoleKey() {
  assertSmokeTargetIsLocal();

  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fromEnv) {
    if (fromEnv.length < 100) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is set but looks too short to be a service_role key.",
      );
    }
    return fromEnv;
  }

  throw new Error("Local service key missing; refusing to look up hosted credentials.");
}

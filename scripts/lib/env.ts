/**
 * Shared environment/credential readers for the scripts in `scripts/`.
 *
 * These four helpers were copy-pasted into six to eight scripts each. That
 * duplication is not just noise: when the pooled-connection fix landed in
 * PR #58 it was pasted into three of the eight `pg` scripts and the other five
 * silently kept the bug. One copy, imported everywhere, is the actual fix.
 *
 * Nothing here is secret. The publishable key is public by design; the
 * service_role key is never stored — it is read from the maintainer's own
 * logged-in Supabase CLI session at run time.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Read `name` from `.env`, falling back to the real environment.
 *
 * Deliberately a hand-rolled parser rather than a dotenv dependency: these are
 * dev-only scripts and `.env` here holds one flat `KEY=value` per line.
 */
export function readEnvValue(name: string) {
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
 * The live project these scripts point at unless told otherwise.
 *
 * Kept as the default on purpose: a maintainer running a smoke script on their
 * own machine means the real database, and having to set three variables first
 * would just get skipped.
 */
export const PRODUCTION_PROJECT_REF = "kfxfnqryfmuxiwlswyyn";

/** Which project the scripts act on. Override to point CI at its own project. */
export const projectRef = readEnvValue("SUPABASE_PROJECT_REF") ?? PRODUCTION_PROJECT_REF;

/**
 * Refuse to touch production from CI.
 *
 * The smoke scripts create and delete real rows and real auth users. Running
 * them on every pull request is fine against a disposable CI project and is not
 * fine against the database serving users — and the difference between those
 * two is a handful of environment variables that somebody will eventually get
 * wrong. This makes that mistake loud instead of destructive.
 *
 * Called from the two chokepoints every script passes through: the service_role
 * key (which grants write access over PostgREST) and the Postgres client config
 * (which grants it directly).
 */
export function assertTargetIsSafeForCI() {
  if (!process.env.CI) return;
  if (projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error(
      "Refusing to run against the production Supabase project from CI. These scripts " +
        "create and delete real rows and real auth users. Point CI at its own project by " +
        "setting SUPABASE_PROJECT_REF, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and " +
        "SUPABASE_DB_HOST to the CI project's values.",
    );
  }
}

/**
 * Scrape the URL and publishable key out of the app's own client module, so a
 * smoke script can never drift onto a different project than the app uses.
 */
export function readSupabaseClientConfig() {
  // Env first, so CI can be pointed at its own project. Falling back to the
  // app's own client module keeps a local run on exactly the project the app
  // uses, with no chance of drifting onto a different one.
  const envUrl = readEnvValue("SUPABASE_URL");
  const envKey = readEnvValue("SUPABASE_PUBLISHABLE_KEY");
  if (envUrl && envKey) return { publishableKey: envKey, url: envUrl };

  const source = readFileSync("src/lib/supabase/client.ts", "utf8");
  const url = source.match(/const supabaseUrl = "([^"]+)"/)?.[1];
  const publishableKey = source.match(/const supabasePublishableKey\s*=\s*"([^"]+)"/)?.[1];

  if (!url || !publishableKey) {
    throw new Error("Could not read Supabase URL/publishable key from src/lib/supabase/client.ts.");
  }

  return { publishableKey, url };
}

/**
 * The service_role key, from the environment first and the local Supabase CLI
 * session second.
 *
 * It is never written to disk — a service_role key bypasses every RLS policy,
 * so committing one would hand over the database.
 *
 * The environment branch exists because CI has no logged-in Supabase CLI
 * session, so the `npx supabase projects api-keys` path below cannot work
 * there. Without this, adding the key to GitHub Actions secrets would not be
 * enough to make the smoke suite runnable in CI — every script would still
 * fail trying to shell out. Locally the CLI path stays the default, so nobody
 * has to keep a copy of the key in their `.env`.
 */
export function readServiceRoleKey() {
  assertTargetIsSafeForCI();

  const fromEnv = readEnvValue("SUPABASE_SERVICE_ROLE_KEY");
  if (fromEnv) {
    if (fromEnv.length < 100) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is set but looks too short to be a service_role key.",
      );
    }
    return fromEnv;
  }

  const output = execFileSync(
    "npx",
    ["supabase", "projects", "api-keys", "--project-ref", projectRef, "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(output);
  const keys = Array.isArray(parsed) ? parsed : (parsed.api_keys ?? parsed.keys ?? []);
  const serviceRole = keys.find((key: Record<string, unknown>) => {
    const name = String(key.name ?? key.api_key_type ?? key.type ?? key.key_type ?? "");
    return name === "service_role";
  });
  const value = serviceRole?.api_key ?? serviceRole?.key ?? serviceRole?.value;

  if (typeof value !== "string" || value.length < 100) {
    throw new Error(
      "Could not read Supabase service_role key. Either sign in to the Supabase CLI " +
        "(`npx supabase login`) or set SUPABASE_SERVICE_ROLE_KEY in the environment.",
    );
  }

  return value;
}

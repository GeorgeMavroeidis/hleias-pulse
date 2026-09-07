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

export const projectRef = "kfxfnqryfmuxiwlswyyn";

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
 * Scrape the URL and publishable key out of the app's own client module, so a
 * smoke script can never drift onto a different project than the app uses.
 */
export function readSupabaseClientConfig() {
  const source = readFileSync("src/lib/supabase/client.ts", "utf8");
  const url = source.match(/const supabaseUrl = "([^"]+)"/)?.[1];
  const publishableKey = source.match(/const supabasePublishableKey\s*=\s*"([^"]+)"/)?.[1];

  if (!url || !publishableKey) {
    throw new Error("Could not read Supabase URL/publishable key from src/lib/supabase/client.ts.");
  }

  return { publishableKey, url };
}

/**
 * Borrow the service_role key from the local Supabase CLI session.
 *
 * It is fetched per run and never written to disk — a service_role key
 * bypasses every RLS policy, so committing one would hand over the database.
 */
export function readServiceRoleKey() {
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
    throw new Error("Could not read Supabase service_role key from the local CLI session.");
  }

  return value;
}

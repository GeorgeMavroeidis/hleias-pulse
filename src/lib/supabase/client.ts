import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

// The live project. Public by design: a publishable key is meant to ship to the
// browser. The secret that must never be committed is the service_role key.
const productionUrl = "https://kfxfnqryfmuxiwlswyyn.supabase.co";
const productionPublishableKey = "sb_publishable_3E2YsCPkTKaP2IiDIqQNrQ__OCnauzd";

/**
 * A Node-only environment override.
 *
 * WHY THIS EXISTS. Six scripts under `scripts/` import this module's client on
 * purpose — `smoke:moderation` exists precisely to exercise the path a user
 * takes, through the real `hp-api` functions and this real singleton, rather
 * than a client the test built for itself. But the constants above are the
 * production project, so those scripts reached production no matter what the
 * environment said. `assertTargetIsSafeForCI()` did not catch it: it guards the
 * Postgres connection and the service_role key, and this is a third path that
 * passes through neither. CI read the live database because of that gap.
 *
 * WHY IT IS INERT IN THE BROWSER. A browser bundle has no `globalThis.process`,
 * so this returns undefined there and the literals above are used unchanged.
 * The shipped app is byte-for-byte what it was; only Node sees anything new.
 * `globalThis.process` rather than a bare `process` so the lookup is a property
 * read that cannot throw a ReferenceError where the global is absent.
 */
function nodeEnv(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = proc?.env?.[name];
  return value ? value : undefined;
}

const supabaseUrl = nodeEnv("SUPABASE_URL") ?? productionUrl;
const supabasePublishableKey = nodeEnv("SUPABASE_PUBLISHABLE_KEY") ?? productionPublishableKey;

// The backstop the missing guard should have been. Configuration alone is not
// enough: the failure mode is a variable that quietly does not arrive, and the
// scripts that import this client create and delete real rows and real users.
// Refusing at import time means a CI run that would have touched production
// fails before it can issue a single request, instead of succeeding quietly.
if (nodeEnv("CI") && supabaseUrl === productionUrl) {
  throw new Error(
    "Refusing to build the app's Supabase client against the production project from CI. " +
      "The scripts that import this client create and delete real rows and real auth users. " +
      "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to a throwaway stack — " +
      ".github/workflows/smoke.yml does this from `supabase status`.",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});

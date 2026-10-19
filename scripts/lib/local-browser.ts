import { browserLocalConfig } from "../../src/lib/supabase/browser-local-config";

/** Supply only status-derived public credentials to Vite, never a dotenv file. */
export function localBrowserEnv(stack: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(stack).filter(([key]) => !key.startsWith("VITE_")));
  const local = {
    DEV: true,
    MODE: "local-test",
    VITE_HLEIAS_LOCAL_ONLY: "1",
    VITE_SUPABASE_URL: stack.SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: stack.SUPABASE_PUBLISHABLE_KEY,
  };
  browserLocalConfig(local);
  return {
    ...env,
    VITE_HLEIAS_LOCAL_ONLY: local.VITE_HLEIAS_LOCAL_ONLY,
    VITE_SUPABASE_URL: local.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: local.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

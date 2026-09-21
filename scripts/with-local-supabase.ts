import { spawnSync } from "node:child_process";
import { localStackEnv } from "./lib/local-stack";

const [script, ...args] = process.argv.slice(2);
if (!script || !/^(smoke:|audit:rls$|db:contract$)/.test(script)) {
  throw new Error("Usage: npm run supabase:local -- <smoke:name|audit:rls|db:contract> [args]");
}
const result = spawnSync("npm", ["run", script, "--", ...args], {
  env: localStackEnv(),
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

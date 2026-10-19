import { spawn } from "node:child_process";
import { localBrowserEnv } from "./lib/local-browser";
import { localStackEnv } from "./lib/local-stack";

const commands: Record<string, string[]> = {
  dev: ["vite", "--host", "127.0.0.1", "--port", "5183", "--strictPort"],
  build: ["vite", "build", "--config", "vite.static.config.ts", "--mode", "local-test"],
  preview: [
    "vite",
    "preview",
    "--config",
    "vite.static.config.ts",
    "--mode",
    "local-test",
    "--host",
    "127.0.0.1",
    "--port",
    "4183",
    "--strictPort",
  ],
};
const command = commands[process.argv[2] ?? ""];
if (!command || process.argv.length > 3) {
  throw new Error("Usage: node --import tsx scripts/local-browser.ts <dev|build|preview>");
}
const env = localBrowserEnv(localStackEnv());
console.log("Local browser checks: loopback API, disposable stack, public key only.");
const child = spawn("npx", ["--no-install", ...command], { env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

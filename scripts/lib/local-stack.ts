import { execFileSync } from "node:child_process";

/** Never consult .env, linked project metadata, or hosted API-key discovery. */
export function localStackEnv(): NodeJS.ProcessEnv {
  const status = JSON.parse(
    execFileSync("npx", ["--no-install", "supabase", "status", "--output", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }),
  ) as Record<string, string>;
  const api = new URL(status.API_URL);
  const db = new URL(status.DB_URL);
  for (const url of [api, db]) {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error("Supabase status returned a non-loopback address; refusing local checks.");
    }
  }
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY || !db.password) {
    throw new Error("Local stack credentials are incomplete.");
  }
  return {
    ...process.env,
    CI: "1",
    HLEIAS_LOCAL_ONLY: "1",
    SUPABASE_PROJECT_REF: "local",
    SUPABASE_URL: status.API_URL,
    SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_DB_HOST: db.hostname.replace(/^\[|\]$/g, ""),
    SUPABASE_DB_PORT: db.port,
    SUPABASE_DB_USER: decodeURIComponent(db.username),
    ["SUPABASE_DB_PASSWORD"]: decodeURIComponent(db.password),
    SUPABASE_DB_URL: status.DB_URL,
  };
}

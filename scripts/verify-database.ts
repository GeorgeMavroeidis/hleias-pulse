import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { format, resolveConfig } from "prettier";
import { databaseCatalog, fixtureIdentities } from "./lib/database-catalog";
import { localStackEnv } from "./lib/local-stack";

// No arbitrary CLI arguments: this entrypoint can only reset the local stack.
assert.equal(process.argv.length, 2, "db:verify accepts no target or reset flags");
function supabase(...args: string[]) {
  return execFileSync("npx", ["--no-install", "supabase", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 16 * 1024 * 1024,
  });
}
function run(script: string, env: NodeJS.ProcessEnv, args: string[] = []) {
  console.log(`\n[verify] ${script} ${args.join(" ")}`);
  const result = spawnSync("npm", ["run", script, "--", ...args], { env, stdio: "inherit" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${script} failed`);
}
async function catalog(env: NodeJS.ProcessEnv, fixtures = false) {
  const db = new pg.Client({
    host: env.SUPABASE_DB_HOST,
    port: Number(env.SUPABASE_DB_PORT),
    user: env.SUPABASE_DB_USER,
    password: env.SUPABASE_DB_PASSWORD,
    database: "postgres",
  });
  try {
    await db.connect();
    return JSON.stringify(await (fixtures ? fixtureIdentities(db) : databaseCatalog(db)));
  } finally {
    await db.end();
  }
}

console.log("[verify] Start disposable local Supabase");
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
const generated = await format(
  supabase("gen", "types", "--lang", "typescript", "--local", "--schema", "public"),
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
  run(script, env);
run("audit:rls", env, ["--check"]);
run("db:contract", env, ["--after-smokes"]);
assert.deepEqual(
  JSON.parse(await catalog(env, true)),
  JSON.parse(initialFixtures),
  "Smoke cleanup changed seeded IDs or left rows behind (audit logs are retained intentionally)",
);
console.log(
  "\n[verify] Clean resets, seed, schema, generated types, all smokes and cleanup passed.",
);

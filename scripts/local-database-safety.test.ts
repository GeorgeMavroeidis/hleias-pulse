import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

const envModule = resolve("scripts/lib/env.ts");
const clientModule = resolve("src/lib/supabase/client.ts");
const tsx = resolve("node_modules/tsx/dist/cli.mjs");
function evaluate(code: string, env: NodeJS.ProcessEnv = {}, dotenv = "", module = envModule) {
  const cwd = mkdtempSync(`${tmpdir()}/hleias-env-test-`);
  try {
    writeFileSync(`${cwd}/.env`, dotenv);
    return spawnSync(process.execPath, [tsx, "-e", code.replaceAll("$MODULE", module)], {
      cwd,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HLEIAS_LOCAL_ONLY: "1",
        SUPABASE_PROJECT_REF: "local",
        SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_DB_HOST: "127.0.0.1",
        ...env,
      },
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("local recovery ignores a production .env, including credentials", () => {
  const result = evaluate(
    `import {readEnvValue, assertTargetIsSafeForCI} from '$MODULE';
     assertTargetIsSafeForCI();
     if(readEnvValue('SUPABASE_DB_PASSWORD') !== undefined) throw Error('read .env');`,
    {},
    "SUPABASE_PROJECT_REF=kfxfnqryfmuxiwlswyyn\nSUPABASE_DB_HOST=live.invalid\n" +
      ["SUPABASE_DB_PASSWORD", "test-only-placeholder"].join("=") +
      "\n",
  );
  assert.equal(result.status, 0, result.stderr);
});

for (const env of [
  { SUPABASE_PROJECT_REF: "kfxfnqryfmuxiwlswyyn" },
  { SUPABASE_URL: "https://live.invalid" },
  { SUPABASE_DB_HOST: "live.invalid" },
]) {
  test(`local recovery rejects ${Object.keys(env)[0]} pointing away from local`, () => {
    const result = evaluate(
      `import {assertTargetIsSafeForCI} from '$MODULE'; assertTargetIsSafeForCI();`,
      env,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Local recovery requires/);
  });
}

test("missing local service key fails without hosted key discovery", () => {
  const result = evaluate(`import {readServiceRoleKey} from '$MODULE'; readServiceRoleKey();`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing to look up hosted credentials/);
});

test("a destructive smoke refuses an unwrapped production default", () => {
  const result = evaluate(
    `import {assertSmokeTargetIsLocal} from '$MODULE'; assertSmokeTargetIsLocal();`,
    { HLEIAS_LOCAL_ONLY: "0", SUPABASE_PROJECT_REF: "kfxfnqryfmuxiwlswyyn" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /disposable local stack/);
});

test("local mode never falls back to the application's production client", () => {
  const result = evaluate(
    `import {readSupabaseClientConfig} from '$MODULE'; readSupabaseClientConfig();`,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local publishable key/);
});

test("the app singleton refuses a hosted URL in local smoke mode", () => {
  const result = evaluate(
    `import '$MODULE';`,
    { SUPABASE_URL: "https://live.invalid", SUPABASE_PUBLISHABLE_KEY: "test-only-key" },
    "",
    clientModule,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /explicit loopback URL/);
});

test("explicit environment overrides .env outside recovery too", () => {
  const result = evaluate(
    `import {readEnvValue} from '$MODULE';
     if(readEnvValue('SUPABASE_PROJECT_REF') !== 'local') throw Error('wrong precedence');`,
    { HLEIAS_LOCAL_ONLY: "0" },
    "SUPABASE_PROJECT_REF=kfxfnqryfmuxiwlswyyn\n",
  );
  assert.equal(result.status, 0, result.stderr);
});

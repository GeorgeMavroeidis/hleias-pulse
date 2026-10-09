import assert from "node:assert/strict";
import test from "node:test";
import {
  browserLocalConfig,
  localOnlyFetch,
  type BrowserBuildEnv,
} from "../src/lib/supabase/browser-local-config";
import { localBrowserEnv } from "./lib/local-browser";

const local: BrowserBuildEnv = {
  DEV: true,
  MODE: "development",
  VITE_HLEIAS_LOCAL_ONLY: "1",
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test_key",
};
const legacyKey = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;

test("normal builds ignore arbitrary browser endpoint overrides without opt-in", () => {
  assert.equal(
    browserLocalConfig({ MODE: "production", VITE_SUPABASE_URL: "https://bad.invalid" }),
    null,
  );
});

test("local configuration is explicit and cannot be included in a release build", () => {
  assert.throws(() => browserLocalConfig({ MODE: "local-test" }), /explicit local-only/);
  assert.throws(
    () => browserLocalConfig({ ...local, DEV: false, MODE: "production" }),
    /release build/,
  );
  assert.deepEqual(browserLocalConfig({ ...local, DEV: false, MODE: "local-test" }, "localhost"), {
    url: "http://127.0.0.1:54321",
    publishableKey: local.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
});

test("local mode rejects missing, remote, deceptive, credentialed and malformed endpoints", () => {
  for (const value of [
    undefined,
    "",
    "https://kfxfnqryfmuxiwlswyyn.supabase.co",
    "http://localhost.bad.invalid:54321",
    "http://127.0.0.1.bad.invalid:54321",
    "ftp://127.0.0.1:54321",
    "http://user:pass@127.0.0.1:54321",
    "http://127.0.0.1:54321/path",
    "http://127.0.0.1:54321/?url=hosted",
  ]) {
    assert.throws(
      () => browserLocalConfig({ ...local, VITE_SUPABASE_URL: value }),
      /loopback API URL/,
    );
  }
});

test("a local-test artifact refuses to run on a hosted browser origin", () => {
  assert.throws(() => browserLocalConfig(local, "example.com"), /loopback host/);
  for (const hostname of ["localhost", "127.0.0.1", "::1", "[::1]"]) {
    assert.ok(browserLocalConfig(local, hostname));
  }
});

test("only public keys reach browser configuration", () => {
  for (const key of [undefined, "", "sb_secret_test", legacyKey("service_role"), "invalid"]) {
    assert.throws(
      () => browserLocalConfig({ ...local, VITE_SUPABASE_PUBLISHABLE_KEY: key }),
      /public key/,
    );
  }
  assert.ok(browserLocalConfig({ ...local, VITE_SUPABASE_PUBLISHABLE_KEY: legacyKey("anon") }));
});

test("status-derived local config wins over inherited Vite values", () => {
  const env = localBrowserEnv({
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_PUBLISHABLE_KEY: legacyKey("anon"),
    VITE_SUPABASE_URL: "https://hosted.invalid",
    VITE_SERVICE_ROLE_KEY: "must-not-be-bundled",
  });
  assert.equal(env.VITE_SUPABASE_URL, "http://127.0.0.1:54321");
  assert.equal(env.VITE_HLEIAS_LOCAL_ONLY, "1");
  assert.equal(env.VITE_SERVICE_ROLE_KEY, undefined);
  assert.throws(() => localBrowserEnv({}), /loopback API URL/);
});

test("local API requests reject other destinations before fetch and disable redirects", async () => {
  const requests: Array<{ url: string; redirect?: string }> = [];
  const send: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), redirect: init?.redirect });
    return new Response("{}", { status: 200 });
  };
  const guarded = localOnlyFetch("http://127.0.0.1:54321", send);
  await guarded("http://127.0.0.1:54321/rest/v1/places");
  assert.deepEqual(requests, [{ url: "http://127.0.0.1:54321/rest/v1/places", redirect: "error" }]);
  for (const url of [
    "https://kfxfnqryfmuxiwlswyyn.supabase.co/rest/v1/places",
    "http://127.0.0.1:9999/rest/v1/places",
  ]) {
    await assert.rejects(() => guarded(url), /destination/);
  }
  assert.equal(requests.length, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { CreatePulseMeetEventInput } from "../src/lib/hp-api";

test("real Meet API refuses invalid/past starts and missing place before any network request", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_PUBLISHABLE_KEY = "local-test-public-key";
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error("Network forbidden in validation test");
  };
  try {
    const { createPulseMeetEvent } = await import("../src/lib/hp-api");
    const input = { place: { id: "chosen" } } as CreatePulseMeetEventInput;
    for (const happensAt of [
      "invalid",
      "2026-02-30T12:00:00Z",
      "2026-10-08T24:00:00Z",
      "2000-01-01T00:00:00Z",
      new Date().toISOString(),
    ]) {
      await assert.rejects(createPulseMeetEvent({ ...input, happensAt }), /Invalid Meet start/);
    }
    await assert.rejects(
      createPulseMeetEvent({
        ...input,
        place: { id: "" } as CreatePulseMeetEventInput["place"],
        happensAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      /Choose a valid place/,
    );
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

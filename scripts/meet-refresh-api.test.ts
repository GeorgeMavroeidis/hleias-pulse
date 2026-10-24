/** Real API/client wiring with intercepted HTTP; browser and Smoke prove UI/RLS separately. */
import assert from "node:assert/strict";
import { after, beforeEach, mock, test } from "node:test";

process.env.HLEIAS_LOCAL_ONLY = "1";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISHABLE_KEY = "local-meet-refresh-protocol-test";
const originalFetch = globalThis.fetch;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
let requests: URL[] = [];
let responseFor: (url: URL) => Response;
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  assert.equal(url.origin, "http://127.0.0.1:54321", "No real network requests allowed");
  requests.push(url);
  return responseFor(url);
};
const { supabase } = await import("../src/lib/supabase/client");
const { loadPulseData } = await import("../src/lib/hp-api");
let userId: string | null = "alice";
const auth = mock.method(
  supabase.auth,
  "getSession",
  async () =>
    ({
      data: { session: userId ? { user: { id: userId } } : null },
      error: null,
    }) as Awaited<ReturnType<typeof supabase.auth.getSession>>,
);
const row = {
  id: "meet-one",
  user_id: "alice",
  profile_id: "alice",
  place_id: "place-one",
  title: "Owner's gathering",
  host_name: "Alice",
  host_type: "local",
  host_avatar_url: "",
  starts_at: "2026-10-22T15:30:00.000Z",
  created_at: "2026-10-20T11:00:00.000Z",
  duration_min: 120,
  category: "social",
  vibe: "chill",
  price: "Free",
  capacity: null,
  description: "Awaiting review",
  cover_url: "",
  tags: [],
  going_count: 1,
  maybe_count: 0,
  hot: false,
  attendee_avatar_urls: [],
  moderation_status: "pending",
};
beforeEach(() => {
  requests = [];
  userId = "alice";
  responseFor = (url) =>
    url.pathname.endsWith("get_pulse_bootstrap")
      ? json({ meet_events: [] })
      : url.pathname === "/rest/v1/meet_events"
        ? json([row])
        : json([]);
});
after(() => {
  auth.mock.restore();
  supabase.auth.stopAutoRefresh();
  globalThis.fetch = originalFetch;
});

test("a newly pending Meet survives repeated accepted refreshes with its ID and Athens instant", async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const data = await loadPulseData({ force: true });
    assert.equal(data.meetEvents.length, 1);
    assert.equal(data.meetEvents[0].id, row.id);
    assert.equal(data.meetEvents[0].moderationStatus, "pending");
    assert.equal(data.meetEvents[0].happensAt, row.starts_at);
    assert.equal(data.meetEvents[0].userId, "alice");
  }
  for (const url of requests.filter((url) => url.pathname.endsWith("meet_events"))) {
    assert.equal(url.searchParams.get("user_id"), "eq.alice");
    assert.equal(url.searchParams.get("moderation_status"), "eq.pending");
  }
});

test("guest refresh never requests private gatherings", async () => {
  userId = null;
  assert.equal((await loadPulseData()).meetEvents.length, 0);
  assert(!requests.some((url) => url.pathname.endsWith("meet_events")));
});

test("account switch scopes the query anew and rejects mismatched/hidden rows", async () => {
  await loadPulseData();
  userId = "bob";
  const data = await loadPulseData();
  assert.equal(data.meetEvents.length, 0);
  assert.equal(
    requests
      .filter((url) => url.pathname.endsWith("meet_events"))
      .at(-1)
      ?.searchParams.get("user_id"),
    "eq.bob",
  );
  responseFor = (url) =>
    url.pathname.endsWith("meet_events")
      ? json([{ ...row, user_id: "bob", moderation_status: "hidden" }])
      : json([]);
  assert.equal((await loadPulseData()).meetEvents.length, 0);
});

test("publication replaces the pending observation by ID without duplicates", async () => {
  responseFor = (url) =>
    url.pathname.endsWith("get_pulse_bootstrap")
      ? json({
          meet_events: [{ ...row, title: "Published gathering", moderation_status: "published" }],
        })
      : url.pathname.endsWith("meet_events")
        ? json([row])
        : json([]);
  const data = await loadPulseData();
  assert.equal(data.meetEvents.length, 1);
  assert.equal(data.meetEvents[0].moderationStatus, "published");
  assert.equal(data.meetEvents[0].title, "Published gathering");
});

test("successful omission removes a moderated/deleted pending gathering", async () => {
  assert.equal((await loadPulseData()).meetEvents.length, 1);
  responseFor = () => json([]);
  assert.equal((await loadPulseData()).meetEvents.length, 0);
});

test("a pending read failure rejects refresh instead of falsely accepting an empty owner list", async () => {
  responseFor = (url) =>
    url.pathname.endsWith("meet_events")
      ? json({ code: "42501", message: "Read failed" }, 403)
      : json([]);
  await assert.rejects(
    loadPulseData(),
    (error: unknown) => (error as { code: string }).code === "42501",
  );
});

test("pending reads page beyond the server cap and deduplicate overlapping pages", async () => {
  let pages = 0;
  responseFor = (url) => {
    if (!url.pathname.endsWith("meet_events")) return json([]);
    assert.equal(url.searchParams.get("order"), "created_at.asc,id.asc");
    pages += 1;
    if (pages === 1)
      return json(Array.from({ length: 1000 }, (_, i) => ({ ...row, id: `meet-${i}` })));
    assert.equal(url.searchParams.get("offset"), "1000");
    return json([
      { ...row, id: "meet-999" },
      { ...row, id: "meet-1000" },
    ]);
  };
  assert.equal((await loadPulseData()).meetEvents.length, 1001);
  assert.equal(pages, 2);
});

/** Protocol-mocked tests of the real hp-api + Supabase client, with ALL fetches intercepted.
 * These prove API wiring and response handling, not Postgres/RLS behavior. Local smoke/browser
 * acceptance supplies the database and interaction evidence separately.
 */
import assert from "node:assert/strict";
import { after, beforeEach, mock, test } from "node:test";
import type { CommentTarget } from "../src/lib/hp/comment-drafts";

process.env.HLEIAS_LOCAL_ONLY = "1";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISHABLE_KEY = "local-comment-protocol-test";
const originalFetch = globalThis.fetch;
interface RecordedRequest {
  url: URL;
  method: string;
  body: Record<string, unknown> | null;
}
let requests: RecordedRequest[] = [];
let responseFor: (request: RecordedRequest) => Response;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  assert.equal(
    url.origin,
    "http://127.0.0.1:54321",
    "non-local request refused by test interceptor",
  );
  const request = {
    url,
    method: init?.method ?? "GET",
    body:
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
  };
  requests.push(request);
  return responseFor(request);
};
const { supabase } = await import("../src/lib/supabase/client");
const { addPulseComment, loadPulseData, isAuthRequiredError } = await import("../src/lib/hp-api");
let userId: string | null = "alice";
let sessionError: { name: string; message: string; status: number; code: string } | null = null;
const authMock = mock.method(supabase.auth, "getSession", async () => {
  return {
    data: { session: userId ? { user: { id: userId } } : null },
    error: sessionError,
  } as Awaited<ReturnType<typeof supabase.auth.getSession>>;
});
const row = {
  id: "comment-one",
  moderation_status: "pending",
  author_name: "Alice",
  text: "Shade beside the east steps",
  place_id: "place-one",
  post_id: null,
  route_id: null,
  cultural_event_id: null,
  user_id: "alice",
  profile_id: "alice",
  posting_identity: "LOCAL",
  author_kind: "user",
  created_at: "2026-10-08T10:00:00.000Z",
};
beforeEach(() => {
  requests = [];
  userId = "alice";
  sessionError = null;
  responseFor = () => json(row);
});
after(() => {
  authMock.mock.restore();
  supabase.auth.stopAutoRefresh();
  globalThis.fetch = originalFetch;
});

for (const type of ["post", "place", "route", "cultural_event"] as const) {
  test(`real comment API writes the explicit ${type} target and maps acknowledgement ID/moderation`, async () => {
    const target: CommentTarget = { type, id: "target-one" };
    responseFor = (request) => json({ ...row, ...request.body });
    const saved = await addPulseComment(target, "  A place-specific note  ", {
      expectedUserId: "alice",
      profileId: "alice",
      authorName: "Alice",
      identity: "LOCAL",
    });
    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.equal(request.url.pathname, "/rest/v1/comments");
    assert.equal(request.method, "POST");
    assert.equal(request.body?.target_type, type);
    assert.equal(request.body?.[`${type}_id`], "target-one");
    assert.equal(request.body?.user_id, "alice");
    assert.equal(request.body?.moderation_status, "pending");
    assert.equal(request.body?.text, "A place-specific note");
    assert.match(request.url.searchParams.get("select") ?? "", /id,moderation_status/);
    assert.equal(saved.id, "comment-one");
    assert.equal(saved.moderationStatus, "pending");
    assert.equal(saved.userId, "alice");
  });
}

test("signed-out and account-switched attempts never issue a write", async () => {
  userId = null;
  await assert.rejects(
    addPulseComment({ type: "post", id: "one" }, "Keep draft"),
    isAuthRequiredError,
  );
  userId = "bob";
  await assert.rejects(
    addPulseComment({ type: "post", id: "one" }, "Alice's draft", { expectedUserId: "alice" }),
    isAuthRequiredError,
  );
  assert.equal(requests.length, 0);
});

test("failed API writes reject without fabricating a successful acknowledgement", async () => {
  responseFor = () => json({ code: "42501", message: "Write refused" }, 403);
  await assert.rejects(
    addPulseComment({ type: "place", id: "one" }, "Keep draft"),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, "42501");
      return true;
    },
  );
});

test("expired JWT responses return the explicit authentication-required error", async () => {
  responseFor = () => json({ code: "PGRST303", message: "JWT expired" }, 401);
  await assert.rejects(
    addPulseComment({ type: "route", id: "one" }, "Keep draft"),
    isAuthRequiredError,
  );
});

test("an expired refresh session opens authentication without sending a write", async () => {
  sessionError = {
    name: "AuthApiError",
    message: "Refresh token expired",
    status: 400,
    code: "refresh_token_not_found",
  };
  await assert.rejects(
    addPulseComment({ type: "post", id: "one" }, "Keep draft"),
    isAuthRequiredError,
  );
  assert.equal(requests.length, 0);
});

test("blank API input cannot insert a row", async () => {
  await assert.rejects(
    addPulseComment({ type: "post", id: "one" }, "  "),
    /Comment text is required/,
  );
  assert.equal(requests.length, 0);
});

test("bootstrap reads published comment IDs directly and excludes private pending comments", async () => {
  responseFor = (request) => {
    if (request.url.pathname.endsWith("get_pulse_bootstrap")) {
      return json({ comments: [row] }); // Historical bootstrap has an author's own pending rows.
    }
    if (request.url.pathname === "/rest/v1/comments") {
      assert.equal(request.url.searchParams.get("moderation_status"), "eq.published");
      return json([{ ...row, moderation_status: "published" }]);
    }
    return json([]);
  };
  const data = await loadPulseData();
  assert.equal(data.placeComments["place-one"][0].id, "comment-one");
  assert.equal(data.placeComments["place-one"][0].moderationStatus, "published");
});

test("a comment read error rejects the whole refresh instead of returning an empty discussion", async () => {
  responseFor = (request) =>
    request.url.pathname === "/rest/v1/comments"
      ? json({ code: "XX000", message: "Comment read failed" }, 500)
      : json([]);
  await assert.rejects(loadPulseData(), (error: unknown) => {
    assert.equal((error as { code: string }).code, "XX000");
    return true;
  });
});

test("comment reads page beyond the PostgREST row limit with stable order", async () => {
  let pages = 0;
  responseFor = (request) => {
    if (request.url.pathname !== "/rest/v1/comments") return json([]);
    assert.equal(request.url.searchParams.get("order"), "sort_order.asc,id.asc");
    pages += 1;
    if (pages === 1) {
      assert.equal(request.url.searchParams.get("offset"), "0");
      return json(Array.from({ length: 1000 }, (_, index) => ({ ...row, id: `comment-${index}` })));
    }
    assert.equal(request.url.searchParams.get("offset"), "1000");
    return json([{ ...row, id: "comment-1000" }]);
  };
  const data = await loadPulseData();
  assert.equal(pages, 2);
  assert.equal(data.placeComments["place-one"].length, 1001);
});

test("overlapping comment pages keep each ID once with its latest authoritative row", async () => {
  const repeated = [
    { ...row, id: "repeated-place", moderation_status: "published" },
    {
      ...row,
      id: "repeated-route",
      moderation_status: "published",
      place_id: null,
      route_id: "route-one",
    },
    {
      ...row,
      id: "repeated-event",
      moderation_status: "published",
      place_id: null,
      cultural_event_id: "event-one",
    },
  ];
  let pages = 0;
  responseFor = (request) => {
    if (request.url.pathname !== "/rest/v1/comments") return json([]);
    pages += 1;
    if (pages === 1) {
      assert.equal(request.url.searchParams.get("offset"), "0");
      return json([
        ...repeated,
        ...Array.from({ length: 997 }, (_, index) => ({
          ...row,
          id: `other-comment-${index}`,
          moderation_status: "published",
        })),
      ]);
    }
    assert.equal(request.url.searchParams.get("offset"), "1000");
    return json([
      ...repeated.map((comment) => ({ ...comment, text: `Latest ${comment.id}` })),
      { ...row, id: "new-comment", moderation_status: "published" },
    ]);
  };

  const data = await loadPulseData();
  assert.equal(pages, 2);
  const groups = [
    data.placeComments["place-one"],
    data.routeComments["route-one"],
    data.culturalEventComments["event-one"],
  ];
  assert.equal(groups.flat().length, 1001);
  for (const [index, comment] of repeated.entries()) {
    const matches = groups[index].filter((candidate) => candidate.id === comment.id);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].text, `Latest ${comment.id}`);
  }
});

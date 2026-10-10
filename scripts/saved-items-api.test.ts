/** Offline protocol checks of the real Saved resolver. Local smoke tests prove
 * permissions separately; every request here is intercepted before networking.
 */
import assert from "node:assert/strict";
import { after, beforeEach, mock, test } from "node:test";

process.env.HLEIAS_LOCAL_ONLY = "1";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISHABLE_KEY = "local-saved-protocol-test";
const originalFetch = globalThis.fetch;
let requests: URL[] = [];
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
let respond: (url: URL) => Response;
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  assert.equal(url.origin, "http://127.0.0.1:54321", "non-local request intercepted");
  requests.push(url);
  return respond(url);
};
const { supabase } = await import("../src/lib/supabase/client");
const { loadSavedItems, setSavedItem, isAuthRequiredError } = await import("../src/lib/hp-api");
const { savedTargetAvailable } = await import("../src/lib/hp/saved-items");
let userId: string | null = "alice";
const authMock = mock.method(
  supabase.auth,
  "getSession",
  async () =>
    ({
      data: { session: userId ? { user: { id: userId } } : null },
      error: null,
    }) as Awaited<ReturnType<typeof supabase.auth.getSession>>,
);
beforeEach(() => {
  requests = [];
  userId = "alice";
  respond = () => json([]);
});
after(() => {
  authMock.mock.restore();
  supabase.auth.stopAutoRefresh();
  globalThis.fetch = originalFetch;
});

function bookmark(type: "place" | "post" | "route", id: string) {
  return { id: `saved-${id}`, target_type: type, [`${type}_id`]: id };
}
function ids(url: URL, column = "id") {
  const filter = url.searchParams.get(column) ?? "";
  assert.match(filter, /^in\.\(.+\)$/);
  return filter.slice(4, -1).split(",");
}
const post = { id: "outside-feed", place_id: "place-one", author_id: "author-one", tags: [] };
function discussion(url: URL, comments: unknown[]) {
  if (url.pathname === "/rest/v1/saved_items") return json([bookmark("post", post.id)]);
  if (url.pathname === "/rest/v1/posts") return json([post]);
  if (url.pathname === "/rest/v1/places") return json([{ id: post.place_id }]);
  if (url.pathname === "/rest/v1/authors") return json([{ id: post.author_id }]);
  if (url.pathname === "/rest/v1/comments" && url.searchParams.has("post_id"))
    return json(comments);
  return json([]);
}

test("Saved reads every stored ID beyond the server cap using bounded permission-checked batches", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => bookmark("place", `place-${index}`));
  respond = (url) => {
    if (url.pathname === "/rest/v1/saved_items") {
      assert.equal(url.searchParams.get("user_id"), "eq.alice");
      assert.equal(url.searchParams.get("order"), "created_at.desc,id.asc");
      const offset = Number(url.searchParams.get("offset"));
      return json(rows.slice(offset, offset + 1000));
    }
    if (url.pathname === "/rest/v1/places") {
      const batch = ids(url);
      assert(batch.length <= 100, "ID batch exceeded the URL bound");
      return json(batch.map((id) => ({ id })));
    }
    return json([]);
  };
  const content = await loadSavedItems();
  assert.equal(content.targets.length, 1001);
  assert.equal(content.places.length, 1001);
  assert.equal(requests.filter((url) => url.pathname.endsWith("/saved_items")).length, 2);
  assert.equal(requests.filter((url) => url.pathname.endsWith("/places")).length, 11);
  assert.equal(savedTargetAvailable({ type: "place", id: "place-1000" }, content), true);
});

test("Saved discussion paging retains comment IDs once and accepts the latest overlapping row", async () => {
  const row = { id: "comment", post_id: post.id, moderation_status: "published", text: "Original" };
  const first = Array.from({ length: 1000 }, (_, index) => ({ ...row, id: `comment-${index}` }));
  respond = (url) => {
    if (url.pathname === "/rest/v1/comments" && url.searchParams.has("post_id")) {
      assert.equal(url.searchParams.get("order"), "created_at.asc,id.asc");
      return json(
        Number(url.searchParams.get("offset")) === 0
          ? first
          : [
              { ...row, id: "comment-999", text: "Updated" },
              { ...row, id: "comment-1000" },
            ],
      );
    }
    return discussion(url, []);
  };
  const content = await loadSavedItems();
  assert.equal(content.posts[0].comments.length, 1001);
  assert.equal(
    content.posts[0].comments.filter((comment) => comment.id === "comment-999").length,
    1,
  );
  assert.equal(
    content.posts[0].comments.find((comment) => comment.id === "comment-999")?.text,
    "Updated",
  );
});

test("a failed later page rejects the entire read instead of presenting missing bookmarks/comments", async () => {
  respond = (url) => {
    if (url.pathname === "/rest/v1/comments" && url.searchParams.has("post_id")) {
      if (Number(url.searchParams.get("offset")) > 0)
        return json({ message: "Later page failed" }, 400);
      return json(
        Array.from({ length: 1000 }, (_, index) => ({ id: `comment-${index}`, post_id: post.id })),
      );
    }
    return discussion(url, []);
  };
  await assert.rejects(loadSavedItems(), { message: "Later page failed" });
});

test("an account switch during Saved resolution rejects the previous account's result", async () => {
  respond = (url) => {
    const response = discussion(url, []);
    if (url.pathname === "/rest/v1/posts") userId = "bob";
    return response;
  };
  await assert.rejects(loadSavedItems(), isAuthRequiredError);
});

test("signed-out Saved reads never issue a request", async () => {
  userId = null;
  await assert.rejects(loadSavedItems(), isAuthRequiredError);
  assert.equal(requests.length, 0);
});

test("Saved screen operations cannot read or remove another account's bookmarks after switching", async () => {
  userId = "bob";
  await assert.rejects(loadSavedItems("alice"), isAuthRequiredError);
  await assert.rejects(
    setSavedItem({ type: "post", id: post.id }, false, "alice"),
    isAuthRequiredError,
  );
  await assert.rejects(loadSavedItems(null), isAuthRequiredError);
  await assert.rejects(
    setSavedItem({ type: "post", id: post.id }, false, null),
    isAuthRequiredError,
  );
  assert.equal(requests.length, 0);
});

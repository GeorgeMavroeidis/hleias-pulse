import assert from "node:assert/strict";
import { test } from "node:test";
import type { Comment } from "../hp-model";
import {
  CommentDraftStore,
  mergeComments,
  reconcileCommentGroups,
  visibleComments,
  type CommentSubmissionResult,
  type CommentTarget,
} from "./comment-drafts";

const postA: CommentTarget = { type: "post", id: "a" };
const postB: CommentTarget = { type: "post", id: "b" };
const pending: Comment = {
  id: "comment-1",
  author: "Local",
  text: "There is shade by the east steps.",
  userId: "alice",
  moderationStatus: "pending",
};
const submitted: CommentSubmissionResult = { status: "submitted", comment: pending };
function deferred() {
  let resolve!: (result: CommentSubmissionResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<CommentSubmissionResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

for (const type of ["post", "place", "route", "cultural_event"] as const) {
  test(`${type} drafts remain attached to their target after switching details`, () => {
    const store = new CommentDraftStore();
    const target = { type, id: "same-id" };
    store.setText(null, target, `Draft for ${type}`);
    store.setText(null, postB, "Other post");
    assert.equal(store.get(null, target).text, `Draft for ${type}`);
    assert.equal(store.get(null, { type: "place", id: "b" }).text, "");
    assert.equal(store.get(null, postB).text, "Other post");
  });
}

test("guest draft survives sign-in cancellation and hands off once without auto-submit", async () => {
  const store = new CommentDraftStore();
  store.setText(null, postA, "Guest note");
  let calls = 0;
  const auth = await store.submit(null, postA, async () => {
    calls += 1;
    return { status: "auth-required" };
  });
  assert.equal(auth?.status, "auth-required");
  store.setViewer(null); // Closing sign-in does not change ownership or content.
  assert.equal(store.get(null, postA).text, "Guest note");
  store.setViewer("alice");
  assert.equal(store.get("alice", postA).text, "Guest note");
  assert.equal(store.get(null, postA).text, "");
  assert.equal(calls, 1);
  store.setViewer(null);
  store.setViewer("bob");
  assert.equal(store.get("bob", postA).text, "");
  store.setViewer("alice");
  assert.equal(store.get("alice", postA).text, "Guest note");
});

test("profile completion and expired authentication preserve text until an explicit retry", async () => {
  const store = new CommentDraftStore();
  store.setViewer("alice");
  store.setText("alice", postA, "Profile draft");
  for (const status of ["profile-required", "auth-required"] as const) {
    await store.submit("alice", postA, async () => ({ status }));
    assert.equal(store.get("alice", postA).text, "Profile draft");
    assert.equal(store.get("alice", postA).status, status);
  }
  await store.submit("alice", postA, async () => submitted);
  assert.equal(store.get("alice", postA).text, "");
  assert.equal(store.get("alice", postA).status, "submitted");
});

test("rejected writes keep the draft, expose failure, and permit retry", async () => {
  const store = new CommentDraftStore();
  store.setText("alice", postA, "Keep me");
  await store.submit("alice", postA, async () => {
    throw new Error("Network disconnected");
  });
  assert.equal(store.get("alice", postA).text, "Keep me");
  assert.equal(store.get("alice", postA).status, "error");
  await store.submit("alice", postA, async () => submitted);
  assert.equal(store.get("alice", postA).text, "");
});

test("duplicate sends are blocked immediately before the UI rerenders", async () => {
  const store = new CommentDraftStore();
  store.setText("alice", postA, "One write");
  const request = deferred();
  let writes = 0;
  const write = () => {
    writes += 1;
    return request.promise;
  };
  const first = store.submit("alice", postA, write);
  const second = store.submit("alice", postA, write);
  assert.equal(writes, 1);
  assert.equal(store.get("alice", postA).status, "saving");
  assert.equal(await second, undefined);
  request.resolve(submitted);
  await first;
  assert.equal(store.get("alice", postA).text, "");
});

test("late completion clears only its captured target and owner", async () => {
  const store = new CommentDraftStore();
  store.setViewer("alice");
  store.setText("alice", postA, "Original");
  const request = deferred();
  const first = store.submit("alice", postA, () => request.promise);
  store.setText("alice", postB, "Different post");
  store.setViewer("bob");
  store.setText("bob", postA, "Different person");
  request.resolve(submitted);
  await first;
  assert.equal(store.get("alice", postA).text, "");
  assert.equal(store.get("alice", postB).text, "Different post");
  assert.equal(store.get("bob", postA).text, "Different person");
});

test("editing during a request preserves the newer text even if it equals the original again", async () => {
  const store = new CommentDraftStore();
  store.setText("alice", postA, "Original");
  const request = deferred();
  let received = "";
  const first = store.submit("alice", postA, (text) => {
    received = text;
    return request.promise;
  });
  store.setText("alice", postA, "Edited");
  store.setText("alice", postA, "Original");
  request.resolve(submitted);
  await first;
  assert.equal(received, "Original");
  assert.equal(store.get("alice", postA).text, "Original");
  assert.equal(store.get("alice", postA).status, "idle");
});

test("sign-in collisions retain all drafts for explicit recovery", () => {
  const store = new CommentDraftStore();
  store.setViewer("alice");
  store.setText("alice", postA, "Account draft");
  store.setViewer(null);
  store.setText(null, postA, "Guest draft");
  store.setViewer("alice");
  assert.equal(store.get("alice", postA).text, "Account draft");
  assert.deepEqual(store.get("alice", postA).otherTexts, ["Guest draft"]);
  store.setViewer(null);
  store.setText(null, postA, "Second guest draft");
  store.setViewer("alice");
  assert.deepEqual(store.get("alice", postA).otherTexts, ["Guest draft", "Second guest draft"]);
  store.useGuestDraft("alice", postA);
  assert.equal(store.get("alice", postA).text, "Guest draft");
  assert.deepEqual(store.get("alice", postA).otherTexts, ["Second guest draft", "Account draft"]);
});

test("blank comments never start a write", async () => {
  const store = new CommentDraftStore();
  store.setText(null, postA, "  ");
  await store.submit(null, postA, async () => {
    assert.fail("blank draft reached write");
  });
  assert.equal(store.get(null, postA).status, "idle");
});

test("acknowledgements reconcile with refreshed published rows by ID, never by identical text", () => {
  const published = { ...pending, moderationStatus: "published" };
  const another = { ...published, id: "comment-2" };
  const combined = mergeComments([pending, pending], [published, another]);
  assert.equal(combined.length, 2);
  assert.equal(combined[0].moderationStatus, "published");
  const refreshed = reconcileCommentGroups(
    { a: [pending], b: [{ ...pending, id: "still-pending" }] },
    { a: [published, another] },
  );
  assert.equal(refreshed.a.length, 2);
  assert.equal(refreshed.a[0].moderationStatus, "published");
  assert.equal(refreshed.b[0].id, "still-pending");
  assert.equal(visibleComments(refreshed.b, "bob").length, 0);
  assert.equal(visibleComments(refreshed.b, "alice").length, 1);
  assert.equal(visibleComments(refreshed.b, null).length, 0);
  assert.equal(visibleComments([published], null).length, 1);
  assert.equal(visibleComments([{ ...pending, moderationStatus: "hidden" }], "alice").length, 0);
});

test("new guest text retains previously saved alternatives even after the primary was submitted", async () => {
  const store = new CommentDraftStore();
  store.setViewer("alice");
  store.setText("alice", postA, "Account draft");
  store.setViewer(null);
  store.setText(null, postA, "First guest draft");
  store.setViewer("alice");
  await store.submit("alice", postA, async () => submitted);
  store.setViewer(null);
  store.setText(null, postA, "Second guest draft");
  store.setViewer("alice");
  assert.equal(store.get("alice", postA).text, "Second guest draft");
  assert.deepEqual(store.get("alice", postA).otherTexts, ["First guest draft"]);
});

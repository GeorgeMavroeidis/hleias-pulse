/** Real API/RLS acceptance on the disposable local stack. Never run against hosted data. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readServiceRoleKey, readSupabaseClientConfig } from "./lib/env";
import { cleanupAll } from "./lib/cleanup";
import {
  addPulseComment,
  isAuthRequiredError,
  loadPulseData,
  type PulseData,
} from "../src/lib/hp-api";
import { supabase } from "../src/lib/supabase/client";
import { CommentDraftStore, mergeComments, type CommentTarget } from "../src/lib/hp/comment-drafts";

if (process.env.HLEIAS_LOCAL_ONLY !== "1") {
  throw new Error("Run only through npm run supabase:local -- smoke:comment-drafts.");
}
function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}
function commentsFor(data: PulseData, target: CommentTarget) {
  if (target.type === "post")
    return data.posts.find((post) => post.id === target.id)?.comments ?? [];
  return (
    {
      place: data.placeComments,
      route: data.routeComments,
      cultural_event: data.culturalEventComments,
    }[target.type][target.id] ?? []
  );
}

async function main() {
  // Both readers bind the API endpoint, service key and DB to CLI-owned local status.
  const { url, publishableKey } = readSupabaseClientConfig();
  const admin = createClient(url, readServiceRoleKey(), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const guest = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const suffix = randomUUID().slice(0, 12);
  const password = `Smoke-${randomUUID()}-Aa1!`;
  const emails = [0, 1].map((index) => `smoke-comments-${index}-${suffix}@example.invalid`);
  const userIds: string[] = [];
  const commentIds: string[] = [];
  let testFailure: unknown;
  async function signIn(index: number) {
    assertOk(
      "sign in",
      (await supabase.auth.signInWithPassword({ email: emails[index], password })).error,
    );
  }
  async function readableIds(client: typeof guest) {
    const result = await client
      .from("comments")
      .select("id,moderation_status")
      .in("id", commentIds);
    assertOk("read comments", result.error);
    return result.data ?? [];
  }
  try {
    const data = await loadPulseData();
    const targets: CommentTarget[] = [
      { type: "place", id: data.places[0]?.id ?? "" },
      { type: "post", id: data.posts.find((post) => post.kind !== "question")?.id ?? "" },
      { type: "route", id: data.routes[0]?.id ?? "" },
      { type: "cultural_event", id: data.culturalEvents[0]?.id ?? "" },
    ];
    assert(
      targets.every((target) => target.id),
      "Local seed needs all four published comment targets.",
    );
    for (const [index, email] of emails.entries()) {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: `Comment Smoke ${index}`, default_identity: "LOCAL" },
      });
      assertOk("create disposable user", created.error);
      assert(created.data.user?.id, "Created user has no ID.");
      userIds.push(created.data.user.id);
    }
    await signIn(0);
    const drafts = new CommentDraftStore();
    drafts.setViewer(userIds[0]);
    const acknowledgements = [];
    for (const target of targets) {
      drafts.setText(userIds[0], target, `Local ${target.type} note ${suffix}`);
      const result = await drafts.submit(userIds[0], target, async (text) => ({
        status: "submitted",
        comment: await addPulseComment(target, text, {
          expectedUserId: userIds[0],
          profileId: userIds[0],
          authorName: "Comment Draft Smoke",
          identity: "LOCAL",
        }),
      }));
      assert.equal(result?.status, "submitted");
      assert(
        result?.status === "submitted" && result.comment.id,
        "Missing database acknowledgement ID.",
      );
      assert.equal(result.comment.moderationStatus, "pending");
      assert.equal(result.comment.userId, userIds[0]);
      assert.equal(drafts.get(userIds[0], target).text, "", "Acknowledged draft was not cleared.");
      commentIds.push(result.comment.id);
      acknowledgements.push(result.comment);
    }
    assert.equal(
      (await readableIds(supabase)).length,
      4,
      "Author cannot read pending acknowledgements.",
    );
    assert.equal((await readableIds(guest)).length, 0, "Guest can read pending comments.");
    const ownPublicSnapshot = await loadPulseData();
    for (const target of targets) {
      assert.equal(
        commentsFor(ownPublicSnapshot, target).some((comment) =>
          commentIds.includes(comment.id ?? ""),
        ),
        false,
        "Own pending comment leaked into public freshness data.",
      );
    }
    // Real rejected write: foreign-key validation fails and the shared store retains its text.
    const missingTarget: CommentTarget = { type: "post", id: randomUUID() };
    drafts.setText(userIds[0], missingTarget, "Retain after rejected database write");
    await drafts.submit(userIds[0], missingTarget, async (text) => ({
      status: "submitted",
      comment: await addPulseComment(missingTarget, text, { expectedUserId: userIds[0] }),
    }));
    assert.equal(drafts.get(userIds[0], missingTarget).status, "error");
    assert.equal(
      drafts.get(userIds[0], missingTarget).text,
      "Retain after rejected database write",
    );

    assertOk("sign out", (await supabase.auth.signOut()).error);
    await signIn(1);
    assert.equal(
      (await readableIds(supabase)).length,
      0,
      "Another account can read pending comments.",
    );
    await assert.rejects(
      addPulseComment(targets[0], "Must stay with the original account", {
        expectedUserId: userIds[0],
      }),
      isAuthRequiredError,
    );
    const publish = await admin
      .from("comments")
      .update({ moderation_status: "published" })
      .in("id", commentIds);
    assertOk("publish disposable comments", publish.error);
    assert.equal(
      (await readableIds(guest)).length,
      4,
      "Published comments are not visible to guests.",
    );
    assert.equal(
      (await readableIds(supabase)).length,
      4,
      "Published comments are not visible to another account.",
    );
    const publishedData = await loadPulseData();
    for (const [index, target] of targets.entries()) {
      const authoritative = commentsFor(publishedData, target).filter(
        (comment) => comment.id === commentIds[index],
      );
      assert.equal(
        authoritative.length,
        1,
        "Publication changed identity or duplicated the comment.",
      );
      assert.equal(authoritative[0].moderationStatus, "published");
      const combined = mergeComments([acknowledgements[index]], authoritative);
      assert.equal(combined.length, 1);
      assert.equal(combined[0].moderationStatus, "published");
    }
    console.log(
      "smoke_comment_drafts_ok: four targets; owner-only pending; guest/account publication; rejected-write retention; ID reconciliation",
    );
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await cleanupAll(
      [
        ["sign out", async () => assertOk("sign out", (await supabase.auth.signOut()).error)],
        [
          "delete disposable comments",
          async () => {
            if (userIds.length)
              assertOk(
                "delete comments",
                (await admin.from("comments").delete().in("user_id", userIds)).error,
              );
          },
        ],
        ...userIds.map(
          (userId) =>
            [
              `delete disposable user ${userId}`,
              async () =>
                assertOk("delete user", (await admin.auth.admin.deleteUser(userId)).error),
            ] as [string, () => Promise<void>],
        ),
        [
          "verify fixture cleanup",
          async () => {
            if (!commentIds.length) return;
            const remaining = await admin.from("comments").select("id").in("id", commentIds);
            assertOk("verify cleanup", remaining.error);
            assert.equal(remaining.data?.length, 0, "Comment fixtures survived cleanup.");
          },
        ],
      ],
      testFailure,
    );
    admin.auth.stopAutoRefresh();
    guest.auth.stopAutoRefresh();
    supabase.auth.stopAutoRefresh();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

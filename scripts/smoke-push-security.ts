/**
 * Disposable-stack acceptance test for the durable push queue.
 *
 * This script is intentionally destructive and is guarded by scripts/lib/env.ts.
 * Run it only against `supabase start`; it never contacts a push provider and it
 * never invokes the Edge Function.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type pg from "pg";

import { readServiceRoleKey, readSupabaseClientConfig } from "./lib/env";
import { connectGuarded, createPgSession, endQuietly } from "./lib/pg";

type UserFixture = {
  client: SupabaseClient;
  email: string;
  id: string;
};

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const questionId = `push-question-${suffix}`;
const unrelatedQuestionId = `push-unrelated-${suffix}`;
const password = `Push-${randomUUID()}-Aa1!`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function createUser(
  admin: SupabaseClient,
  url: string,
  publishableKey: string,
  label: string,
  onCreated: (id: string) => void,
): Promise<UserFixture> {
  const email = `push-smoke-${label}-${suffix}@example.invalid`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    throw new Error(`create ${label}: ${created.error?.message ?? "no user returned"}`);
  }
  onCreated(created.data.user.id);

  const client = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) {
    throw new Error(`sign in ${label}: ${signedIn.error?.message ?? "no session returned"}`);
  }
  return { client, email, id: created.data.user.id };
}

async function expectRejected(label: string, action: () => Promise<{ error: unknown }>) {
  const result = await action();
  assert(result.error, `${label}: expected rejection`);
}

async function setupContent(
  client: pg.Client,
  ownerId: string,
  unrelatedId: string,
): Promise<void> {
  const author = await client.query<{ id: string }>("select id from public.authors limit 1");
  const place = await client.query<{ id: string }>("select id from public.places limit 1");
  assert(author.rowCount && place.rowCount, "seed must contain an author and place");

  for (const [id, userId, moderationStatus] of [
    [questionId, ownerId, "published"],
    [unrelatedQuestionId, unrelatedId, "published"],
  ] as const) {
    await client.query(
      `insert into public.posts
         (id, author_id, place_id, kind, display_time, text, image_url,
          user_id, profile_id, author_kind, moderation_status)
       values ($1, $2, $3, 'question', 'now', 'push security fixture', '',
               $4, $4, 'user', $5)`,
      [id, author.rows[0].id, place.rows[0].id, userId, moderationStatus],
    );
  }
}

async function outboxCount(client: pg.Client, commentId: string) {
  const result = await client.query<{ count: string }>(
    "select count(*) from private.push_notification_outbox where source_comment_id = $1",
    [commentId],
  );
  return Number(result.rows[0].count);
}

async function main() {
  const { publishableKey, url } = readSupabaseClientConfig();
  const adminApi = createClient(url, readServiceRoleKey(), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const db = createPgSession("session", "push-smoke-admin");
  const claimA = await connectGuarded("session", "push-claim-a");
  const claimB = await connectGuarded("session", "push-claim-b");
  const createdUserIds: string[] = [];
  const commentIds: string[] = [];

  try {
    const trackCreated = (id: string) => createdUserIds.push(id);
    const owner = await createUser(adminApi, url, publishableKey, "owner", trackCreated);
    const answerer = await createUser(adminApi, url, publishableKey, "answerer", trackCreated);
    const unrelated = await createUser(adminApi, url, publishableKey, "unrelated", trackCreated);

    await db.once((client) => setupContent(client, owner.id, unrelated.id));

    // The provider allowlist is enforced under the ordinary authenticated API.
    await expectRejected("SSRF endpoint", async () =>
      owner.client.from("push_subscriptions").insert({
        auth_key: "auth",
        endpoint: "https://fcm.googleapis.com.evil.example/private",
        p256dh: "key",
        user_id: owner.id,
      }),
    );
    const fcmEndpoint = `https://fcm.googleapis.com/fcm/send/${suffix}-one`;
    const databaseAllowlist = await db.withPg((client) =>
      client.query<{ allowed: boolean }>("select private.is_allowed_push_endpoint($1) as allowed", [
        fcmEndpoint,
      ]),
    );
    assert(databaseAllowlist.rows[0]?.allowed, "database rejected the valid FCM endpoint shape");
    const firstSubscription = await owner.client
      .from("push_subscriptions")
      .insert({
        auth_key: "auth-one",
        endpoint: fcmEndpoint,
        p256dh: "key-one",
        user_id: owner.id,
      })
      .select("id")
      .single();
    assert(
      !firstSubscription.error && firstSubscription.data,
      `valid FCM subscription rejected: ${firstSubscription.error?.code ?? "unknown_code"} ${
        firstSubscription.error?.message ?? "unknown_message"
      }`,
    );

    // Endpoint and encryption keys are private to their owner, including for
    // direct REST calls made by another signed-in account.
    const otherRead = await answerer.client
      .from("push_subscriptions")
      .select("id")
      .eq("id", firstSubscription.data.id);
    assert(!otherRead.error && otherRead.data?.length === 0, "another user read a subscription");
    const otherUpdate = await answerer.client
      .from("push_subscriptions")
      .update({ auth_key: "forged" })
      .eq("id", firstSubscription.data.id)
      .select("id");
    assert(
      !otherUpdate.error && otherUpdate.data?.length === 0,
      "another user updated a subscription",
    );
    const otherDelete = await answerer.client
      .from("push_subscriptions")
      .delete()
      .eq("id", firstSubscription.data.id)
      .select("id");
    assert(
      !otherDelete.error && otherDelete.data?.length === 0,
      "another user deleted a subscription",
    );
    const signedOut = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    await expectRejected("signed-out subscription insert", async () =>
      signedOut.from("push_subscriptions").insert({
        auth_key: "auth",
        endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}-signed-out`,
        p256dh: "key",
        user_id: owner.id,
      }),
    );
    const secondSubscription = await owner.client
      .from("push_subscriptions")
      .insert({
        auth_key: "auth-two",
        endpoint: `https://web.push.apple.com/QH/${suffix}-two`,
        p256dh: "key-two",
        user_id: owner.id,
      })
      .select("id")
      .single();
    assert(
      !secondSubscription.error && secondSubscription.data,
      "valid Apple subscription rejected",
    );
    const thirdSubscription = await owner.client
      .from("push_subscriptions")
      .insert({
        auth_key: "auth-three",
        endpoint: `https://updates.push.services.mozilla.com/wpush/v2/${suffix}-three`,
        p256dh: "key-three",
        user_id: owner.id,
      })
      .select("id")
      .single();
    assert(
      !thirdSubscription.error && thirdSubscription.data,
      "valid Mozilla subscription rejected",
    );

    // A block in either direction prevents the publication event from entering
    // the push outbox. General comment-write enforcement is tested separately.
    await db.once((client) =>
      client.query(
        "insert into public.user_blocks (blocker_id, blocked_id, kind) values ($1, $2, 'block')",
        [owner.id, answerer.id],
      ),
    );
    const blockedAnswer = await answerer.client
      .from("comments")
      .insert({
        author_name: "blocked",
        moderation_status: "pending",
        post_id: questionId,
        target_type: "post",
        text: "blocked",
        user_id: answerer.id,
      })
      .select("id")
      .single();
    assert(!blockedAnswer.error && blockedAnswer.data, "blocked answer fixture rejected");
    commentIds.push(blockedAnswer.data.id);
    await db.once((client) =>
      client.query("update public.comments set moderation_status = 'published' where id = $1", [
        blockedAnswer.data.id,
      ]),
    );
    assert(
      (await db.withPg((client) => outboxCount(client, blockedAnswer.data.id))) === 0,
      "blocked answer enqueued",
    );
    await db.once((client) =>
      client.query("delete from public.user_blocks where blocker_id = $1", [owner.id]),
    );

    const answer = await answerer.client
      .from("comments")
      .insert({
        author_name: "answerer",
        moderation_status: "pending",
        post_id: questionId,
        target_type: "post",
        text: "legitimate answer",
        user_id: answerer.id,
      })
      .select("id")
      .single();
    assert(!answer.error && answer.data, `legitimate answer rejected: ${answer.error?.message}`);
    commentIds.push(answer.data.id);

    assert(
      (await db.withPg((client) => outboxCount(client, answer.data.id))) === 0,
      "pending answer enqueued",
    );
    await db.once((client) =>
      client.query("update public.comments set moderation_status = 'published' where id = $1", [
        answer.data.id,
      ]),
    );
    assert(
      (await db.withPg((client) => outboxCount(client, answer.data.id))) === 1,
      "publish did not enqueue exactly once",
    );
    const queuedRecipient = await db.withPg((client) =>
      client.query<{ recipient_id: string }>(
        "select recipient_id from private.push_notification_outbox where source_comment_id = $1",
        [answer.data.id],
      ),
    );
    assert(
      queuedRecipient.rows[0]?.recipient_id === owner.id,
      "published answer was queued for a caller-chosen recipient",
    );
    await db.once(async (client) => {
      await client.query("update public.comments set text = 'edited after publish' where id = $1", [
        answer.data.id,
      ]);
      await client.query("update public.comments set moderation_status = 'hidden' where id = $1", [
        answer.data.id,
      ]);
      await client.query(
        "update public.comments set moderation_status = 'published' where id = $1",
        [answer.data.id],
      );
    });
    assert(
      (await db.withPg((client) => outboxCount(client, answer.data.id))) === 1,
      "edit/re-publish duplicated event",
    );

    // An unrelated published parent remains eligible, and self-answering never enqueues.
    const unrelatedAnswer = await answerer.client
      .from("comments")
      .insert({
        author_name: "answerer",
        moderation_status: "pending",
        post_id: unrelatedQuestionId,
        target_type: "post",
        text: "unrelated success",
        user_id: answerer.id,
      })
      .select("id")
      .single();
    assert(!unrelatedAnswer.error && unrelatedAnswer.data, "unrelated-user answer rejected");
    commentIds.push(unrelatedAnswer.data.id);
    const selfAnswer = await owner.client
      .from("comments")
      .insert({
        author_name: "owner",
        moderation_status: "pending",
        post_id: questionId,
        target_type: "post",
        text: "self answer",
        user_id: owner.id,
      })
      .select("id")
      .single();
    assert(!selfAnswer.error && selfAnswer.data, "self-answer fixture rejected");
    commentIds.push(selfAnswer.data.id);
    await db.once((client) =>
      client.query(
        "update public.comments set moderation_status = 'published' where id = any($1::uuid[])",
        [[unrelatedAnswer.data.id, selfAnswer.data.id]],
      ),
    );
    assert(
      (await db.withPg((client) => outboxCount(client, selfAnswer.data.id))) === 0,
      "self-answer enqueued",
    );

    // Queue internals and service RPCs are unavailable to client roles.
    await db.withPg(async (client) => {
      const subscriptionGrants = await client.query<{
        grantee: string;
        privilege_type: string;
      }>(`
        select grantee, privilege_type
        from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = 'push_subscriptions'
          and grantee in ('anon', 'authenticated')
        order by grantee, privilege_type
      `);
      assert(
        JSON.stringify(subscriptionGrants.rows) ===
          JSON.stringify(
            ["DELETE", "INSERT", "SELECT", "UPDATE"].map((privilege_type) => ({
              grantee: "authenticated",
              privilege_type,
            })),
          ),
        "push subscription table grants exceed authenticated CRUD",
      );
      const grants = await client.query<{ count: string }>(`
        select count(*)
        from information_schema.role_table_grants
        where table_schema = 'private'
          and grantee in ('anon', 'authenticated', 'service_role')
      `);
      assert(Number(grants.rows[0].count) === 0, "private queue tables have client grants");
      const routines = await client.query<{ grantee: string; routine_name: string }>(`
        select grantee, routine_name
        from information_schema.role_routine_grants
        where routine_schema = 'public'
          and routine_name in ('claim_push_delivery_batch', 'prepare_push_delivery', 'complete_push_delivery')
          and grantee in ('PUBLIC', 'anon', 'authenticated')
      `);
      assert(routines.rowCount === 0, "internal RPC is executable by a client role");
    });

    // Two workers cannot claim the same delivery. Replays after completion see no due row.
    const [claimedA, claimedB] = await Promise.all([
      claimA.query<{ delivery_id: string; claim_token: string }>(
        "select * from public.claim_push_delivery_batch()",
      ),
      claimB.query<{ delivery_id: string; claim_token: string }>(
        "select * from public.claim_push_delivery_batch()",
      ),
    ]);
    const claims = [...claimedA.rows, ...claimedB.rows];
    assert(claims.length >= 3, "expected at least three per-device deliveries");
    assert(
      new Set(claims.map((row) => row.delivery_id)).size === claims.length,
      "concurrent workers double-claimed a delivery",
    );

    const firstClaim = claims[0];
    const prepared = await db.withPg((client) =>
      client.query<{ comment_text: string; subscription_id: string }>(
        "select * from public.prepare_push_delivery($1, $2)",
        [firstClaim.delivery_id, firstClaim.claim_token],
      ),
    );
    assert(
      prepared.rowCount === 1 && prepared.rows[0].comment_text === "edited after publish",
      "worker did not re-read current text",
    );
    await db.once((client) =>
      client.query("select public.complete_push_delivery($1, $2, 'sent', null)", [
        firstClaim.delivery_id,
        firstClaim.claim_token,
      ]),
    );
    const replay = await db.withPg((client) =>
      client.query<{ delivery_id: string }>("select * from public.claim_push_delivery_batch()"),
    );
    assert(
      !replay.rows.some((row) => row.delivery_id === firstClaim.delivery_id),
      "completed delivery replayed",
    );

    // An expired lease is reclaimed with a fresh claim before it can be completed.
    const abandonedClaim = claims[1];
    await db.once((client) =>
      client.query(
        "update private.push_notification_deliveries set processing_at = now() - interval '6 minutes' where id = $1",
        [abandonedClaim.delivery_id],
      ),
    );
    const recovered = await db.withPg((client) =>
      client.query<{ claim_token: string; delivery_id: string }>(
        "select * from public.claim_push_delivery_batch()",
      ),
    );
    const goneClaim = recovered.rows.find((row) => row.delivery_id === abandonedClaim.delivery_id);
    assert(goneClaim, "expired lease was not reclaimed");
    assert(
      goneClaim.claim_token !== abandonedClaim.claim_token,
      "lease recovery reused a claim token",
    );
    const gonePrepared = await db.withPg((client) =>
      client.query<{ subscription_id: string }>(
        "select * from public.prepare_push_delivery($1, $2)",
        [goneClaim.delivery_id, goneClaim.claim_token],
      ),
    );
    assert(gonePrepared.rowCount === 1, "reclaimed delivery could not be prepared");

    // 404/410 semantics remove exactly the affected subscription.
    await db.once((client) =>
      client.query("select public.complete_push_delivery($1, $2, 'gone', 'http_410')", [
        goneClaim.delivery_id,
        goneClaim.claim_token,
      ]),
    );
    const goneSubscription = await db.withPg((client) =>
      client.query("select 1 from public.push_subscriptions where id = $1", [
        gonePrepared.rows[0].subscription_id,
      ]),
    );
    assert(goneSubscription.rowCount === 0, "gone subscription was not removed");

    // A transient error has four total attempts with 1/5/30 minute backoffs,
    // then terminates as failed. The test advances only the due timestamp.
    let retryClaim = claims.find(
      (row) =>
        row.delivery_id !== firstClaim.delivery_id &&
        row.delivery_id !== abandonedClaim.delivery_id,
    );
    assert(retryClaim, "retry fixture delivery was not claimed");
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await db.once((client) =>
        client.query("select public.complete_push_delivery($1, $2, 'transient', 'network_error')", [
          retryClaim?.delivery_id,
          retryClaim?.claim_token,
        ]),
      );
      if (attempt < 4) {
        await db.once((client) =>
          client.query(
            "update private.push_notification_deliveries set next_attempt_at = now() where id = $1",
            [retryClaim?.delivery_id],
          ),
        );
        const next = await db.withPg((client) =>
          client.query<{ claim_token: string; delivery_id: string }>(
            "select * from public.claim_push_delivery_batch()",
          ),
        );
        retryClaim = next.rows.find((row) => row.delivery_id === retryClaim?.delivery_id);
        assert(retryClaim, `retry attempt ${attempt + 1} was not claimed`);
      }
    }
    const exhausted = await db.withPg((client) =>
      client.query<{ attempt_count: number; status: string }>(
        "select attempt_count, status from private.push_notification_deliveries where id = $1",
        [retryClaim.delivery_id],
      ),
    );
    assert(
      exhausted.rows[0]?.status === "failed" && exhausted.rows[0].attempt_count === 4,
      "transient retry did not terminate after four attempts",
    );

    // Eligibility is checked again after claiming and immediately before
    // transport, so a newly-created block cancels already queued deliveries.
    const revokedAnswer = await answerer.client
      .from("comments")
      .insert({
        author_name: "answerer",
        moderation_status: "pending",
        post_id: questionId,
        target_type: "post",
        text: "revoked before delivery",
        user_id: answerer.id,
      })
      .select("id")
      .single();
    assert(!revokedAnswer.error && revokedAnswer.data, "revoked answer fixture rejected");
    commentIds.push(revokedAnswer.data.id);
    await db.once((client) =>
      client.query("update public.comments set moderation_status = 'published' where id = $1", [
        revokedAnswer.data.id,
      ]),
    );
    const revokedClaims = await db.withPg((client) =>
      client.query<{ claim_token: string; delivery_id: string }>(
        "select * from public.claim_push_delivery_batch()",
      ),
    );
    assert(revokedClaims.rowCount === 2, "expected one revoked delivery per active subscription");
    await db.once((client) =>
      client.query(
        "insert into public.user_blocks (blocker_id, blocked_id, kind) values ($1, $2, 'block')",
        [answerer.id, owner.id],
      ),
    );
    for (const claim of revokedClaims.rows) {
      const preparedAfterBlock = await db.withPg((client) =>
        client.query("select * from public.prepare_push_delivery($1, $2)", [
          claim.delivery_id,
          claim.claim_token,
        ]),
      );
      assert(preparedAfterBlock.rowCount === 0, "blocked delivery reached transport preparation");
    }
    await db.once((client) =>
      client.query("delete from public.user_blocks where blocker_id = $1", [answerer.id]),
    );

    // A worker crash on the fourth attempt must terminalize both the expired
    // delivery and its parent outbox instead of leaving the event processing.
    const leaseAnswer = await answerer.client
      .from("comments")
      .insert({
        author_name: "answerer",
        moderation_status: "pending",
        post_id: questionId,
        target_type: "post",
        text: "fourth attempt lease",
        user_id: answerer.id,
      })
      .select("id")
      .single();
    assert(!leaseAnswer.error && leaseAnswer.data, "lease answer fixture rejected");
    commentIds.push(leaseAnswer.data.id);
    await db.once((client) =>
      client.query("update public.comments set moderation_status = 'published' where id = $1", [
        leaseAnswer.data.id,
      ]),
    );
    const leaseClaims = await db.withPg((client) =>
      client.query<{ claim_token: string; delivery_id: string }>(
        "select * from public.claim_push_delivery_batch()",
      ),
    );
    assert(leaseClaims.rowCount === 2, "expected two lease-test deliveries");
    const expiredLease = leaseClaims.rows[0];
    const terminalPeer = leaseClaims.rows[1];
    await db.once(async (client) => {
      await client.query("select public.complete_push_delivery($1, $2, 'permanent', 'http_400')", [
        terminalPeer.delivery_id,
        terminalPeer.claim_token,
      ]);
      await client.query(
        `update private.push_notification_deliveries
         set attempt_count = 4,
             processing_at = now() - interval '6 minutes'
         where id = $1`,
        [expiredLease.delivery_id],
      );
    });
    const claimsAfterLeaseExpiry = await db.withPg((client) =>
      client.query<{ delivery_id: string }>("select * from public.claim_push_delivery_batch()"),
    );
    assert(
      !claimsAfterLeaseExpiry.rows.some((row) => row.delivery_id === expiredLease.delivery_id),
      "fourth-attempt expired lease was reclaimed",
    );
    const terminalLeaseState = await db.withPg((client) =>
      client.query<{ delivery_status: string; outbox_status: string }>(
        `select d.status as delivery_status, o.status as outbox_status
         from private.push_notification_deliveries as d
         join private.push_notification_outbox as o on o.id = d.outbox_id
         where d.id = $1`,
        [expiredLease.delivery_id],
      ),
    );
    assert(
      terminalLeaseState.rows[0]?.delivery_status === "failed" &&
        terminalLeaseState.rows[0]?.outbox_status === "failed",
      "expired fourth attempt did not terminalize its outbox",
    );

    // A user cannot store unlimited devices or oversized payloads. Use the
    // unrelated account so the earlier per-device delivery assertions stay
    // focused on the original three subscriptions.
    await expectRejected("oversized endpoint", async () =>
      unrelated.client.from("push_subscriptions").insert({
        auth_key: "auth",
        endpoint: `https://fcm.googleapis.com/fcm/send/${"x".repeat(2100)}`,
        p256dh: "key",
        user_id: unrelated.id,
      }),
    );
    await expectRejected("oversized encryption key", async () =>
      unrelated.client.from("push_subscriptions").insert({
        auth_key: "auth",
        endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}-oversized-key`,
        p256dh: "x".repeat(257),
        user_id: unrelated.id,
      }),
    );
    await expectRejected("oversized authentication key", async () =>
      unrelated.client.from("push_subscriptions").insert({
        auth_key: "x".repeat(129),
        endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}-oversized-auth`,
        p256dh: "key",
        user_id: unrelated.id,
      }),
    );
    const deviceRegistrations = await Promise.all(
      Array.from({ length: 11 }, (_, device) =>
        unrelated.client.from("push_subscriptions").insert({
          auth_key: "auth",
          endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}-device-${device}`,
          p256dh: "key",
          user_id: unrelated.id,
        }),
      ),
    );
    assert(
      deviceRegistrations.filter((result) => !result.error).length === 10 &&
        deviceRegistrations.filter((result) => result.error).length === 1,
      "concurrent device registrations exceeded the ten-subscription limit",
    );
    await expectRejected("twelfth device", async () =>
      unrelated.client.from("push_subscriptions").insert({
        auth_key: "auth",
        endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}-device-over-limit`,
        p256dh: "key",
        user_id: unrelated.id,
      }),
    );

    // One claim call may fan out at most 20 outboxes to at most ten devices.
    // Roll back the synthetic queue rows so they never escape this test.
    await db.withPg(async (client) => {
      await client.query("begin");
      try {
        const created = await client.query<{ id: string }>(
          `insert into private.push_notification_outbox
             (event_type,source_comment_id,recipient_id,created_at)
           select 'question_answer_published',extensions.gen_random_uuid(),$1,
                  now()-interval '1 day'
           from generate_series(1,25)
           returning id`,
          [unrelated.id],
        );
        const ids = created.rows.map((row) => row.id);
        assert(ids.length === 25, "bounded fanout fixture was incomplete");
        const claimed = await client.query("select * from public.claim_push_delivery_batch()");
        assert(claimed.rowCount !== null && claimed.rowCount <= 20, "worker claimed over 20 rows");
        const result = await client.query<{
          deliveries: string;
          outboxes_with_deliveries: string;
          queued_without_deliveries: string;
        }>(
          `select count(d.id) as deliveries,
                  count(distinct d.outbox_id) as outboxes_with_deliveries,
                  count(distinct o.id) filter (where d.id is null and o.status='queued')
                    as queued_without_deliveries
           from private.push_notification_outbox as o
           left join private.push_notification_deliveries as d on d.outbox_id=o.id
           where o.id=any($1::uuid[])`,
          [ids],
        );
        assert(
          Number(result.rows[0].deliveries) === 200 &&
            Number(result.rows[0].outboxes_with_deliveries) === 20 &&
            Number(result.rows[0].queued_without_deliveries) === 5,
          "one worker call did not bound fanout to 20 outboxes and ten devices",
        );
      } finally {
        await client.query("rollback");
      }
    });

    console.log(JSON.stringify({ ok: true, claims: claims.length, outbox: "durable" }, null, 2));
  } finally {
    await db
      .withPg(async (client) => {
        await client.query("delete from public.comments where id = any($1::uuid[])", [commentIds]);
        await client.query("delete from public.posts where id = any($1::text[])", [
          [questionId, unrelatedQuestionId],
        ]);
        for (const userId of createdUserIds) {
          await client.query("delete from auth.users where id = $1", [userId]);
        }
      })
      .catch((error) => console.error("push security fixture cleanup failed", error));
    await db.close();
    await endQuietly(claimA, claimB);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

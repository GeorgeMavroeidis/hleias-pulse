// Sends a web push notification for one new answer to a question post.
//
// Deliberately trusts nothing from the caller except a comment id — the
// trigger that calls this (notify_question_answered, in
// 20260908090000_add_push_subscriptions.sql) only ever sends that, on
// purpose: this function re-derives the question, its owner, and the real
// answer text itself using the service_role key, so nobody can spoof a
// notification's content by hitting this endpoint directly with a
// fabricated title/body.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to
// every edge function by the platform — not something to set by hand.
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are the ones that do
// need setting once: `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...`

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const admin = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req) => {
  try {
    const { comment_id: commentId } = await req.json();
    if (!commentId || typeof commentId !== "string") {
      return new Response(JSON.stringify({ error: "comment_id required" }), { status: 400 });
    }

    const { data: comment, error: commentError } = await admin
      .from("comments")
      .select("id, post_id, user_id, text, target_type")
      .eq("id", commentId)
      .single();
    if (commentError || !comment || comment.target_type !== "post" || !comment.post_id) {
      return new Response(JSON.stringify({ skipped: "not a post comment" }), { status: 200 });
    }

    const { data: post, error: postError } = await admin
      .from("posts")
      .select("id, kind, user_id, text")
      .eq("id", comment.post_id)
      .single();
    if (postError || !post || post.kind !== "question" || !post.user_id) {
      return new Response(JSON.stringify({ skipped: "not a question, or no owner" }), {
        status: 200,
      });
    }

    // Don't notify someone that they answered their own question.
    if (comment.user_id && comment.user_id === post.user_id) {
      return new Response(JSON.stringify({ skipped: "self-answer" }), { status: 200 });
    }

    const { data: subscriptions, error: subsError } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", post.user_id);
    if (subsError) throw subsError;
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ skipped: "no subscriptions" }), { status: 200 });
    }

    const payload = JSON.stringify({
      title: "Κάποιος απάντησε στην ερώτησή σου",
      body: comment.text.length > 140 ? `${comment.text.slice(0, 137)}…` : comment.text,
      url: `/?post=${post.id}`,
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          payload,
        ),
      ),
    );

    // A 404/410 means the browser dropped that subscription (uninstalled,
    // cleared data, expired) — stop sending to it instead of failing forever.
    const stale = subscriptions.filter((_, i) => {
      const r = results[i];
      return (
        r.status === "rejected" && [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0)
      );
    });
    if (stale.length > 0) {
      await admin
        .from("push_subscriptions")
        .delete()
        .in("id", stale.map((s) => s.id));
    }

    return new Response(
      JSON.stringify({ sent: results.filter((r) => r.status === "fulfilled").length }),
      { status: 200 },
    );
  } catch (error) {
    console.error("send-push failed", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});

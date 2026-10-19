import { formatDistanceStrict } from "date-fns";
import type { Post } from "../hp-model";
import { evaluateFreshness } from "./freshness";

/**
 * `Post.time` (the `display_time` column) is written once when a post is
 * created and never updated — for a real user post that's always the literal
 * string "just now", forever (see ROADMAP.md → "Next up"). `created_at` is
 * the real timestamp and is already carried on every `Post`; this just
 * renders it as "3 minutes ago" / "2 hours ago" instead of trusting the
 * frozen label.
 *
 * Event posts are the deliberate exception: their `display_time` is the
 * event's own schedule ("Tonight · 22:30"), not a posting age, so it's left
 * exactly as authored.
 */
export function displayPostTime(
  post: Pick<Post, "kind" | "time" | "createdAt">,
  nowMs = Date.now(),
): string {
  if (post.kind === "event" || !post.createdAt) return post.time;
  const created = new Date(post.createdAt);
  if (Number.isNaN(created.getTime())) return post.time;
  return formatDistanceStrict(created, nowMs, { addSuffix: true });
}

/** "Now" requires a valid observation younger than three hours. */
export function isRecentlyPosted(
  post: Pick<Post, "time" | "createdAt">,
  nowMs = Date.now(),
): boolean {
  return evaluateFreshness({ observedAt: post.createdAt, nowMs }).isRecent;
}

import { formatDistanceToNowStrict } from "date-fns";
import type { Post } from "../hp-model";

/** A post created within this window still reasonably counts as "happening now". */
const RECENT_MS = 60 * 60 * 1000; // 1 hour

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
export function displayPostTime(post: Pick<Post, "kind" | "time" | "createdAt">): string {
  if (post.kind === "event" || !post.createdAt) return post.time;
  const created = new Date(post.createdAt);
  if (Number.isNaN(created.getTime())) return post.time;
  return formatDistanceToNowStrict(created, { addSuffix: true });
}

/**
 * Whether a post should count as "Now" in the Pulse feed's filter tabs.
 * Event posts and busy/popular places already qualify elsewhere; this covers
 * plain posts. It used to check whether `display_time` contained the word
 * "now" — which only ever matched the frozen "just now" label, so a post
 * from last month still read as "Now" forever. Checking real freshness off
 * `created_at` fixes that without changing what the tab means.
 */
export function isRecentlyPosted(post: Pick<Post, "time" | "createdAt">): boolean {
  if (!post.createdAt) return post.time.toLowerCase().includes("now");
  return Date.now() - new Date(post.createdAt).getTime() < RECENT_MS;
}

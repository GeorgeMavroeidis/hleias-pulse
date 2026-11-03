import type { Post } from "../hp-model";
import { evaluateFreshness } from "./freshness";
import { observationLabel } from "./surface-freshness";

export function displayPostTime(
  post: Pick<Post, "kind" | "time" | "createdAt">,
  nowMs = Date.now(),
  language: "GR" | "EN" = "EN",
): string {
  return observationLabel(post.createdAt, nowMs, language).relative;
}

/** Authored tags and frozen display labels cannot make an old post current. */
export function isRecentlyPosted(
  post: Pick<Post, "time" | "createdAt">,
  nowMs = Date.now(),
): boolean {
  return evaluateFreshness({ observedAt: post.createdAt, nowMs }).isRecent;
}

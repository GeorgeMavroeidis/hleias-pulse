import type { PulseData } from "@/lib/hp-api";
import { evaluateFreshness, storyObservedAt, timestampMs } from "@/lib/hp/freshness";

export type ActivityEvidenceKind = "story" | "post" | "meetEvent" | "event" | "comment";
export type ActivityEvidence = {
  kind: ActivityEvidenceKind;
  timestamp: number | null;
  contributorId: string | null;
  weight: number;
  expiresAt?: number | null;
};
export const ACTIVITY_EVIDENCE_WEIGHTS: Record<ActivityEvidenceKind, number> = {
  story: 1.25,
  post: 1,
  meetEvent: 1,
  event: 0.6,
  comment: 0.35,
};

export function evidenceScore(weight: number, saturationWeight = 4) {
  return 100 * (1 - Math.exp(-Math.max(0, weight) / saturationWeight));
}

function contributorId(value: {
  profileId?: string | null;
  userId?: string | null;
  authorId?: string;
  author?: string;
}) {
  return value.profileId ?? value.userId ?? value.authorId ?? value.author ?? null;
}

/** Collect observed records, never cached place counters or future event starts. */
export function buildPlaceEvidence(
  data: PulseData,
  nowMs: number,
  weights = ACTIVITY_EVIDENCE_WEIGHTS,
): Map<string, ActivityEvidence[]> {
  const byPlace = new Map<string, ActivityEvidence[]>();
  const add = (
    placeId: string,
    kind: ActivityEvidenceKind,
    observedAt: string | null | undefined,
    contributor: string | null,
    expiresAt?: number | null,
  ) => {
    const freshness = evaluateFreshness({ observedAt, expiresAt, nowMs });
    const item: ActivityEvidence = {
      kind,
      timestamp: freshness.observedAtMs,
      contributorId: contributor,
      weight: weights[kind],
      expiresAt,
    };
    const list = byPlace.get(placeId) ?? [];
    list.push(item);
    byPlace.set(placeId, list);
  };
  data.posts.forEach((post) => {
    add(post.placeId, "post", post.createdAt, contributorId(post));
    post.comments.forEach((comment) =>
      add(post.placeId, "comment", comment.createdAt, contributorId(comment)),
    );
  });
  Object.entries(data.placeComments).forEach(([placeId, comments]) =>
    comments.forEach((comment) =>
      add(placeId, "comment", comment.createdAt, contributorId(comment)),
    ),
  );
  data.events.forEach((event) => add(event.placeId, "event", event.createdAt, null));
  data.meetEvents.forEach((event) =>
    add(event.placeId, "meetEvent", event.createdAt, contributorId(event)),
  );
  data.stories.forEach((story) => {
    const observedAt = storyObservedAt(story);
    const timestamp = timestampMs(observedAt);
    const duration = story.expiresAfterHours ?? 24;
    const expiry = timestamp === null ? null : timestamp + duration * 60 * 60_000;
    add(story.placeId, "story", observedAt, contributorId(story), expiry);
  });
  return byPlace;
}

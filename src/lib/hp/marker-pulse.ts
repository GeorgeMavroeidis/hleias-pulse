import type { PulseData } from "../hp-api";
import type { Comment } from "../hp-model";
import {
  AREA_INTELLIGENCE_CONFIG,
  deriveAreaIntelligence,
  type ActivityEvidence,
  type SignalQuality,
} from "./area-intelligence";

/** Recent attributable community content, never attendance or live presence. */
export type PulseLevel = "quiet" | "emerging" | "active" | "lively" | "fading";
export type MarkerPulseSignal = {
  level: PulseLevel | null;
  quality: SignalQuality;
  lastSignalAt: string | null;
  score: number;
  contributorCount: number;
};
type MarkerEvidence = ActivityEvidence & { expiresAt: number | null };
export type MarkerPulseInput = {
  fetchedAt: number | null;
  available: boolean;
  placeIds: string[];
  evidence: Record<string, MarkerEvidence[]>;
};
export type MarkerPulseSnapshot = Record<string, MarkerPulseSignal>;

export const MARKER_PULSE_MAX_SNAPSHOT_AGE_MS = 3 * 60_000;
export const EMPTY_MARKER_PULSE_INPUT: MarkerPulseInput = {
  fetchedAt: null,
  available: false,
  placeIds: [],
  evidence: {},
};
export const NEUTRAL_MARKER_PULSE: MarkerPulseSignal = {
  level: null,
  quality: "uncertain",
  lastSignalAt: null,
  score: 0,
  contributorCount: 0,
};
const MARKER_EVIDENCE_CONFIG = {
  ...AREA_INTELLIGENCE_CONFIG,
  legacyActivityShare: 0,
};

/** Normalize only public bootstrap evidence. No seed imports or metadata floors. */
export function buildMarkerPulseInput(data: PulseData, fetchedAt: number): MarkerPulseInput {
  const placeIds = [...new Set(data.places.map((place) => place.id))];
  const knownPlaces = new Set(placeIds);
  const evidence: Record<string, MarkerEvidence[]> = Object.fromEntries(
    placeIds.map((id) => [id, []]),
  );
  const seen = new Set<string>();
  const add = (
    placeId: string,
    kind: ActivityEvidence["kind"],
    key: string,
    createdAt: string | null | undefined,
    identity: { userId?: string | null; profileId?: string | null },
    expiresAt: number | null = null,
  ) => {
    const contributor = identity.userId || identity.profileId;
    const timestamp = createdAt ? Date.parse(createdAt) : Number.NaN;
    if (
      !knownPlaces.has(placeId) ||
      !contributor ||
      !Number.isFinite(timestamp) ||
      timestamp > fetchedAt + MARKER_EVIDENCE_CONFIG.futureToleranceMs ||
      (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= fetchedAt))
    )
      return;
    const identityKey = JSON.stringify([kind, placeId, key]);
    if (seen.has(identityKey)) return;
    seen.add(identityKey);
    evidence[placeId].push({
      kind,
      timestamp,
      contributorId: contributor,
      weight: MARKER_EVIDENCE_CONFIG.evidenceWeights[kind],
      expiresAt,
    });
  };
  const addComment = (placeId: string, target: string, comment: Comment) => {
    // Comments have no ID in the existing bootstrap contract.
    const key = JSON.stringify([
      target,
      comment.userId || comment.profileId,
      comment.createdAt,
      comment.text,
    ]);
    add(placeId, "comment", key, comment.createdAt, comment);
  };
  data.posts.forEach((post) => {
    add(post.placeId, "post", post.id, post.createdAt, post);
    post.comments.forEach((comment) => addComment(post.placeId, `post:${post.id}`, comment));
  });
  Object.entries(data.placeComments).forEach(([placeId, comments]) => {
    comments.forEach((comment) => addComment(placeId, `place:${placeId}`, comment));
  });
  data.stories.forEach((story) => {
    const expiresAt =
      story.expiresAfterHours == null
        ? null
        : Date.parse(story.createdAt) + story.expiresAfterHours * 3_600_000;
    add(story.placeId, "story", story.id, story.createdAt, story, expiresAt);
  });
  return { fetchedAt, available: true, placeIds, evidence };
}

/** Shared evidence-to-state rule for places and regions. */
export function pulseInputIsFresh(input: MarkerPulseInput, now: number) {
  return (
    input.available &&
    input.fetchedAt !== null &&
    Number.isFinite(now) &&
    now >= input.fetchedAt &&
    now - input.fetchedAt <= MARKER_PULSE_MAX_SNAPSHOT_AGE_MS
  );
}

export function deriveEvidencePulseSignal(
  evidence: readonly MarkerEvidence[],
  now: number,
): MarkerPulseSignal {
  const signal = deriveAreaIntelligence(
    {
      areaId: "community-content",
      legacyRawScore: 0,
      evidence: evidence.filter((item) => item.expiresAt === null || item.expiresAt > now),
      observedAt: now,
    },
    MARKER_EVIDENCE_CONFIG,
  );
  if (signal.signalQuality === "uncertain") return NEUTRAL_MARKER_PULSE;
  const level: PulseLevel =
    signal.signalQuality === "fading" || signal.state === "cooling"
      ? "fading"
      : signal.state === "hot"
        ? signal.signalQuality === "confirmed" && signal.evidence.contributorCount >= 2
          ? "lively"
          : "active"
        : signal.emerging || signal.state === "rising"
          ? "emerging"
          : signal.state === "active"
            ? "active"
            : "quiet";
  return {
    level,
    quality: signal.signalQuality,
    lastSignalAt: signal.lastSignalAt,
    score: signal.activityScore,
    contributorCount: signal.evidence.contributorCount,
  };
}

export function deriveMarkerPulseSnapshot(
  input: MarkerPulseInput,
  now: number,
): MarkerPulseSnapshot {
  const fresh = pulseInputIsFresh(input, now);
  return Object.fromEntries(
    input.placeIds.map((placeId) => [
      placeId,
      fresh ? deriveEvidencePulseSignal(input.evidence[placeId] ?? [], now) : NEUTRAL_MARKER_PULSE,
    ]),
  );
}

export function markerPulseForPlace(id: string, snapshot: MarkerPulseSnapshot) {
  return snapshot[id] ?? NEUTRAL_MARKER_PULSE;
}

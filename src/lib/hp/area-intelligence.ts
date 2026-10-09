import type { PulseData } from "@/lib/hp-api";
import type { Place } from "@/lib/hp-model";
import { areaIdForPlaceId, groupPlacesByArea } from "@/lib/hp/area-catalog";
import {
  ACTIVITY_EVIDENCE_WEIGHTS,
  buildPlaceEvidence,
  evidenceScore,
  type ActivityEvidence,
  type ActivityEvidenceKind,
} from "@/lib/hp/activity-evidence";
import { evaluateFreshness, FRESHNESS_LIMITS } from "@/lib/hp/freshness";
export type { ActivityEvidence, ActivityEvidenceKind } from "@/lib/hp/activity-evidence";

export type AreaState = "calm" | "rising" | "active" | "hot" | "cooling";
export type SignalQuality = "confirmed" | "stable" | "fading" | "uncertain";

export type AreaIntelligenceEvidence = {
  recentWeight: number;
  baselineWeight: number;
  signalCount: number;
  sourceCount: number;
  contributorCount: number;
  timestampCoverage: number;
};

export type AreaIntelligence = {
  areaId: string;
  state: AreaState;
  activityScore: number;
  momentum: number;
  relativeMomentum: number;
  emerging: boolean;
  signalQuality: SignalQuality;
  confidenceScore: number;
  lastSignalAt: string | null;
  lastConfirmedAt: string | null;
  evidence: AreaIntelligenceEvidence;
};

export type AreaIntelligenceSnapshot = Record<string, AreaIntelligence>;

export type AreaIntelligenceConfig = {
  evidenceWeights: Record<ActivityEvidenceKind, number>;
  recentWindowMs: number;
  baselineWindowMs: number;
  consistencyBucketMs: number;
  confirmedFreshMs: number;
  stableFreshMs: number;
  fadingFreshMs: number;
  futureToleranceMs: number;
  evidenceSaturationWeight: number;
  thresholds: {
    active: number;
    hot: number;
    risingMinimumActivity: number;
    risingMomentum: number;
    risingRelativeMomentum: number;
    risingMinimumWeight: number;
    coolingBaselineActivity: number;
    coolingMomentum: number;
    coolingRelativeMomentum: number;
    emergingMinimumActivity: number;
    emergingMomentum: number;
    emergingRelativeMomentum: number;
    emergingMinimumWeight: number;
    emergingMinimumSources: number;
    emergingMinimumContributors: number;
    confirmedConfidence: number;
    confirmedMinimumWeight: number;
    confirmedMinimumSources: number;
    stableConfidence: number;
  };
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const AREA_INTELLIGENCE_CONFIG: AreaIntelligenceConfig = {
  evidenceWeights: ACTIVITY_EVIDENCE_WEIGHTS,
  recentWindowMs: FRESHNESS_LIMITS.recentMs,
  baselineWindowMs: FRESHNESS_LIMITS.historicalMs,
  consistencyBucketMs: 30 * MINUTE,
  confirmedFreshMs: FRESHNESS_LIMITS.currentMs,
  stableFreshMs: FRESHNESS_LIMITS.recentMs,
  fadingFreshMs: 8 * HOUR,
  futureToleranceMs: FRESHNESS_LIMITS.futureToleranceMs,
  evidenceSaturationWeight: 4,
  thresholds: {
    active: 45,
    hot: 75,
    risingMinimumActivity: 28,
    risingMomentum: 10,
    risingRelativeMomentum: 0.2,
    risingMinimumWeight: 1.5,
    coolingBaselineActivity: 45,
    coolingMomentum: -12,
    coolingRelativeMomentum: -0.25,
    emergingMinimumActivity: 35,
    emergingMomentum: 22,
    emergingRelativeMomentum: 0.6,
    emergingMinimumWeight: 3,
    emergingMinimumSources: 2,
    emergingMinimumContributors: 3,
    confirmedConfidence: 75,
    confirmedMinimumWeight: 3,
    confirmedMinimumSources: 2,
    stableConfidence: 45,
  },
};

export type AreaObservation = {
  areaId: string;
  /** Old payloads may contain this field; it never establishes current activity. */
  legacyRawScore?: number;
  evidence: ActivityEvidence[];
  observedAt: number;
};

type BucketSummary = {
  latestTimestamp: number;
  weight: number;
  kinds: Set<ActivityEvidenceKind>;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const round = (value: number, digits = 0) => {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
};

export function buildAreaObservations(
  data: PulseData,
  observedAt: number,
  config: AreaIntelligenceConfig = AREA_INTELLIGENCE_CONFIG,
): AreaObservation[] {
  const evidenceByPlace = buildPlaceEvidence(data, observedAt, config.evidenceWeights);
  return [...groupPlacesByArea(data.places).entries()].map(([areaId, places]) => ({
    areaId,
    evidence: places.flatMap((place) => evidenceByPlace.get(place.id) ?? []),
    observedAt,
  }));
}

function freshnessForEvidence(item: ActivityEvidence, nowMs: number) {
  return evaluateFreshness({ observedAt: item.timestamp, expiresAt: item.expiresAt, nowMs });
}

function summarizeBuckets(
  evidence: ActivityEvidence[],
  observedAt: number,
  config: AreaIntelligenceConfig,
) {
  const buckets = new Map<number, BucketSummary>();
  evidence.forEach((item) => {
    const freshness = freshnessForEvidence(item, observedAt);
    if (freshness.observedAtMs === null || freshness.ageMs === null) return;
    if (item.expiresAt != null && observedAt >= item.expiresAt) return;
    const age = freshness.ageMs;
    if (age >= config.fadingFreshMs) return;
    const timestamp = freshness.observedAtMs;
    const bucketId = Math.floor(timestamp / config.consistencyBucketMs);
    const bucket = buckets.get(bucketId) ?? {
      latestTimestamp: timestamp,
      weight: 0,
      kinds: new Set<ActivityEvidenceKind>(),
    };
    bucket.latestTimestamp = Math.max(bucket.latestTimestamp, timestamp);
    bucket.weight += item.weight;
    bucket.kinds.add(item.kind);
    buckets.set(bucketId, bucket);
  });
  return [...buckets.values()];
}

export function deriveAreaIntelligence(
  observation: AreaObservation,
  config: AreaIntelligenceConfig = AREA_INTELLIGENCE_CONFIG,
): AreaIntelligence {
  const { evidence, observedAt } = observation;
  const validEvidence = evidence.filter((item) => {
    const freshness = freshnessForEvidence(item, observedAt);
    return (
      freshness.observedAtMs !== null && !(item.expiresAt != null && observedAt >= item.expiresAt)
    );
  });
  const current = validEvidence.filter(
    (item) =>
      freshnessForEvidence(item, observedAt).isCurrent &&
      Math.max(0, observedAt - (item.timestamp as number)) < config.confirmedFreshMs,
  );
  const recent = validEvidence.filter(
    (item) =>
      freshnessForEvidence(item, observedAt).isRecent &&
      Math.max(0, observedAt - (item.timestamp as number)) < config.recentWindowMs,
  );
  const baseline = validEvidence.filter((item) => {
    const age = Math.max(0, observedAt - (item.timestamp as number));
    return age >= config.recentWindowMs && age < config.baselineWindowMs;
  });
  const recentWeight = recent.reduce((sum, item) => sum + item.weight, 0);
  const baselineWeight = baseline.reduce((sum, item) => sum + item.weight, 0);
  const baselineDuration = config.baselineWindowMs - config.recentWindowMs;
  const baselineEquivalentWeight =
    baselineWeight * (config.recentWindowMs / Math.max(config.recentWindowMs, baselineDuration));
  const recentEvidenceScore = evidenceScore(recentWeight, config.evidenceSaturationWeight);
  const baselineEvidenceScore = evidenceScore(
    baselineEquivalentWeight,
    config.evidenceSaturationWeight,
  );
  const rawActivityScore = recentEvidenceScore;
  const activityScore = round(rawActivityScore);
  const baselineActivityScore = baselineEvidenceScore;
  const currentWeight = current.reduce((sum, item) => sum + item.weight, 0);
  const currentKinds = new Set(current.map((item) => item.kind));
  const recentKinds = new Set(recent.map((item) => item.kind));
  const recentContributors = new Set(
    recent.flatMap((item) => (item.contributorId ? [item.contributorId] : [])),
  );
  const spikeReady =
    recentWeight >= config.thresholds.emergingMinimumWeight &&
    recentKinds.size >= config.thresholds.emergingMinimumSources;
  const trendReady = baselineWeight > 0 || spikeReady;
  const momentum = trendReady ? round(recentEvidenceScore - baselineEvidenceScore) : 0;
  const relativeMomentum = trendReady
    ? round(
        clamp(
          (recentWeight - baselineEquivalentWeight) / Math.max(baselineEquivalentWeight, 1.5),
          -1,
          2,
        ),
        2,
      )
    : 0;

  const timestamps = validEvidence.map((item) => item.timestamp as number);
  const latestSignalTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const latestSignalAge =
    latestSignalTimestamp === null ? Number.POSITIVE_INFINITY : observedAt - latestSignalTimestamp;
  const buckets = summarizeBuckets(evidence, observedAt, config);
  const confirmedBuckets = buckets.filter(
    (bucket) =>
      bucket.weight >= config.thresholds.confirmedMinimumWeight &&
      bucket.kinds.size >= config.thresholds.confirmedMinimumSources,
  );
  const lastConfirmedTimestamp =
    confirmedBuckets.length > 0
      ? Math.max(...confirmedBuckets.map((bucket) => bucket.latestTimestamp))
      : null;
  const occupiedRecentBuckets = buckets.filter(
    (bucket) => observedAt - bucket.latestTimestamp < config.stableFreshMs,
  ).length;
  const timestampCoverage = evidence.length === 0 ? 0 : validEvidence.length / evidence.length;
  const recencyFactor =
    latestSignalAge < config.confirmedFreshMs
      ? 1
      : clamp(
          1 -
            (latestSignalAge - config.confirmedFreshMs) /
              (config.fadingFreshMs - config.confirmedFreshMs),
          0,
          1,
        );
  const amountFactor = clamp(recentWeight / config.evidenceSaturationWeight, 0, 1);
  const diversityFactor = clamp(recentKinds.size / 3, 0, 1);
  const consistencyFactor = clamp(occupiedRecentBuckets / 3, 0, 1);
  const confidenceScore = round(
    100 *
      (recencyFactor * 0.35 +
        amountFactor * 0.25 +
        diversityFactor * 0.2 +
        consistencyFactor * 0.15 +
        timestampCoverage * 0.05),
  );

  const currentlyConfirmed =
    confidenceScore >= config.thresholds.confirmedConfidence &&
    latestSignalAge < config.confirmedFreshMs &&
    currentWeight >= config.thresholds.confirmedMinimumWeight &&
    currentKinds.size >= config.thresholds.confirmedMinimumSources;
  const fading =
    !currentlyConfirmed &&
    latestSignalAge < config.fadingFreshMs &&
    ((lastConfirmedTimestamp !== null &&
      observedAt - lastConfirmedTimestamp >= config.confirmedFreshMs) ||
      (latestSignalAge >= config.stableFreshMs && buckets.some((bucket) => bucket.weight >= 1.5)));
  const stable =
    !currentlyConfirmed &&
    !fading &&
    latestSignalAge < config.stableFreshMs &&
    confidenceScore >= config.thresholds.stableConfidence &&
    (recentWeight >= 1 || occupiedRecentBuckets >= 2);
  const signalQuality: SignalQuality = currentlyConfirmed
    ? "confirmed"
    : fading
      ? "fading"
      : stable
        ? "stable"
        : "uncertain";

  const thresholds = config.thresholds;
  const cooling =
    baselineActivityScore >= thresholds.coolingBaselineActivity &&
    momentum <= thresholds.coolingMomentum &&
    relativeMomentum <= thresholds.coolingRelativeMomentum;
  const rising =
    rawActivityScore >= thresholds.risingMinimumActivity &&
    momentum >= thresholds.risingMomentum &&
    relativeMomentum >= thresholds.risingRelativeMomentum &&
    recentWeight >= thresholds.risingMinimumWeight;
  const state: AreaState = cooling
    ? "cooling"
    : rawActivityScore >= thresholds.hot
      ? "hot"
      : rising
        ? "rising"
        : rawActivityScore >= thresholds.active
          ? "active"
          : "calm";
  const emerging =
    (state === "rising" || state === "active") &&
    rawActivityScore >= thresholds.emergingMinimumActivity &&
    momentum >= thresholds.emergingMomentum &&
    relativeMomentum >= thresholds.emergingRelativeMomentum &&
    recentWeight >= thresholds.emergingMinimumWeight &&
    (recentKinds.size >= thresholds.emergingMinimumSources ||
      recentContributors.size >= thresholds.emergingMinimumContributors);

  return {
    areaId: observation.areaId,
    state,
    activityScore,
    momentum,
    relativeMomentum,
    emerging,
    signalQuality,
    confidenceScore,
    lastSignalAt:
      latestSignalTimestamp === null ? null : new Date(latestSignalTimestamp).toISOString(),
    lastConfirmedAt:
      lastConfirmedTimestamp === null ? null : new Date(lastConfirmedTimestamp).toISOString(),
    evidence: {
      recentWeight: round(recentWeight, 2),
      baselineWeight: round(baselineWeight, 2),
      signalCount: recent.length,
      sourceCount: recentKinds.size,
      contributorCount: recentContributors.size,
      timestampCoverage: round(timestampCoverage, 2),
    },
  };
}

export function deriveAreaIntelligenceSnapshot(
  data: PulseData,
  now: Date | number = Date.now(),
  config: AreaIntelligenceConfig = AREA_INTELLIGENCE_CONFIG,
): AreaIntelligenceSnapshot {
  const observedAt = now instanceof Date ? now.getTime() : now;
  return Object.fromEntries(
    buildAreaObservations(data, observedAt, config).map((observation) => {
      const intelligence = deriveAreaIntelligence(observation, config);
      return [intelligence.areaId, intelligence];
    }),
  );
}

export function getAreaIntelligence(
  snapshot: AreaIntelligenceSnapshot,
  areaId: string | null | undefined,
) {
  return areaId ? (snapshot[areaId] ?? null) : null;
}

export function areaPlacesForIntelligence(places: Place[], areaId: string) {
  return places.filter((place) => areaIdForPlaceId(place.id) === areaId);
}

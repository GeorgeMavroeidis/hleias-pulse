import type { Place } from "@/lib/hp-model";
import type { PulseData } from "@/lib/hp-api";
import {
  buildPlaceEvidence,
  evidenceScore,
  type ActivityEvidence,
} from "@/lib/hp/activity-evidence";
import { deriveAreaIntelligence, type SignalQuality } from "@/lib/hp/area-intelligence";
import { evaluateFreshness } from "@/lib/hp/freshness";

export type PulseTier = "quiet" | "moving" | "hot" | "live";

export type PlacePulseMetric = {
  /** Derived from dated evidence; the stored Place.hotness is never used. */
  hotness: number;
  postCount: number;
  eventCount: number;
  commentCount: number;
  storyCount: number;
  evidenceWeight: number;
  score: number;
  tier: PulseTier;
  signalQuality: SignalQuality;
  lastSignalAt: string | null;
  observedAt: number;
  evidence: ActivityEvidence[];
};

export type PulseActivitySnapshot = Record<string, PlacePulseMetric>;

/** The same evidence formula is used by places, areas, and map clusters. */
export function scorePulseActivity(evidenceWeight: number) {
  return evidenceScore(evidenceWeight);
}

export function pulseTierForMetric(score: number, confirmed = false): PulseTier {
  // Compare the raw score: rounding 98.5 to 99 must not manufacture Live.
  if (score >= 99 && confirmed) return "live";
  if (score >= 75) return "hot";
  if (score >= 28) return "moving";
  return "quiet";
}

function metricFromEvidence(evidence: ActivityEvidence[], observedAt: number): PlacePulseMetric {
  const recent = evidence.filter(
    (item) =>
      evaluateFreshness({
        observedAt: item.timestamp,
        expiresAt: item.expiresAt,
        nowMs: observedAt,
      }).isRecent,
  );
  const weight = recent.reduce((sum, item) => sum + item.weight, 0);
  const rawScore = scorePulseActivity(weight);
  const intelligence = deriveAreaIntelligence({ areaId: "", evidence, observedAt });
  return {
    hotness: rawScore / 10,
    postCount: recent.filter((item) => item.kind === "post").length,
    eventCount: recent.filter((item) => item.kind === "event" || item.kind === "meetEvent").length,
    commentCount: recent.filter((item) => item.kind === "comment").length,
    storyCount: recent.filter((item) => item.kind === "story").length,
    evidenceWeight: weight,
    score: Math.round(rawScore),
    tier: pulseTierForMetric(rawScore, intelligence.signalQuality === "confirmed"),
    signalQuality: intelligence.signalQuality,
    lastSignalAt: intelligence.lastSignalAt,
    observedAt,
    evidence,
  };
}

/** An undated place or event count cannot establish current activity. */
export function fallbackPulseMetric(_place: Place, _eventCount = 0): PlacePulseMetric {
  return metricFromEvidence([], Date.now());
}

export function pulseMetricForPlace(
  place: Place,
  snapshot: PulseActivitySnapshot,
  fallbackEventCount = 0,
) {
  return snapshot[place.id] ?? fallbackPulseMetric(place, fallbackEventCount);
}

export function aggregatePulseMetrics(
  places: Place[],
  snapshot: PulseActivitySnapshot,
  _fallbackEventCounts: ReadonlyMap<string, number> = new Map(),
): PlacePulseMetric {
  const metrics = places.flatMap((place) => (snapshot[place.id] ? [snapshot[place.id]] : []));
  // Snapshots share one accepted clock. Missing rows contribute no evidence.
  const observedAt = metrics[0]?.observedAt ?? Date.now();
  return metricFromEvidence(
    metrics.flatMap((metric) => metric.evidence),
    observedAt,
  );
}

export function buildPulseActivitySnapshot(
  data: PulseData,
  now: Date | number = Date.now(),
): PulseActivitySnapshot {
  const observedAt = now instanceof Date ? now.getTime() : now;
  const evidenceByPlace = buildPlaceEvidence(data, observedAt);
  return Object.fromEntries(
    data.places.map((place) => [
      place.id,
      metricFromEvidence(evidenceByPlace.get(place.id) ?? [], observedAt),
    ]),
  );
}

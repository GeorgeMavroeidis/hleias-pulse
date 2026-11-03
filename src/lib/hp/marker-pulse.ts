import type { PulseData } from "../hp-api";
import type { ActivityEvidence } from "./activity-evidence";
import type { SignalQuality } from "./area-intelligence";
import { evaluateFreshness, timestampMs } from "./freshness";
import {
  buildPulseActivitySnapshot,
  derivePulseActivityMetric,
  type PulseActivitySnapshot,
  type PulseTier,
} from "./pulse-activity";

/** CSS anatomy keys retained from the compact-marker design, never a second scorer. */
export type PulseLevel = "quiet" | "emerging" | "active" | "lively" | "fading";
export type MarkerPulseSignal = {
  /** Presentation only: quiet / moving / hot / live map to the existing CSS keys. */
  level: PulseLevel | null;
  /** Canonical current status. Public status labels must use this tier. */
  tier: PulseTier;
  quality: SignalQuality;
  lastSignalAt: string | null;
  score: number;
  contributorCount: number;
};
export type MarkerPulseInput = {
  /** Diagnostic fetch time only. It never establishes or invalidates evidence age. */
  fetchedAt: number | null;
  /** At least one accepted dataset exists; a failed refresh must retain this value. */
  available: boolean;
  placeIds: string[];
  evidence: Record<string, ActivityEvidence[]>;
};
export type MarkerPulseSnapshot = Record<string, MarkerPulseSignal>;

export const EMPTY_MARKER_PULSE_INPUT: MarkerPulseInput = {
  fetchedAt: null,
  available: false,
  placeIds: [],
  evidence: {},
};
export const NEUTRAL_MARKER_PULSE: MarkerPulseSignal = {
  level: null,
  tier: "quiet",
  quality: "uncertain",
  lastSignalAt: null,
  score: 0,
  contributorCount: 0,
};
const PRESENTATION_LEVEL: Record<PulseTier, PulseLevel> = {
  quiet: "quiet",
  moving: "emerging",
  hot: "active",
  live: "lively",
};

/** Adapt the accepted shared activity snapshot; do not collect or score a second dataset. */
export function markerPulseInputFromActivity(
  activity: PulseActivitySnapshot,
  placeIds: readonly string[] = Object.keys(activity),
  fetchedAt: number | null = null,
): MarkerPulseInput {
  const ids = [...new Set(placeIds)];
  return {
    fetchedAt,
    available: true,
    placeIds: ids,
    evidence: Object.fromEntries(ids.map((id) => [id, activity[id]?.evidence ?? []])),
  };
}

/** Compatibility entry point for callers holding accepted PulseData and the shared clock. */
export function buildMarkerPulseInput(data: PulseData, nowMs: number): MarkerPulseInput {
  return markerPulseInputFromActivity(
    buildPulseActivitySnapshot(data, nowMs),
    data.places.map((place) => place.id),
    nowMs,
  );
}

/** Re-project moderation visibility without changing observations or fetch metadata. */
export function excludeHiddenPulseContributors(
  input: MarkerPulseInput,
  hiddenIds: ReadonlySet<string>,
): MarkerPulseInput {
  if (!hiddenIds.size) return input;
  return {
    ...input,
    evidence: Object.fromEntries(
      Object.entries(input.evidence).map(([placeId, evidence]) => [
        placeId,
        evidence.filter((item) => !item.contributorId || !hiddenIds.has(item.contributorId)),
      ]),
    ),
  };
}

/** Availability is independent of the last request's age or success. */
export function pulseInputIsUsable(input: MarkerPulseInput, nowMs: number) {
  return input.available && timestampMs(nowMs) !== null;
}

/** Legacy name kept for the phase renderer. Evidence freshness is evaluated below. */
export const pulseInputIsFresh = pulseInputIsUsable;

/** One shared evidence-to-metric function owns raw thresholds and confidence. */
export function deriveEvidencePulseSignal(
  evidence: readonly ActivityEvidence[],
  nowMs: number,
): MarkerPulseSignal {
  if (timestampMs(nowMs) === null) return NEUTRAL_MARKER_PULSE;
  const metric = derivePulseActivityMetric([...evidence], nowMs);
  const recent = evidence.filter(
    (item) =>
      evaluateFreshness({
        observedAt: item.timestamp,
        expiresAt: item.expiresAt,
        nowMs,
      }).isRecent,
  );
  const level = recent.length
    ? PRESENTATION_LEVEL[metric.tier]
    : metric.signalQuality === "fading"
      ? "fading"
      : null;
  return {
    level,
    tier: metric.tier,
    quality: metric.signalQuality,
    lastSignalAt: metric.lastSignalAt,
    score: metric.score,
    contributorCount: new Set(
      recent.flatMap((item) => (item.contributorId ? [item.contributorId] : [])),
    ).size,
  };
}

export function deriveMarkerPulseSnapshot(
  input: MarkerPulseInput,
  nowMs: number,
): MarkerPulseSnapshot {
  const usable = pulseInputIsUsable(input, nowMs);
  return Object.fromEntries(
    input.placeIds.map((placeId) => [
      placeId,
      usable
        ? deriveEvidencePulseSignal(input.evidence[placeId] ?? [], nowMs)
        : NEUTRAL_MARKER_PULSE,
    ]),
  );
}

export function markerPulseForPlace(id: string, snapshot: MarkerPulseSnapshot) {
  return snapshot[id] ?? NEUTRAL_MARKER_PULSE;
}

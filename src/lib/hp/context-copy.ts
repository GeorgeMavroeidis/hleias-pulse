import type { TranslationParams } from "../i18n";
import type { MarkerPulseSignal } from "./marker-pulse";
import type { TemporalPresentation } from "./temporal-atmosphere";
import { evaluateFreshness } from "./freshness";

export type ContextCopySource =
  | "temporal"
  | "community-activity"
  | "regional-metadata"
  | "fallback";
export type ContextCopy = {
  source: ContextCopySource;
  key: string;
  params?: TranslationParams;
};
export const PULSE_NAMES = {
  quiet: "Quiet",
  moving: "Moving",
  hot: "Hot",
  live: "Live",
};
const TEMPORAL_HEADLINES = {
  morning: "Morning in Ilia",
  afternoon: "Afternoon in Ilia",
  "golden-hour": "Golden hour",
  evening: "Evening in Ilia",
  "late-night": "Late night",
} as const;
export function temporalHeadline(atmosphere: TemporalPresentation): ContextCopy {
  if (atmosphere.basis === "unavailable" || atmosphere.period === null) {
    return { source: "fallback", key: "Explore Ilia" };
  }
  return {
    source: "temporal",
    // Colour and solar time establish a time of day, never a Tonight recommendation.
    key: TEMPORAL_HEADLINES[atmosphere.period],
  };
}
/** Only accepts the existing evidence-derived signal, never raw counters or regional tone. */
export function communityActivityCopy(
  signal: MarkerPulseSignal,
  nowMs: number,
): ContextCopy | null {
  const freshness = evaluateFreshness({ observedAt: signal.lastSignalAt, nowMs });
  if (
    !signal.level ||
    signal.level === "fading" ||
    signal.quality === "uncertain" ||
    !freshness.isRecent
  )
    return null;
  // A retained projection can age between refreshes; only a current signal is Live.
  const tier =
    signal.tier === "live" && (!freshness.isCurrent || signal.quality !== "confirmed")
      ? "hot"
      : signal.tier;
  return {
    source: "community-activity",
    key: "Recent community activity: {level}",
    params: { level: PULSE_NAMES[tier] },
  };
}

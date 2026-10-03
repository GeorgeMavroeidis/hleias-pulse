import type { TranslationParams } from "../i18n";
import type { MarkerPulseSignal } from "./marker-pulse";
import type { TemporalPresentation } from "./temporal-atmosphere";

export type ContextCopySource =
  | "temporal"
  | "community-activity"
  | "regional-metadata"
  | "fallback";
export type ContextCopy = { source: ContextCopySource; key: string; params?: TranslationParams };
export const PULSE_NAMES = {
  quiet: "Quiet",
  emerging: "Emerging",
  active: "Active",
  lively: "Lively",
  fading: "Fading",
};
export function temporalHeadline(atmosphere: TemporalPresentation): ContextCopy {
  return {
    source: atmosphere.basis === "unavailable" ? "fallback" : "temporal",
    key: atmosphere.headlineKey,
  };
}
/** Only accepts the existing evidence-derived signal, never raw counters or regional tone. */
export function communityActivityCopy(signal: MarkerPulseSignal): ContextCopy | null {
  if (!signal.level || signal.quality === "uncertain") return null;
  return {
    source: "community-activity",
    key: "Recent community activity: {level}",
    params: { level: PULSE_NAMES[signal.level] },
  };
}

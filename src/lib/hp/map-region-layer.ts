import type { RegionalDiscovery } from "./regional-discovery";
import type { TranslationParams } from "../i18n";
import type { MarkerPulseSignal } from "./marker-pulse";
import { observationLabel } from "./surface-freshness";
import { evaluateFreshness } from "./freshness";
import { bubblePhotoUrl } from "./marker-photo";

type Translate = (key: string, params?: TranslationParams) => string;
const TIER_NAMES = { quiet: "Quiet", moving: "Moving", hot: "Hot", live: "Live" } as const;

/** Public copy uses canonical activity tiers and real observation time, never CSS levels. */
export function markerActivityDescription(
  signal: MarkerPulseSignal,
  nowMs: number,
  language: "GR" | "EN",
  t: Translate,
  includeExact = true,
) {
  if (signal.level === null) return t("Community activity unavailable");
  const freshness = evaluateFreshness({ observedAt: signal.lastSignalAt, nowMs });
  // Retained snapshots can outlive their projection clock during recovery.
  // Re-check claims with the shared evidence boundaries, never the fetch time.
  const tier =
    signal.tier === "live" && (!freshness.isCurrent || signal.quality !== "confirmed")
      ? "hot"
      : signal.tier;
  const status = !signal.lastSignalAt
    ? signal.score > 0
      ? t("Community activity unavailable")
      : t("Quiet")
    : freshness.state === "unknown"
      ? t("Community activity unavailable")
      : !freshness.isRecent || signal.score === 0
        ? t("Historical community activity")
        : t("Recent community activity: {level}", { level: t(TIER_NAMES[tier]) });
  if (!signal.lastSignalAt) return status;
  const observed = observationLabel(signal.lastSignalAt, nowMs, language);
  return [status, observed.relative, includeExact ? observed.exact : undefined]
    .filter(Boolean)
    .join(" · ");
}

export function regionalDescription(
  row: RegionalDiscovery,
  filterLabel: string | null | undefined,
  t: Translate,
  nowMs: number,
  language: "GR" | "EN",
  includeExact = false,
) {
  const count = row.contextualPlaceIds.length;
  const places = filterLabel
    ? t(count === 1 ? "{count} {filter} place" : "{count} {filter} places", {
        count,
        filter: filterLabel,
      })
    : t(count === 1 ? "{count} place" : "{count} places", { count });
  if (!count) return t("No matching places");
  return row.signal.level === null
    ? t("Explore · {places}", { places })
    : `${markerActivityDescription(row.signal, nowMs, language, t, includeExact)} · ${places}`;
}

/**
 * What one area bubble shows and says: its name, the spoken summary, and the photo of
 * its most popular matching place. Deliberately no raw evidence, contributor IDs or scores.
 */
export function regionBubbleView(
  row: RegionalDiscovery,
  places: readonly { id: string; hotness: number; imageUrl?: string | null; greekName?: string }[],
  filterLabel: string | null | undefined,
  t: Translate,
  nowMs: number,
  language: "GR" | "EN",
) {
  // A single-place area is named after its place, which knows its own Greek name.
  const solo = row.region.id.startsWith("solo-") && places.length === 1 ? places[0] : null;
  const name = language === "GR" && solo?.greekName ? solo.greekName : t(row.region.name);
  const matching = places.filter((place) => row.contextualPlaceIds.includes(place.id));
  const [lead] = (matching.length ? matching : places)
    .filter((place) => place.imageUrl?.trim())
    .sort((a, b) => b.hotness - a.hotness || a.id.localeCompare(b.id));
  return {
    name,
    label: `${name}. ${regionalDescription(row, filterLabel, t, nowMs, language, true)}`,
    photoUrl: bubblePhotoUrl(lead?.imageUrl),
  };
}

type BubbleBox = { id: string; left: number; top: number; width: number; height: number };

/**
 * Like map labels, area bubbles never overlap. Boxes arrive most important first; each
 * claims its space and any later one that would touch it waits for a closer zoom.
 */
export function nonOverlappingBubbles(boxes: readonly BubbleBox[], gap = 4) {
  const placed: BubbleBox[] = [];
  for (const box of boxes) {
    const clear = placed.every(
      (other) =>
        box.left + box.width + gap <= other.left ||
        other.left + other.width + gap <= box.left ||
        box.top + box.height + gap <= other.top ||
        other.top + other.height + gap <= box.top,
    );
    if (clear) placed.push(box);
  }
  return new Set(placed.map((box) => box.id));
}

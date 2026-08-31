import type { PulseTier } from "./pulse-activity";

const PRESENCE: Record<PulseTier, readonly number[]> = {
  quiet: [1, 1.16, 1.18, 1.18, 1.15],
  moving: [1, 1.2, 1.22, 1.22, 1.2],
  hot: [1, 1.24, 1.26, 1.26, 1.24],
  live: [1, 1.26, 1.28, 1.28, 1.26],
};
const PRESENCE_ZOOMS = [9.25, 11.5, 12.5, 14.25, 15.5] as const;

export function markerPresenceScale(zoom: number, tier: PulseTier) {
  const values = PRESENCE[tier];
  if (zoom <= PRESENCE_ZOOMS[0]) return values[0];
  for (let index = 1; index < PRESENCE_ZOOMS.length; index += 1) {
    if (zoom > PRESENCE_ZOOMS[index]) continue;
    const t =
      (zoom - PRESENCE_ZOOMS[index - 1]) / (PRESENCE_ZOOMS[index] - PRESENCE_ZOOMS[index - 1]);
    return values[index - 1] + (values[index] - values[index - 1]) * t * t * (3 - 2 * t);
  }
  return values[values.length - 1];
}

export function childMarkerSize(tier: PulseTier) {
  return tier === "quiet" ? 48 : tier === "moving" ? 54 : 60;
}

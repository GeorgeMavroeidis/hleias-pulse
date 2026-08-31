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

export function markerMotionPhase(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return (hash % 10000) / 10000;
}

export type ScreenMarker = {
  id: string;
  x: number;
  y: number;
  opacity: number;
  tier: PulseTier;
  score: number;
  selected: boolean;
};

// Run only after a viewport/data change, never on an animation clock.
export function markerViewportDensity(nodes: ScreenMarker[], width: number, height: number) {
  const visible = nodes.filter(
    (n) => n.opacity > 0.08 && n.x >= 0 && n.x < width && n.y >= 0 && n.y < height,
  );
  const cells = new Map<string, ScreenMarker[]>();
  for (const node of visible) {
    const key = `${Math.floor(node.x / 96)}:${Math.floor(node.y / 96)}`;
    const cell = cells.get(key) ?? [];
    cell.push(node);
    cells.set(key, cell);
  }
  const dense = new Set<string>();
  const suppressed = new Set<string>();
  const rank = { quiet: 0, moving: 1, hot: 2, live: 3 };
  for (const cell of cells.values()) {
    if (visible.length <= 36 && cell.length < 3) continue;
    for (const node of cell) if (!node.selected) dense.add(node.id);
    const candidates = cell
      .filter((n) => !n.selected && n.tier !== "quiet")
      .sort(
        (a, b) =>
          rank[b.tier] - rank[a.tier] ||
          b.score - a.score ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    for (const node of candidates.slice(1)) suppressed.add(node.id);
  }
  return { visible: new Set(visible.map((n) => n.id)), dense, suppressed };
}

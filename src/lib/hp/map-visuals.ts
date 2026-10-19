import { MAP_POLICY } from "./map-policy";
import type { PulseLevel } from "./marker-pulse";

export const PLACE_MARKER_CORE_SIZE = 14;
export const LIVELY_MARKER_CORE_SIZE = 16;
export const MAX_ANIMATED_MARKERS = 24;
export const MARKER_LABEL_WIDTH = 128;
export const MARKER_LABEL_HEIGHT = 22;
export const MARKER_LABEL_ZOOM = MAP_POLICY.labelZoom;

export function childMarkerSize(level: PulseLevel | null) {
  return level === "lively" ? LIVELY_MARKER_CORE_SIZE : PLACE_MARKER_CORE_SIZE;
}

export function clusterMarkerSize(count: number) {
  return count < 10 ? 30 : count < 100 ? 34 : 40;
}

export function markerMotionPhase(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  // Avalanche adjacent IDs so place-1 / place-2 do not pulse almost in unison.
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return (hash % 10000) / 10000;
}

export type ScreenMarker = {
  id: string;
  x: number;
  y: number;
  opacity: number;
  level: PulseLevel | null;
  score: number;
  selected: boolean;
  label?: string;
  prominence?: number;
  labelOffset?: number;
  labelScale?: number;
};

const motionRank: Record<PulseLevel, number> = {
  quiet: -1,
  fading: 0,
  emerging: 1,
  active: 2,
  lively: 3,
};
const priority = (a: ScreenMarker, b: ScreenMarker) =>
  motionRank[b.level ?? "quiet"] - motionRank[a.level ?? "quiet"] ||
  b.score - a.score ||
  a.id.localeCompare(b.id);

function visibleMarkers(nodes: ScreenMarker[], width: number, height: number) {
  return nodes.filter(
    (n) => n.opacity > 0.08 && n.x >= 0 && n.x < width && n.y >= 0 && n.y < height,
  );
}

// Viewport/data settle work only; CSS owns the animation clock.
export function markerViewportDensity(nodes: ScreenMarker[], width: number, height: number) {
  const visible = visibleMarkers(nodes, width, height);
  const cells = new Map<string, ScreenMarker[]>();
  for (const node of visible) {
    const key = `${Math.floor(node.x / 96)}:${Math.floor(node.y / 96)}`;
    const cell = cells.get(key) ?? [];
    cell.push(node);
    cells.set(key, cell);
  }
  const dense = new Set<string>();
  const suppressed = new Set<string>();
  const eligible: ScreenMarker[] = [];
  for (const cell of cells.values()) {
    const crowded = visible.length > 36 || cell.length >= 3;
    if (crowded) for (const node of cell) if (!node.selected) dense.add(node.id);
    const candidates = cell
      .filter((n) => !n.selected && n.level && n.level !== "quiet")
      .sort(priority);
    if (crowded) {
      eligible.push(...candidates.slice(0, 1));
      for (const node of candidates.slice(1)) suppressed.add(node.id);
    } else eligible.push(...candidates);
  }
  for (const node of eligible.sort(priority).slice(MAX_ANIMATED_MARKERS)) suppressed.add(node.id);
  return { visible: new Set(visible.map((n) => n.id)), dense, suppressed };
}

type LabelRect = { left: number; right: number; top: number; bottom: number };
const intersects = (a: LabelRect, b: LabelRect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export function markerLabelVisibility(
  nodes: ScreenMarker[],
  width: number,
  height: number,
  zoom: number,
) {
  const visible = visibleMarkers(nodes, width, height);
  const candidates = visible
    .filter((n) => n.label && (n.selected || zoom >= MARKER_LABEL_ZOOM))
    .sort(
      (a, b) =>
        Number(b.selected) - Number(a.selected) ||
        (b.prominence ?? 0) - (a.prominence ?? 0) ||
        a.id.localeCompare(b.id),
    );
  const occupied: LabelRect[] = [];
  const shown = new Set<string>();
  for (const node of candidates) {
    const scale = node.labelScale ?? 1;
    const rect = {
      left: node.x - (MARKER_LABEL_WIDTH * scale) / 2,
      right: node.x + (MARKER_LABEL_WIDTH * scale) / 2,
      top: node.y + (node.labelOffset ?? 17) * scale,
      bottom: node.y + ((node.labelOffset ?? 17) + MARKER_LABEL_HEIGHT) * scale,
    };
    const fits = rect.left >= 0 && rect.right <= width && rect.bottom <= height;
    const overlapsCore = visible.some(
      (other) =>
        other.id !== node.id &&
        intersects(rect, {
          left: other.x - 10,
          right: other.x + 10,
          top: other.y - 10,
          bottom: other.y + 10,
        }),
    );
    if (
      !node.selected &&
      (!fits || overlapsCore || occupied.some((other) => intersects(rect, other)))
    )
      continue;
    shown.add(node.id);
    occupied.push(rect);
  }
  return shown;
}

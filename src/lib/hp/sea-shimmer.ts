/**
 * Decorative sea-shimmer geometry — real-coastline edition.
 *
 * The animated wave pattern in `SocialMap` fills the open sea everywhere inside
 * the map's pan bounds, wherever the user pans or zooms. The shape is built once
 * at module load:
 *
 *   • outer ring  — a rectangle comfortably larger than `MAP_PAN_BOUNDS`
 *   • inner rings — every land polygon from `IONIAN_LAND_POLYGONS`
 *                   (Natural Earth 1:10m land, clipped + simplified; regenerate
 *                   with `npm run build:ionian-land` — see
 *                   scripts/build-ionian-land.ts)
 *
 * It is handed to a single `L.polygon(..., { fillRule: "evenodd" })`: the outer
 * rectangle fills, every land ring punches a hole, and any ring nested inside a
 * land ring (an island's lake) re-fills as water. So the waves show only over
 * real sea — Zakynthos, Kefalonia, Ithaca, Lefkada and the mainland are cut out
 * with their true coastlines, no hand-drawn guesswork.
 *
 * Purely aesthetic — it carries no real sea-state / weather / bathymetry meaning.
 */
import { IONIAN_LAND_POLYGONS } from "./ionian-land";

type LatLng = [number, number];

/**
 * Sea-shimmer outer rectangle, [south, west, north, east].
 *
 * Larger than `MAP_PAN_BOUNDS` ([36.2, 19.4]–[38.9, 23.5] in `SocialMap.tsx`)
 * AND larger than the land-clip bbox in scripts/build-ionian-land.ts
 * ([19.1, 35.9]–[23.8, 39.2]), so there is always a margin of pure sea between
 * any clipped land edge and this rectangle — no coincident edges, clean
 * evenodd fill, and the rectangle's own edges stay well off-screen.
 */
const SEA_SHIMMER_BOUNDS = { south: 35.7, west: 18.9, north: 39.4, east: 24.0 } as const;

const OUTER_RING: LatLng[] = [
  [SEA_SHIMMER_BOUNDS.south, SEA_SHIMMER_BOUNDS.west],
  [SEA_SHIMMER_BOUNDS.south, SEA_SHIMMER_BOUNDS.east],
  [SEA_SHIMMER_BOUNDS.north, SEA_SHIMMER_BOUNDS.east],
  [SEA_SHIMMER_BOUNDS.north, SEA_SHIMMER_BOUNDS.west],
  [SEA_SHIMMER_BOUNDS.south, SEA_SHIMMER_BOUNDS.west],
];

// Flatten every land polygon's rings (outline + any holes) into one flat list
// and flip GeoJSON [lng, lat] → Leaflet [lat, lng].
const LAND_RINGS: LatLng[][] = IONIAN_LAND_POLYGONS.flatMap((polygon) =>
  polygon.map((ring) => ring.map(([lng, lat]) => [lat, lng] as LatLng)),
);

/**
 * One Leaflet polygon: ring 0 is the sea rectangle, every following ring is a
 * land mass. Nesting is polygons → rings → points, with a single polygon, so
 * pass it straight to `L.polygon(SEA_SHIMMER_LATLNGS, { fillRule: "evenodd" })`.
 */
export const SEA_SHIMMER_LATLNGS: LatLng[][][] = [[OUTER_RING, ...LAND_RINGS]];

/** Above this zoom the outline is too crude to show and the sea is off-frame anyway. */
export const SEA_SHIMMER_MAX_ZOOM = 12;

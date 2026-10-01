import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Supercluster from "supercluster";
import {
  coordinateBounds,
  removeAdministrativeBoundaries,
  toMapLibreCoordinate,
} from "../src/lib/hp/map-core";
import {
  childMarkerSize,
  clusterMarkerSize,
  markerMotionPhase,
  markerViewportDensity,
  markerLabelVisibility,
  MAX_ANIMATED_MARKERS,
  type ScreenMarker,
} from "../src/lib/hp/map-visuals";
import { buildAreaClusters, eventCountForPlace } from "../src/lib/hp/map-clusters";
import { PLACES, EVENTS } from "./hp-seed-data";

assert.deepEqual(
  [null, "quiet", "emerging", "active", "lively", "fading"].map((level) =>
    childMarkerSize(level as Parameters<typeof childMarkerSize>[0]),
  ),
  [14, 14, 14, 14, 16, 14],
);
assert.deepEqual([2, 9, 10, 99, 100, 500].map(clusterMarkerSize), [30, 30, 34, 34, 40, 40]);
const pin = (id: string, overrides: Partial<ScreenMarker> = {}): ScreenMarker => ({
  id,
  x: 160,
  y: 100,
  opacity: 1,
  level: "active",
  score: 50,
  selected: false,
  label: id,
  ...overrides,
});
for (const count of [1, 12, 36, 37, 80, 500]) {
  const nodes = Array.from({ length: count }, (_, i) =>
    pin(`pin-${String(i).padStart(3, "0")}`, {
      x: (i % 25) * 96 + 80,
      y: Math.floor(i / 25) * 96 + 80,
    }),
  );
  const density = markerViewportDensity(nodes, 2500, 2500);
  assert.equal(density.visible.size, count);
  assert.equal(density.dense.size, count > 36 ? count : 0);
  assert.equal(count - density.suppressed.size, Math.min(count, MAX_ANIMATED_MARKERS));
  assert.deepEqual(markerViewportDensity([...nodes].reverse(), 2500, 2500), density);
}
const crowd = [
  pin("active"),
  pin("emerging", { level: "emerging", score: 99 }),
  pin("lively", { level: "lively" }),
  pin("selected", { selected: true, level: "fading" }),
];
const crowded = markerViewportDensity(crowd, 390, 400);
assert.deepEqual([...crowded.suppressed].sort(), ["active", "emerging"]);
assert.ok(!crowded.dense.has("selected"));
assert.deepEqual(markerViewportDensity([...crowd].reverse(), 390, 400), crowded);
const clipped = markerViewportDensity(
  [
    pin("inside"),
    pin("sheet", { y: 400 }),
    pin("outside", { x: -1 }),
    pin("hidden", { opacity: 0.08 }),
  ],
  390,
  400,
);
assert.deepEqual([...clipped.visible], ["inside"]);
const neutral = markerViewportDensity(
  Array.from({ length: 80 }, (_, i) => pin(String(i), { level: null })),
  390,
  400,
);
assert.equal(neutral.suppressed.size, 0);
const labels = [
  pin("low", { prominence: 0.1 }),
  pin("high", { prominence: 1 }),
  pin("selected", { selected: true, prominence: 0 }),
];
assert.deepEqual([...markerLabelVisibility(labels, 390, 400, 15.5)], ["selected"]);
assert.deepEqual([...markerLabelVisibility(labels, 390, 400, 14)], ["selected"]);
assert.deepEqual([...markerLabelVisibility(labels.slice(0, 2), 390, 400, 15.5)], ["high"]);
assert.equal(markerLabelVisibility([pin("edge", { x: 10 })], 390, 400, 16).size, 0);
for (const id of ["a", "place-123", "Πύργος", "cluster-99"]) {
  assert.equal(markerMotionPhase(id), markerMotionPhase(id));
  assert.ok(markerMotionPhase(id) >= 0 && markerMotionPhase(id) < 1);
}
assert.ok(
  new Set(Array.from({ length: 32 }, (_, i) => Math.floor(markerMotionPhase(`place-${i}`) * 8)))
    .size >= 6,
);
console.log(
  "Pulse geometry, 1–500-marker motion budget, clipping, deterministic priority and label collisions passed.",
);

const before = JSON.stringify(PLACES);
const areas = buildAreaClusters(PLACES, EVENTS);
const mapped = areas.flatMap((area) => area.places);
assert.equal(mapped.length, PLACES.length);
assert.deepEqual(mapped.map((place) => place.id).sort(), PLACES.map((place) => place.id).sort());
for (const place of mapped) {
  const original = PLACES.find((item) => item.id === place.id)!;
  assert.deepEqual([place.lat, place.lng], [original.lat, original.lng]);
}
assert.equal(JSON.stringify(PLACES), before);
const counts = eventCountForPlace(EVENTS);
assert.equal(
  [...counts.values()].reduce((sum, value) => sum + value, 0),
  EVENTS.length,
);
for (const event of EVENTS) assert.ok(mapped.some((place) => place.id === event.placeId));
// Exercise the existing Supercluster topology parameters and all zoom transitions.
const index = new Supercluster({ maxZoom: 13, minPoints: 2, radius: 58 });
index.load(
  mapped.map((place) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [place.lng, place.lat] },
    properties: { placeId: place.id },
  })),
);
for (let zoom = 8; zoom <= 18; zoom++) {
  const features = index.getClusters([19.9, 36.35, 23.25, 39.15], zoom);
  const leaves = features.flatMap((feature) =>
    feature.properties.cluster
      ? index.getLeaves(feature.properties.cluster_id, Infinity)
      : [feature],
  );
  assert.deepEqual(
    leaves.map((leaf) => leaf.properties.placeId).sort(),
    mapped.map((place) => place.id).sort(),
  );
  for (const feature of features)
    if (feature.properties.cluster) {
      assert.equal(
        index.getLeaves(feature.properties.cluster_id, Infinity).length,
        feature.properties.point_count,
      );
      assert.ok(index.getClusterExpansionZoom(feature.properties.cluster_id) > zoom);
    }
}
console.log(
  "All seeded place coordinates, event-place links, complete cluster membership, counts and zoom expansion passed.",
);

const stylesUrl = new URL("../src/styles.css", import.meta.url);
const css = readFileSync(stylesUrl, "utf8").replace(
  /^@import "(\.[^"]+)";$/gm,
  (_match, specifier: string) => readFileSync(new URL(specifier, stylesUrl), "utf8"),
);
const mapSource = readFileSync(
  new URL("../src/components/hp/SocialMap.tsx", import.meta.url),
  "utf8",
);
assert.ok(mapSource.includes("https://tiles.openfreemap.org/styles/bright"));
assert.ok(mapSource.includes('import("maplibre-gl")'));
assert.ok(mapSource.includes("new maplibre.Map"));
assert.ok(mapSource.includes("attributionControl: false"));
assert.ok(mapSource.includes("hp-map-attribution__info"));
assert.doesNotMatch(mapSource, /maplibre-gl-leaflet|import\("leaflet"\)|OPENFREEMAP_ATTRIBUTION/);
assert.doesNotMatch(
  mapSource,
  /tile\.openstreetmap\.org/,
  "The public map must not silently restore OSM Standard administrative boundaries",
);
assert.doesNotMatch(mapSource, /VITE_MAP_TILE_/);
assert.doesNotMatch(mapSource, /ORS_API_KEY|VITE_[A-Z_]*ROUT/);
const style = removeAdministrativeBoundaries({
  version: 8,
  sources: {},
  layers: [
    { id: "water", type: "background" },
    { id: "boundary_2", type: "line", source: "openmaptiles", "source-layer": "boundary" },
    { id: "admin-boundary-label", type: "symbol", source: "openmaptiles", "source-layer": "place" },
    { id: "road", type: "line", source: "openmaptiles", "source-layer": "transportation" },
  ],
});
assert.deepEqual(
  style.layers.map((layer) => layer.id),
  ["water", "road"],
);
assert.deepEqual(toMapLibreCoordinate(37.64, 21.31), [21.31, 37.64]);
assert.deepEqual(
  coordinateBounds([
    [21, 37],
    [22, 38],
    [20, 37.5],
  ]),
  [
    [20, 37],
    [22, 38],
  ],
);
console.log(
  "Basemap contract: direct MapLibre, one compact credit control and boundary-free vector style passed.",
);

const pulseCss = readFileSync(new URL("../src/styles/pulse-markers.css", import.meta.url), "utf8");
const keyframes = [...pulseCss.matchAll(/@keyframes (hp-pulse-[\w-]+)\s*\{([\s\S]*?)\n\}/g)];
assert.equal(keyframes.length, 4);
for (const [, name, body] of keyframes)
  for (const [, property] of body.matchAll(/([\w-]+)\s*:/g))
    assert.ok(["opacity", "transform"].includes(property), `${name} animates ${property}`);
assert.doesNotMatch(
  mapSource,
  /useImageUrls|resolveImg|createAreaIcon|createChildIcon|createActivityClusterIcon|markerSigRef/,
);
assert.ok(mapSource.includes("updatePulseIcon(marker.getElement(), node, hasStory, t)"));
assert.ok(mapSource.includes("if (!marker) {"));
assert.ok(mapSource.includes('anchor: "center"'));
assert.ok(mapSource.includes('markerShell?.classList.toggle("is-selected", node.selected)'));
assert.ok(mapSource.includes("markerElement.tabIndex = visibleForInteraction ? 0 : -1"));
assert.ok(mapSource.includes('keyEvent.key !== "Enter" && keyEvent.key !== " "'));
assert.ok(mapSource.includes('"--hp-marker-lens-opacity-target"'));
assert.ok(mapSource.includes('"--hp-marker-lens-scale-target"'));
assert.ok(mapSource.includes("frame = requestAnimationFrame(() =>"));
assert.ok(mapSource.includes('map.on("moveend", schedule)'));
assert.doesNotMatch(mapSource, /moving tonight|Hot around the coast/);
assert.match(pulseCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(pulseCss, /animation: none !important/);
assert.match(pulseCss, /animation-play-state: paused !important/);
assert.match(pulseCss, /hp-map-motion-far/);
assert.match(pulseCss, /is-motion-suppressed:not\(\.is-selected\)/);
assert.doesNotMatch(pulseCss, /filter:|backdrop-filter:|neon|#[a-f0-9]{6}\s*;/);
const coreRule = pulseCss.match(/\.hp-pulse-core \{([\s\S]*?)\n\}/)?.[1];
assert.ok(coreRule && !/animation|transform/.test(coreRule));
const shell = readFileSync(new URL("../src/components/hp/PulseApp.tsx", import.meta.url), "utf8");
assert.ok(shell.includes("setMarkerPulseNow(now)"));
assert.ok(shell.includes("available: false"));
assert.equal((shell.match(/setInterval\(refreshIfStale, 60_000\)/g) ?? []).length, 1);
assert.ok(shell.includes("markerPulseSnapshot={markerPulseSnapshot}"));
assert.ok(shell.includes("data-marker-motion={markerMotion}"));
console.log(
  "Stable DOM anatomy, preserved interaction/lenses, compositor-only rings, shared refresh and reduced-motion contracts passed.",
);

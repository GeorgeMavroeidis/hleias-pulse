import assert from "node:assert/strict";
import {
  childMarkerSize,
  markerPresenceScale,
  markerMotionPhase,
  markerViewportDensity,
  type ScreenMarker,
} from "../src/lib/hp/map-visuals";

const tiers = ["quiet", "moving", "hot", "live"] as const;
const expected = [
  [9.25, 1, 1, 1, 1],
  [11.5, 1.16, 1.2, 1.24, 1.26],
  [12.5, 1.18, 1.22, 1.26, 1.28],
  [14.25, 1.18, 1.22, 1.26, 1.28],
  [15.5, 1.15, 1.2, 1.24, 1.26],
];
for (const [zoom, ...values] of expected) {
  for (const [index, tier] of tiers.entries()) {
    assert.equal(markerPresenceScale(zoom, tier), values[index]);
    assert.ok(
      Math.abs(markerPresenceScale(zoom - 0.001, tier) - markerPresenceScale(zoom + 0.001, tier)) <
        0.0001,
    );
  }
}
for (const tier of tiers) {
  assert.equal(markerPresenceScale(8, tier), 1);
  assert.equal(markerPresenceScale(18, tier), markerPresenceScale(15.5, tier));
}
assert.deepEqual(tiers.map(childMarkerSize), [48, 54, 60, 60]);
console.log("Map visual profiles: zoom anchors, continuity and tier sizes passed.");

const pin = (id: string, overrides: Partial<ScreenMarker> = {}): ScreenMarker => ({
  id,
  x: 24,
  y: 24,
  opacity: 1,
  tier: "moving",
  score: 1,
  selected: false,
  ...overrides,
});
for (const count of [1, 12, 36, 37, 80]) {
  const nodes = Array.from({ length: count }, (_, i) =>
    pin(`pin-${i}`, { x: (i % 10) * 96 + 12, y: Math.floor(i / 10) * 96 + 12 }),
  );
  const result = markerViewportDensity(nodes, 1000, 1000);
  assert.equal(result.visible.size, count);
  assert.equal(result.dense.size, count > 36 ? count : 0);
  assert.equal(result.suppressed.size, 0);
}
const crowd = [
  pin("moving", { score: 99 }),
  pin("hot", { tier: "hot", score: 100 }),
  pin("live", { tier: "live" }),
  pin("selected", { selected: true }),
];
const local = markerViewportDensity(crowd, 390, 400);
assert.deepEqual([...local.suppressed].sort(), ["hot", "moving"]);
assert.ok(!local.dense.has("selected"));
assert.deepEqual(markerViewportDensity([...crowd].reverse(), 390, 400), local);
const ties = markerViewportDensity([pin("z"), pin("a"), pin("m")], 390, 400);
assert.ok(!ties.suppressed.has("a"));
const clipped = markerViewportDensity(
  [
    pin("onscreen"),
    pin("behind-sheet", { y: 400 }),
    pin("outside", { x: -1 }),
    pin("crossfade", { opacity: 0.08 }),
  ],
  390,
  400,
);
assert.deepEqual([...clipped.visible], ["onscreen"]);
assert.equal(clipped.dense.size, 0);
for (const id of ["a", "place-123", "Πύργος", "cluster-99"]) {
  assert.equal(markerMotionPhase(id), markerMotionPhase(id));
  assert.ok(markerMotionPhase(id) >= 0 && markerMotionPhase(id) < 1);
}
console.log(
  "Marker density: viewport clipping, 1/12/36/37/80 nodes, tier priority, stable ties and selected exemption passed.",
);

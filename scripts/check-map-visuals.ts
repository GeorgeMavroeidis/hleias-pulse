import assert from "node:assert/strict";
import { childMarkerSize, markerPresenceScale } from "../src/lib/hp/map-visuals";

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

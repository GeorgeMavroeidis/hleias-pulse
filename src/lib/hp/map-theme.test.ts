import assert from "node:assert/strict";
import { test } from "node:test";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { applyBasemapTheme, themedBasemap } from "./map-theme";

const original: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#fff" } },
    {
      id: "water",
      type: "fill",
      source: "base",
      paint: { "fill-color": ["case", true, "#abc", "#def"] },
    },
    { id: "labels", type: "symbol", source: "base", layout: { "text-field": "name" } },
  ],
};
test("dark style preserves original geometry and light expressions", () => {
  const before = JSON.stringify(original);
  const dark = themedBasemap(original, "dark");
  assert.equal(JSON.stringify(original), before);
  assert.equal(dark.sources, original.sources);
  assert.deepEqual(
    dark.layers.map((l) => l.id),
    original.layers.map((l) => l.id),
  );
  assert.equal(themedBasemap(original, "light"), original);
  assert.equal(
    dark.layers[1].paint?.["fill-color" as keyof (typeof dark.layers)[1]["paint"]],
    "#0b3047",
  );
});
test("live switching restores original colors/defaults and never touches app overlays", () => {
  const calls: unknown[][] = [];
  const map = {
    getLayer: () => true,
    setPaintProperty: (...args: unknown[]) => {
      calls.push(args);
    },
  } as unknown as MapLibreMap;
  applyBasemapTheme(map, original, "dark");
  assert.ok(calls.every(([id]) => ["background", "water", "labels"].includes(String(id))));
  calls.length = 0;
  applyBasemapTheme(map, original, "light");
  assert.deepEqual(calls, [
    ["background", "background-color", "#fff"],
    ["water", "fill-color", ["case", true, "#abc", "#def"]],
    ["labels", "text-color", null],
    ["labels", "text-halo-color", null],
  ]);
});

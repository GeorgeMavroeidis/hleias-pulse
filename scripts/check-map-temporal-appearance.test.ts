import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import type { StyleSpecification } from "maplibre-gl";
import {
  applyMapAppearance,
  ATMOSPHERE_MAP_PALETTES,
  createIliaMapStyle,
  createMapAppearanceStyle,
  DARK_ATMOSPHERE_MAP_PALETTES,
  resolveMapPalette,
  type MapAppearance,
} from "../src/lib/hp/map-cartography";
import { ATMOSPHERE_MAP_PALETTES as reviewedLight } from "./reviewed-light-palettes";

const provider: StyleSpecification = JSON.parse(
  readFileSync(new URL("./fixtures/openfreemap-bright.json", import.meta.url), "utf8"),
);
const periods = ["day", "golden-hour", "evening", "late-night"] as const;
const colorFields = [
  "background-color",
  "fill-color",
  "fill-outline-color",
  "fill-extrusion-color",
  "line-color",
  "text-color",
  "text-halo-color",
];
function nonColor(style: StyleSpecification): unknown {
  const result = structuredClone(style);
  for (const layer of result.layers) {
    if (!("paint" in layer) || !layer.paint) continue;
    const paint = layer.paint as Record<string, unknown>;
    for (const field of colorFields) delete paint[field];
    if (Object.keys(paint).length === 0) delete layer.paint;
  }
  return result;
}
function luminance(color: string): number {
  return color
    .slice(1)
    .match(/../g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

test("all eight outputs validate, preserve reviewed geometry and retain exact reviewed Light palettes", () => {
  const original = JSON.stringify(provider);
  const baseline = nonColor(createIliaMapStyle(provider));
  assert.deepEqual(ATMOSPHERE_MAP_PALETTES, reviewedLight);
  for (const atmosphere of periods) {
    for (const colorScheme of ["light", "dark"] as const) {
      const appearance = { colorScheme, atmosphere };
      const result = createMapAppearanceStyle(provider, appearance);
      assert.deepEqual(
        validateStyleMin(result).map((error) => error.message),
        [],
      );
      assert.deepEqual(nonColor(result), baseline);
      assert.equal(result.sources, provider.sources);
      assert.equal(result.sprite, provider.sprite);
      assert.equal(result.glyphs, provider.glyphs);
      assert.equal(
        resolveMapPalette(appearance),
        colorScheme === "dark"
          ? DARK_ATMOSPHERE_MAP_PALETTES[atmosphere]
          : ATMOSPHERE_MAP_PALETTES[atmosphere],
      );
      if (colorScheme === "light")
        assert.deepEqual(result, createIliaMapStyle(provider, reviewedLight[atmosphere]));
    }
  }
  assert.equal(JSON.stringify(provider), original);
});

test("Dark temporal palettes are complete frozen navy variants with readable stable text", () => {
  for (const atmosphere of periods) {
    const p = DARK_ATMOSPHERE_MAP_PALETTES[atmosphere];
    assert.ok(Object.isFrozen(p));
    assert.deepEqual(Object.keys(p).sort(), Object.keys(reviewedLight.day).sort());
    assert.ok(luminance(p.land) < 0.05);
    assert.ok(luminance(p.water) < 0.05);
    assert.ok(contrast(p.primaryText, p.land) >= 4.5);
    assert.ok(contrast(p.secondaryText, p.land) >= 4.5);
    assert.ok(contrast(p.waterText, p.water) >= 4.5);
    assert.equal(p.primaryText, DARK_ATMOSPHERE_MAP_PALETTES.day.primaryText);
    assert.equal(p.secondaryText, DARK_ATMOSPHERE_MAP_PALETTES.day.secondaryText);
    assert.equal(p.waterText, DARK_ATMOSPHERE_MAP_PALETTES.day.waterText);
    assert.ok(
      Math.abs(luminance(p.land) - luminance(DARK_ATMOSPHERE_MAP_PALETTES.day.land)) < 0.02,
    );
    assert.ok(
      Math.abs(luminance(p.water) - luminance(DARK_ATMOSPHERE_MAP_PALETTES.day.water)) < 0.02,
    );
  }
  assert.equal(new Set(periods.map((period) => DARK_ATMOSPHERE_MAP_PALETTES[period].land)).size, 4);
  assert.equal(
    new Set(periods.map((period) => DARK_ATMOSPHERE_MAP_PALETTES[period].water)).size,
    4,
  );
});

test("Light day through every Dark period and back to Light restores unknown colors and excludes overlays", () => {
  const original: StyleSpecification = {
    version: 8,
    sources: provider.sources,
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#eee" } },
      {
        id: "future-fill",
        type: "fill",
        source: "openmaptiles",
        paint: { "fill-color": ["case", true, "#abc", "#def"], "fill-opacity": 0.4 },
      },
      {
        id: "future-building",
        type: "fill-extrusion",
        source: "openmaptiles",
        paint: { "fill-extrusion-height": 9 },
      },
      {
        id: "future-symbol",
        type: "symbol",
        source: "openmaptiles",
        layout: { "text-field": "name" },
      },
    ],
  };
  const live = new Map<string, Record<string, unknown>>();
  for (const layer of original.layers) live.set(layer.id, structuredClone(layer.paint ?? {}));
  live.set("hp-route-solid", { "line-color": "#f60", "line-width": 4 });
  live.set("hp-region-labels", { "text-color": "#111" });
  const map = new Proxy(
    {
      getLayer: (id: string) => live.has(id),
      setPaintProperty: (id: string, property: string, value: unknown) => {
        assert.ok(!id.startsWith("hp-"));
        assert.ok(colorFields.includes(property.replace(/-transition$/, "")));
        if (!property.endsWith("-transition")) {
          if (value === null) delete live.get(id)![property];
          else live.get(id)![property] = structuredClone(value);
        }
      },
    },
    {
      get(target, property, receiver) {
        assert.ok(property === "getLayer" || property === "setPaintProperty", String(property));
        return Reflect.get(target, property, receiver);
      },
    },
  );
  const sequence: MapAppearance[] = [
    { colorScheme: "light", atmosphere: "day" },
    ...periods.map((atmosphere) => ({ colorScheme: "dark" as const, atmosphere })),
    { colorScheme: "light", atmosphere: "late-night" },
    { colorScheme: "light", atmosphere: "day" },
  ];
  for (const appearance of sequence) {
    applyMapAppearance(
      map as unknown as Parameters<typeof applyMapAppearance>[0],
      original,
      appearance,
      0,
    );
    const expected = createMapAppearanceStyle(original, appearance);
    for (const layer of expected.layers) assert.deepEqual(live.get(layer.id), layer.paint ?? {});
  }
  assert.deepEqual(
    live.get("future-fill")!["fill-color"],
    (original.layers[1].paint as Record<string, unknown>)["fill-color"],
  );
  assert.ok(!Object.hasOwn(live.get("future-building")!, "fill-extrusion-color"));
  assert.ok(!Object.hasOwn(live.get("future-symbol")!, "text-color"));
  assert.deepEqual(live.get("hp-route-solid"), { "line-color": "#f60", "line-width": 4 });
  assert.deepEqual(live.get("hp-region-labels"), { "text-color": "#111" });
});

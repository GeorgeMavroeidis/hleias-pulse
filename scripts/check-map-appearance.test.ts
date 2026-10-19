import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import {
  applyMapAppearance,
  createIliaMapStyle,
  createMapAppearanceStyle,
  DARK_DAY_MAP_PALETTE,
  DAY_MAP_PALETTE,
  resolveMapPalette,
  type MapAppearance,
} from "../src/lib/hp/map-cartography";
import { darkBasemapPaint } from "../src/lib/hp/map-theme";

const provider: StyleSpecification = JSON.parse(
  readFileSync(new URL("./fixtures/openfreemap-bright.json", import.meta.url), "utf8"),
);
const light: MapAppearance = { colorScheme: "light", atmosphere: "day" };
const dark: MapAppearance = { colorScheme: "dark", atmosphere: "day" };
const colors = new Set([
  "background-color",
  "fill-color",
  "fill-outline-color",
  "fill-extrusion-color",
  "line-color",
  "text-color",
  "text-halo-color",
]);
const extras: LayerSpecification[] = [
  {
    id: "future-marina",
    type: "fill",
    source: "openmaptiles",
    "source-layer": "water",
    paint: {
      "fill-color": ["match", ["get", "class"], "lake", "#aad", "#bbc"],
      "fill-opacity": 0.46,
    },
    filter: ["==", ["get", "class"], "lake"],
  },
  {
    id: "future-industrial-block",
    type: "fill-extrusion",
    source: "openmaptiles",
    "source-layer": "building",
    paint: { "fill-extrusion-height": ["get", "height"], "fill-extrusion-opacity": 0.7 },
  },
  {
    id: "future-building-outline",
    type: "fill-extrusion",
    source: "openmaptiles",
    "source-layer": "building",
    paint: {
      "fill-extrusion-color": ["case", ["has", "class"], "#abc", "#def"],
      "fill-extrusion-height": 12,
    },
  },
  {
    id: "future-place-label",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "place",
    layout: { "text-field": ["get", "name"], "text-size": 13 },
    paint: { "text-opacity": 0.9 },
  },
  {
    id: "future-water-label",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "water_name",
    layout: { "text-field": ["get", "name"] },
    paint: {
      "text-color": ["match", ["get", "class"], "lake", "#123", "#234"],
      "text-halo-color": "#abc",
    },
  },
  {
    id: "future-data-point",
    type: "circle",
    source: "openmaptiles",
    "source-layer": "poi",
    paint: { "circle-color": "#ee2233", "circle-radius": 3 },
  },
];
const unthemed: StyleSpecification = { ...provider, layers: [...provider.layers, ...extras] };

function freeze(value: unknown): void {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
}
function paintOf(layer: LayerSpecification | undefined): Record<string, unknown> {
  return layer && "paint" in layer
    ? ((layer.paint as Record<string, unknown> | undefined) ?? {})
    : {};
}
function withoutColors(style: StyleSpecification): unknown {
  const result = structuredClone(style);
  for (const layer of result.layers) {
    if (!("paint" in layer) || !layer.paint) continue;
    const paint = layer.paint as Record<string, unknown>;
    for (const property of colors) delete paint[property];
    if (Object.keys(paint).length === 0) delete layer.paint;
  }
  return result;
}
function getLayer(style: StyleSpecification, id: string): LayerSpecification {
  const result = style.layers.find((layer) => layer.id === id);
  assert.ok(result, id);
  return result;
}

test("day resolver is a pure lookup of complete frozen Light and Dark palettes", () => {
  assert.equal(resolveMapPalette(light), DAY_MAP_PALETTE);
  assert.equal(resolveMapPalette(dark), DARK_DAY_MAP_PALETTE);
  assert.ok(Object.isFrozen(DAY_MAP_PALETTE));
  assert.ok(Object.isFrozen(DARK_DAY_MAP_PALETTE));
  assert.deepEqual(Object.keys(DARK_DAY_MAP_PALETTE).sort(), Object.keys(DAY_MAP_PALETTE).sort());
});

test("both appearance outputs validate and preserve reviewed Phase 2 non-color behavior", () => {
  const reviewed = createIliaMapStyle(unthemed);
  const snapshot = structuredClone(unthemed);
  freeze(unthemed);
  for (const appearance of [light, dark]) {
    const result = createMapAppearanceStyle(unthemed, appearance);
    assert.deepEqual(
      validateStyleMin(result).map((error) => error.message),
      [],
    );
    assert.deepEqual(withoutColors(result), withoutColors(reviewed));
    assert.deepEqual(result.sources, provider.sources);
    assert.deepEqual(result.glyphs, provider.glyphs);
    assert.deepEqual(result.sprite, provider.sprite);
    assert.deepEqual(
      result.layers.map(({ id, type }) => ({ id, type })),
      reviewed.layers.map(({ id, type }) => ({ id, type })),
    );
  }
  assert.deepEqual(unthemed, snapshot);
  assert.deepEqual(createMapAppearanceStyle(unthemed, light), reviewed);
});

test("main fallback handles unknown provider layers, then Bright hierarchy overrides it", () => {
  const result = createMapAppearanceStyle(unthemed, dark);
  const p = DARK_DAY_MAP_PALETTE;
  assert.equal(paintOf(getLayer(result, "future-marina"))["fill-color"], p.water);
  assert.equal(
    paintOf(getLayer(result, "future-industrial-block"))["fill-extrusion-color"],
    p.building,
  );
  assert.equal(paintOf(getLayer(result, "future-place-label"))["text-color"], p.primaryText);
  assert.equal(paintOf(getLayer(result, "future-water-label"))["text-color"], p.waterText);
  assert.deepEqual(getLayer(result, "future-data-point"), extras.at(-1));
  assert.equal(paintOf(getLayer(result, "landcover-wood"))["fill-color"], p.olive);
  assert.equal(paintOf(getLayer(result, "highway-motorway-casing"))["line-color"], p.majorCasing);
  assert.equal(paintOf(getLayer(result, "water_name_point_label"))["text-halo-color"], p.water);
  assert.deepEqual(paintOf(getLayer(result, "highway-link"))["line-color"], [
    "match",
    ["get", "class"],
    ["motorway", "trunk", "primary"],
    p.majorRoad,
    p.secondaryRoad,
  ]);
});

test("pure fallback preserves main defaults and accepts resolved cartography tokens", () => {
  const background: LayerSpecification = { id: "unknown-background", type: "background" };
  assert.deepEqual(darkBasemapPaint(background), { "background-color": "#142230" });
  assert.deepEqual(darkBasemapPaint(background, { ...DARK_DAY_MAP_PALETTE, land: "#172531" }), {
    "background-color": "#172531",
  });
});

test("runtime round trip restores expressions and absent defaults while overlays and all other state survive", () => {
  const displayed = structuredClone(createMapAppearanceStyle(unthemed, light));
  displayed.layers.push(
    {
      id: "hp-route-solid",
      type: "line",
      source: "route",
      paint: { "line-color": "#e06a32", "line-width": 4 },
    },
    {
      id: "hp-route-halo",
      type: "line",
      source: "route",
      paint: { "line-color": "#fff", "line-width": 6 },
    },
    {
      id: "hp-region-labels",
      type: "symbol",
      source: "region",
      layout: { "text-field": "Ilia" },
      paint: { "text-color": "#111" },
    },
  );
  const overlays = structuredClone(displayed.layers.slice(-3));
  const camera = Object.freeze({ center: [21.63, 37.67], zoom: 11, bearing: 14, pitch: 20 });
  const selection = Object.freeze({ placeId: "olympia", routeId: "coast" });
  const writes: Array<[string, string, unknown]> = [];
  const map = new Proxy(
    {
      getLayer: (id: string) => displayed.layers.find((layer) => layer.id === id),
      setPaintProperty: (id: string, property: string, value: unknown) => {
        const layer = getLayer(displayed, id);
        assert.ok(!id.startsWith("hp-"), `Overlay write: ${id}`);
        assert.ok(colors.has(property.replace(/-transition$/, "")), property);
        assert.ok("paint" in layer);
        const paint = (layer.paint ??= {}) as Record<string, unknown>;
        writes.push([id, property, structuredClone(value)]);
        if (value === null) delete paint[property];
        else paint[property] = structuredClone(value);
      },
    },
    {
      get(target, property, receiver) {
        assert.ok(
          property === "getLayer" || property === "setPaintProperty",
          `Forbidden map access: ${String(property)}`,
        );
        return Reflect.get(target, property, receiver);
      },
    },
  );
  const before = withoutColors(displayed);
  for (const appearance of [light, dark, light, dark, light]) {
    writes.length = 0;
    applyMapAppearance(map as Parameters<typeof applyMapAppearance>[0], unthemed, appearance, 700);
    const expected = createMapAppearanceStyle(unthemed, appearance);
    for (const layer of expected.layers) {
      const actual = getLayer(displayed, layer.id);
      for (const property of colors) {
        assert.deepEqual(
          paintOf(actual)[property],
          paintOf(layer)[property],
          `${appearance.colorScheme}:${layer.id}:${property}`,
        );
      }
    }
    assert.ok(
      writes
        .filter(([, property]) => property.endsWith("-transition"))
        .every(([, , value]) => {
          assert.deepEqual(value, { duration: 700, delay: 0 });
          return true;
        }),
    );
  }
  assert.ok(
    writes.some(
      ([id, property, value]) =>
        id === "future-place-label" && property === "text-color" && value === null,
    ),
  );
  assert.ok(
    writes.some(
      ([id, property, value]) =>
        id === "future-industrial-block" && property === "fill-extrusion-color" && value === null,
    ),
  );
  assert.deepEqual(
    paintOf(getLayer(displayed, "future-marina"))["fill-color"],
    paintOf(extras[0])["fill-color"],
  );
  assert.deepEqual(
    paintOf(getLayer(displayed, "future-building-outline"))["fill-extrusion-color"],
    paintOf(extras[2])["fill-extrusion-color"],
  );
  for (const layer of displayed.layers) {
    if (!("paint" in layer) || !layer.paint) continue;
    for (const key of Object.keys(layer.paint)) {
      if (key.endsWith("-transition")) delete (layer.paint as Record<string, unknown>)[key];
    }
  }
  assert.deepEqual(withoutColors(displayed), before);
  assert.deepEqual(displayed.layers.slice(-3), overlays);
  assert.deepEqual(camera, { center: [21.63, 37.67], zoom: 11, bearing: 14, pitch: 20 });
  assert.deepEqual(selection, { placeId: "olympia", routeId: "coast" });
});

test("reduced-motion duration is immediate and missing provider layers are skipped", () => {
  const calls: Array<[string, string, unknown]> = [];
  const map = {
    getLayer: (id: string) => (id === "background" ? {} : undefined),
    setPaintProperty: (...args: unknown[]) => {
      calls.push(args as [string, string, unknown]);
    },
  } as unknown as Parameters<typeof applyMapAppearance>[0];
  applyMapAppearance(map, unthemed, dark, 0);
  assert.deepEqual(calls, [
    ["background", "background-color-transition", { duration: 0, delay: 0 }],
    ["background", "background-color", DARK_DAY_MAP_PALETTE.land],
  ]);
});

function luminance(color: string): number {
  const channels = color
    .slice(1)
    .match(/../g)!
    .map((value) => Number.parseInt(value, 16) / 255);
  return channels
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

test("navy day map remains dark and supports legible map labels", () => {
  const p = DARK_DAY_MAP_PALETTE;
  assert.ok(luminance(p.land) < 0.05);
  assert.ok(luminance(p.water) < 0.05);
  assert.ok(contrast(p.primaryText, p.land) >= 4.5);
  assert.ok(contrast(p.secondaryText, p.land) >= 4.5);
  assert.ok(contrast(p.waterText, p.water) >= 4.5);
});

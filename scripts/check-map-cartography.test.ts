import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
// The validator/filter evaluator shipped with our installed MapLibre renderer.
import { featureFilter, validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import type { LayerSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import {
  applyMapPalette,
  ATMOSPHERE_MAP_PALETTES,
  createIliaMapStyle,
  DAY_MAP_PALETTE,
} from "../src/lib/hp/map-cartography";
import { removeAdministrativeBoundaries } from "../src/lib/hp/map-core";

// Real Bright response captured 2026-10-01. Test fixture only, never a runtime
// style fallback. Source and licensing are recorded in phase2-map-cartography.md.
const upstream: StyleSpecification = JSON.parse(
  readFileSync(new URL("./fixtures/openfreemap-bright.json", import.meta.url), "utf8"),
);
const styled = createIliaMapStyle(upstream);
const layer = (id: string) => {
  const result = styled.layers.find((item) => item.id === id);
  assert.ok(result, `Missing ${id}`);
  return result;
};
const symbol = (id: string) => {
  const result = layer(id);
  assert.equal(result.type, "symbol");
  if (result.type !== "symbol") throw new Error(id);
  return result;
};

test("real provider style transforms into a valid, boundary-free MapLibre style", () => {
  assert.deepEqual(
    validateStyleMin(styled).map((error) => error.message),
    [],
  );
  assert.deepEqual(
    styled.layers.map((item) => item.id),
    removeAdministrativeBoundaries(upstream).layers.map((item) => item.id),
  );
  assert.equal(styled.layers.length, 116);
});

test("transformation does not mutate the provider style or alter remote assets", () => {
  const original = structuredClone(upstream);
  const frozen = (value: unknown): void => {
    if (value && typeof value === "object") {
      Object.freeze(value);
      Object.values(value).forEach(frozen);
    }
  };
  frozen(original);
  const result = createIliaMapStyle(original);
  assert.deepEqual(original, upstream);
  for (const key of ["sources", "glyphs", "sprite"] as const) {
    assert.deepEqual(result[key], upstream[key]);
  }
  assert.deepEqual(createIliaMapStyle(result), result, "Applying twice is idempotent");
});

test("roads preserve topology filters, widths, zooms and bridge/tunnel/ferry semantics", () => {
  for (const original of upstream.layers) {
    if (original.type !== "line" || original.id.startsWith("boundary")) continue;
    const result = layer(original.id);
    assert.equal(result.type, "line");
    if (result.type !== "line") continue;
    assert.deepEqual(result.filter, original.filter, original.id);
    assert.deepEqual(result.layout, original.layout, original.id);
    assert.equal(result.minzoom, original.minzoom, original.id);
    for (const property of [
      "line-width",
      "line-dasharray",
      "line-opacity",
      "line-gap-width",
    ] as const) {
      assert.deepEqual(result.paint?.[property], original.paint?.[property], original.id);
    }
  }
});

test("bilingual settlement names, provider classes, rank and collision behavior survive", () => {
  for (const original of upstream.layers) {
    if (original.type !== "symbol" || !original.id.startsWith("label_")) continue;
    const result = symbol(original.id);
    assert.deepEqual(result.filter, original.filter);
    assert.deepEqual(result.layout?.["text-field"], original.layout?.["text-field"]);
    for (const key of [
      "text-allow-overlap",
      "text-ignore-placement",
      "text-padding",
      "symbol-sort-key",
    ] as const) {
      assert.deepEqual(result.layout?.[key], original.layout?.[key]);
    }
  }
  assert.deepEqual(symbol("label_town").layout?.["text-font"], ["Noto Sans Bold"]);
  assert.equal(symbol("label_village").minzoom, 9);
  assert.equal(symbol("label_other").minzoom, 13);
});

function accepts(
  id: string,
  properties: Record<string, string | number>,
  type: "Point" | "LineString" = "Point",
) {
  return featureFilter(symbol(id).filter, id).filter({ zoom: 17 }, { type, properties });
}

test("orientation POIs retain original ranks; commercial labels are suppressed", () => {
  for (const [id, rank] of [
    ["poi_r1", 2],
    ["poi_r7", 9],
    ["poi_r20", 24],
  ] as const) {
    for (const category of ["hospital", "museum", "castle", "monument", "park"]) {
      assert.equal(accepts(id, { class: category, rank }), true, `${id}: ${category}`);
    }
    for (const category of ["cafe", "shop", "restaurant", "lodging", "fuel", "parking"]) {
      assert.equal(accepts(id, { class: category, rank }), false, `${id}: ${category}`);
    }
    const original = upstream.layers.find((item) => item.id === id);
    assert.equal(symbol(id).minzoom, original?.minzoom);
  }
  assert.equal(accepts("poi_r1", { class: "museum", rank: 9 }), false);
  assert.equal(accepts("poi_r7", { class: "museum", rank: 2 }), false);
});

test("transit keeps actual provider railway class and bus stations, excludes ordinary stops", () => {
  for (const properties of [
    { class: "airport", subclass: "airport" },
    { class: "bus", subclass: "bus_station" },
    { class: "railway", subclass: "station" },
    { class: "railway", subclass: "halt" },
    { class: "rail", subclass: "station" },
  ])
    assert.equal(accepts("poi_transit", properties), true);
  assert.equal(accepts("poi_transit", { class: "bus", subclass: "bus_stop" }), false);
  assert.equal(accepts("poi_transit", { class: "shop", subclass: "station" }), false);
});

test("shields preserve network/ref constraints and only major-road orientation", () => {
  const base = { network: "gr-national", ref_length: 2, ref: "9" };
  for (const category of ["motorway", "trunk", "primary"]) {
    assert.equal(
      accepts("highway-shield-non-us", { ...base, class: category }, "LineString"),
      true,
    );
  }
  assert.equal(accepts("highway-shield-non-us", { ...base, class: "minor" }, "LineString"), false);
  assert.equal(
    accepts("highway-shield-non-us", { ...base, class: "primary", ref_length: 8 }, "LineString"),
    false,
  );
  assert.equal(symbol("highway-shield-non-us").minzoom, 11);
  assert.equal(symbol("highway-shield-non-us").layout?.["symbol-spacing"], 450);
  assert.equal(symbol("highway-name-minor").minzoom, 16);
  assert.equal(symbol("highway-name-path").minzoom, 17);
});

test("missing optional layers and unknown IDs/types remain safe", () => {
  const extras: LayerSpecification[] = [
    {
      id: "future-park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: { "fill-color": "red" },
    },
    {
      id: "water",
      type: "line",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "line-color": "red" },
    },
    {
      id: "hp-route-solid",
      type: "line",
      source: "openmaptiles",
      paint: { "line-color": "#e06a32", "line-width": 4 },
    },
  ];
  const result = createIliaMapStyle({ version: 8, sources: upstream.sources, layers: extras });
  assert.deepEqual(result.layers, extras);
  assert.deepEqual(createIliaMapStyle({ version: 8, sources: {}, layers: [] }).layers, []);
});

test("palette changes do not change density, fonts, assets or route overlays", () => {
  const variant = createIliaMapStyle(upstream, {
    ...DAY_MAP_PALETTE,
    water: "#7795a0",
    land: "#eee2cf",
  });
  for (let i = 0; i < styled.layers.length; i++) {
    const before = styled.layers[i],
      after = variant.layers[i];
    assert.equal(before.id, after.id);
    assert.equal(before.minzoom, after.minzoom);
    if ("filter" in before && "filter" in after) assert.deepEqual(before.filter, after.filter);
    assert.deepEqual(before.layout, after.layout);
  }
});

test("all atmospheres validate and keep label contrast and coastline separation", () => {
  const luminance = (hex: string) => {
    const rgb = hex
      .slice(1)
      .match(/../g)!
      .map((part) => parseInt(part, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (a: string, b: string) =>
    (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  for (const [name, palette] of Object.entries(ATMOSPHERE_MAP_PALETTES)) {
    const variant = createIliaMapStyle(upstream, palette);
    assert.deepEqual(
      validateStyleMin(variant).map((e) => e.message),
      [],
      name,
    );
    for (const [foreground, background] of [
      [palette.primaryText, palette.land],
      [palette.secondaryText, palette.land],
      [palette.waterText, palette.water],
    ])
      assert.ok(contrast(foreground, background) >= 4.5, `${name}: ${foreground} on ${background}`);
    assert.ok(contrast(palette.land, palette.water) >= 1.5, `${name}: land/sea separation`);
    for (let i = 0; i < styled.layers.length; i++) {
      const before = styled.layers[i],
        after = variant.layers[i];
      assert.deepEqual({ ...after, paint: undefined }, { ...before, paint: undefined });
    }
    assert.deepEqual(variant.sources, styled.sources);
    assert.equal(variant.glyphs, styled.glyphs);
    assert.deepEqual(variant.sprite, styled.sprite);
  }
});

test("runtime updates use only paint colors/transitions and match initial styles without touching overlays", () => {
  const route: LayerSpecification = {
    id: "hp-route-solid",
    type: "line",
    source: "openmaptiles",
    "source-layer": "transportation",
    paint: { "line-color": "#e06a32", "line-width": 4 },
  };
  const state: StyleSpecification = {
    ...structuredClone(styled),
    layers: [...structuredClone(styled.layers), route],
  };
  const sources = state.sources,
    layers = state.layers;
  const routesBefore = structuredClone(route);
  const calls: string[] = [];
  const fake = {
    getStyle: () => state,
    getLayer: (id: string) => state.layers.find((layer) => layer.id === id),
    setPaintProperty: (id: string, property: string, value: unknown) => {
      assert.match(
        property,
        /^(background|fill|fill-outline|line|text|text-halo)-color(-transition)?$/,
      );
      calls.push(property);
      const layer = state.layers.find((layer) => layer.id === id)!;
      (layer.paint as Record<string, unknown>)[property] = value;
    },
  } as unknown as MapLibreMap;
  for (const duration of [800, 0])
    for (const palette of Object.values(ATMOSPHERE_MAP_PALETTES)) {
      applyMapPalette(fake, palette, duration);
      const expected = createIliaMapStyle(upstream, palette);
      for (const layer of expected.layers) {
        const actual = state.layers.find((row) => row.id === layer.id)!;
        const paint = Object.fromEntries(
          Object.entries(actual.paint ?? {}).filter(([key]) => !key.endsWith("-transition")),
        );
        assert.deepEqual(paint, layer.paint ?? {}, layer.id);
        for (const [property, value] of Object.entries(actual.paint ?? {}))
          if (property.endsWith("-transition")) assert.deepEqual(value, { duration, delay: 0 });
      }
      assert.deepEqual(state.sources, sources);
      assert.equal(state.layers, layers);
      assert.deepEqual(route, routesBefore);
      assert.deepEqual(
        validateStyleMin(state).map((e) => e.message),
        [],
      );
    }
  assert.ok(calls.length > 0);
});

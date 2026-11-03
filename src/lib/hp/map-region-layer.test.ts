import assert from "node:assert/strict";
import test from "node:test";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { ATMOSPHERE_MAP_PALETTES } from "./map-cartography";
import {
  applyRegionalMapPalette,
  installRegionalLayer,
  markerActivityDescription,
  regionalSymbolLayer,
  REGION_LAYER_ID,
  REGION_SOURCE_ID,
} from "./map-region-layer";
import type { MarkerPulseSignal } from "./marker-pulse";
import { FRESHNESS_LIMITS } from "./freshness";

const now = Date.parse("2026-10-05T12:00:00Z");
const t = (key: string, params?: Record<string, string | number>) =>
  key.replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? k));

test("all atmosphere regional labels validate without changing disclosure or sprite topology", () => {
  const day = regionalSymbolLayer();
  for (const palette of Object.values(ATMOSPHERE_MAP_PALETTES)) {
    const layer = regionalSymbolLayer(palette);
    assert.deepEqual(
      validateStyleMin({
        version: 8,
        glyphs: "https://example.test/{fontstack}/{range}.pbf",
        sources: {
          [REGION_SOURCE_ID]: {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          },
        },
        layers: [layer],
      }).map((e) => e.message),
      [],
    );
    assert.deepEqual(layer.layout, day.layout);
    assert.equal(layer.maxzoom, day.maxzoom);
    assert.deepEqual(layer.paint?.["icon-opacity"], day.paint?.["icon-opacity"]);
    assert.equal(layer.paint?.["text-color"], palette.primaryText);
    assert.equal(layer.paint?.["text-halo-color"], palette.land);
  }
});

test("regional atmosphere updates paint only and skip an absent layer during recovery", () => {
  const writes: unknown[][] = [];
  let exists = false;
  const map = {
    getLayer: () => (exists ? ({ id: REGION_LAYER_ID } as never) : undefined),
    setPaintProperty: (...args: unknown[]) => {
      writes.push(args);
    },
  } as unknown as Parameters<typeof applyRegionalMapPalette>[0];
  const palette = ATMOSPHERE_MAP_PALETTES["late-night"];
  applyRegionalMapPalette(map, palette, 800);
  assert.deepEqual(writes, []);
  exists = true;
  applyRegionalMapPalette(map, palette, 0);
  assert.deepEqual(writes, [
    [REGION_LAYER_ID, "text-color-transition", { duration: 0, delay: 0 }],
    [REGION_LAYER_ID, "text-color", palette.primaryText],
    [REGION_LAYER_ID, "text-halo-color-transition", { duration: 0, delay: 0 }],
    [REGION_LAYER_ID, "text-halo-color", palette.land],
  ]);
});

test("a source left by partial installation can finish without fetching or duplicating sprites", () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const styleDescriptor = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  const images = new Set(["hp-region-core", "hp-region-selected"]);
  const layers: ReturnType<typeof regionalSymbolLayer>[] = [];
  const source = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement() {
        throw new Error("Sprites already exist");
      },
    },
  });
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    value: () => ({ getPropertyValue: () => "" }),
  });
  try {
    const map = {
      getContainer: () => ({}),
      getSource: () => source,
      getLayer: () => layers[0],
      hasImage: (id: string) => images.has(id),
      addImage: () => assert.fail("duplicate sprite"),
      addSource: () => assert.fail("duplicate source"),
      addLayer: (layer: ReturnType<typeof regionalSymbolLayer>) => layers.push(layer),
    } as unknown as Parameters<typeof installRegionalLayer>[0];
    installRegionalLayer(map, ATMOSPHERE_MAP_PALETTES.evening);
    installRegionalLayer(map);
    assert.equal(layers.length, 1);
    assert.equal(layers[0].paint?.["text-color"], ATMOSPHERE_MAP_PALETTES.evening.primaryText);
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
    else Reflect.deleteProperty(globalThis, "document");
    if (styleDescriptor) Object.defineProperty(globalThis, "getComputedStyle", styleDescriptor);
    else Reflect.deleteProperty(globalThis, "getComputedStyle");
  }
});

test("palette context cannot grant Live to uncertain or aged retained evidence", () => {
  const signal: MarkerPulseSignal = {
    level: "lively",
    tier: "live",
    quality: "confirmed",
    lastSignalAt: new Date(now - 60000).toISOString(),
    score: 99,
    contributorCount: 3,
  };
  assert.match(markerActivityDescription(signal, now, "EN", t), /activity: Live/);
  assert.doesNotMatch(
    markerActivityDescription({ ...signal, quality: "uncertain" }, now, "EN", t),
    /activity: Live/,
  );
  assert.doesNotMatch(
    markerActivityDescription(signal, now + FRESHNESS_LIMITS.currentMs, "EN", t),
    /activity: Live/,
  );
  assert.match(
    markerActivityDescription(signal, now + FRESHNESS_LIMITS.recentMs, "EN", t),
    /Historical community activity/,
  );
});

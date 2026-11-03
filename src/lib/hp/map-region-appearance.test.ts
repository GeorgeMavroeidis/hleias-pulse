import assert from "node:assert/strict";
import { test } from "node:test";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  DAY_MAP_PALETTE,
  DARK_DAY_MAP_PALETTE,
  ATMOSPHERE_MAP_PALETTES,
  DARK_ATMOSPHERE_MAP_PALETTES,
} from "./map-cartography";
import { applyRegionalMapPalette, installRegionalLayer, REGION_LAYER_ID } from "./map-region-layer";

type ImageFixture = ImageData & { paints: string[]; geometry: number[][] };

test("regional palette round trips update existing pixels and labels without replacing map topology", () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const styleDescriptor = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  let contexts = 0;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => {
        contexts++;
        let paints: string[] = [];
        let geometry: number[][] = [];
        const ctx = {
          fillStyle: "",
          strokeStyle: "",
          lineWidth: 0,
          clearRect: () => {
            paints = [];
            geometry = [];
          },
          beginPath: () => {},
          arc: (...args: number[]) => geometry.push(args),
          fill: () => paints.push(`fill:${ctx.fillStyle}`),
          stroke: () => paints.push(`stroke:${ctx.strokeStyle}`),
          getImageData: () => ({
            width: 64,
            height: 64,
            data: new Uint8ClampedArray(64 * 64 * 4),
            paints: [...paints],
            geometry: structuredClone(geometry),
          }),
        };
        return { getContext: () => ctx };
      },
    },
  });
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    value: () => ({ getPropertyValue: () => "#ed7948" }),
  });
  const images = new Map<string, ImageFixture>();
  const layers = new Map<string, unknown>();
  const sources = new Map<string, unknown>();
  const writes: Array<[string, string, unknown]> = [];
  let runtime = false;
  let updates = 0;
  const methods = {
    getContainer: () => ({}),
    getLayer: (id: string) => layers.get(id),
    getSource: (id: string) => sources.get(id),
    hasImage: (id: string) => images.has(id),
    addImage: (id: string, image: ImageFixture, options: unknown) => {
      assert.equal(runtime, false);
      assert.deepEqual(options, { pixelRatio: 2 });
      images.set(id, image);
    },
    updateImage: (id: string, image: ImageFixture) => {
      assert.equal(runtime, true);
      assert.ok(images.has(id));
      images.set(id, image);
      updates++;
    },
    addSource: (id: string, source: unknown) => {
      assert.equal(runtime, false);
      sources.set(id, source);
    },
    addLayer: (layer: { id: string }) => {
      assert.equal(runtime, false);
      layers.set(layer.id, layer);
    },
    setPaintProperty: (id: string, property: string, value: unknown) => {
      assert.equal(id, REGION_LAYER_ID);
      assert.ok(
        [
          "text-color",
          "text-halo-color",
          "text-color-transition",
          "text-halo-color-transition",
        ].includes(property),
      );
      writes.push([id, property, value]);
    },
  };
  const map = new Proxy(methods, {
    get(target, property, receiver) {
      assert.ok(Object.hasOwn(target, property), `Forbidden map operation ${String(property)}`);
      return Reflect.get(target, property, receiver);
    },
  }) as unknown as MapLibreMap;
  try {
    installRegionalLayer(map, DAY_MAP_PALETTE);
    const initial = new Map(images);
    const initialSources = [...sources.entries()];
    const initialLayers = [...layers.entries()];
    runtime = true;
    applyRegionalMapPalette(map, DARK_DAY_MAP_PALETTE, 800);
    assert.equal(updates, 2);
    assert.equal(contexts, 2);
    assert.deepEqual([...images.keys()], [...initial.keys()]);
    for (const [id, image] of images) {
      assert.deepEqual(image.geometry, initial.get(id)!.geometry);
      assert.ok(image.paints.includes(`fill:${DARK_DAY_MAP_PALETTE.land}`));
      assert.ok(image.paints.includes(`stroke:${DARK_DAY_MAP_PALETTE.primaryText}`));
      assert.ok(image.paints.includes("fill:#ed7948"));
    }
    assert.ok(
      writes.some(
        ([, property, value]) =>
          property === "text-color" && value === DARK_DAY_MAP_PALETTE.primaryText,
      ),
    );
    applyRegionalMapPalette(map, DARK_DAY_MAP_PALETTE, 0);
    assert.equal(updates, 2, "unchanged colors do not upload textures again");
    applyRegionalMapPalette(map, DAY_MAP_PALETTE, 0);
    assert.equal(updates, 4);
    for (const [id, image] of images) assert.deepEqual(image, initial.get(id));
    assert.deepEqual([...sources.entries()], initialSources);
    assert.deepEqual([...layers.entries()], initialLayers);
    for (const palette of [
      ...Object.values(ATMOSPHERE_MAP_PALETTES),
      ...Object.values(DARK_ATMOSPHERE_MAP_PALETTES),
    ]) {
      applyRegionalMapPalette(map, palette, 800);
      for (const [id, image] of images) {
        assert.deepEqual(image.geometry, initial.get(id)!.geometry);
        assert.ok(image.paints.includes(`fill:${palette.land}`));
        assert.ok(image.paints.includes(`stroke:${palette.primaryText}`));
      }
      assert.deepEqual([...sources.entries()], initialSources);
      assert.deepEqual([...layers.entries()], initialLayers);
    }
    applyRegionalMapPalette(map, DAY_MAP_PALETTE, 0);
    assert.equal(contexts, 2);
    assert.deepEqual(writes.at(-2), [
      REGION_LAYER_ID,
      "text-halo-color-transition",
      { duration: 0, delay: 0 },
    ]);
    assert.deepEqual(writes.at(-1), [REGION_LAYER_ID, "text-halo-color", DAY_MAP_PALETTE.land]);
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
    else Reflect.deleteProperty(globalThis, "document");
    if (styleDescriptor) Object.defineProperty(globalThis, "getComputedStyle", styleDescriptor);
    else Reflect.deleteProperty(globalThis, "getComputedStyle");
  }
});

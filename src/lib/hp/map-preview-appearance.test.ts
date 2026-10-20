import assert from "node:assert/strict";
import { test } from "node:test";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  DAY_MAP_PALETTE,
  DARK_DAY_MAP_PALETTE,
  ATMOSPHERE_MAP_PALETTES,
  DARK_ATMOSPHERE_MAP_PALETTES,
} from "./map-cartography";
const allPalettes = [
  ...Object.values(ATMOSPHERE_MAP_PALETTES),
  ...Object.values(DARK_ATMOSPHERE_MAP_PALETTES),
];
import {
  applyPreviewMapPalette,
  attachLocalPreviewLand,
  createLocalPreviewBasemapStyle,
} from "./map-preview-appearance";

class Element {
  attributes = new Map<string, string>();
  style: Record<string, string> = {};
  children: Element[] = [];
  parent: Element | null = null;
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  append(child: Element) {
    this.children.push(child);
    child.parent = this;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
}

test("all eight preview styles validate with only a palette-colored sea and no sources", () => {
  for (const palette of allPalettes) {
    const style = createLocalPreviewBasemapStyle(palette);
    assert.deepEqual(
      validateStyleMin(style).map((error) => error.message),
      [],
    );
    assert.deepEqual(style.sources, {});
    assert.deepEqual(style.layers, [
      { id: "hp-preview-sea", type: "background", paint: { "background-color": palette.water } },
    ]);
  }
});

test("preview changes reuse coast geometry, keep sea/SVG colors together, and dispose queued work", () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const canvas = new Element("div");
  const frames = new Map<number, FrameRequestCallback>();
  const cancelled: number[] = [];
  let nextFrame = 0;
  const flushFrame = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElementNS: (_namespace: string, tag: string) => new Element(tag),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        const id = ++nextFrame;
        frames.set(id, callback);
        return id;
      },
      cancelAnimationFrame: (id: number) => {
        cancelled.push(id);
        frames.delete(id);
      },
    },
  });
  const listeners = new Map<string, Set<() => void>>();
  const writes: Array<[string, string, unknown]> = [];
  const methods = {
    getCanvasContainer: () => canvas,
    getContainer: () => ({ clientWidth: 390, clientHeight: 700 }),
    project: ([lng, lat]: [number, number]) => ({ x: lng * 10, y: lat * 10 }),
    on: (event: string, callback: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback);
    },
    off: (event: string, callback: () => void) => {
      listeners.get(event)?.delete(callback);
    },
    getLayer: (id: string) => id === "hp-preview-sea",
    setPaintProperty: (id: string, property: string, value: unknown) => {
      assert.equal(id, "hp-preview-sea");
      assert.ok(property === "background-color" || property === "background-color-transition");
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
    const land = attachLocalPreviewLand(map, DAY_MAP_PALETTE);
    assert.equal(canvas.children.length, 1);
    const svg = canvas.children[0];
    assert.equal(svg.attributes.get("aria-hidden"), "true");
    assert.equal(svg.style.pointerEvents, "none");
    assert.ok(svg.children.length > 0);
    const paths = [...svg.children];
    assert.ok(paths.every((path) => path.attributes.get("fill") === DAY_MAP_PALETTE.land));
    assert.ok(paths.every((path) => path.attributes.get("stroke") === DAY_MAP_PALETTE.olive));
    assert.equal(frames.size, 1);
    flushFrame();
    const geometry = paths.map((path) => path.attributes.get("d"));
    assert.ok(geometry.every((path) => path?.startsWith("M") && path.endsWith(" Z")));
    assert.equal(svg.attributes.get("viewBox"), "0 0 390 700");

    applyPreviewMapPalette(map, land, DARK_DAY_MAP_PALETTE, 800);
    assert.deepEqual(writes.slice(-2), [
      ["hp-preview-sea", "background-color-transition", { duration: 800, delay: 0 }],
      ["hp-preview-sea", "background-color", DARK_DAY_MAP_PALETTE.water],
    ]);
    assert.equal(canvas.children[0], svg);
    assert.deepEqual(svg.children, paths);
    assert.deepEqual(
      paths.map((path) => path.attributes.get("d")),
      geometry,
    );
    assert.ok(paths.every((path) => path.attributes.get("fill") === DARK_DAY_MAP_PALETTE.land));
    assert.ok(paths.every((path) => path.attributes.get("stroke") === DARK_DAY_MAP_PALETTE.olive));
    assert.ok(
      paths.every((path) => path.style.transition === "fill 800ms ease, stroke 800ms ease"),
    );
    assert.equal(frames.size, 0);

    for (const palette of allPalettes) {
      applyPreviewMapPalette(map, land, palette, 800);
      assert.equal(canvas.children[0], svg);
      assert.deepEqual(
        paths.map((path) => path.attributes.get("d")),
        geometry,
      );
      assert.ok(
        paths.every(
          (path) =>
            path.attributes.get("fill") === palette.land &&
            path.attributes.get("stroke") === palette.olive,
        ),
      );
    }
    applyPreviewMapPalette(map, land, DAY_MAP_PALETTE, 0);
    assert.ok(paths.every((path) => path.attributes.get("fill") === DAY_MAP_PALETTE.land));
    assert.ok(paths.every((path) => path.style.transition === "none"));
    assert.deepEqual(writes.slice(-2), [
      ["hp-preview-sea", "background-color-transition", { duration: 0, delay: 0 }],
      ["hp-preview-sea", "background-color", DAY_MAP_PALETTE.water],
    ]);
    listeners.get("move")!.forEach((listener) => listener());
    listeners.get("resize")!.forEach((listener) => listener());
    assert.equal(frames.size, 1, "move/resize share one queued projection update");
    const staleDraw = [...frames.values()][0];
    land.dispose();
    land.dispose();
    assert.equal(cancelled.length, 1);
    assert.equal(frames.size, 0);
    assert.equal(canvas.children.length, 0);
    assert.ok([...listeners.values()].every((registered) => registered.size === 0));
    land.update(DARK_DAY_MAP_PALETTE, 0);
    staleDraw(0);
    assert.ok(paths.every((path) => path.attributes.get("fill") === DAY_MAP_PALETTE.land));
    assert.deepEqual(
      paths.map((path) => path.attributes.get("d")),
      geometry,
    );
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
    else Reflect.deleteProperty(globalThis, "document");
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

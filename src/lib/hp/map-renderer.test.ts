import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { PLACES } from "../../../scripts/hp-seed-data";
import { MAP_POLICY, mapDisclosure, topologyBlend, type MapBounds } from "./map-policy";
import {
  buildMapRegions,
  deriveRegionalDiscovery,
  discoveryViewport,
  visibleScreenMembers,
  viewportSignature,
} from "./regional-discovery";
import { createMapTopology, topologyKey, blendTopologies } from "./map-topology";
import {
  regionalGeoJson,
  regionalSymbolLayer,
  REGION_SOURCE_ID,
  installRegionalLayer,
  markerActivityDescription,
} from "./map-region-layer";
import {
  markerPulseInputFromActivity,
  deriveMarkerPulseSnapshot,
  deriveEvidencePulseSignal,
  type MarkerPulseSignal,
} from "./marker-pulse";
import { buildTrafficPreviewScene, TRAFFIC_SCENES } from "./traffic-preview";
import { FRESHNESS_LIMITS } from "./freshness";
import { createMarkerExits } from "./marker-exit";
import { HP_MOTION } from "./motion";

const now = Date.parse("2026-10-05T12:00:00Z");
const regions = buildMapRegions(PLACES);
const allIds = new Set(PLACES.map((p) => p.id));
const world: MapBounds = [
  [-180, -85],
  [180, 85],
];
const t = (key: string, params?: Record<string, string | number>) =>
  key.replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? k));
const olympia = regions.find((r) => r.id === "olympia")!;

test("disclosure thresholds are continuous, monotonic, complementary and central", () => {
  assert.equal(mapDisclosure(9.25).level, "region");
  assert.equal(mapDisclosure(10.5).level, "transition");
  assert.equal(mapDisclosure(11.5).level, "activity");
  assert.equal(mapDisclosure(14).level, "place");
  let previous = 0;
  for (let zoom = 8; zoom <= 18; zoom += 0.005) {
    const row = mapDisclosure(zoom);
    assert.ok(row.detailOpacity >= previous - 1e-9);
    assert.equal(row.regionOpacity + row.detailOpacity, 1);
    previous = row.detailOpacity;
  }
  for (const edge of [10.5, 11.5])
    assert.ok(
      Math.abs(
        mapDisclosure(edge - 1e-5).detailOpacity - mapDisclosure(edge + 1e-5).detailOpacity,
      ) < 1e-6,
    );
  assert.deepEqual(topologyBlend(12.5), { lower: 12, upper: 13, mix: 0 });
  assert.equal(topologyBlend(13).mix, 0);
  assert.ok(topologyBlend(12.999).mix > 0.999);
});

test("regional symbol layer validates against installed SDK with collision-aware labels", () => {
  const layer = regionalSymbolLayer();
  assert.deepEqual(
    validateStyleMin({
      version: 8,
      glyphs: "https://example.test/{fontstack}/{range}.pbf",
      sources: {
        [REGION_SOURCE_ID]: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      },
      layers: [layer],
    }).map((e) => e.message),
    [],
  );
  assert.equal(layer.layout?.["text-allow-overlap"], false);
  assert.equal(layer.layout?.["icon-optional"], false);
  assert.equal(layer.maxzoom, MAP_POLICY.regionFadeEnd);
});

test("one spatial index preserves every member at all zooms and caches queries/leaves", () => {
  const key = topologyKey(PLACES);
  assert.equal(topologyKey([...PLACES].reverse().map((p) => ({ ...p, hotness: 999 }))), key);
  const topology = createMapTopology(key);
  for (let zoom = 8; zoom <= 18; zoom++) {
    const nodes = topology.query(zoom, world);
    assert.strictEqual(topology.query(zoom, world), nodes);
    assert.deepEqual(nodes.flatMap((n) => n.placeIds).sort(), [...allIds].sort());
    if (zoom >= 14) assert.ok(nodes.every((n) => n.clusterId === undefined));
  }
  const visible = topology.visiblePlaces(olympia.bounds);
  assert.ok(visible.some((p) => p.id === olympia.placeIds[0]));
  assert.deepEqual(
    topology.visiblePlaces([
      [0, 0],
      [1, 1],
    ]),
    [],
  );
});

test("crossfades preserve stable identity, exact place points and weighted membership", () => {
  const topology = createMapTopology(topologyKey(PLACES));
  assert.deepEqual(blendTopologies(topology.query(9, world), topology.query(10, world), 9.25), []);
  for (let zoom = 11.5; zoom <= 14.1; zoom += 0.01) {
    const { lower, upper } = topologyBlend(zoom);
    const nodes = blendTopologies(topology.query(lower, world), topology.query(upper, world), zoom);
    const weights = new Map<string, number>();
    nodes.forEach((n) =>
      n.placeIds.forEach((id) => weights.set(id, (weights.get(id) ?? 0) + n.opacity)),
    );
    for (const id of allIds)
      assert.ok(Math.abs((weights.get(id) ?? 0) - 1) < 0.0011, `${id} at ${zoom}`);
    for (const n of nodes.filter((n) => n.clusterId === undefined)) {
      const place = PLACES.find((p) => p.id === n.placeIds[0])!;
      assert.deepEqual([n.lng, n.lat], [place.lng, place.lat]);
    }
  }
});

test("viewport uses geographic members, filters primary area, and includes zoom/overlay geometry", () => {
  const center = olympia.anchor;
  const points = PLACES.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }));
  const full = discoveryViewport(center, 9.25, world, world, points, allIds);
  const close = discoveryViewport(center, 14, world, olympia.bounds, points, allIds);
  assert.equal(close.primaryAreaId, "olympia");
  assert.ok(close.visiblePlaceIds.length < full.visiblePlaceIds.length);
  assert.notEqual(viewportSignature(close), viewportSignature({ ...close, zoom: 14.5 }));
  assert.notEqual(viewportSignature(close), viewportSignature({ ...close, usableBounds: world }));
  const noContext = discoveryViewport(center, 14, world, olympia.bounds, points, new Set());
  assert.equal(noContext.primaryAreaId, null);
  assert.deepEqual(noContext.visibleAreaIds, close.visibleAreaIds);
  const outside = discoveryViewport(
    { lng: 20, lat: 36.5 },
    12,
    world,
    [
      [19.5, 36],
      [20, 36.5],
    ],
    points,
    allIds,
  );
  assert.deepEqual(outside.visiblePlaceIds, []);
  assert.equal(outside.primaryAreaId, null);
  assert.deepEqual(
    discoveryViewport(center, 14, world, world, [...points].reverse(), allIds).visibleAreaIds,
    full.visibleAreaIds,
  );
});

test("rotated and pitched SDK viewports query all corners and exclude obstructed members", () => {
  // Runtime-only SDK source imports avoid adding its internal build types to the app project.
  const sdk = "../../../node_modules/maplibre-gl/src/";
  const requireSdk = createRequire(import.meta.url);
  const { MercatorTransform } = requireSdk(`${sdk}geo/projection/mercator_transform.ts`);
  const { LngLat } = requireSdk(`${sdk}geo/lng_lat.ts`);
  const pointPackage = "@mapbox/point-geometry";
  const { default: Point } = requireSdk(pointPackage);
  const rect = { left: 20, top: 108, right: 376, bottom: 500 };
  for (const bearing of [0, 45, 90, 180, 270]) {
    for (const pitch of [0, 30, 60]) {
      const transform = new MercatorTransform();
      transform.resize(440, 700);
      transform.setZoom(12);
      transform.setCenter(new LngLat(21.63, 37.64));
      transform.setBearing(bearing);
      transform.setPitch(pitch);
      const camera = {
        unproject: ([x, y]: [number, number]) => transform.screenPointToLocation(new Point(x, y)),
        project: ([lng, lat]: [number, number]) =>
          transform.locationToScreenPoint(new LngLat(lng, lat)),
      };
      const screenPoints = [
        { id: "ancient-olympia", x: 220, y: 350 },
        { id: "olympia-stadium", x: 60, y: 140 },
        { id: "qa-under-sheet", x: 220, y: 550 },
        { id: "qa-under-controls", x: 410, y: 350 },
        { id: "qa-above-usable-map", x: 220, y: 60 },
      ];
      const points = screenPoints.map(({ id, x, y }) => ({ id, ...camera.unproject([x, y]) }));
      const topology = createMapTopology(topologyKey(points));
      const result = visibleScreenMembers(rect, camera, topology.visiblePlaces);
      if (bearing === 45 && pitch === 0)
        assert.ok(topology.visiblePlaces(result.bounds).some((p) => p.id === "qa-under-controls"));
      assert.ok(result.bounds[0][0] <= result.bounds[1][0]);
      assert.ok(result.bounds[0][1] <= result.bounds[1][1]);
      assert.deepEqual(
        result.places.map((p) => p.id).sort(),
        ["ancient-olympia", "olympia-stadium"],
        `bearing ${bearing}, pitch ${pitch}`,
      );
      const viewport = discoveryViewport(
        { lng: 21.63, lat: 37.64 },
        12,
        world,
        result.bounds,
        result.places,
        new Set(points.map((p) => p.id)),
        { bearing, pitch },
      );
      assert.equal(viewport.bearing, bearing);
      assert.equal(viewport.pitch, pitch);
      assert.equal(viewport.primaryAreaId, "olympia");
      assert.deepEqual(viewport.visibleAreaIds, ["olympia"]);
    }
  }
});

test("every preview scene exposes canonical tiers and actual observation time without leaking evidence", () => {
  for (const { id } of TRAFFIC_SCENES) {
    const scene = buildTrafficPreviewScene(id, now);
    const input = markerPulseInputFromActivity(scene.activitySnapshot);
    const signals = deriveMarkerPulseSnapshot(input, scene.nowMs);
    for (const signal of Object.values(signals)) {
      const copy = markerActivityDescription(signal, scene.nowMs, "EN", t);
      if (signal.lastSignalAt) assert.match(copy, /Reported .*Europe\/Athens/);
      if (signal.level === "fading" && signal.score === 0) {
        assert.match(copy, /^Historical community activity/);
        assert.doesNotMatch(copy, /Recent|Live/);
      }
    }
    if (id === "later") {
      assert.match(
        markerActivityDescription(signals[scene.focusPlaceId], scene.nowMs, "EN", t),
        /^Historical/,
      );
      assert.equal(signals[scene.focusPlaceId].tier, "quiet");
    }
    const rows = deriveRegionalDiscovery(
      buildMapRegions(scene.data.places),
      new Set(scene.data.places.map((place) => place.id)),
      null,
      { places: {}, areas: {} },
      input,
      scene.nowMs,
    );
    const geo = regionalGeoJson(rows, rows[0].region.id, null, t, scene.nowMs, "EN");
    assert.doesNotMatch(JSON.stringify(geo), /contributor|timestamp|score|evidence/);
    assert.equal(geo.features[0].properties.priority, -10000);
    assert.ok(geo.features.every((feature) => feature.properties.count > 0));
    assert.equal(
      regionalGeoJson(
        rows.map((row) => ({ ...row, searchedPlaceIds: [] })),
        null,
        null,
        t,
        scene.nowMs,
        "EN",
      ).features.length,
      0,
    );
  }
});

test("retained Live copy expires at shared one-hour and three-hour boundaries", () => {
  const retained: MarkerPulseSignal = {
    level: "lively",
    tier: "live",
    quality: "confirmed",
    lastSignalAt: new Date(now).toISOString(),
    score: 100,
    contributorCount: 3,
  };
  const describe = (clock: number) => markerActivityDescription(retained, clock, "EN", t);
  assert.match(describe(now + FRESHNESS_LIMITS.currentMs - 1), /^Recent community activity: Live/);
  assert.match(describe(now + FRESHNESS_LIMITS.currentMs), /^Recent community activity: Hot/);
  assert.match(describe(now + FRESHNESS_LIMITS.recentMs - 1), /^Recent community activity: Hot/);
  assert.match(describe(now + FRESHNESS_LIMITS.recentMs), /^Historical community activity/);
  assert.doesNotMatch(describe(now + 3 * 3_600_000 + 10 * 60_000), /Recent|Live/);
  assert.match(describe(now), /5 Oct 2026, 15:00 · Europe\/Athens/);
  assert.match(
    markerActivityDescription({ ...retained, quality: "stable" }, now, "EN", t),
    /^Recent community activity: Hot/,
  );
  assert.match(
    markerActivityDescription({ ...retained, lastSignalAt: "invalid" }, now, "EN", t),
    /^Community activity unavailable/,
  );
  assert.match(
    markerActivityDescription({ ...retained, lastSignalAt: null }, now, "EN", t),
    /^Community activity unavailable/,
  );
  assert.match(
    markerActivityDescription(
      {
        ...retained,
        lastSignalAt: new Date(now + FRESHNESS_LIMITS.futureToleranceMs + 1).toISOString(),
      },
      now,
      "EN",
      t,
    ),
    /^Community activity unavailable/,
  );
  const weight = -4 * Math.log(1 - 98.99 / 100);
  const roundedHot = deriveEvidencePulseSignal(
    [
      { kind: "post", weight: weight / 2, timestamp: now, contributorId: "one" },
      { kind: "story", weight: weight / 2, timestamp: now, contributorId: "one" },
    ],
    now,
  );
  assert.equal(roundedHot.score, 99);
  assert.match(
    markerActivityDescription(roundedHot, now, "EN", t),
    /^Recent community activity: Hot/,
  );
});

function clock() {
  let time = 0,
    serial = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    timers,
    now: () => time,
    schedule: (run: () => void, delay: number) => {
      timers.set(++serial, { at: time + delay, run });
      return serial as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: (id: ReturnType<typeof setTimeout>) => {
      timers.delete(id as unknown as number);
    },
    advance(ms: number) {
      time += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at > time) continue;
        timers.delete(id);
        timer.run();
      }
    },
  };
}

test("500 exits share one timer; reappearing markers cannot be removed by old exits", () => {
  const c = clock();
  const exits = createMarkerExits(c.schedule, c.cancel, c.now);
  const removed: string[] = [];
  for (let i = 0; i < 500; i++) exits.start(String(i), () => removed.push(String(i)));
  assert.equal(c.timers.size, 1);
  assert.equal(exits.cancel("4"), true);
  assert.equal(exits.cancel("4"), false);
  c.advance(HP_MOTION.state);
  assert.equal(removed.length, 499);
  assert.ok(!removed.includes("4"));
  assert.equal(c.timers.size, 0);
});

test("repeat reconciliation retains deadlines; staggered exits receive their full duration", () => {
  const c = clock();
  const exits = createMarkerExits(c.schedule, c.cancel, c.now);
  const removed: string[] = [];
  exits.start("a", () => removed.push("a"));
  c.advance(HP_MOTION.state / 2);
  exits.start("a", () => removed.push("wrong"));
  exits.start("b", () => removed.push("b"));
  c.advance(HP_MOTION.state / 2);
  assert.deepEqual(removed, ["a"]);
  c.advance(HP_MOTION.state / 2);
  assert.deepEqual(removed, ["a", "b"]);
});

test("teardown flushes marker exits exactly once and leaves no timers", () => {
  const c = clock();
  const exits = createMarkerExits(c.schedule, c.cancel, c.now);
  let removed = 0;
  exits.start("a", () => removed++);
  exits.flush();
  exits.flush();
  c.advance(1000);
  assert.equal(removed, 1);
  assert.equal(c.timers.size, 0);
});

function regionalMapFixture(availableContext: boolean) {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalComputedStyle = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    clearRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    getImageData: () => ({ width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) }),
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => (availableContext ? context : null),
      }),
    },
  });
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    value: () => ({ getPropertyValue: () => "" }),
  });
  const images: string[] = [],
    layers: ReturnType<typeof regionalSymbolLayer>[] = [];
  const sources = new Map<string, unknown>();
  const map = {
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.find((layer) => layer.id === id),
    hasImage: (id: string) => images.includes(id),
    getContainer: () => ({}),
    addImage: (id: string) => images.push(id),
    addSource: (id: string, source: unknown) => sources.set(id, source),
    addLayer: (layer: ReturnType<typeof regionalSymbolLayer>) => layers.push(layer),
  } as unknown as Parameters<typeof installRegionalLayer>[0];
  return {
    map,
    images,
    sources,
    layers,
    restore() {
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else Reflect.deleteProperty(globalThis, "document");
      if (originalComputedStyle)
        Object.defineProperty(globalThis, "getComputedStyle", originalComputedStyle);
      else Reflect.deleteProperty(globalThis, "getComputedStyle");
    },
  };
}

test("regional installation uses only local sprites and an empty safe source, once per map", () => {
  const fixture = regionalMapFixture(true);
  try {
    installRegionalLayer(fixture.map);
    installRegionalLayer(fixture.map);
    assert.deepEqual(fixture.images, ["hp-region-core", "hp-region-selected"]);
    assert.deepEqual(fixture.sources.get(REGION_SOURCE_ID), {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    assert.equal(fixture.layers.length, 1);
  } finally {
    fixture.restore();
  }
});

test("unavailable canvas context fails before installing a regional source or layer", () => {
  const fixture = regionalMapFixture(false);
  try {
    assert.throws(() => installRegionalLayer(fixture.map), /Regional sprite unavailable/);
    assert.equal(fixture.sources.size, 0);
    assert.equal(fixture.layers.length, 0);
    assert.equal(fixture.images.length, 0);
  } finally {
    fixture.restore();
  }
});

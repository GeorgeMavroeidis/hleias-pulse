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
  applyRegionalMapPalette,
} from "./map-region-layer";
import { ATMOSPHERE_MAP_PALETTES } from "./map-cartography";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  EMPTY_MARKER_PULSE_INPUT,
  deriveMarkerPulseSnapshot,
  type MarkerPulseInput,
} from "./marker-pulse";
import type { DiscoverySnapshot } from "./discovery";

const now = Date.parse("2026-10-01T10:00:00Z");
const regions = buildMapRegions(PLACES);
const allIds = new Set(PLACES.map((p) => p.id));
const blank: DiscoverySnapshot = { places: {}, areas: {} };
const world: MapBounds = [
  [-180, -85],
  [180, 85],
];
const t = (key: string, params?: Record<string, string | number>) =>
  key.replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? k));
const olympia = regions.find((r) => r.id === "olympia")!;

test("regional labels follow each atmosphere while symbol geometry, source and disclosure stay fixed", () => {
  const layer = regionalSymbolLayer();
  const originalLayout = structuredClone(layer.layout);
  const map = {
    getLayer: (id: string) => (id === layer.id ? layer : undefined),
    setPaintProperty: (id: string, property: string, value: unknown) => {
      assert.equal(id, layer.id);
      (layer.paint as Record<string, unknown>)[property] = value;
    },
  } as unknown as MapLibreMap;
  for (const duration of [800, 0])
    for (const palette of Object.values(ATMOSPHERE_MAP_PALETTES)) {
      applyRegionalMapPalette(map, palette, duration);
      assert.equal(layer.paint!["text-color"], palette.primaryText);
      assert.equal(layer.paint!["text-halo-color"], palette.land);
      assert.deepEqual(layer.paint!["text-color-transition"], { duration, delay: 0 });
      assert.deepEqual(layer.layout, originalLayout);
      assert.equal(layer.source, REGION_SOURCE_ID);
    }
});
function input(): MarkerPulseInput {
  return { available: true, fetchedAt: now, placeIds: PLACES.map((p) => p.id), evidence: {} };
}
const observation = (user: string, minutes: number, kind: "post" | "story" = "post") => ({
  contributorId: user,
  timestamp: now - minutes * 60_000,
  kind,
  weight: kind === "story" ? 1.25 : 1,
  expiresAt: null,
});

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

test("catalog membership covers every place once; geometry survives search and lenses", () => {
  assert.equal(regions.filter((r) => !r.standalone).length, 16);
  assert.deepEqual(regions.flatMap((r) => r.placeIds).sort(), [...allIds].sort());
  const before = JSON.stringify(regions);
  const searched = new Set([olympia.placeIds[0]]);
  const rows = deriveRegionalDiscovery(regions, searched, "beach", blank, input(), now);
  assert.equal(rows.find((r) => r.region.id === "olympia")!.contextualPlaceIds.length, 0);
  assert.equal(JSON.stringify(regions), before);
  assert.deepEqual(rows.find((r) => r.region.id === "olympia")!.region.bounds, olympia.bounds);
});

test("lens membership uses semantic relevance, excludes unrelated activity, and counts matches", () => {
  const source = input();
  source.evidence[olympia.placeIds[0]] = Array.from({ length: 12 }, (_, i) =>
    observation(`user-${i}`, 5),
  );
  const snapshot: DiscoverySnapshot = {
    areas: {},
    places: {
      [olympia.placeIds[0]]: {
        lensRelevance: { beach: 0.349, food: 1, chill: 0, music: 0, social: 0 },
      },
      [olympia.placeIds[1]]: {
        lensRelevance: { beach: 0.35, food: 0, chill: 0, music: 0, social: 0 },
      },
    },
  };
  const row = deriveRegionalDiscovery(regions, allIds, "beach", snapshot, source, now).find(
    (r) => r.region.id === "olympia",
  )!;
  assert.deepEqual(row.contextualPlaceIds, [olympia.placeIds[1]]);
  assert.equal(row.signal.level, null);
  assert.ok(
    deriveRegionalDiscovery(regions, allIds, "food", snapshot, source, now).find(
      (r) => r.region.id === "olympia",
    )!.signal.level,
  );
});

test("regional evidence pools observations while distinct contributors stay distinct", () => {
  const source = input();
  const a = olympia.placeIds[0],
    b = olympia.placeIds[1];
  source.evidence[a] = [
    observation("shared", 5),
    observation("shared", 35),
    observation("shared", 65),
  ];
  source.evidence[b] = [
    observation("shared", 5, "story"),
    observation("shared", 35, "story"),
    observation("shared", 65, "story"),
  ];
  let row = deriveRegionalDiscovery(regions, allIds, null, blank, source, now).find(
    (r) => r.region.id === "olympia",
  )!;
  assert.equal(row.signal.contributorCount, 1);
  assert.equal(row.signal.level, "active");
  source.evidence[b] = source.evidence[b].map((e) => ({ ...e, contributorId: "second" }));
  row = deriveRegionalDiscovery(regions, allIds, null, blank, source, now).find(
    (r) => r.region.id === "olympia",
  )!;
  assert.equal(row.signal.contributorCount, 2);
  assert.equal(row.signal.level, "lively");
});

test("one-place regional rule matches place rule; missing/failed/stale data stays neutral", () => {
  const source = input();
  const id = olympia.placeIds[0];
  source.evidence[id] = [observation("contributor", 5)];
  const derive = (value: MarkerPulseInput, clock = now) =>
    deriveRegionalDiscovery(regions, new Set([id]), null, blank, value, clock).find(
      (r) => r.region.id === "olympia",
    )!.signal;
  assert.deepEqual(derive(source), deriveMarkerPulseSnapshot(source, now)[id]);
  for (const value of [
    EMPTY_MARKER_PULSE_INPUT,
    { ...source, available: false },
    { ...source, fetchedAt: now - 180_001 },
  ])
    assert.equal(derive(value).level, null);
  assert.equal(derive(source, now - 1).level, null);
  assert.equal(
    derive({
      ...source,
      evidence: { [id]: [{ ...observation("contributor", 5), expiresAt: now }] },
    }).level,
    null,
  );
});

test("standalone geography is honest and public symbol properties contain no evidence", () => {
  const rows = deriveRegionalDiscovery(regions, allIds, null, blank, input(), now);
  for (const row of rows.filter((r) => r.region.standalone)) assert.equal(row.signal.level, null);
  const geo = regionalGeoJson(rows, "olympia", null, t);
  assert.ok(geo.features.every((f) => f.properties.description.startsWith("Explore")));
  assert.equal(geo.features.find((f) => f.id === "olympia")!.properties.priority, -10000);
  assert.doesNotMatch(JSON.stringify(geo), /contributor|timestamp|score|evidence/);
  assert.equal(
    regionalGeoJson(
      deriveRegionalDiscovery(regions, new Set(), null, blank, input(), now),
      null,
      null,
      t,
    ).features.length,
    0,
  );
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
      );
      assert.equal(viewport.primaryAreaId, "olympia");
      assert.deepEqual(viewport.visibleAreaIds, ["olympia"]);
    }
  }
});

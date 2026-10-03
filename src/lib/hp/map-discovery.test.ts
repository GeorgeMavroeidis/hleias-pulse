import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { PLACES } from "../../../scripts/hp-seed-data";
import {
  initialMapDiscoveryState,
  mapDiscoveryReducer as reduce,
  discoverySheetHeights,
  releaseSheetSnap,
  sheetSnapPoints,
  type MapSelection,
} from "./map-discovery-state";
import {
  buildMapRegions,
  deriveRegionalDiscovery,
  discoveryViewport,
  viewportSignature,
} from "./regional-discovery";
import { deriveMapDiscoveryContent } from "./map-discovery-content";
import { EMPTY_MARKER_PULSE_INPUT } from "./marker-pulse";
import { discoverySafeMapRect, panDeltaIntoSafeRect, pointIsInSafeRect } from "./map-sheet-camera";
import { createSheetGeometry } from "./sheet-geometry";
import type { MeetEvent } from "./meet-types";
import type { CulturalEvent } from "./cultural-events-types";

const now = Date.parse("2026-10-01T10:00:00Z");
const region: MapSelection = { kind: "regionSelected", regionId: "olympia" };
const place: MapSelection = {
  kind: "placeSelected",
  regionId: "olympia",
  placeId: "ancient-olympia",
};
const other: MapSelection = {
  kind: "placeSelected",
  regionId: "olympia",
  placeId: "olympia-stadium",
};
const blank = { places: {}, areas: {} };
const bounds: [[number, number], [number, number]] = [
  [20, 36],
  [23, 39],
];
const viewport = discoveryViewport(
  { lat: 37.64, lng: 21.63 },
  12,
  bounds,
  bounds,
  PLACES,
  new Set(PLACES.map((p) => p.id)),
  { bearing: 45, pitch: 30 },
);

test("idle → region → place → another place shares atomic selection and reversible history", () => {
  let state = reduce(initialMapDiscoveryState, {
    type: "select",
    selection: region as Exclude<MapSelection, { kind: "idle" }>,
  });
  assert.equal(state.snap, "preview");
  state = reduce(state, {
    type: "select",
    selection: place as Exclude<MapSelection, { kind: "idle" }>,
  });
  state = reduce(state, {
    type: "select",
    selection: other as Exclude<MapSelection, { kind: "idle" }>,
  });
  assert.deepEqual(reduce(state, { type: "back" }).selection, place);
  state = reduce(reduce(state, { type: "back" }), { type: "back" });
  assert.deepEqual(state.selection, region);
  assert.equal(reduce(state, { type: "back" }).selection.kind, "idle");
  assert.equal(initialMapDiscoveryState.history.length, 0);
});
test("expanded Back steps down first; collapse and dismissal clear selection and history", () => {
  const selected = reduce(initialMapDiscoveryState, {
    type: "select",
    selection: place as Exclude<MapSelection, { kind: "idle" }>,
  });
  const expanded = reduce(selected, { type: "snap", snap: "expanded" });
  assert.deepEqual(reduce(expanded, { type: "back" }).selection, place);
  assert.equal(reduce(expanded, { type: "back" }).snap, "preview");
  for (const action of [{ type: "snap", snap: "collapsed" }, { type: "clear" }] as const) {
    const idle = reduce(expanded, action);
    assert.equal(idle.selection.kind, "idle");
    assert.equal(idle.history.length, 0);
    assert.equal(idle.snap, "collapsed");
  }
  assert.equal(
    reduce(reduce(initialMapDiscoveryState, { type: "snap", snap: "preview" }), { type: "back" })
      .snap,
    "collapsed",
  );
});
test("Back collapses expanded idle directly without creating an idle preview", () => {
  const expanded = reduce(initialMapDiscoveryState, { type: "snap", snap: "expanded" });
  assert.deepEqual(reduce(expanded, { type: "back" }), initialMapDiscoveryState);
});
test("route opening creates a new camera intent while tab return retains the framed revision", () => {
  let state = reduce(initialMapDiscoveryState, { type: "frameRoute" });
  assert.equal(state.routeFrameRevision, 1);
  const camera = {
    center: [21.2, 37.7] as [number, number],
    zoom: 11.3,
    bearing: 90,
    pitch: 45,
    framedRouteRevision: state.routeFrameRevision,
  };
  state = reduce(state, { type: "leaveMap", camera });
  assert.deepEqual(state.camera, camera);
  assert.equal(state.routeFrameRevision, camera.framedRouteRevision);
  // Reopening the same route must also frame it rather than restore this view.
  state = reduce(state, { type: "frameRoute" });
  assert.equal(state.routeFrameRevision, 2);
  assert.notEqual(state.routeFrameRevision, state.camera?.framedRouteRevision);
});
test("soft lenses and zoom-out retain the selected pin; tab departure retains exact camera", () => {
  let state = reduce(initialMapDiscoveryState, {
    type: "select",
    selection: place as Exclude<MapSelection, { kind: "idle" }>,
  });
  state = reduce(state, { type: "lens", lens: "beach" });
  state = reduce(state, { type: "viewport", viewport: { ...viewport, zoom: 9.25 } });
  assert.deepEqual(state.selection, place);
  const camera = { center: [21.2, 37.7] as [number, number], zoom: 11.3, bearing: 90, pitch: 45 };
  state = reduce(state, { type: "leaveMap", camera });
  assert.equal(state.selection.kind, "idle");
  assert.equal(state.snap, "collapsed");
  assert.equal(state.viewport, null);
  assert.equal(state.activeLens, "beach");
  assert.deepEqual(state.camera, camera);
});
test("search/deletion invalidates selection and prunes unavailable Back targets", () => {
  let state = reduce(initialMapDiscoveryState, {
    type: "select",
    selection: region as Exclude<MapSelection, { kind: "idle" }>,
  });
  state = reduce(state, {
    type: "select",
    selection: place as Exclude<MapSelection, { kind: "idle" }>,
  });
  const valid = {
    type: "validate",
    placeIds: new Set(["ancient-olympia"]),
    regionIds: new Set(["olympia"]),
  } as const;
  assert.equal(reduce(state, valid), state);
  const removed = reduce(state, { ...valid, placeIds: new Set() });
  assert.equal(removed.selection.kind, "idle");
  assert.equal(removed.history.length, 0);
  for (let i = 0; i < 20; i++)
    state = reduce(state, {
      type: "select",
      selection: { kind: "regionSelected", regionId: String(i) },
    });
  assert.equal(state.history.length, 12);
  assert.equal(
    reduce(state, { type: "validate", placeIds: new Set(), regionIds: new Set(["19"]) }).history
      .length,
    0,
  );
});
test("named snaps adapt to small screens, resize, wrapping and duplicate heights", () => {
  for (const height of [240, 330, 460, 560, 700])
    for (const mode of ["idle", "regionSelected", "placeSelected"] as const) {
      const sizes = discoverySheetHeights(height, 88, mode);
      assert.ok(sizes.collapsed <= sizes.preview && sizes.preview <= sizes.expanded);
      assert.ok(sizes.expanded <= height);
      if (height >= 88 + 112 + 188) assert.ok(height - sizes.expanded >= 188);
      assert.equal(
        releaseSheetSnap(sizes.preview, 0, sizes),
        sheetSnapPoints(sizes).find((s) => sizes[s] === sizes.preview),
      );
    }
  const short = discoverySheetHeights(110, 120, "placeSelected");
  assert.deepEqual(sheetSnapPoints(short), ["collapsed"]);
  const sizes = discoverySheetHeights(700, 88, "placeSelected");
  assert.equal(releaseSheetSnap(sizes.preview - 10, 250, sizes), "collapsed");
  assert.equal(releaseSheetSnap(sizes.preview, -250, sizes), "expanded");
});
test("viewport discovery counts contextual visible places and excludes hidden members", () => {
  const regions = deriveRegionalDiscovery(
    buildMapRegions(PLACES),
    new Set(PLACES.map((p) => p.id)),
    null,
    blank,
    EMPTY_MARKER_PULSE_INPUT,
    now,
  );
  const visible = { ...viewport, visiblePlaceIds: ["ancient-olympia", "olympia-stadium"] };
  const content = deriveMapDiscoveryContent({
    places: PLACES,
    regions,
    discovery: blank,
    viewport: visible,
    lens: null,
    meetEvents: [],
    culturalEvents: [],
    now,
  });
  assert.equal(content.matchingVisiblePlaceCount, 2);
  assert.deepEqual(
    content.visibleRegions.map((r) => r.discovery.region.id),
    ["olympia"],
  );
  assert.equal(content.visibleRegions[0].visiblePlaceCount, 2);
  assert.equal(content.regions.get("olympia")!.places.length, 4);
  assert.equal(content.regions.get("olympia")!.discovery.signal.level, null);
  const empty = deriveMapDiscoveryContent({
    places: PLACES,
    regions,
    discovery: blank,
    viewport: { ...visible, visiblePlaceIds: [] },
    lens: null,
    meetEvents: [],
    culturalEvents: [],
    now,
  });
  assert.equal(empty.visibleRegions.length, 0);
  assert.equal(
    deriveMapDiscoveryContent({
      places: PLACES,
      regions,
      discovery: blank,
      viewport: null,
      lens: null,
      meetEvents: [],
      culturalEvents: [],
      now,
    }).matchingVisiblePlaceCount,
    0,
  );
});
test("dated event counts reject invalid, past, unlinked, muted and duplicated events", () => {
  const meet = {
    id: "same",
    placeId: "ancient-olympia",
    title: "Tomorrow",
    happensAt: new Date(now + 86_400_000).toISOString(),
    userId: "host",
  } as MeetEvent;
  const cultural = {
    id: "same",
    placeId: "olympia-stadium",
    title: "Culture",
    eventDate: new Date(now + 86_400_000).toISOString(),
  } as CulturalEvent;
  const args = {
    places: PLACES,
    regions: deriveRegionalDiscovery(
      buildMapRegions(PLACES),
      new Set(PLACES.map((p) => p.id)),
      null,
      blank,
      EMPTY_MARKER_PULSE_INPUT,
      now,
    ),
    discovery: blank,
    viewport,
    lens: null,
    now,
  };
  const content = deriveMapDiscoveryContent({
    ...args,
    meetEvents: [
      meet,
      meet,
      { ...meet, id: "invalid", happensAt: "Tonight 22:30" },
      { ...meet, id: "past", happensAt: "2025-01-01T10:00:00Z" },
      { ...meet, id: "mute", userId: "muted" },
    ],
    culturalEvents: [
      cultural,
      { ...cultural, id: "unlinked", placeId: null },
      { ...cultural, id: "invalid", eventDate: "invalid" },
      { ...cultural, id: "past", eventDate: "2025-01-01" },
    ],
    hiddenUserIds: new Set(["muted"]),
  });
  assert.deepEqual(
    content.events.map((e) => e.key),
    ["cultural:same", "meet:same"],
  );
  assert.equal(content.regions.get("olympia")!.events.length, 2);
  assert.equal(content.regions.get("olympia")!.discovery.signal.level, null);
});
test("lens ranking and counts remain deterministic while region geometry stays fixed", () => {
  const discovery = {
    areas: {},
    places: Object.fromEntries(
      PLACES.map((p) => [
        p.id,
        {
          lensRelevance: {
            beach: p.id === "ancient-olympia" ? 1 : 0,
            chill: 0,
            food: 0,
            music: 0,
            social: 0,
          },
        },
      ]),
    ),
  };
  const regions = deriveRegionalDiscovery(
    buildMapRegions(PLACES),
    new Set(PLACES.map((p) => p.id)),
    "beach",
    discovery,
    EMPTY_MARKER_PULSE_INPUT,
    now,
  );
  const args = {
    places: PLACES,
    regions,
    discovery,
    viewport,
    lens: "beach" as const,
    now,
    meetEvents: [],
    culturalEvents: [],
  };
  assert.equal(deriveMapDiscoveryContent(args).matchingVisiblePlaceCount, 1);
  assert.deepEqual(
    deriveMapDiscoveryContent(args).visibleRegions.map((r) => r.discovery.region.id),
    deriveMapDiscoveryContent({
      ...args,
      regions: [...regions].reverse(),
      places: [...PLACES].reverse(),
    }).visibleRegions.map((r) => r.discovery.region.id),
  );
  assert.deepEqual(
    regions.find((r) => r.region.id === "olympia")!.region.bounds,
    buildMapRegions(PLACES).find((r) => r.id === "olympia")!.bounds,
  );
});
test("safe camera correction respects sheet heights, phone sizes and unchanged visible pins", () => {
  for (const width of [320, 390, 440])
    for (const height of [190, 240, 330, 560, 700])
      for (const mode of ["regionSelected", "placeSelected"] as const) {
        const snaps = discoverySheetHeights(height, 88, mode);
        for (const overlay of Object.values(snaps)) {
          const rect = discoverySafeMapRect(width, height, overlay, 24);
          assert.ok(rect.bottom <= height - overlay);
          const center = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
          assert.deepEqual(panDeltaIntoSafeRect(center, rect), { x: 0, y: 0 });
          const behind = { x: center.x, y: height - 5 };
          const delta = panDeltaIntoSafeRect(behind, rect);
          assert.ok(pointIsInSafeRect({ x: behind.x - delta.x, y: behind.y - delta.y }, rect));
        }
      }
});
test("live sheet geometry updates bypass selection state and unsubscribe cleanly", () => {
  const geometry = createSheetGeometry(80);
  let updates = 0;
  const unsubscribe = geometry.subscribe(() => updates++);
  for (let i = 0; i < 100; i++) geometry.set({ height: 80 + i, moving: true });
  assert.equal(updates, 100);
  geometry.set({ height: 179, moving: false });
  assert.equal(updates, 101);
  geometry.set({ height: 179, moving: false });
  assert.equal(updates, 101);
  unsubscribe();
  geometry.set({ height: 80, moving: false });
  assert.equal(updates, 101);
  assert.equal(initialMapDiscoveryState.snap, "collapsed");
});
test("viewport signature and saved camera include rotation and pitch", () => {
  assert.notEqual(viewportSignature(viewport), viewportSignature({ ...viewport, bearing: 90 }));
  assert.notEqual(viewportSignature(viewport), viewportSignature({ ...viewport, pitch: 60 }));
  const state = reduce(initialMapDiscoveryState, { type: "viewport", viewport });
  assert.deepEqual(state.camera, {
    center: [viewport.center.lng, viewport.center.lat],
    zoom: 12,
    bearing: 45,
    pitch: 30,
  });
});

test("installed SDK keeps a selected coordinate above the sheet at every rotation and pitch", () => {
  const requireSdk = createRequire(import.meta.url);
  const sdk = "../../../node_modules/maplibre-gl/src/";
  const { MercatorTransform } = requireSdk(`${sdk}geo/projection/mercator_transform.ts`);
  const { MercatorCameraHelper } = requireSdk(`${sdk}geo/projection/mercator_camera_helper.ts`);
  const { LngLat } = requireSdk(`${sdk}geo/lng_lat.ts`);
  const pointPackage = "@mapbox/point-geometry";
  const { default: Point } = requireSdk(pointPackage);
  const rect = discoverySafeMapRect(390, 643, 399, 24);
  for (const bearing of [0, 45, 90, 180, 270])
    for (const pitch of [0, 30, 60]) {
      const transform = new MercatorTransform();
      transform.resize(390, 643);
      transform.setZoom(14.25);
      transform.setCenter(new LngLat(21.63, 37.64));
      transform.setBearing(bearing);
      transform.setPitch(pitch);
      const coordinate = transform.screenPointToLocation(new Point(195, 360));
      for (let attempt = 0; attempt < 3; attempt++) {
        const delta = panDeltaIntoSafeRect(transform.locationToScreenPoint(coordinate), rect);
        new MercatorCameraHelper()
          .handleEaseTo(transform, {
            center: transform.center,
            offsetAsPoint: new Point(-delta.x, -delta.y),
            padding: transform.padding,
          })
          .easeFunc(1);
      }
      const after = transform.locationToScreenPoint(coordinate);
      const remaining = panDeltaIntoSafeRect(after, rect);
      assert.ok(Math.hypot(remaining.x, remaining.y) < 1, `bearing ${bearing}, pitch ${pitch}`);
      assert.equal(transform.zoom, 14.25);
      assert.equal((transform.bearing + 360) % 360, bearing);
      assert.equal(transform.pitch, pitch);
    }
});

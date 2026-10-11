import assert from "node:assert/strict";
import test from "node:test";
import type { ActivityEvidence } from "./activity-evidence";
import type { DiscoverySnapshot } from "./discovery";
import { FRESHNESS_LIMITS } from "./freshness";
import {
  type MarkerPulseInput,
  deriveMarkerPulseSnapshot,
  deriveEvidencePulseSignal,
} from "./marker-pulse";
import { buildTrafficPreviewScene, TRAFFIC_SCENES } from "./traffic-preview";
import { markerPulseInputFromActivity } from "./marker-pulse";
import {
  buildMapRegions,
  deriveRegionalDiscovery,
  discoveryViewport,
  visibleScreenMembers,
  viewportSignature,
} from "./regional-discovery";
import type { MapBounds } from "./map-policy";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const base = buildTrafficPreviewScene("quiet", NOW).data.places[0];
const places = [
  base,
  {
    ...base,
    id: "kourouta-sunset",
    lat: base.lat + 0.01,
    lng: base.lng + 0.01,
  },
  { ...base, id: "qa-standalone", lat: base.lat + 0.02, lng: base.lng + 0.02 },
];
const regions = buildMapRegions(places);
const region = regions.find((row) => row.id === "kourouta")!;
const searched = new Set(places.map((place) => place.id));
const blank: DiscoverySnapshot = { places: {}, areas: {} };
const world: MapBounds = [
  [-180, -85],
  [180, 85],
];
function input(): MarkerPulseInput {
  return {
    fetchedAt: NOW,
    available: true,
    placeIds: [...searched],
    evidence: {},
  };
}
function observation(kind: "post" | "story", weight: number): ActivityEvidence {
  return { kind, weight, timestamp: NOW, contributorId: "same-contributor" };
}

test("regional geometry and membership remain independent of search, lens, and evidence", () => {
  const before = JSON.stringify(regions);
  assert.deepEqual(regions.flatMap((row) => row.placeIds).sort(), [...searched].sort());
  const data = input();
  data.evidence[base.id] = [observation("post", 20)];
  const rows = deriveRegionalDiscovery(regions, new Set([base.id]), "beach", blank, data, NOW);
  assert.equal(rows.find((row) => row.region.id === region.id)!.contextualPlaceIds.length, 0);
  assert.equal(JSON.stringify(regions), before);
  assert.deepEqual(rows.find((row) => row.region.id === region.id)!.region.bounds, region.bounds);
  assert.equal(buildMapRegions([{ ...base, lat: Number.NaN }]).length, 0);
});

test("regional signals pool canonical evidence, without summing scores or contributors", () => {
  const data = input();
  data.evidence[base.id] = [observation("post", 10)];
  data.evidence["kourouta-sunset"] = [observation("story", 10)];
  const row = deriveRegionalDiscovery(regions, searched, null, blank, data, NOW).find(
    (r) => r.region.id === region.id,
  )!;
  assert.deepEqual(row.signal, deriveEvidencePulseSignal(Object.values(data.evidence).flat(), NOW));
  assert.equal(row.signal.contributorCount, 1);
  assert.equal(row.signal.tier, "live");
  assert.equal(row.signal.level, "lively");
  const markers = deriveMarkerPulseSnapshot(data, NOW);
  assert.equal(markers[base.id].tier, "hot");
  assert.equal(markers["kourouta-sunset"].tier, "hot");
  assert.ok(row.signal.score < markers[base.id].score + markers["kourouta-sunset"].score);
});

test("lens membership excludes unrelated evidence at the central relevance threshold", () => {
  const data = input();
  data.evidence[base.id] = [observation("post", 20)];
  const discovery: DiscoverySnapshot = {
    areas: {},
    places: {
      [base.id]: {
        lensRelevance: { beach: 0.349, food: 1, chill: 0, music: 0, social: 0 },
      },
      "kourouta-sunset": {
        lensRelevance: { beach: 0.35, food: 0, chill: 0, music: 0, social: 0 },
      },
    },
  };
  const row = deriveRegionalDiscovery(regions, searched, "beach", discovery, data, NOW).find(
    (r) => r.region.id === region.id,
  )!;
  assert.deepEqual(row.contextualPlaceIds, ["kourouta-sunset"]);
  assert.equal(row.signal.score, 0);
  assert.equal(row.signal.level, null);
});

test("one-place regional signal exactly matches the compact marker in all five scenes", () => {
  for (const { id } of TRAFFIC_SCENES) {
    const scene = buildTrafficPreviewScene(id, NOW);
    const source = markerPulseInputFromActivity(scene.activitySnapshot);
    const rows = deriveRegionalDiscovery(
      buildMapRegions(scene.data.places),
      new Set([scene.focusPlaceId]),
      null,
      blank,
      source,
      scene.nowMs,
    );
    const region = rows.find((row) => row.region.id === scene.focusAreaId)!;
    assert.deepEqual(
      region.signal,
      deriveMarkerPulseSnapshot(source, scene.nowMs)[scene.focusPlaceId],
      id,
    );
    if (id === "later") {
      assert.equal(region.signal.score, 0);
      assert.equal(region.signal.tier, "quiet");
      assert.equal(region.signal.level, "fading");
    }
  }
});

test("retained regional evidence ages after request failure, including exact expiry boundaries", () => {
  const data = input();
  data.evidence[base.id] = [observation("post", 10), observation("story", 10)];
  const derive = (clock: number, source = data) =>
    deriveRegionalDiscovery(regions, searched, null, blank, source, clock).find(
      (row) => row.region.id === region.id,
    )!.signal;
  assert.equal(derive(NOW + 180_001).tier, "live");
  assert.deepEqual(derive(NOW, { ...data, fetchedAt: NOW - 86_400_000 }), derive(NOW));
  assert.equal(derive(NOW + FRESHNESS_LIMITS.currentMs).tier, "hot");
  assert.equal(derive(NOW + FRESHNESS_LIMITS.recentMs).score, 0);
  assert.equal(derive(NOW + FRESHNESS_LIMITS.recentMs).tier, "quiet");
  assert.equal(derive(NOW, { ...data, available: false }).level, null);
  data.evidence[base.id] = data.evidence[base.id].map((item) => ({
    ...item,
    expiresAt: NOW + 60_000,
  }));
  assert.equal(derive(NOW + 60_000).score, 0);
  assert.equal(derive(Number.NaN).level, null);
});

test("standalone loaded geography never invents a region activity signal", () => {
  const data = input();
  data.evidence["qa-standalone"] = [observation("post", 20)];
  const row = deriveRegionalDiscovery(regions, searched, null, blank, data, NOW).find(
    (r) => r.region.standalone,
  )!;
  assert.equal(row.region.name, base.name);
  assert.equal(row.signal.level, null);
  assert.equal(row.signal.score, 0);
  assert.ok(deriveMarkerPulseSnapshot(data, NOW)["qa-standalone"].score > 0);
});

test("viewport and screen membership preserve contextual geographic identity", () => {
  const full = discoveryViewport(region.anchor, 9.25, world, world, places, searched);
  const close = discoveryViewport(region.anchor, 14, world, region.bounds, places, searched, {
    bearing: 45,
    pitch: 30,
  });
  assert.equal(close.primaryAreaId, "kourouta");
  assert.deepEqual(close.visiblePlaceIds, region.placeIds);
  assert.equal(close.hierarchyLevel, "place");
  assert.notEqual(viewportSignature(close), viewportSignature(full));
  assert.notEqual(viewportSignature(close), viewportSignature({ ...close, pitch: 0 }));
  const withoutContext = discoveryViewport(
    region.anchor,
    14,
    world,
    region.bounds,
    places,
    new Set(),
  );
  assert.equal(withoutContext.primaryAreaId, null);
  assert.deepEqual(withoutContext.visiblePlaceIds, close.visiblePlaceIds);
  const screen = visibleScreenMembers(
    { left: 0, right: 10, top: 0, bottom: 10 },
    {
      unproject: ([x, y]) => ({ lng: x, lat: y }),
      project: ([lng, lat]) => ({ x: lng, y: lat }),
    },
    () => [
      { id: "inside", lng: 5, lat: 5 },
      { id: "outside", lng: 11, lat: 5 },
    ],
  );
  assert.deepEqual(screen.bounds, [
    [0, 0],
    [10, 10],
  ]);
  assert.deepEqual(
    screen.places.map((place) => place.id),
    ["inside"],
  );
});

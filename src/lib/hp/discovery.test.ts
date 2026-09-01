import assert from "node:assert/strict";
import test from "node:test";
import type { PulseData } from "@/lib/hp-api";
import type { Place } from "@/lib/hp-model";
import type { AreaIntelligence } from "@/lib/hp/area-intelligence";
import {
  aggregateClusterProminence,
  deriveDiscoverySnapshot,
  deriveMarkerProminence,
  rankDiscoveryRecommendations,
  viewportNeedsDiscoveryRecommendation,
  type DiscoveryAreaCandidate,
  type DiscoveryProfile,
} from "./discovery";

const NOW = Date.parse("2026-09-01T12:00:00.000Z");

function place(id: string, type: Place["type"], tags: string[], lat = 37.68, lng = 21.52): Place {
  return {
    id,
    name: id,
    greekName: id,
    type,
    area: "Test",
    x: 0,
    y: 0,
    lat,
    lng,
    pulse: 4,
    mood: "",
    crowd: "",
    budget: "€",
    bestTime: "",
    tags,
    short: "",
    imageUrl: "",
    hotness: 4,
    commentCount: 0,
    recentPostCount: 0,
    status: "active",
    avatars: [],
  };
}

function data(places: Place[]): PulseData {
  return {
    authors: [],
    profiles: [],
    places,
    posts: [],
    events: [],
    meetEvents: [],
    routes: [],
    stories: [],
    vibeChips: [],
    placeComments: {},
    routeComments: {},
    source: "supabase",
  };
}

function intelligence(
  areaId: string,
  state: AreaIntelligence["state"],
  quality: AreaIntelligence["signalQuality"] = "stable",
  updates: Partial<AreaIntelligence> = {},
): AreaIntelligence {
  return {
    areaId,
    state,
    activityScore: state === "hot" ? 85 : 58,
    momentum: state === "rising" ? 24 : 4,
    relativeMomentum: state === "rising" ? 0.7 : 0.1,
    emerging: false,
    signalQuality: quality,
    confidenceScore: quality === "confirmed" ? 88 : 62,
    lastSignalAt: new Date(NOW - 20 * 60_000).toISOString(),
    lastConfirmedAt: quality === "uncertain" ? null : new Date(NOW - 30 * 60_000).toISOString(),
    evidence: {
      recentWeight: 3,
      baselineWeight: 2,
      signalCount: 3,
      sourceCount: 2,
      contributorCount: 2,
      timestampCoverage: 1,
    },
    ...updates,
  };
}

function profile(relevance: number): DiscoveryProfile {
  return {
    lensRelevance: {
      chill: relevance,
      social: relevance,
      music: relevance,
      beach: relevance,
      food: relevance,
    },
  };
}

test("derives distinct semantic relevance for all five lenses", () => {
  const snapshot = deriveDiscoverySnapshot(
    data([
      place("calm-place", "nature", ["quiet", "shade"]),
      place("social-place", "local", ["party", "beer"]),
      place("music-place", "night", ["dj", "music"]),
      place("beach-place", "beach", ["coast", "swim"]),
      place("food-place", "food", ["seafood", "wine"]),
    ]),
    NOW,
  );

  assert.ok(snapshot.places["calm-place"].lensRelevance.chill >= 0.9);
  assert.ok(snapshot.places["social-place"].lensRelevance.social >= 0.9);
  assert.ok(snapshot.places["music-place"].lensRelevance.music >= 0.9);
  assert.ok(snapshot.places["beach-place"].lensRelevance.beach >= 0.9);
  assert.ok(snapshot.places["food-place"].lensRelevance.food >= 0.9);
});

test("fresh matching content boosts relevance while untimed content does not", () => {
  const base = place("pyrgos-centre", "local", ["local"]);
  const pulseData = data([base]);
  pulseData.posts = [
    {
      id: "music-now",
      authorId: "one",
      placeId: base.id,
      kind: "event",
      time: "now",
      createdAt: new Date(NOW - 10 * 60_000).toISOString(),
      text: "",
      tags: ["music", "live"],
      likes: 0,
      imageUrl: "",
      comments: [],
    },
  ];
  const fresh = deriveDiscoverySnapshot(pulseData, NOW);
  pulseData.posts[0].createdAt = null;
  const untimed = deriveDiscoverySnapshot(pulseData, NOW);

  assert.ok(
    fresh.places[base.id].lensRelevance.music > untimed.places[base.id].lensRelevance.music,
  );
});

test("clear lens is neutral and selected markers always retain priority", () => {
  const neutral = deriveMarkerProminence(profile(0), intelligence("area", "hot"), null);
  const selected = deriveMarkerProminence(profile(0), intelligence("area", "hot"), "music", {
    selected: true,
    hasSelection: true,
  });

  assert.deepEqual(neutral, {
    score: 1,
    band: "high",
    opacityFactor: 1,
    scaleFactor: 1,
    zIndexBoost: 0,
  });
  assert.equal(selected.opacityFactor, 1);
  assert.equal(selected.scaleFactor, 1);
});

test("relevant Emerging areas outrank irrelevant Hot areas without hiding them", () => {
  const emerging = deriveMarkerProminence(
    profile(0.82),
    intelligence("emerging", "rising", "stable", { emerging: true, momentum: 35 }),
    "music",
  );
  const irrelevantHot = deriveMarkerProminence(
    profile(0.05),
    intelligence("hot", "hot", "confirmed"),
    "music",
  );

  assert.equal(emerging.band, "high");
  assert.equal(irrelevantHot.band, "low");
  assert.ok(irrelevantHot.opacityFactor >= 0.62);
  assert.ok(emerging.score > irrelevantHot.score);
});

test("selection context and dense mode keep conservative visibility and scale", () => {
  const result = deriveMarkerProminence(profile(0), intelligence("area", "calm"), "music", {
    hasSelection: true,
    dense: true,
  });

  assert.ok(result.opacityFactor >= 0.76);
  assert.ok(result.scaleFactor >= 0.98 && result.scaleFactor <= 1.02);
});

test("mixed clusters preserve a strong relevant member", () => {
  const strong = deriveMarkerProminence(profile(1), intelligence("one", "active"), "beach");
  const weak = deriveMarkerProminence(profile(0), intelligence("two", "active"), "beach");
  const cluster = aggregateClusterProminence([strong, weak, weak]);

  assert.ok(cluster.score > 0.7);
  assert.ok(cluster.opacityFactor > weak.opacityFactor);
});

test("recommendations balance distance with Rising and Emerging opportunity", () => {
  const discovery = {
    places: {},
    areas: { near: profile(0.4), rising: profile(0.95) },
  };
  const candidates: DiscoveryAreaCandidate[] = [
    {
      areaId: "near",
      lat: 37.7,
      lng: 21.52,
      intelligence: intelligence("near", "active", "stable"),
    },
    {
      areaId: "rising",
      lat: 37.76,
      lng: 21.52,
      intelligence: intelligence("rising", "rising", "confirmed", {
        emerging: true,
        momentum: 38,
      }),
    },
  ];
  const recommendations = rankDiscoveryRecommendations(
    candidates,
    { lat: 37.68, lng: 21.52 },
    "music",
    discovery,
    { now: NOW },
  );

  assert.equal(recommendations[0].areaId, "rising");
  assert.equal(recommendations[0].reason, "emerging");
});

test("uncertain, irrelevant and distant candidates are excluded", () => {
  const discovery = {
    places: {},
    areas: { uncertain: profile(1), irrelevant: profile(0.1), distant: profile(1) },
  };
  const candidates: DiscoveryAreaCandidate[] = [
    {
      areaId: "uncertain",
      lat: 37.7,
      lng: 21.52,
      intelligence: intelligence("uncertain", "hot", "uncertain"),
    },
    {
      areaId: "irrelevant",
      lat: 37.7,
      lng: 21.52,
      intelligence: intelligence("irrelevant", "hot", "confirmed"),
    },
    {
      areaId: "distant",
      lat: 38.5,
      lng: 21.52,
      intelligence: intelligence("distant", "hot", "confirmed"),
    },
  ];

  assert.deepEqual(
    rankDiscoveryRecommendations(candidates, { lat: 37.68, lng: 21.52 }, "food", discovery, {
      now: NOW,
    }),
    [],
  );
});

test("viewport detection handles active opportunity and an empty viewport", () => {
  const discovery = { places: {}, areas: { active: profile(0.9) } };
  const areaIntelligence = { active: intelligence("active", "active", "stable") };

  assert.equal(
    viewportNeedsDiscoveryRecommendation(["active"], "beach", discovery, areaIntelligence),
    false,
  );
  assert.equal(
    viewportNeedsDiscoveryRecommendation([], "beach", discovery, areaIntelligence),
    true,
  );
});

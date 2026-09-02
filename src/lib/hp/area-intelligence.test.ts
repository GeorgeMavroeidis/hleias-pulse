import assert from "node:assert/strict";
import test from "node:test";
import type { PulseData } from "@/lib/hp-api";
import type { Place } from "@/lib/hp-model";
import {
  AREA_INTELLIGENCE_CONFIG,
  deriveAreaIntelligence,
  deriveAreaIntelligenceSnapshot,
  type ActivityEvidence,
  type AreaIntelligenceConfig,
  type AreaObservation,
} from "./area-intelligence";

const NOW = Date.parse("2026-09-01T12:00:00.000Z");

function evidence(
  kind: ActivityEvidence["kind"],
  ageMinutes: number,
  contributorId: string,
  weight = AREA_INTELLIGENCE_CONFIG.evidenceWeights[kind],
): ActivityEvidence {
  return {
    kind,
    contributorId,
    weight,
    timestamp: NOW - ageMinutes * 60_000,
  };
}

function observation(legacyRawScore: number, items: ActivityEvidence[] = []): AreaObservation {
  return { areaId: "test-area", legacyRawScore, evidence: items, observedAt: NOW };
}

function configWith(updates: Partial<AreaIntelligenceConfig>): AreaIntelligenceConfig {
  return {
    ...AREA_INTELLIGENCE_CONFIG,
    ...updates,
    evidenceWeights: {
      ...AREA_INTELLIGENCE_CONFIG.evidenceWeights,
      ...updates.evidenceWeights,
    },
    thresholds: {
      ...AREA_INTELLIGENCE_CONFIG.thresholds,
      ...updates.thresholds,
    },
  };
}

test("derives calm, rising, active and hot without conflating signal quality", () => {
  const calm = deriveAreaIntelligence(observation(0));
  const rising = deriveAreaIntelligence(
    observation(40, [evidence("post", 10, "one", 1.6), evidence("post", 120, "one", 1.5)]),
  );
  const active = deriveAreaIntelligence(
    observation(95, [evidence("post", 20, "one", 1.5), evidence("post", 120, "one", 4.5)]),
  );
  const hot = deriveAreaIntelligence(
    observation(105, [
      evidence("post", 10, "one", 2),
      evidence("story", 15, "two", 2),
      evidence("post", 120, "one", 6),
    ]),
  );

  assert.equal(calm.state, "calm");
  assert.equal(calm.signalQuality, "uncertain");
  assert.equal(rising.state, "rising");
  assert.equal(rising.emerging, false);
  assert.equal(active.state, "active");
  assert.equal(hot.state, "hot");
});

test("moves from hot to cooling when the recent rate falls below its baseline", () => {
  const hot = deriveAreaIntelligence(
    observation(105, [
      evidence("post", 10, "one", 2),
      evidence("story", 15, "two", 2),
      evidence("post", 120, "one", 6),
    ]),
  );
  const cooling = deriveAreaIntelligence(
    observation(105, [evidence("post", 120, "one", 4.5), evidence("story", 150, "two", 4.5)]),
  );

  assert.equal(hot.state, "hot");
  assert.equal(cooling.state, "cooling");
  assert.ok(cooling.momentum <= AREA_INTELLIGENCE_CONFIG.thresholds.coolingMomentum);

  const calmAfterDecay = deriveAreaIntelligence(
    observation(0, [
      evidence("post", 9 * 60, "one", 4.5),
      evidence("story", 9 * 60 + 10, "two", 4.5),
    ]),
  );
  assert.equal(calmAfterDecay.state, "calm");
});

test("emerging requires meaningful absolute support and disappears when growth stabilizes", () => {
  const emerging = deriveAreaIntelligence(
    observation(40, [evidence("post", 10, "one", 1.6), evidence("story", 20, "two", 1.5)]),
  );
  const stabilized = deriveAreaIntelligence(
    observation(95, [
      evidence("post", 10, "one", 1.5),
      evidence("story", 20, "two", 1.5),
      evidence("post", 120, "one", 4.5),
      evidence("story", 150, "two", 4.5),
    ]),
  );
  const tinyDoubling = deriveAreaIntelligence(observation(20, [evidence("post", 10, "one", 2)]));

  assert.equal(emerging.state, "rising");
  assert.equal(emerging.emerging, true);
  assert.equal(stabilized.state, "active");
  assert.equal(stabilized.emerging, false);
  assert.equal(tinyDoubling.emerging, false);
});

test("signal freshness decays from confirmed to fading to uncertain", () => {
  const confirmed = deriveAreaIntelligence(
    observation(60, [evidence("post", 10, "one", 1.5), evidence("story", 15, "two", 1.5)]),
  );
  const fading = deriveAreaIntelligence(
    observation(60, [evidence("post", 50, "one", 1.5), evidence("story", 55, "two", 1.5)]),
  );
  const uncertain = deriveAreaIntelligence(
    observation(60, [
      evidence("post", 9 * 60, "one", 1.5),
      evidence("story", 9 * 60 + 5, "two", 1.5),
    ]),
  );

  assert.equal(confirmed.signalQuality, "confirmed");
  assert.equal(fading.signalQuality, "fading");
  assert.equal(uncertain.signalQuality, "uncertain");
  assert.ok(confirmed.lastConfirmedAt);
});

test("repeated modest evidence becomes stable without being confirmed", () => {
  const result = deriveAreaIntelligence(
    observation(50, [evidence("event", 20, "one"), evidence("event", 70, "one")]),
  );

  assert.equal(result.signalQuality, "stable");
  assert.equal(result.lastConfirmedAt, null);
});

test("missing, invalid and future timestamps remain uncertain", () => {
  const result = deriveAreaIntelligence(
    observation(105, [
      { kind: "post", contributorId: "one", weight: 1, timestamp: null },
      { kind: "story", contributorId: "two", weight: 1.25, timestamp: NOW + 10 * 60_000 },
    ]),
  );

  assert.equal(result.state, "active");
  assert.equal(result.momentum, 0);
  assert.equal(result.emerging, false);
  assert.equal(result.signalQuality, "uncertain");
  assert.equal(result.lastConfirmedAt, null);
});

test("active threshold is inclusive and centrally configurable", () => {
  const thresholdConfig = configWith({ legacyActivityShare: 1 });
  const below = deriveAreaIntelligence(observation(47.24), thresholdConfig);
  const boundary = deriveAreaIntelligence(observation(47.25), thresholdConfig);
  const above = deriveAreaIntelligence(observation(47.26), thresholdConfig);

  assert.equal(below.activityScore, 45);
  assert.equal(boundary.activityScore, 45);
  assert.equal(above.activityScore, 45);
  assert.equal(below.state, "calm");
  assert.equal(boundary.state, "active");
  assert.equal(above.state, "active");
});

test("snapshot derivation is order-independent and supports old payloads and standalone areas", () => {
  const place: Place = {
    id: "ancient-olympia",
    name: "Olympia",
    greekName: "Ολυμπία",
    type: "culture",
    area: "Olympia",
    x: 0,
    y: 0,
    lat: 37.64,
    lng: 21.63,
    pulse: 4,
    mood: "calm",
    crowd: "low",
    budget: "free",
    bestTime: "morning",
    tags: [],
    short: "",
    imageUrl: "",
    hotness: 4,
    commentCount: 0,
    recentPostCount: 1,
    status: "active",
    avatars: [],
  };
  const standalonePlace: Place = { ...place, id: "new-independent-place", name: "New place" };
  const data: PulseData = {
    authors: [],
    profiles: [],
    places: [place, standalonePlace],
    posts: [
      {
        id: "old-post",
        authorId: "author",
        placeId: place.id,
        kind: "spot",
        time: "recently",
        text: "",
        tags: [],
        likes: 0,
        imageUrl: "",
        comments: [],
      },
    ],
    events: [],
    meetEvents: [],
    culturalEvents: [],
    routes: [],
    stories: [],
    vibeChips: [],
    placeComments: {},
    routeComments: {},
    culturalEventComments: {},
    claimedPlaceIds: [],
    dealPlaceIds: [],
    deals: [],
    source: "supabase",
  };

  const full = deriveAreaIntelligenceSnapshot(data, NOW);
  const repeated = deriveAreaIntelligenceSnapshot(
    { ...data, places: [...data.places].reverse(), posts: [...data.posts].reverse() },
    NOW,
  );

  assert.deepEqual(full, repeated);
  assert.equal(full.olympia.signalQuality, "uncertain");
  assert.equal(full.olympia.evidence.timestampCoverage, 0);
  assert.equal(full["solo-new-independent-place"].areaId, "solo-new-independent-place");
});

import assert from "node:assert/strict";
import test from "node:test";
import type { PulseData } from "../hp-api";
import type { ActivityEvidence } from "./activity-evidence";
import { FRESHNESS_LIMITS, RECYCLED_STORY_IDS } from "./freshness";
import { buildPulseActivitySnapshot } from "./pulse-activity";
import { buildTrafficPreviewScene, TRAFFIC_SCENES } from "./traffic-preview";
import {
  buildMarkerPulseInput,
  deriveEvidencePulseSignal,
  deriveMarkerPulseSnapshot,
  excludeHiddenPulseContributors,
  markerPulseForPlace,
  markerPulseInputFromActivity,
  NEUTRAL_MARKER_PULSE,
} from "./marker-pulse";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const iso = (instant: number) => new Date(instant).toISOString();
function blankData(): PulseData {
  return buildTrafficPreviewScene("quiet", NOW).data;
}
function weightedEvidence(score: number, observedAt = NOW): ActivityEvidence[] {
  const weight = -4 * Math.log(1 - score / 100);
  return [
    {
      kind: "post",
      weight: weight / 2,
      timestamp: observedAt,
      contributorId: "same",
    },
    {
      kind: "story",
      weight: weight / 2,
      timestamp: observedAt,
      contributorId: "same",
    },
  ];
}

test("every compact preview scene uses the canonical activity metric and one clock", () => {
  const presentation = {
    quiet: "quiet",
    moving: "emerging",
    hot: "active",
    live: "lively",
  };
  for (const { id } of TRAFFIC_SCENES) {
    const scene = buildTrafficPreviewScene(id, NOW);
    const before = JSON.stringify(scene.data);
    const input = markerPulseInputFromActivity(scene.activitySnapshot);
    const markers = deriveMarkerPulseSnapshot(input, scene.nowMs);
    for (const place of scene.data.places) {
      const metric = scene.activitySnapshot[place.id];
      assert.equal(markers[place.id].score, metric.score, `${id}: score`);
      assert.equal(markers[place.id].tier, metric.tier, `${id}: tier`);
      assert.equal(markers[place.id].quality, metric.signalQuality, `${id}: confidence`);
      assert.equal(markers[place.id].lastSignalAt, metric.lastSignalAt, `${id}: evidence time`);
      if (metric.evidenceWeight > 0)
        assert.equal(markers[place.id].level, presentation[metric.tier], `${id}: CSS anatomy`);
    }
    assert.equal(JSON.stringify(scene.data), before);
    if (id === "later") {
      const marker = markers[scene.focusPlaceId];
      assert.equal(marker.score, 0);
      assert.equal(marker.tier, "quiet");
      assert.equal(marker.level, "fading");
      assert.ok(
        scene.data.posts.length && scene.data.stories.length && scene.data.meetEvents.length,
      );
    }
  }
});

test("retained evidence survives old or failed requests and ages at one and three hours", () => {
  const input = buildTrafficPreviewScene("live", NOW);
  const evidence = weightedEvidence(99.5);
  const snapshot = {
    fetchedAt: NOW,
    available: true,
    placeIds: [input.focusPlaceId],
    evidence: { [input.focusPlaceId]: evidence },
  };
  const signal = (now: number) => deriveMarkerPulseSnapshot(snapshot, now)[input.focusPlaceId];
  assert.equal(signal(NOW + 180_001).tier, "live");
  assert.equal(signal(NOW + FRESHNESS_LIMITS.currentMs - 1).tier, "live");
  assert.equal(signal(NOW + FRESHNESS_LIMITS.currentMs).tier, "hot");
  assert.notEqual(signal(NOW + FRESHNESS_LIMITS.currentMs).quality, "confirmed");
  assert.equal(signal(NOW + FRESHNESS_LIMITS.recentMs - 1).score, 100);
  assert.equal(signal(NOW + FRESHNESS_LIMITS.recentMs).score, 0);
  assert.equal(signal(NOW + FRESHNESS_LIMITS.recentMs).tier, "quiet");
  for (const fetchedAt of [null, NOW - 86_400_000, NOW + 86_400_000])
    assert.deepEqual(
      deriveMarkerPulseSnapshot({ ...snapshot, fetchedAt }, NOW)[input.focusPlaceId],
      signal(NOW),
    );
  assert.deepEqual(snapshot.evidence[input.focusPlaceId], evidence);
});

test("rounded display scores cannot manufacture Hot or Live", () => {
  for (const [score, tier] of [
    [27.99, "quiet"],
    [28.01, "moving"],
    [74.99, "moving"],
    [75.01, "hot"],
    [98.99, "hot"],
    [99.01, "live"],
  ] as const)
    assert.equal(deriveEvidencePulseSignal(weightedEvidence(score), NOW).tier, tier);
  const rounded = deriveEvidencePulseSignal(weightedEvidence(98.99), NOW);
  assert.equal(rounded.score, 99);
  assert.equal(rounded.tier, "hot");
  assert.equal(rounded.level, "active");
  const singleSource = weightedEvidence(99.5).map((item) => ({
    ...item,
    kind: "post" as const,
  }));
  assert.equal(deriveEvidencePulseSignal(singleSource, NOW).tier, "hot");
});

test("published Meet and event announcements contribute; future starts and RSVP counts do not", () => {
  const data = blankData();
  const arriving = buildTrafficPreviewScene("arriving", NOW);
  const meet = {
    ...arriving.data.meetEvents[0],
    createdAt: iso(NOW - 60_000),
    happensAt: iso(NOW + 5 * 3_600_000),
    going: 999,
    maybe: 999,
    moderationStatus: "published",
  };
  data.meetEvents = [meet];
  data.events = [
    {
      id: "dated-event",
      placeId: meet.placeId,
      title: "Published announcement",
      createdAt: iso(NOW - 60_000),
      time: "tonight",
      price: "",
      vibe: "",
      tags: [],
    },
  ];
  let marker = deriveMarkerPulseSnapshot(buildMarkerPulseInput(data, NOW), NOW)[meet.placeId];
  const canonical = buildPulseActivitySnapshot(data, NOW)[meet.placeId];
  assert.equal(marker.score, canonical.score);
  assert.equal(marker.tier, canonical.tier);
  assert.ok(marker.score > 0);
  data.meetEvents[0].createdAt = null;
  data.events[0].createdAt = null;
  marker = deriveMarkerPulseSnapshot(buildMarkerPulseInput(data, NOW), NOW)[meet.placeId];
  assert.equal(marker.score, 0);
  assert.equal(marker.tier, "quiet");
  assert.equal(marker.level, null);
});

test("pending and hidden publications never establish public marker activity", () => {
  const data = blankData();
  const source = buildTrafficPreviewScene("arriving", NOW).data;
  data.posts = source.posts.map((post) => ({
    ...post,
    moderationStatus: "pending",
  }));
  data.stories = source.stories.map((story) => ({
    ...story,
    moderationStatus: "hidden",
  }));
  data.meetEvents = source.meetEvents.map((meet) => ({
    ...meet,
    moderationStatus: "pending",
  }));
  data.placeComments = Object.fromEntries(
    Object.entries(source.placeComments).map(([id, comments]) => [
      id,
      comments.map((comment) => ({ ...comment, moderationStatus: "pending" })),
    ]),
  );
  for (const marker of Object.values(
    deriveMarkerPulseSnapshot(buildMarkerPulseInput(data, NOW), NOW),
  ))
    assert.equal(marker.score, 0);
  const post = {
    ...source.posts[0],
    comments: source.posts[0].comments.map((comment) => ({
      ...comment,
      moderationStatus: "pending",
    })),
    moderationStatus: "published",
  };
  data.posts = [post];
  const marker = deriveMarkerPulseSnapshot(buildMarkerPulseInput(data, NOW), NOW)[post.placeId];
  assert.equal(marker.score, buildPulseActivitySnapshot(data, NOW)[post.placeId].score);
  assert.equal(marker.score, 22);
});

test("all eleven recycled story IDs, missing/invalid/future evidence, and expiry stay honest", () => {
  const data = blankData();
  const source = buildTrafficPreviewScene("arriving", NOW).data;
  const placeId = data.places[0].id;
  data.stories = [...RECYCLED_STORY_IDS].map((id) => ({
    ...source.stories[0],
    id,
    createdAt: iso(NOW),
    moderationStatus: "published",
  }));
  const input = buildMarkerPulseInput(data, NOW);
  assert.equal(input.evidence[placeId].length, 11);
  assert.ok(input.evidence[placeId].every((item) => item.timestamp === null));
  assert.equal(deriveMarkerPulseSnapshot(input, NOW)[placeId].score, 0);
  const invalid: ActivityEvidence[] = [
    null,
    Number.NaN,
    NOW + FRESHNESS_LIMITS.futureToleranceMs + 1,
  ].map((timestamp) => ({
    kind: "post",
    weight: 50,
    timestamp,
    contributorId: "user",
  }));
  assert.equal(deriveEvidencePulseSignal(invalid, NOW).score, 0);
  const story = {
    kind: "story" as const,
    timestamp: NOW - 59 * 60_000,
    weight: 1.25,
    contributorId: "user",
    expiresAt: NOW + 60_000,
  };
  assert.ok(deriveEvidencePulseSignal([story], NOW).score > 0);
  assert.equal(deriveEvidencePulseSignal([story], NOW + 60_000).score, 0);
  assert.deepEqual(deriveEvidencePulseSignal(invalid, Number.NaN), NEUTRAL_MARKER_PULSE);
});

test("moderation projection preserves the accepted clock and does not mutate source evidence", () => {
  const scene = buildTrafficPreviewScene("arriving", NOW);
  const activity = buildPulseActivitySnapshot(scene.data, NOW);
  const input = markerPulseInputFromActivity(
    activity,
    scene.data.places.map((place) => place.id),
    NOW,
  );
  const before = JSON.stringify(input);
  const hidden = new Set(
    Object.values(input.evidence)
      .flat()
      .flatMap((item) => (item.contributorId ? [item.contributorId] : [])),
  );
  const projected = excludeHiddenPulseContributors(input, hidden);
  assert.equal(projected.fetchedAt, NOW);
  assert.equal(projected.available, true);
  for (const marker of Object.values(deriveMarkerPulseSnapshot(projected, NOW)))
    assert.equal(marker.score, 0);
  assert.equal(JSON.stringify(input), before);
  assert.strictEqual(excludeHiddenPulseContributors(input, new Set()), input);
  assert.deepEqual(markerPulseForPlace("missing", {}), NEUTRAL_MARKER_PULSE);
});

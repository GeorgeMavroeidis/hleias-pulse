import assert from "node:assert/strict";
import test from "node:test";
import { deriveAreaIntelligenceSnapshot } from "./area-intelligence";
import { FRESHNESS_LIMITS, RECYCLED_STORY_IDS } from "./freshness";
import {
  aggregatePulseMetrics,
  buildPulseActivitySnapshot,
  fallbackPulseMetric,
  pulseTierForMetric,
} from "./pulse-activity";
import { buildTrafficPreviewScene } from "./traffic-preview";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");

test("stored place counters, statuses, and fallback event counts cannot manufacture activity", () => {
  const { data, focusPlaceId, focusAreaId } = buildTrafficPreviewScene("quiet", NOW);
  const place = data.places[0];
  Object.assign(place, { hotness: 999, recentPostCount: 999, commentCount: 999, status: "busy" });
  const snapshot = buildPulseActivitySnapshot(data, NOW);
  const area = deriveAreaIntelligenceSnapshot(data, NOW)[focusAreaId];
  for (const metric of [
    snapshot[focusPlaceId],
    fallbackPulseMetric(place, 99),
    aggregatePulseMetrics(data.places, snapshot, new Map([[focusPlaceId, 99]])),
  ]) {
    assert.equal(metric.score, 0);
    assert.equal(metric.tier, "quiet");
    assert.equal(metric.postCount, 0);
    assert.equal(metric.eventCount, 0);
  }
  assert.equal(area.activityScore, 0);
  assert.equal(area.state, "calm");
});

test("raw marker thresholds are inclusive and Live additionally requires confirmation", () => {
  assert.equal(pulseTierForMetric(27.999), "quiet");
  assert.equal(pulseTierForMetric(28), "moving");
  assert.equal(pulseTierForMetric(74.999), "moving");
  assert.equal(pulseTierForMetric(75), "hot");
  assert.equal(pulseTierForMetric(98.999, true), "hot");
  assert.equal(pulseTierForMetric(99), "hot");
  assert.equal(pulseTierForMetric(99, true), "live");
});

test("Live expires exactly at one hour, recent scores at three, without deleting records or schedules", () => {
  const { data, focusPlaceId, focusAreaId } = buildTrafficPreviewScene("live", NOW);
  const observation = new Date(NOW).toISOString();
  for (const post of data.posts) {
    post.createdAt = observation;
    post.comments.forEach((comment) => {
      comment.createdAt = observation;
    });
  }
  data.meetEvents.forEach((event) => {
    event.createdAt = observation;
  });
  data.stories.forEach((story) => {
    story.createdAt = observation;
  });
  Object.values(data.placeComments)
    .flat()
    .forEach((comment) => {
      comment.createdAt = observation;
    });
  const retained = structuredClone(data);

  const beforeHour = buildPulseActivitySnapshot(data, NOW + FRESHNESS_LIMITS.currentMs - 1)[
    focusPlaceId
  ];
  const atHour = buildPulseActivitySnapshot(data, NOW + FRESHNESS_LIMITS.currentMs)[focusPlaceId];
  const beforeThree = buildPulseActivitySnapshot(data, NOW + FRESHNESS_LIMITS.recentMs - 1)[
    focusPlaceId
  ];
  const atThree = buildPulseActivitySnapshot(data, NOW + FRESHNESS_LIMITS.recentMs)[focusPlaceId];
  const area = deriveAreaIntelligenceSnapshot(data, NOW + FRESHNESS_LIMITS.recentMs)[focusAreaId];

  assert.equal(beforeHour.tier, "live");
  assert.equal(beforeHour.signalQuality, "confirmed");
  assert.equal(atHour.tier, "hot");
  assert.notEqual(atHour.signalQuality, "confirmed");
  assert.equal(beforeThree.score, 100);
  assert.equal(atThree.score, 0);
  assert.equal(atThree.tier, "quiet");
  assert.equal(area.activityScore, 0);
  assert.equal(area.evidence.recentWeight, 0);
  assert.equal(area.state, "cooling");
  assert.deepEqual(data, retained);
});

test("old source diversity cannot confirm a fresh single-source spike", () => {
  const { data, focusPlaceId } = buildTrafficPreviewScene("live", NOW);
  const original = data.posts[0];
  data.posts = Array.from({ length: 25 }, (_, i) => ({
    ...original,
    id: `post-${i}`,
    comments: [],
    createdAt: new Date(NOW).toISOString(),
  }));
  data.placeComments = {};
  data.meetEvents = [];
  data.stories = [data.stories[0]];
  data.stories[0].createdAt = new Date(NOW - FRESHNESS_LIMITS.currentMs).toISOString();
  assert.equal(buildPulseActivitySnapshot(data, NOW)[focusPlaceId].tier, "hot");
  data.stories[0].createdAt = new Date(NOW).toISOString();
  assert.equal(buildPulseActivitySnapshot(data, NOW)[focusPlaceId].tier, "live");
});

test("unknown observations and recycled stories cannot contribute to scores", () => {
  const { data, focusPlaceId, focusAreaId } = buildTrafficPreviewScene("arriving", NOW);
  data.posts[0].createdAt = "invalid";
  data.posts[0].comments[0].createdAt = null;
  data.meetEvents[0].createdAt = new Date(
    NOW + FRESHNESS_LIMITS.futureToleranceMs + 1,
  ).toISOString();
  Object.values(data.placeComments)
    .flat()
    .forEach((comment) => {
      comment.createdAt = undefined;
    });
  data.stories = [...RECYCLED_STORY_IDS].map((id) => ({
    ...data.stories[0],
    id,
    createdAt: new Date(NOW).toISOString(),
  }));
  const metric = buildPulseActivitySnapshot(data, NOW)[focusPlaceId];
  const area = deriveAreaIntelligenceSnapshot(data, NOW)[focusAreaId];
  assert.equal(metric.score, 0);
  assert.equal(metric.lastSignalAt, null);
  assert.equal(area.activityScore, 0);
  assert.equal(area.signalQuality, "uncertain");
  assert.equal(area.evidence.timestampCoverage, 0);
  assert.equal(data.stories.length, 11);
});

test("map aggregation uses the same dated weights and clock as places and areas", () => {
  const scene = buildTrafficPreviewScene("arriving", NOW);
  const combined = aggregatePulseMetrics(scene.data.places, scene.activitySnapshot);
  assert.equal(combined.score, 63);
  assert.equal(combined.score, scene.areaIntelligence[scene.focusAreaId].activityScore);
  assert.equal(combined.observedAt, NOW);
  assert.ok(Math.abs(combined.evidenceWeight - 3.95) < 0.00001);
});

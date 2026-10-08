import assert from "node:assert/strict";
import test from "node:test";
import { TRAFFIC_SCENES, buildTrafficPreviewScene } from "./traffic-preview";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");

test("traffic timeline crosses the real map tier thresholds", () => {
  assert.deepEqual(
    TRAFFIC_SCENES.map((scene) => scene.id),
    ["quiet", "arriving", "hot", "live", "later"],
  );

  const expectations = [
    { scene: "quiet", posts: 0, meets: 0, tier: "quiet", state: "calm" },
    { scene: "arriving", posts: 1, meets: 1, tier: "moving", state: "rising" },
    { scene: "hot", posts: 8, meets: 2, tier: "hot", state: "hot" },
    { scene: "live", posts: 13, meets: 3, tier: "live", state: "hot" },
    { scene: "later", posts: 13, meets: 3, tier: "live", state: "cooling" },
  ] as const;

  for (const expected of expectations) {
    const result = buildTrafficPreviewScene(expected.scene, NOW);
    const metric = result.activitySnapshot[result.focusPlaceId];
    const area = result.areaIntelligence[result.focusAreaId];

    assert.equal(result.data.source, "preview");
    assert.equal(result.focusPlaceId, "kourouta-beach");
    assert.equal(result.focusAreaId, "kourouta");
    assert.equal(result.data.posts.length, expected.posts);
    assert.equal(result.data.meetEvents.length, expected.meets);
    assert.equal(metric.postCount, expected.posts);
    assert.equal(metric.eventCount, expected.meets);
    assert.equal(metric.tier, expected.tier, expected.scene);
    assert.equal(area.state, expected.state, expected.scene);
    assert.equal(result.data.places.length, 3);
    assert.equal(result.data.authors.length, 4);
    assert.equal(result.data.places[0].hotness, 4);
    assert.equal(result.data.places[0].status, "quiet");
    assert.equal(result.data.places[0].recentPostCount, 0);
    assert.equal(result.data.places[0].commentCount, 0);
  }
});

test("later ages real timestamps but retains accumulated map content", () => {
  const live = buildTrafficPreviewScene("live", new Date(NOW));
  const later = buildTrafficPreviewScene("later", new Date(NOW));
  const focus = live.focusPlaceId;
  const area = live.focusAreaId;

  assert.deepEqual(
    live.data.posts.map((post) => post.id),
    later.data.posts.map((post) => post.id),
  );
  assert.deepEqual(
    live.data.meetEvents.map((event) => event.id),
    later.data.meetEvents.map((event) => event.id),
  );
  assert.equal(
    Date.parse(live.data.meetEvents[0].happensAt) - Date.parse(later.data.meetEvents[0].happensAt),
    3 * 60 * 60_000 + 10 * 60_000,
  );
  assert.ok(Date.parse(later.data.meetEvents[0].happensAt) < NOW);
  assert.equal(later.data.stories.length, live.data.stories.length);
  assert.equal(later.activitySnapshot[focus].score, live.activitySnapshot[focus].score);
  assert.equal(later.activitySnapshot[focus].tier, "live");
  assert.equal(later.areaIntelligence[area].state, "cooling");
  assert.equal(later.areaIntelligence[area].evidence.recentWeight, 0);
  assert.ok(later.areaIntelligence[area].evidence.baselineWeight > 0);
  assert.ok(later.areaIntelligence[area].activityScore < live.areaIntelligence[area].activityScore);
  assert.equal(
    Date.parse(live.data.posts[0].createdAt ?? "") -
      Date.parse(later.data.posts[0].createdAt ?? ""),
    3 * 60 * 60_000 + 10 * 60_000,
  );
});

test("same scene and clock produce isolated, deterministic fixtures", () => {
  const first = buildTrafficPreviewScene("hot", NOW);
  const second = buildTrafficPreviewScene("hot", NOW);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.data.places.map((place) => [place.id, place.lat, place.lng]),
    [
      ["kourouta-beach", 37.7694054, 21.2938768],
      ["pyrgos-centre", 37.6721814, 21.4439156],
      ["ancient-olympia", 37.6441431, 21.6252773],
    ],
  );
  assert.equal(first.data.stories.length, 3);
  assert.ok(first.data.posts.some((post) => post.comments.length > 0));
  assert.ok((first.data.placeComments[first.focusPlaceId] ?? []).length > 0);
  assert.ok(
    first.data.authors.every((author) => author.avatarUrl.startsWith("data:image/svg+xml,")),
  );

  first.data.posts[0].likes = 999;
  assert.notEqual(first.data.posts[0].likes, second.data.posts[0].likes);
});

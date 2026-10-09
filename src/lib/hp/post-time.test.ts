import assert from "node:assert/strict";
import test from "node:test";
import { buildPlaceStoryGroups, formatStoryTime } from "./place-stories";
import { displayPostTime, isRecentlyPosted } from "./post-time";
import { buildTrafficPreviewScene } from "./traffic-preview";
import { FRESHNESS_LIMITS } from "./freshness";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");

test("Now eligibility uses the strict three-hour observation window with no frozen-label fallback", () => {
  const createdAt = new Date(NOW).toISOString();
  assert.equal(
    isRecentlyPosted({ time: "then", createdAt }, NOW + FRESHNESS_LIMITS.recentMs - 1),
    true,
  );
  assert.equal(
    isRecentlyPosted({ time: "just now", createdAt }, NOW + FRESHNESS_LIMITS.recentMs),
    false,
  );
  for (const value of [
    null,
    undefined,
    "bad",
    new Date(NOW + FRESHNESS_LIMITS.futureToleranceMs + 1).toISOString(),
  ]) {
    assert.equal(isRecentlyPosted({ time: "just now", createdAt: value }, NOW), false);
  }
});

test("post and story display helpers use the injected clock, including later-scene story grouping", () => {
  const scene = buildTrafficPreviewScene("later", NOW);
  const firstPost = scene.data.posts[0];
  assert.equal(displayPostTime(firstPost, scene.nowMs), "3 hours ago");
  const groups = buildPlaceStoryGroups(
    scene.data.places,
    new Set(),
    scene.data.stories,
    scene.nowMs,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 4);
  assert.equal(groups[0].latestMinutesAgo, 195);
  assert.equal(
    formatStoryTime(
      groups[0].stories[0].minutesAgo,
      groups[0].stories[0].createdAt,
      "EN",
      scene.nowMs,
    ),
    "3 hours ago",
  );
  const eventPost = { ...firstPost, kind: "event" as const, time: "Saturday · 20:30" };
  assert.equal(displayPostTime(eventPost, scene.nowMs), "Saturday · 20:30");
});

test("fixed preview/domain clocks do not consult the wall clock", () => {
  const original = Date.now;
  try {
    Date.now = () => {
      throw new Error("Unexpected wall-clock read");
    };
    for (const sceneName of ["quiet", "arriving", "hot", "live", "later"] as const) {
      const scene = buildTrafficPreviewScene(sceneName, NOW);
      const groups = buildPlaceStoryGroups(
        scene.data.places,
        new Set(),
        scene.data.stories,
        scene.nowMs,
      );
      for (const post of scene.data.posts) {
        assert.equal(typeof displayPostTime(post, scene.nowMs), "string");
        isRecentlyPosted(post, scene.nowMs);
      }
      for (const story of groups.flatMap((group) => group.stories)) {
        assert.equal(
          typeof formatStoryTime(story.minutesAgo, story.createdAt, "EN", scene.nowMs),
          "string",
        );
      }
    }
  } finally {
    Date.now = original;
  }
});

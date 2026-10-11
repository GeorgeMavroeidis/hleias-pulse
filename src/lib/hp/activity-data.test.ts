import assert from "node:assert/strict";
import test from "node:test";
import { buildActivityTicks } from "./activity-data";
import { buildTrafficPreviewScene } from "./traffic-preview";

const NOW = Date.parse("2026-10-05T12:00:00Z");
test("ticker uses actual identity, observation time and truthful gathering verb", () => {
  const scene = buildTrafficPreviewScene("arriving", NOW);
  const data = scene.data;
  const post = { ...data.posts[0], createdAt: new Date(NOW - 48 * 60_000).toISOString() };
  const ticks = buildActivityTicks(
    [post],
    new Map(data.places.map((place) => [place.id, place])),
    data.meetEvents,
    {
      nowMs: NOW,
      findAuthor: () => ({
        ...data.authors[0],
        name: "Named contributor",
        avatarUrl: "/real-avatar",
      }),
      stories: data.stories,
    },
  );
  const postTick = ticks.find((tick) => tick.id === `post-${post.id}`)!;
  assert.equal(postTick.who, "Named contributor");
  assert.equal(postTick.avatar, "/real-avatar");
  assert.equal(postTick.minutesAgo, 48);
  assert.equal(postTick.observedAt, post.createdAt);
  assert.equal(ticks.find((tick) => tick.id.startsWith("meet-"))?.verb, "announced a gathering");
  assert.ok(ticks.every((tick) => !tick.avatar.includes("pravatar")));
});

test("ticker excludes exact-hour, unknown, implausible future and pending records", () => {
  const data = buildTrafficPreviewScene("live", NOW).data;
  const post = data.posts[0];
  const posts = [
    { ...post, createdAt: new Date(NOW - 3_600_000).toISOString() },
    { ...post, id: "unknown", createdAt: null },
    { ...post, id: "future", createdAt: new Date(NOW + 300_001).toISOString() },
    { ...post, id: "pending", moderationStatus: "pending" },
  ];
  assert.deepEqual(
    buildActivityTicks(posts, new Map(data.places.map((place) => [place.id, place])), [], {
      nowMs: NOW,
    }),
    [],
  );
});

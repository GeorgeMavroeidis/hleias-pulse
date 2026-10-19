import assert from "node:assert/strict";
import test from "node:test";
import { buildTrafficPreviewScene } from "./traffic-preview";
import { buildPlaceStoryGroups } from "./place-stories";
import { isEventPast } from "./cultural-events-types";
import { RECYCLED_STORY_IDS } from "./freshness";
import {
  contentVisibleToViewer,
  fullParkingReport,
  isTonightMeet,
  meetPhase,
  observationLabel,
  postQualifiesTonight,
  storyHasCurrentReport,
  storyIsVisible,
  upcomingMeetForPlace,
} from "./surface-freshness";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const HOUR = 3_600_000;
const live = buildTrafficPreviewScene("live", NOW);
const story = {
  ...live.data.stories[0],
  createdAt: new Date(NOW).toISOString(),
  report: { parking: "full" as const },
  expiresAfterHours: 6,
};
const event = {
  ...live.data.meetEvents[0],
  happensAt: "2026-10-05T18:00:00Z",
  durationMin: 90,
  moderationStatus: "published",
};

test("Live and explicitly scoped full reports expire exactly at one hour, before story visibility", () => {
  assert.equal(storyHasCurrentReport(story, NOW + HOUR - 1), true);
  assert.equal(fullParkingReport([story], story.placeId, NOW + HOUR - 1)?.id, story.id);
  assert.equal(storyHasCurrentReport(story, NOW + HOUR), false);
  assert.equal(fullParkingReport([story], story.placeId, NOW + HOUR), null);
  assert.equal(storyIsVisible(story, NOW + HOUR), true);
  assert.equal(storyIsVisible(story, NOW + 6 * HOUR - 1), true);
  assert.equal(storyIsVisible(story, NOW + 6 * HOUR), false);
  const dayStory = { ...story, expiresAfterHours: 24 };
  assert.equal(storyIsVisible(dayStory, NOW + 24 * HOUR - 1), true);
  assert.equal(storyIsVisible(dayStory, NOW + 24 * HOUR), false);
  assert.equal(
    fullParkingReport(
      [
        story,
        {
          ...story,
          id: "new-report",
          createdAt: new Date(NOW + 1).toISOString(),
          report: { parking: "easy" },
        },
      ],
      story.placeId,
      NOW + 2,
    ),
    null,
  );
  assert.equal(storyHasCurrentReport({ ...story, moderationStatus: "pending" }, NOW), false);
});

test("all eleven recycled IDs remain visible only within expiry and cannot establish observation claims", () => {
  for (const id of RECYCLED_STORY_IDS) {
    const recycled = { ...story, id };
    assert.equal(storyHasCurrentReport(recycled, NOW), false, id);
    const group = buildPlaceStoryGroups(live.data.places, new Set(), [recycled], NOW)[0];
    assert.equal(group.live, false);
    assert.equal(group.stories[0].createdAt, undefined);
    assert.equal(group.stories[0].currentReport, false);
  }
  assert.equal(observationLabel(undefined, NOW, "EN").relative, "Observation time unknown");
  assert.equal(storyIsVisible({ ...story, createdAt: "bad" }, NOW), false);
});

test("Meet phase follows start and duration independently of announcement age", () => {
  const start = Date.parse(event.happensAt);
  const oldAnnouncement = { ...event, createdAt: "2020-01-01T00:00:00Z" };
  assert.equal(meetPhase(oldAnnouncement, start - 1), "upcoming");
  assert.equal(meetPhase(oldAnnouncement, start), "inProgress");
  assert.equal(meetPhase(oldAnnouncement, start + 90 * 60_000 - 1), "inProgress");
  assert.equal(meetPhase(oldAnnouncement, start + 90 * 60_000), "ended");
  assert.equal(meetPhase({ ...event, happensAt: "bad" }, NOW), "unknown");
  assert.equal(meetPhase({ ...event, durationMin: 0 }, NOW), "unknown");
  assert.equal(
    upcomingMeetForPlace(
      [
        { ...event, moderationStatus: "pending" },
        { ...event, id: "valid" },
      ],
      event.placeId,
      NOW,
    )?.id,
    "valid",
  );
});

test("Tonight needs recent published evidence and a future Athens evening gathering", () => {
  const post = {
    ...live.data.posts[0],
    placeId: event.placeId,
    createdAt: new Date(NOW).toISOString(),
    kind: "event" as const,
    time: "Tonight",
    tags: ["live", "night"],
  };
  assert.equal(isTonightMeet(event, NOW), true);
  assert.equal(postQualifiesTonight(post, [event], NOW + 3 * HOUR - 1), true);
  assert.equal(postQualifiesTonight(post, [event], NOW + 3 * HOUR), false);
  assert.equal(postQualifiesTonight({ ...post, moderationStatus: "pending" }, [event], NOW), false);
  for (const invalid of [
    { ...event, moderationStatus: "pending" },
    { ...event, happensAt: "2026-10-06T18:00:00Z" },
    { ...event, happensAt: "2026-10-05T13:00:00Z" },
    { ...event, happensAt: new Date(NOW).toISOString() },
  ]) {
    assert.equal(postQualifiesTonight(post, [invalid], NOW), false);
  }
  // Athens is already Monday while a UTC and US device still see Sunday.
  const midnight = Date.parse("2026-10-04T21:30:00Z");
  assert.equal(isTonightMeet({ ...event, happensAt: "2026-10-05T16:00:00Z" }, midnight), true);
  assert.equal(isTonightMeet({ ...event, happensAt: "2026-10-04T22:00:00Z" }, midnight), false);
});

test("Athens observations and evening qualification ignore device timezone through DST", () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ["America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
      process.env.TZ = timezone;
      assert.match(
        observationLabel("2026-10-25T01:30:00Z", Date.parse("2026-10-25T02:00:00Z"), "EN").exact!,
        /03:30.*Europe\/Athens/,
      );
      assert.equal(
        isTonightMeet(
          { ...event, happensAt: "2026-10-25T16:00:00Z" },
          Date.parse("2026-10-25T12:00:00Z"),
        ),
        true,
      );
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("every preview scene shares claim ages; the three-hour scene retains history and schedules", () => {
  for (const sceneName of ["quiet", "arriving", "hot", "live", "later"] as const) {
    const scene = buildTrafficPreviewScene(sceneName, NOW);
    const groups = buildPlaceStoryGroups(
      scene.data.places,
      new Set(),
      scene.data.stories,
      scene.nowMs,
    );
    if (sceneName === "later") {
      assert.equal(groups.length, 1);
      assert.equal(groups[0].live, false);
      assert.ok(groups[0].stories.every((item) => !item.currentReport));
      assert.equal(
        scene.data.posts.filter((post) =>
          postQualifiesTonight(post, scene.data.meetEvents, scene.nowMs),
        ).length,
        0,
      );
      assert.deepEqual(
        scene.data.meetEvents.map((item) => meetPhase(item, scene.nowMs)),
        ["inProgress", "inProgress", "upcoming"],
      );
    } else if (sceneName !== "quiet") assert.equal(groups[0].live, true);
  }
});

test("pending write acknowledgements are visible only to their owner and never current public evidence", () => {
  const pending = { ...story, moderationStatus: "pending", userId: "owner" };
  assert.equal(contentVisibleToViewer(pending, "owner"), true);
  assert.equal(contentVisibleToViewer(pending, "other"), false);
  assert.equal(contentVisibleToViewer(pending, null), false);
  assert.equal(storyHasCurrentReport(pending, NOW), false);
  for (const expiresAfterHours of [-1, NaN, Infinity])
    assert.equal(storyIsVisible({ ...story, expiresAfterHours }, NOW), false);
});

test("cultural event calendar-day grace uses the shared Athens clock across midnight", () => {
  const eventDate = "2026-10-04T18:00:00Z";
  const previous = process.env.TZ;
  try {
    for (const timezone of ["America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
      process.env.TZ = timezone;
      assert.equal(isEventPast({ eventDate }, Date.parse("2026-10-04T20:59:59.999Z")), false);
      assert.equal(isEventPast({ eventDate }, Date.parse("2026-10-04T21:00:00Z")), true);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

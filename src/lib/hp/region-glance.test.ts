import assert from "node:assert/strict";
import test from "node:test";
import {
  bestTimeBucket,
  daysSinceLastPost,
  eventsThisWeek,
  eventsToday,
  hasNewSince,
  iliaDayKey,
  regionBestTime,
} from "./region-glance";

// 2026-11-01 14:00 in Athens (UTC+2 in winter).
const NOW = Date.parse("2026-11-01T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

test("free-text best times map to a part of the day, or to nothing", () => {
  assert.equal(bestTimeBucket("morning"), "morning");
  assert.equal(bestTimeBucket("morning tour"), "morning");
  assert.equal(bestTimeBucket("late afternoon"), "afternoon");
  assert.equal(bestTimeBucket("sunset dinner"), "sunset");
  assert.equal(bestTimeBucket("golden hour"), "sunset");
  assert.equal(bestTimeBucket("summer evening"), "evening");
  assert.equal(bestTimeBucket("hot midday"), "midday");
  assert.equal(bestTimeBucket("early"), "morning");
  assert.equal(bestTimeBucket("20:00"), "evening");
  assert.equal(bestTimeBucket("22:00"), "night");
  assert.equal(bestTimeBucket("before ferry"), null);
  assert.equal(bestTimeBucket("spring or early autumn"), null);
  assert.equal(bestTimeBucket(""), null);
});

test("an area's best time needs more than half of its places to agree", () => {
  assert.equal(
    regionBestTime([{ bestTime: "sunset" }, { bestTime: "evening" }, { bestTime: "golden hour" }]),
    "sunset",
  );
  // Olympia: museums say midday, the site says late afternoon — no single answer.
  assert.equal(
    regionBestTime([
      { bestTime: "late afternoon" },
      { bestTime: "morning" },
      { bestTime: "hot midday" },
      { bestTime: "midday" },
    ]),
    null,
  );
  assert.equal(regionBestTime([{ bestTime: "evening" }, { bestTime: "morning" }]), null);
  assert.equal(regionBestTime([{ bestTime: "before ferry" }]), null);
  assert.equal(regionBestTime([]), null);
});

test("'today' is the Ilia calendar day, not the device's", () => {
  // 23:30 UTC on 1 Nov is already 2 Nov in Athens.
  assert.equal(iliaDayKey(Date.parse("2026-11-01T23:30:00Z")), "2026-11-02");
  const events = [
    { id: "tonight", date: "2026-11-01T19:00:00Z" },
    { id: "after-midnight-athens", date: "2026-11-01T22:30:00Z" },
    { id: "running", date: "2026-10-31T10:00:00Z", phase: "inProgress" as const },
    { id: "next-week", date: "2026-11-05T10:00:00Z" },
  ];
  assert.deepEqual(
    eventsToday(events, NOW).map((e) => e.id),
    ["tonight", "running"],
  );
  assert.deepEqual(
    eventsThisWeek(events, NOW).map((e) => e.id),
    ["tonight", "after-midnight-athens", "running", "next-week"],
  );
  assert.deepEqual(eventsThisWeek([{ date: new Date(NOW + 9 * DAY).toISOString() }], NOW), []);
});

test("days since the last post, and whether there is something new for a local", () => {
  assert.equal(daysSinceLastPost(null, NOW), null);
  assert.equal(daysSinceLastPost(new Date(NOW - 15 * DAY).toISOString(), NOW), 15);
  assert.equal(daysSinceLastPost(new Date(NOW + DAY).toISOString(), NOW), 0);
  assert.equal(hasNewSince(new Date(NOW - DAY).toISOString(), NOW - 2 * DAY), true);
  assert.equal(hasNewSince(new Date(NOW - 3 * DAY).toISOString(), NOW - 2 * DAY), false);
  // First visit ever: nothing is "new since last time" yet.
  assert.equal(hasNewSince(new Date(NOW - DAY).toISOString(), null), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateFreshness,
  fixedClock,
  FRESHNESS_LIMITS,
  RECYCLED_STORY_IDS,
  storyObservedAt,
} from "./freshness";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");

test("current, recent, and history windows have strict boundaries", () => {
  const observation = new Date(NOW).toISOString();
  const cases = [
    [0, "current", true, true],
    [FRESHNESS_LIMITS.currentMs - 1, "current", true, true],
    [FRESHNESS_LIMITS.currentMs, "recent", false, true],
    [FRESHNESS_LIMITS.recentMs - 1, "recent", false, true],
    [FRESHNESS_LIMITS.recentMs, "historical", false, false],
    [FRESHNESS_LIMITS.historicalMs - 1, "historical", false, false],
    [FRESHNESS_LIMITS.historicalMs, "stale", false, false],
  ] as const;
  for (const [ageMs, state, isCurrent, isRecent] of cases) {
    const result = evaluateFreshness({ observedAt: observation, nowMs: NOW + ageMs });
    assert.equal(result.state, state, `${ageMs}ms`);
    assert.equal(result.ageMs, ageMs);
    assert.equal(result.isCurrent, isCurrent);
    assert.equal(result.isRecent, isRecent);
    assert.equal(result.currentUntilMs, NOW + FRESHNESS_LIMITS.currentMs);
    assert.equal(result.recentUntilMs, NOW + FRESHNESS_LIMITS.recentMs);
  }
});

test("missing, invalid, and implausibly future evidence never establishes freshness", () => {
  for (const observedAt of [
    null,
    undefined,
    "",
    "invalid",
    NaN,
    Infinity,
    new Date(NaN),
    NOW + FRESHNESS_LIMITS.futureToleranceMs + 1,
  ]) {
    const result = evaluateFreshness({ observedAt, nowMs: NOW });
    assert.equal(result.state, "unknown");
    assert.equal(result.ageMs, null);
    assert.equal(result.isCurrent, false);
    assert.equal(result.isRecent, false);
  }
  assert.equal(evaluateFreshness({ observedAt: NOW, nowMs: NaN }).state, "unknown");
  assert.equal(
    evaluateFreshness({ observedAt: NOW, expiresAt: "bad", nowMs: NOW }).state,
    "unknown",
  );
  assert.equal(
    evaluateFreshness({ observedAt: NOW, expiresAt: NOW - 1, nowMs: NOW }).state,
    "unknown",
  );
  const tolerated = evaluateFreshness({
    observedAt: NOW + FRESHNESS_LIMITS.futureToleranceMs,
    nowMs: NOW,
  });
  assert.equal(tolerated.isCurrent, true);
  assert.equal(tolerated.ageMs, 0);
});

test("explicit expiry cuts off claims and keeps stale 24-hour stories distinct from expired stories", () => {
  const shortlyExpired = evaluateFreshness({
    observedAt: NOW,
    expiresAt: NOW + 30_000,
    nowMs: NOW + 30_000,
  });
  assert.equal(shortlyExpired.state, "expired");
  assert.equal(shortlyExpired.currentUntilMs, NOW + 30_000);
  assert.equal(shortlyExpired.recentUntilMs, NOW + 30_000);
  assert.equal(shortlyExpired.isCurrent, false);
  assert.equal(shortlyExpired.isRecent, false);

  for (const duration of [6, 24]) {
    const expiresAt = NOW + duration * 60 * 60_000;
    assert.notEqual(
      evaluateFreshness({ observedAt: NOW, expiresAt, nowMs: expiresAt - 1 }).state,
      "expired",
    );
    assert.equal(
      evaluateFreshness({ observedAt: NOW, expiresAt, nowMs: expiresAt }).state,
      "expired",
    );
  }
  assert.equal(
    evaluateFreshness({
      observedAt: NOW,
      expiresAt: NOW + 24 * 60 * 60_000,
      nowMs: NOW + 8 * 60 * 60_000,
    }).state,
    "stale",
  );
});

test("recycled seed stories have unknown observation times without dropping their content", () => {
  assert.equal(RECYCLED_STORY_IDS.size, 11);
  for (const id of RECYCLED_STORY_IDS) {
    const story = { id, createdAt: new Date(NOW).toISOString(), caption: "Preserved content" };
    assert.equal(storyObservedAt(story), null);
    assert.equal(story.caption, "Preserved content");
    assert.equal(story.createdAt, new Date(NOW).toISOString());
  }
  assert.equal(
    storyObservedAt({ id: "real-story", createdAt: "2026-10-05T12:00:00.000Z" }),
    "2026-10-05T12:00:00.000Z",
  );
});

test("fixed clocks are deterministic and do not read the machine clock", () => {
  const clock = fixedClock(NOW);
  assert.equal(clock.nowMs(), NOW);
  assert.equal(clock.nowMs(), NOW);
});

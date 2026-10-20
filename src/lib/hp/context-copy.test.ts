import assert from "node:assert/strict";
import test from "node:test";
import { communityActivityCopy, temporalHeadline } from "./context-copy";
import { FRESHNESS_LIMITS } from "./freshness";
import { deriveEvidencePulseSignal, type MarkerPulseSignal } from "./marker-pulse";
import type { ActivityEvidence } from "./activity-evidence";
import type { TemporalPresentation } from "./temporal-atmosphere";

const NOW = Date.parse("2026-10-05T15:00:00Z");
const signal: MarkerPulseSignal = {
  level: "lively",
  tier: "live",
  quality: "confirmed",
  lastSignalAt: new Date(NOW).toISOString(),
  score: 100,
  contributorCount: 4,
};
const atmosphere: TemporalPresentation = {
  period: "evening",
  headlineKey: "Tonight's pulse",
  paletteKey: "evening",
  basis: "solar",
};

test("an evening palette or solar period produces neutral time-of-day copy, never a Tonight recommendation", () => {
  for (const basis of ["solar", "clock-fallback"] as const) {
    assert.deepEqual(temporalHeadline({ ...atmosphere, basis }), {
      source: "temporal",
      key: "Evening in Ilia",
    });
  }
  assert.deepEqual(temporalHeadline({ ...atmosphere, basis: "unavailable" }), {
    source: "fallback",
    key: "Explore Ilia",
  });
  assert.deepEqual(temporalHeadline({ ...atmosphere, period: null }), {
    source: "fallback",
    key: "Explore Ilia",
  });
});

test("other temporal periods describe only the time of day, regardless of a legacy headline", () => {
  for (const [period, key] of [
    ["morning", "Morning in Ilia"],
    ["afternoon", "Afternoon in Ilia"],
    ["golden-hour", "Golden hour"],
    ["late-night", "Late night"],
  ] as const) {
    assert.equal(temporalHeadline({ ...atmosphere, period }).key, key);
  }
});

test("recent community copy expires at exactly three hours and cannot borrow confidence from an undated signal", () => {
  assert.equal(
    communityActivityCopy({ ...signal, tier: "hot" }, NOW + FRESHNESS_LIMITS.recentMs - 1)?.key,
    "Recent community activity: {level}",
  );
  assert.equal(communityActivityCopy(signal, NOW + FRESHNESS_LIMITS.recentMs), null);
  for (const lastSignalAt of [
    null,
    "bad",
    new Date(NOW + FRESHNESS_LIMITS.futureToleranceMs + 1).toISOString(),
  ]) {
    assert.equal(communityActivityCopy({ ...signal, lastSignalAt }, NOW), null);
  }
  assert.equal(communityActivityCopy({ ...signal, quality: "uncertain" }, NOW), null);
  assert.equal(communityActivityCopy({ ...signal, level: null }, NOW), null);
  assert.equal(communityActivityCopy({ ...signal, level: "fading" }, NOW), null);
  assert.equal(communityActivityCopy(signal, Number.NaN), null);
});

test("the explicit copy clock is independent of wall time and device timezone", () => {
  const previousNow = Date.now;
  const previousZone = process.env.TZ;
  try {
    Date.now = () => {
      throw new Error("Unexpected wall-clock read");
    };
    for (const timezone of ["Europe/Athens", "America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
      process.env.TZ = timezone;
      assert.equal(communityActivityCopy(signal, NOW)?.params?.level, "Live");
      assert.equal(temporalHeadline(atmosphere).key, "Evening in Ilia");
    }
  } finally {
    Date.now = previousNow;
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

test("canonical Hot stays Hot when a raw 98.99 score rounds to displayed 99", () => {
  const rawScore = 98.99;
  const totalWeight = -4 * Math.log(1 - rawScore / 100);
  const evidence: ActivityEvidence[] = (["post", "story", "comment"] as const).map(
    (kind, index) => ({
      kind,
      timestamp: NOW,
      contributorId: `person-${index}`,
      weight: totalWeight / 3,
    }),
  );
  const rounded = deriveEvidencePulseSignal(evidence, NOW);
  assert.equal(rounded.score, 99);
  assert.equal(rounded.tier, "hot");
  assert.equal(communityActivityCopy(rounded, NOW)?.params?.level, "Hot");
  // Even a contradictory presentation key cannot become the public activity tier.
  assert.equal(communityActivityCopy({ ...rounded, level: "lively" }, NOW)?.params?.level, "Hot");
  assert.doesNotMatch(JSON.stringify(communityActivityCopy(rounded, NOW)), /Lively|Live/);
  assert.equal(communityActivityCopy(rounded, NOW + FRESHNESS_LIMITS.recentMs), null);
});

test("all public activity names come from canonical tiers, independent of CSS anatomy", () => {
  for (const [tier, level] of [
    ["quiet", "Quiet"],
    ["moving", "Moving"],
    ["hot", "Hot"],
    ["live", "Live"],
  ] as const) {
    assert.equal(communityActivityCopy({ ...signal, tier }, NOW)?.params?.level, level);
  }
});

test("a stale Live snapshot cannot extend a current claim beyond the shared current window", () => {
  assert.equal(
    communityActivityCopy(signal, NOW + FRESHNESS_LIMITS.currentMs - 1)?.params?.level,
    "Live",
  );
  assert.equal(
    communityActivityCopy(signal, NOW + FRESHNESS_LIMITS.currentMs)?.params?.level,
    "Hot",
  );
  assert.equal(
    communityActivityCopy({ ...signal, tier: "hot" }, NOW + FRESHNESS_LIMITS.currentMs)?.params
      ?.level,
    "Hot",
  );
});

test("a contradictory retained Live tier cannot borrow missing confirmation", () => {
  for (const quality of ["stable", "fading"] as const) {
    assert.equal(communityActivityCopy({ ...signal, quality }, NOW)?.params?.level, "Hot");
  }
  assert.equal(communityActivityCopy({ ...signal, quality: "uncertain" }, NOW), null);
});

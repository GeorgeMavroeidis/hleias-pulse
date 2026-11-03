import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { getTimes } from "suncalc";
import { MAP_POLICY } from "./map-policy";
import {
  createTemporalResolver,
  getTemporalAtmosphere,
  type IliaSunlight,
} from "./temporal-atmosphere";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useTemporalAtmosphere } from "../../components/hp/use-temporal-atmosphere";

const at = Date.parse;
const fixture = createTemporalResolver(({ year, month, day }) => ({
  sunrise: Date.UTC(year, month - 1, day, 4, 30),
  goldenHour: Date.UTC(year, month - 1, day, 15, 30),
  sunset: Date.UTC(year, month - 1, day, 16, 15),
}));
const fallback = createTemporalResolver(() => {
  throw new Error("unavailable sunlight");
});

test("all five periods use inclusive starts, exclusive ends and deterministic headlines", () => {
  for (const [instant, period, headline] of [
    ["2026-10-03T05:00:00Z", "morning", "Morning in Ilia"],
    ["2026-10-03T12:00:00Z", "afternoon", "Afternoon in Ilia"],
    ["2026-10-03T16:00:00Z", "golden-hour", "Golden hour"],
    ["2026-10-03T18:00:00Z", "evening", "Evening in Ilia"],
    ["2026-10-03T21:00:00Z", "late-night", "Late night"],
  ]) {
    const result = fixture({ now: at(instant) });
    assert.equal(result.period, period);
    assert.equal(result.headlineKey, headline);
    assert.equal(result.basis, "solar");
    assert.ok(result.nextBoundaryAt! > at(instant));
  }
  for (const [instant, before, after] of [
    ["2026-10-03T04:30:00Z", "late-night", "morning"],
    ["2026-10-03T09:00:00Z", "morning", "afternoon"],
    ["2026-10-03T15:30:00Z", "afternoon", "golden-hour"],
    ["2026-10-03T16:15:00Z", "golden-hour", "evening"],
    ["2026-10-03T20:00:00Z", "evening", "late-night"],
  ]) {
    assert.equal(fixture({ now: at(instant) - 1 }).period, before);
    assert.equal(fixture({ now: at(instant) }).period, after);
  }
});

test("midnight and year rollover project the next boundary without inventing a new visible period", () => {
  const before = getTemporalAtmosphere({ now: at("2026-12-31T21:59:59.999Z") });
  const after = getTemporalAtmosphere({ now: at("2026-12-31T22:00:00Z") });
  assert.equal(before.period, "late-night");
  assert.equal(before.nextBoundaryAt, at("2026-12-31T22:00:00Z"));
  assert.equal(after.period, "late-night");
  assert.ok(after.nextBoundaryAt! > at("2027-01-01T00:00:00Z"));
});

test("real summer/winter solar windows move with the season and wrap the actual sunset", () => {
  for (const day of ["2026-06-21", "2026-12-21"]) {
    const times = getTimes(
      new Date(`${day}T12:00:00Z`),
      MAP_POLICY.center[1],
      MAP_POLICY.center[0],
    );
    const golden = times.goldenHour!.getTime(),
      sunset = times.sunset!.getTime(),
      sunrise = times.sunrise!.getTime();
    assert.equal(getTemporalAtmosphere({ now: golden - 1 }).period, "afternoon");
    assert.equal(getTemporalAtmosphere({ now: golden }).period, "golden-hour");
    assert.equal(getTemporalAtmosphere({ now: sunset }).period, "evening");
    assert.equal(getTemporalAtmosphere({ now: sunrise }).period, "morning");
    assert.ok(sunset - golden > 30 * 60_000 && sunset - golden < 60 * 60_000);
    assert.ok(sunset > at(`${day}T${day.includes("06") ? "17:45" : "15:00"}:00Z`));
    assert.ok(sunset < at(`${day}T${day.includes("06") ? "18:15" : "15:40"}:00Z`));
  }
});

test("Athens daylight-saving changes do not use fixed offsets or 24-hour civil days", () => {
  for (const [day, noonUtc, nightUtc] of [
    ["2026-03-28", 10, 21],
    ["2026-03-29", 9, 20],
    ["2026-10-24", 9, 20],
    ["2026-10-25", 10, 21],
  ] as const) {
    const noon = at(`${day}T${String(noonUtc).padStart(2, "0")}:00:00Z`);
    const night = at(`${day}T${nightUtc}:00:00Z`);
    assert.equal(fallback({ now: noon - 1 }).period, "morning");
    assert.equal(fallback({ now: noon }).period, "afternoon");
    assert.equal(fallback({ now: night }).period, "late-night");
  }
  assert.equal(
    fallback({ now: at("2026-03-28T22:00:00Z") }).nextBoundaryAt,
    at("2026-03-29T03:00:00Z"),
  );
  for (const instant of ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"])
    assert.equal(fallback({ now: at(instant) }).period, "late-night");
});

test("invalid clocks and failed/null/misordered sunlight have honest fallbacks", () => {
  for (const now of [NaN, Infinity, -Infinity, 8.64e15 + 1]) {
    const result = getTemporalAtmosphere({ now });
    assert.equal(result.headlineKey, "Explore Ilia");
    assert.equal(result.paletteKey, "day");
    assert.equal(result.nextBoundaryAt, null);
    assert.equal(result.basis, "unavailable");
  }
  for (const resolve of [
    fallback,
    createTemporalResolver(() => ({ sunrise: NaN, goldenHour: 0, sunset: 0 })),
    createTemporalResolver(() => null as unknown as IliaSunlight),
    createTemporalResolver(() => ({
      sunrise: at("2026-10-03T03:00:00Z"),
      goldenHour: at("2026-10-03T17:00:00Z"),
      sunset: at("2026-10-03T16:00:00Z"),
    })),
  ]) {
    for (const [hour, period] of [
      [4, "morning"],
      [10, "afternoon"],
      [15, "evening"],
      [20, "late-night"],
    ] as const) {
      const result = resolve({ now: Date.UTC(2026, 9, 3, hour) });
      assert.equal(result.basis, "clock-fallback");
      assert.equal(result.period, period);
      assert.notEqual(result.headlineKey, "Golden hour");
    }
  }
});

test("solar calculations cache by Athens date and stay bounded across clock jumps", () => {
  let calls = 0;
  const resolve = createTemporalResolver(() => {
    calls++;
    throw new Error("fixture");
  });
  for (let minute = 0; minute < 60; minute++) resolve({ now: Date.UTC(2026, 9, 3, 12, minute) });
  assert.equal(calls, 1);
  for (let day = 4; day <= 13; day++) resolve({ now: Date.UTC(2026, 9, day, 12) });
  resolve({ now: Date.UTC(2026, 9, 3, 12) });
  assert.equal(calls, 12, "oldest day was evicted, not an unbounded calendar cache");
});

test("resolver outputs match under UTC, Athens and America/Los_Angeles developer timezones", () => {
  const script = `import {getTemporalAtmosphere} from './src/lib/hp/temporal-atmosphere.ts'; console.log(JSON.stringify(['2026-03-29T01:30:00Z','2026-10-03T16:00:00Z','2026-12-31T22:00:00Z'].map(now=>getTemporalAtmosphere({now:Date.parse(now)}))));`;
  const run = (TZ: string) =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      cwd: new URL("../../..", import.meta.url),
      env: { ...process.env, TZ },
      encoding: "utf8",
    });
  assert.equal(run("UTC"), run("Europe/Athens"));
  assert.equal(run("UTC"), run("America/Los_Angeles"));
});

test("a fixed shared clock determines atmosphere without consulting the machine clock", () => {
  const sourceClock = Date.now;
  Date.now = () => {
    throw new Error("An independent production clock was consulted");
  };
  try {
    for (const instant of [
      "2026-06-21T17:50:00Z",
      "2026-10-03T18:00:00Z",
      "2026-12-31T22:00:00Z",
    ]) {
      const now = at(instant);
      const first = getTemporalAtmosphere({ now });
      assert.deepEqual(getTemporalAtmosphere({ now }), first);
      assert.ok(first.nextBoundaryAt! > now);
      assert.notEqual(first.headlineKey, "Tonight's pulse");
    }
  } finally {
    Date.now = sourceClock;
  }
});

test("the hook projects the supplied shared clock, including fixed preview and resume jumps", () => {
  function Probe({ nowMs }: { nowMs: number }) {
    return createElement("output", null, JSON.stringify(useTemporalAtmosphere(nowMs)));
  }
  const originalNow = Date.now;
  const originalTimeout = globalThis.setTimeout;
  const originalInterval = globalThis.setInterval;
  Date.now = () => {
    throw new Error("The hook sampled an independent clock");
  };
  globalThis.setTimeout = (() => {
    throw new Error("The hook scheduled an independent timer");
  }) as unknown as typeof setTimeout;
  globalThis.setInterval = (() => {
    throw new Error("The hook scheduled an independent interval");
  }) as unknown as typeof setInterval;
  try {
    for (const nowMs of [
      at("2026-10-03T05:00:00Z"),
      at("2026-10-03T18:00:00Z"),
      at("2026-10-03T21:00:00Z"),
      at("2026-10-03T05:00:00Z"),
      Number.NaN,
    ]) {
      const { nextBoundaryAt: _boundary, ...expected } = getTemporalAtmosphere({ now: nowMs });
      assert.equal(
        renderToStaticMarkup(createElement(Probe, { nowMs })),
        renderToStaticMarkup(createElement("output", null, JSON.stringify(expected))),
      );
    }
  } finally {
    Date.now = originalNow;
    globalThis.setTimeout = originalTimeout;
    globalThis.setInterval = originalInterval;
  }
});

test("palette period and neutral evening copy never establish live, full, or tonight evidence", () => {
  const evening = fixture({ now: at("2026-10-03T18:00:00Z") });
  assert.equal(evening.period, "evening");
  assert.equal(evening.headlineKey, "Evening in Ilia");
  assert.equal(evening.paletteKey, "evening");
  assert.doesNotMatch(evening.headlineKey, /live|full|tonight/i);
  assert.deepEqual(Object.keys(evening).sort(), [
    "basis",
    "headlineKey",
    "nextBoundaryAt",
    "paletteKey",
    "period",
  ]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { getTimes } from "suncalc";
import { MAP_POLICY } from "./map-policy";
import {
  createTemporalResolver,
  createTemporalAtmosphereClock,
  getTemporalAtmosphere,
  type IliaSunlight,
} from "./temporal-atmosphere";
import { temporalHeadline } from "./context-copy";

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
    ["2026-10-03T18:00:00Z", "evening", "Tonight's pulse"],
    ["2026-10-03T21:00:00Z", "late-night", "Late night"],
  ]) {
    const result = fixture({ now: at(instant) });
    assert.equal(result.period, period);
    assert.equal(result.headlineKey, headline);
    assert.equal(temporalHeadline(result).source, "temporal");
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

test("midnight and year rollover reschedule without inventing a new visible period", () => {
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
    assert.equal(temporalHeadline(result).source, "fallback");
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

test("boundary controller suspends/resumes, deduplicates, reschedules midnight and cleans up", () => {
  let instant = at("2026-10-03T08:59:00Z"),
    changes = 0,
    nextId = 0;
  const pending = new Map<ReturnType<typeof setTimeout>, { callback: () => void; delay: number }>();
  const clock = createTemporalAtmosphereClock({
    now: () => instant,
    resolve: fixture,
    schedule: (callback, delay) => {
      const id = ++nextId as unknown as ReturnType<typeof setTimeout>;
      pending.set(id, { callback, delay });
      return id;
    },
    cancel: (id) => {
      pending.delete(id);
    },
  });
  const unsubscribe = clock.subscribe(() => {
    changes++;
  });
  clock.setActive(true);
  assert.equal(pending.size, 1);
  assert.equal([...pending.values()][0].delay, 60_000);
  clock.refresh();
  assert.equal(changes, 0);
  instant += 60_000;
  [...pending.values()][0].callback();
  assert.equal(clock.getSnapshot().period, "afternoon");
  assert.equal(changes, 1);
  assert.equal(pending.size, 1);
  clock.setActive(false);
  instant = at("2026-10-03T20:30:00Z");
  clock.refresh();
  assert.equal(pending.size, 0);
  assert.equal(changes, 1);
  clock.setActive(true);
  assert.equal(clock.getSnapshot().period, "late-night");
  assert.equal([...pending.values()][0].delay, 30 * 60_000);
  instant = at("2026-10-03T21:00:00Z");
  [...pending.values()][0].callback();
  assert.equal(changes, 2, "midnight does not republish the same atmosphere");
  assert.equal([...pending.values()][0].delay, 7.5 * 3_600_000);
  instant = at("2026-10-03T20:30:00Z");
  clock.refresh();
  assert.equal(changes, 2, "backward clock jump reschedules without republishing");
  assert.equal([...pending.values()][0].delay, 30 * 60_000);
  unsubscribe();
  clock.setActive(false);
  assert.equal(pending.size, 0);
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

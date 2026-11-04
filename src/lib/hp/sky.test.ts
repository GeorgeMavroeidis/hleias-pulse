import assert from "node:assert/strict";
import test from "node:test";
import { formatCountdown, greetingForHour, iliaSky, iliaTime } from "./sky";

const at = (iso: string) => Date.parse(iso);
const fixedSun = (sunriseIso: string, sunsetIso: string) => () => ({
  sunrise: new Date(sunriseIso),
  sunset: new Date(sunsetIso),
});

test("greetings follow the Athens clock", () => {
  assert.equal(greetingForHour(6), "Good morning");
  assert.equal(greetingForHour(13), "Good afternoon");
  assert.equal(greetingForHour(19), "Good evening");
  assert.equal(greetingForHour(23), "Good night");
  assert.equal(greetingForHour(3), "Good night");
});

test("time is Ilia time, not the device's zone", () => {
  // 16:42 UTC in November is 18:42 in Athens (UTC+2).
  assert.equal(iliaTime(at("2026-11-04T16:42:00Z")), "18:42");
  // In July Athens is UTC+3.
  assert.equal(iliaTime(at("2026-07-04T16:42:00Z")), "19:42");
});

test("before sunset the header counts down to it; after, it points at sunrise", () => {
  const sun = fixedSun("2026-11-04T05:05:00Z", "2026-11-04T15:20:00Z");
  const afternoon = iliaSky(at("2026-11-04T14:42:00Z"), sun);
  assert.deepEqual(afternoon.sun && [afternoon.sun.kind, afternoon.sun.minutes], ["sunset", 38]);
  assert.equal(afternoon.greeting, "Good afternoon");

  const dawn = iliaSky(at("2026-11-04T04:00:00Z"), sun);
  assert.deepEqual(dawn.sun && [dawn.sun.kind, dawn.sun.minutes], ["sunrise", 65]);

  const night = iliaSky(at("2026-11-04T20:00:00Z"), (date) =>
    date.getTime() > at("2026-11-05T00:00:00Z")
      ? { sunrise: new Date("2026-11-05T05:06:00Z"), sunset: new Date("2026-11-05T15:19:00Z") }
      : sun(),
  );
  assert.equal(night.sun?.kind, "sunrise");
  assert.equal(night.greeting, "Good night");
});

test("real solar data for Ilia gives a plausible November sunset", () => {
  const sky = iliaSky(at("2026-11-04T12:00:00Z"));
  assert.equal(sky.sun?.kind, "sunset");
  const sunsetAthens = iliaTime(sky.sun!.at);
  assert.match(
    sunsetAthens,
    /^17:[0-4]\d$/,
    `Ilia sets around 17:2x in early November, got ${sunsetAthens}`,
  );
});

test("countdowns read naturally in both languages", () => {
  assert.equal(formatCountdown(38, "GR"), "38′");
  assert.equal(formatCountdown(38, "EN"), "38 min");
  assert.equal(formatCountdown(72, "GR"), "1 ώ 12′");
  assert.equal(formatCountdown(72, "EN"), "1h 12m");
  assert.equal(formatCountdown(120, "EN"), "2h");
});

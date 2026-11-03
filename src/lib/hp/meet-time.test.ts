import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultMeetDateTime,
  formatMeetDateTime,
  formatMeetWhen,
  MeetTimeError,
  meetDateTimeInput,
  parseMeetDateTimeInput,
  requireFutureMeetStart,
  type MeetTimeErrorCode,
} from "./meet-time";

function rejectsWith(code: MeetTimeErrorCode) {
  return (error: unknown) => error instanceof MeetTimeError && error.code === code;
}

test("Athens wall input and UTC round trip in summer and winter", () => {
  assert.equal(meetDateTimeInput("2026-10-08T16:30:00Z"), "2026-10-08T19:30");
  assert.equal(parseMeetDateTimeInput("2026-10-08T19:30"), "2026-10-08T16:30:00.000Z");
  assert.equal(meetDateTimeInput("2026-12-08T16:30:00Z"), "2026-12-08T18:30");
  assert.equal(parseMeetDateTimeInput("2026-12-08T18:30"), "2026-12-08T16:30:00.000Z");
});

test("reject invalid calendar values, DST gaps and ambiguous repeated hours", () => {
  for (const value of [
    "",
    "2026-02-30T12:00",
    "2026-10-08T24:00",
    "2026-10-08T12:60",
    "2026-10-08T12:30Z",
  ]) {
    assert.throws(() => parseMeetDateTimeInput(value), rejectsWith("invalid"));
  }
  assert.throws(() => parseMeetDateTimeInput("2026-03-29T03:30"), rejectsWith("nonexistent"));
  assert.throws(() => parseMeetDateTimeInput("2026-10-25T03:30"), rejectsWith("ambiguous"));
  assert.equal(parseMeetDateTimeInput("2026-03-29T04:00"), "2026-03-29T01:00:00.000Z");
  assert.equal(parseMeetDateTimeInput("2026-10-25T04:00"), "2026-10-25T02:00:00.000Z");
});

test("API rejects missing offsets, invalid inputs, and starts at or before now", () => {
  const now = Date.parse("2026-10-08T16:30:00Z");
  for (const value of ["2026-10-08T16:30:00Z", "2026-10-08T16:29:59Z"]) {
    assert.throws(() => requireFutureMeetStart(value, now), rejectsWith("past"));
  }
  for (const value of ["garbage", "2026-10-08T20:00"]) {
    assert.throws(() => requireFutureMeetStart(value, now), rejectsWith("invalid"));
  }
  assert.equal(
    requireFutureMeetStart("2026-10-08T19:30:00.001+03:00", now),
    "2026-10-08T16:30:00.001Z",
  );
});

test("default is at least three hours ahead and rounds seconds up to the next quarter", () => {
  assert.equal(defaultMeetDateTime(Date.parse("2026-10-08T16:00:00Z")), "2026-10-08T22:00");
  assert.equal(defaultMeetDateTime(Date.parse("2026-10-08T16:00:00.001Z")), "2026-10-08T22:15");
  assert.equal(defaultMeetDateTime(Date.parse("2026-10-08T18:59:59Z")), "2026-10-09T01:00");
  const now = Date.parse("2026-10-24T22:20:00Z");
  const value = defaultMeetDateTime(now);
  assert.equal(value, "2026-10-25T04:00");
  assert.ok(Date.parse(parseMeetDateTimeInput(value)) >= now + 3 * 60 * 60_000);
});

test("today and tomorrow are Athens dates even across midnight and daylight saving", () => {
  const now = Date.parse("2026-10-08T21:20:00Z");
  assert.equal(formatMeetWhen("2026-10-08T22:30:00Z", "EN", now), "Today · 01:30");
  assert.equal(formatMeetWhen("2026-10-09T22:30:00Z", "GR", now), "Αύριο · 01:30");
  assert.equal(
    formatMeetWhen("2026-03-29T21:30:00Z", "EN", Date.parse("2026-03-28T22:30:00Z")),
    "Tomorrow · 00:30",
  );
  assert.match(formatMeetDateTime("2026-10-08T16:30:00Z", "EN"), /19:30.*Europe\/Athens/);
});

test("conversion, defaults, and display ignore the device timezone", () => {
  const original = process.env.TZ;
  try {
    for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Tokyo", "Europe/Athens"]) {
      process.env.TZ = timezone;
      assert.equal(parseMeetDateTimeInput("2026-10-08T19:30"), "2026-10-08T16:30:00.000Z");
      assert.equal(defaultMeetDateTime(Date.parse("2026-10-08T16:00:01Z")), "2026-10-08T22:15");
      assert.equal(
        formatMeetWhen("2026-10-08T22:30:00Z", "EN", Date.parse("2026-10-08T21:00:00Z")),
        "Today · 01:30",
      );
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

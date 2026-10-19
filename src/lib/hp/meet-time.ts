/** Meet wall times always refer to Ilia, regardless of the device timezone. */
export const MEET_TIME_ZONE = "Europe/Athens";

const MINUTE_MS = 60_000;
const QUARTER_MS = 15 * MINUTE_MS;
const wallFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: MEET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type MeetTimeErrorCode = "invalid" | "nonexistent" | "ambiguous" | "past";

export class MeetTimeError extends Error {
  constructor(public readonly code: MeetTimeErrorCode) {
    super(`Invalid Meet start: ${code}`);
    this.name = "MeetTimeError";
  }
}

function validInstant(value: string | number) {
  const instant = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(instant)) throw new MeetTimeError("invalid");
  return instant;
}

/** Value for datetime-local; never derived with device-local Date setters. */
export function meetDateTimeInput(value: string | number): string {
  const parts = wallFormatter.formatToParts(validInstant(value));
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** Reject DST gaps and overlaps instead of silently choosing a different time. */
export function parseMeetDateTimeInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new MeetTimeError("invalid");
  const naive = Date.parse(`${value}:00.000Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 16) !== value) {
    throw new MeetTimeError("invalid");
  }

  // Sample both sides of any nearby Athens transition. Each possible offset
  // becomes a candidate, and only exact round trips are accepted.
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 12) {
    const sample = naive + hours * 60 * MINUTE_MS;
    offsets.add(Date.parse(`${meetDateTimeInput(sample)}:00.000Z`) - sample);
  }
  const candidates = Array.from(offsets)
    .map((offset) => naive - offset)
    .filter((instant) => meetDateTimeInput(instant) === value);
  if (candidates.length === 0) throw new MeetTimeError("nonexistent");
  if (candidates.length !== 1) throw new MeetTimeError("ambiguous");
  return new Date(candidates[0]).toISOString();
}

/** API input must identify an instant, not a device-local wall time. */
export function requireFutureMeetStart(value: string, nowMs = Date.now()): string {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i,
  );
  if (!match || Number(match[2] ?? 0) > 59) {
    throw new MeetTimeError("invalid");
  }
  const calendar = Date.parse(`${match[1]}:00.000Z`);
  if (!Number.isFinite(calendar) || new Date(calendar).toISOString().slice(0, 16) !== match[1]) {
    throw new MeetTimeError("invalid");
  }
  const instant = validInstant(value);
  if (!Number.isFinite(nowMs) || instant <= nowMs) throw new MeetTimeError("past");
  return new Date(instant).toISOString();
}

/** At least three hours ahead, rounded up to a usable Athens quarter hour. */
export function defaultMeetDateTime(nowMs = Date.now()): string {
  let instant = Math.ceil((validInstant(nowMs) + 3 * 60 * MINUTE_MS) / QUARTER_MS) * QUARTER_MS;
  for (let attempt = 0; attempt < 12; attempt += 1, instant += QUARTER_MS) {
    const value = meetDateTimeInput(instant);
    try {
      if (Date.parse(parseMeetDateTimeInput(value)) === instant) return value;
    } catch (error) {
      if (!(error instanceof MeetTimeError)) throw error;
    }
  }
  throw new MeetTimeError("invalid");
}

export function formatMeetWhen(iso: string, language: "GR" | "EN", nowMs = Date.now()): string {
  const instant = validInstant(iso);
  const day = meetDateTimeInput(instant).slice(0, 10);
  const today = meetDateTimeInput(nowMs).slice(0, 10);
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 24 * 60 * MINUTE_MS)
    .toISOString()
    .slice(0, 10);
  const time = meetDateTimeInput(instant).slice(11);
  if (day === today) return `${language === "GR" ? "Σήμερα" : "Today"} · ${time}`;
  if (day === tomorrow) return `${language === "GR" ? "Αύριο" : "Tomorrow"} · ${time}`;
  const date = new Intl.DateTimeFormat(language === "GR" ? "el-GR" : "en-GB", {
    timeZone: MEET_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(instant);
  return `${date} · ${time}`;
}

export function formatMeetDateTime(iso: string, language: "GR" | "EN"): string {
  return `${new Intl.DateTimeFormat(language === "GR" ? "el-GR" : "en-GB", {
    timeZone: MEET_TIME_ZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(validInstant(iso))} · ${MEET_TIME_ZONE}`;
}

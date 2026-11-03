// The "at a glance" line of a map region sheet: what's on today (or this week),
// the best time to go, and — for locals — whether the area has gone quiet.
// Pure functions; the sheet only renders what these return.

import type { Place } from "@/lib/hp-model";

const DAY_MS = 24 * 60 * 60 * 1000;
/** An area with no post for this long gets the local "post something" nudge. */
export const QUIET_AFTER_DAYS = 14;

export const TIME_BUCKETS = [
  "morning",
  "midday",
  "afternoon",
  "sunset",
  "evening",
  "night",
] as const;
export type TimeBucket = (typeof TIME_BUCKETS)[number];

/**
 * Places carry a free-text best time ("late afternoon", "sunset dinner", "21:00").
 * Map it to one part of the day, or null when the text names none ("before ferry").
 */
export function bestTimeBucket(bestTime: string): TimeBucket | null {
  const v = bestTime.trim().toLowerCase();
  if (!v) return null;
  const clock = /^(\d{1,2}):\d{2}/.exec(v);
  if (clock) {
    const hour = Number(clock[1]);
    if (hour < 11) return "morning";
    if (hour < 15) return "midday";
    if (hour < 18) return "afternoon";
    if (hour < 19) return "sunset";
    if (hour < 22) return "evening";
    return "night";
  }
  if (v.includes("sunset") || v.includes("golden hour")) return "sunset";
  if (v.includes("afternoon")) return "afternoon";
  if (v.includes("midday") || v.includes("noon")) return "midday";
  if (v.includes("morning") || v === "early") return "morning";
  if (v.includes("evening") || v.includes("dinner")) return "evening";
  if (v.includes("night")) return "night";
  return null;
}

/**
 * The part of the day that MORE THAN HALF of an area's places name, else null.
 * A plain "most votes" misleads: in Olympia the two museums say "midday" (it is
 * hot outside) while the site itself says "late afternoon" — no single answer.
 */
export function regionBestTime(places: Pick<Place, "bestTime">[]): TimeBucket | null {
  const counts = new Map<TimeBucket, number>();
  for (const place of places) {
    const bucket = bestTimeBucket(place.bestTime ?? "");
    if (bucket) counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  for (const bucket of TIME_BUCKETS) {
    if ((counts.get(bucket) ?? 0) * 2 > places.length) return bucket;
  }
  return null;
}

/** Calendar day in Ilia ("2026-11-01"), whatever the device's own time zone. */
export function iliaDayKey(ms: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

type DatedEvent = { date: string; phase?: "upcoming" | "inProgress" };

/** Events happening today in Ilia, including ones already under way. */
export function eventsToday<T extends DatedEvent>(events: T[], nowMs: number): T[] {
  const today = iliaDayKey(nowMs);
  return events.filter((event) => {
    if (event.phase === "inProgress") return true;
    const at = Date.parse(event.date);
    return Number.isFinite(at) && iliaDayKey(at) === today;
  });
}

/** Events from now until seven days ahead, including ones already under way. */
export function eventsThisWeek<T extends DatedEvent>(events: T[], nowMs: number): T[] {
  return events.filter((event) => {
    if (event.phase === "inProgress") return true;
    const at = Date.parse(event.date);
    return Number.isFinite(at) && at >= nowMs - DAY_MS / 2 && at <= nowMs + 7 * DAY_MS;
  });
}

/**
 * Whole days since anyone last posted in an area, or null when nobody ever has.
 * A future or unreadable timestamp counts as "just now", never as quiet.
 */
export function daysSinceLastPost(lastSignalAt: string | null, nowMs: number): number | null {
  if (!lastSignalAt) return null;
  const at = Date.parse(lastSignalAt);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.floor((nowMs - at) / DAY_MS));
}

/** For locals: has anyone posted here since they last opened this area? */
export function hasNewSince(lastSignalAt: string | null, lastSeenMs: number | null): boolean {
  if (!lastSignalAt || lastSeenMs === null) return false;
  const at = Date.parse(lastSignalAt);
  return Number.isFinite(at) && at > lastSeenMs;
}

// When a local last opened each area — device-only, like the trip plan. Storage
// can throw (private mode, blocked site data); then "what's new" simply stays off.
const SEEN_KEY = "hp.region-seen.v1";

function readSeen(): Record<string, number> {
  try {
    const value = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "{}") as unknown;
    return value && typeof value === "object" ? (value as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function lastSeenRegion(regionId: string): number | null {
  const at = readSeen()[regionId];
  return typeof at === "number" && Number.isFinite(at) ? at : null;
}

export function markRegionSeen(regionId: string, nowMs: number) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), [regionId]: nowMs }));
  } catch {
    // keep going without memory
  }
}

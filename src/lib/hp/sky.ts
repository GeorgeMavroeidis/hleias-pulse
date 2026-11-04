import { getTimes } from "suncalc";
import { MAP_POLICY } from "./map-policy";
import { ILIA_TIME_ZONE } from "./temporal-atmosphere";

/**
 * The living header line: what the light is doing in Ilia right now.
 * Always Athens time — a visitor's phone may still be on another zone.
 */

export type SkyGreeting = "Good morning" | "Good afternoon" | "Good evening" | "Good night";

export type IliaSky = {
  greeting: SkyGreeting;
  /** Local Ilia time, "19:42". */
  time: string;
  /** The next sun event worth knowing: today's sunset, else the next sunrise. */
  sun: { kind: "sunset" | "sunrise"; at: number; minutes: number } | null;
};

const hourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: ILIA_TIME_ZONE,
  hour: "numeric",
  hourCycle: "h23",
});
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: ILIA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function greetingForHour(hour: number): SkyGreeting {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
}

export function iliaTime(at: number) {
  return timeFormatter.format(at);
}

type SunTimes = (
  date: Date,
  lat: number,
  lng: number,
) => { sunrise?: Date | null; sunset?: Date | null };

export function iliaSky(nowMs: number, sunTimes: SunTimes = getTimes): IliaSky {
  if (!Number.isFinite(nowMs)) return { greeting: "Good evening", time: "", sun: null };
  const hour = Number(hourFormatter.format(nowMs));
  const [lng, lat] = MAP_POLICY.center;
  const today = sunTimes(new Date(nowMs), lat, lng);
  const sunrise = today.sunrise?.getTime() ?? Number.NaN;
  const sunset = today.sunset?.getTime() ?? Number.NaN;
  let sun: IliaSky["sun"] = null;
  if (Number.isFinite(sunrise) && nowMs < sunrise) {
    sun = { kind: "sunrise", at: sunrise, minutes: Math.ceil((sunrise - nowMs) / 60_000) };
  } else if (Number.isFinite(sunset) && nowMs < sunset) {
    sun = { kind: "sunset", at: sunset, minutes: Math.ceil((sunset - nowMs) / 60_000) };
  } else {
    const tomorrow = sunTimes(new Date(nowMs + 24 * 60 * 60 * 1000), lat, lng).sunrise?.getTime();
    if (tomorrow && Number.isFinite(tomorrow)) {
      sun = { kind: "sunrise", at: tomorrow, minutes: Math.ceil((tomorrow - nowMs) / 60_000) };
    }
  }
  return { greeting: greetingForHour(hour), time: iliaTime(nowMs), sun };
}

/** "38′", "1 ώ 12′" / "1h 12m" — short enough for a header line. */
export function formatCountdown(minutes: number, language: "GR" | "EN") {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return language === "GR" ? `${safe}′` : `${safe} min`;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (language === "GR") return rest ? `${hours} ώ ${rest}′` : `${hours} ώ`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

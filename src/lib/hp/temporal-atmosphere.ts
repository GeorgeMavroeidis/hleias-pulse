import { HP_MOTION } from "./motion";
import { getTimes } from "suncalc";
import { MAP_POLICY } from "./map-policy";

export const ILIA_TIME_ZONE = "Europe/Athens";
export const ATMOSPHERE_TRANSITION_MS = HP_MOTION.atmosphere;
export type TemporalPeriod = "morning" | "afternoon" | "golden-hour" | "evening" | "late-night";
export type AtmospherePaletteKey = "day" | "golden-hour" | "evening" | "late-night";
export type TemporalAtmosphere = {
  period: TemporalPeriod | null;
  headlineKey: string;
  paletteKey: AtmospherePaletteKey;
  basis: "solar" | "clock-fallback" | "unavailable";
  nextBoundaryAt: number | null;
};
export type TemporalPresentation = Omit<TemporalAtmosphere, "nextBoundaryAt">;
type CivilDate = { year: number; month: number; day: number };
export type IliaSunlight = { sunrise: number; goldenHour: number; sunset: number };
const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: ILIA_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});
const HEADLINES: Record<TemporalPeriod, string> = {
  morning: "Morning in Ilia",
  afternoon: "Afternoon in Ilia",
  "golden-hour": "Golden hour",
  evening: "Tonight's pulse",
  "late-night": "Late night",
};
const UNAVAILABLE: TemporalAtmosphere = {
  period: null,
  headlineKey: "Explore Ilia",
  paletteKey: "day",
  basis: "unavailable",
  nextBoundaryAt: null,
};

function civilParts(at: number) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(at).map((part) => [part.type, Number(part.value)]),
  );
  return parts as CivilDate & { hour: number; minute: number; second: number };
}
function followingDay(date: CivilDate): CivilDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1, 12));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}
/** Only unambiguous civil hours (00, 06, 12, 18, 23), never the DST overlap/gap. */
function civilHourAt(date: CivilDate, hour: number) {
  const target = Date.UTC(date.year, date.month - 1, date.day, hour);
  let instant = target;
  for (let step = 0; step < 3; step++) {
    const p = civilParts(instant);
    instant += target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return instant;
}
function sunlightForDay(date: CivilDate): IliaSunlight {
  // Noon UTC lies in this Athens civil/solar day in both winter and summer.
  const times = getTimes(
    new Date(Date.UTC(date.year, date.month - 1, date.day, 12)),
    MAP_POLICY.center[1],
    MAP_POLICY.center[0],
  );
  return {
    sunrise: times.sunrise?.getTime() ?? NaN,
    goldenHour: times.goldenHour?.getTime() ?? NaN,
    sunset: times.sunset?.getTime() ?? NaN,
  };
}

/** Isolated calculation seam; tests can exercise failure without changing the real clock. */
export function createTemporalResolver(calculateSunlight = sunlightForDay) {
  const cache = new Map<string, IliaSunlight | null>();
  return ({ now }: { now: number }): TemporalAtmosphere => {
    if (!Number.isFinite(now) || Math.abs(now) > 8.64e15) return UNAVAILABLE;
    try {
      const date = civilParts(now);
      const key = `${date.year}-${date.month}-${date.day}`;
      const noon = civilHourAt(date, 12);
      const late = civilHourAt(date, 23);
      const midnight = civilHourAt(followingDay(date), 0);
      if (!cache.has(key)) {
        let solar: IliaSunlight | null = null;
        try {
          const result = calculateSunlight(date);
          if (
            [result.sunrise, result.goldenHour, result.sunset].every(Number.isFinite) &&
            result.sunrise > civilHourAt(date, 0) &&
            result.sunrise < noon &&
            noon < result.goldenHour &&
            result.goldenHour < result.sunset &&
            result.sunset < late
          )
            solar = result;
        } catch {
          // A calculation failure never becomes a fabricated sunlight claim.
        }
        cache.set(key, solar);
        if (cache.size > 8) cache.delete(cache.keys().next().value!);
      }
      const solar = cache.get(key);
      const boundaries: { at: number; period: TemporalPeriod }[] = solar
        ? [
            { at: solar.sunrise, period: "morning" },
            { at: noon, period: "afternoon" },
            { at: solar.goldenHour, period: "golden-hour" },
            { at: solar.sunset, period: "evening" },
            { at: late, period: "late-night" },
          ]
        : [
            { at: civilHourAt(date, 6), period: "morning" },
            { at: noon, period: "afternoon" },
            { at: civilHourAt(date, 18), period: "evening" },
            { at: late, period: "late-night" },
          ];
      const period =
        [...boundaries].reverse().find((boundary) => now >= boundary.at)?.period ?? "late-night";
      return {
        period,
        headlineKey: HEADLINES[period],
        paletteKey: period === "morning" || period === "afternoon" ? "day" : period,
        basis: solar ? "solar" : "clock-fallback",
        nextBoundaryAt: boundaries.find((boundary) => boundary.at > now)?.at ?? midnight,
      };
    } catch {
      return UNAVAILABLE;
    }
  };
}
export const getTemporalAtmosphere = createTemporalResolver();

/** One boundary timer. Existing app clock notifications can call refresh after clock jumps. */
export function createTemporalAtmosphereClock({
  now = Date.now,
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancel = (handle) => globalThis.clearTimeout(handle),
  resolve = getTemporalAtmosphere,
}: {
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (handle: ReturnType<typeof setTimeout>) => void;
  resolve?: typeof getTemporalAtmosphere;
} = {}) {
  let active = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const presentation = (result: TemporalAtmosphere): TemporalPresentation => {
    const { nextBoundaryAt: _boundary, ...visible } = result;
    return visible;
  };
  let snapshot = presentation(resolve({ now: now() }));
  const clear = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const refresh = () => {
    if (!active) return;
    clear();
    const instant = now();
    const result = resolve({ now: instant });
    const next = presentation(result);
    if (JSON.stringify(next) !== JSON.stringify(snapshot)) {
      snapshot = next;
      listeners.forEach((listener) => listener());
    }
    if (result.nextBoundaryAt !== null)
      timer = schedule(
        refresh,
        Math.max(1, Math.min(2_147_483_647, result.nextBoundaryAt - instant)),
      );
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    setActive: (enabled: boolean) => {
      active = enabled;
      clear();
      if (enabled) refresh();
    },
  };
}

// Trip planner ("plan my N days") — pure logic, no React, no network.
// Plan: docs/TOURIST_STAY_PACK.md → "Trip builder".
//
// v1 lives on the device only (localStorage, see loadPlan/savePlan). That is a
// deliberate experiment: find out whether people enjoy planning this way
// before designing tables for it. Consequences worth knowing:
//   - a plan does not follow the user to another phone or browser;
//   - clearing site data deletes it;
//   - nothing about where someone plans to be is sent anywhere (a plus for
//     privacy — trips reveal where a person will be on which day).

import type { Place, RouteItem } from "@/lib/hp-model";
import { TYPICAL_VISIT } from "./summaries";

export const MIN_DAYS = 1;
export const MAX_DAYS = 14;
/** Above this many planned hours a day is flagged as too full. */
export const FULL_DAY_HOURS = 8;
export const STORAGE_KEY = "hp.trip-plan.v1";

export type TripItem = { kind: "place" | "route"; id: string; day: number };

export type TripPlan = {
  version: 1;
  days: number;
  items: TripItem[];
  /** Ids the user skipped in the card deck, so they are not shown again. */
  skipped: string[];
  createdAt: string;
};

export function clampDays(days: number) {
  if (!Number.isFinite(days)) return MIN_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(days)));
}

export function createPlan(days: number, now: Date = new Date()): TripPlan {
  return {
    version: 1,
    days: clampDays(days),
    items: [],
    skipped: [],
    createdAt: now.toISOString(),
  };
}

const itemKey = (item: Pick<TripItem, "kind" | "id">) => `${item.kind}:${item.id}`;

export function hasItem(plan: TripPlan, kind: TripItem["kind"], id: string) {
  return plan.items.some((item) => item.kind === kind && item.id === id);
}

/** Adds an item to a day. Adding something already planned moves it instead of duplicating. */
export function addItem(plan: TripPlan, item: TripItem): TripPlan {
  const day = Math.min(plan.days, Math.max(1, item.day));
  const rest = plan.items.filter((existing) => itemKey(existing) !== itemKey(item));
  return { ...plan, items: [...rest, { ...item, day }] };
}

export function removeItem(plan: TripPlan, kind: TripItem["kind"], id: string): TripPlan {
  return { ...plan, items: plan.items.filter((item) => !(item.kind === kind && item.id === id)) };
}

export function moveItem(
  plan: TripPlan,
  kind: TripItem["kind"],
  id: string,
  day: number,
): TripPlan {
  return addItem(plan, { kind, id, day });
}

/** Bring back every card the visitor skipped, so the deck is never a dead end. */
export function resetSkipped(plan: TripPlan): TripPlan {
  return plan.skipped.length === 0 ? plan : { ...plan, skipped: [] };
}

export function skip(plan: TripPlan, id: string): TripPlan {
  return plan.skipped.includes(id) ? plan : { ...plan, skipped: [...plan.skipped, id] };
}

/** Change the trip length. Items on days that no longer exist move to the last day. */
export function setDays(plan: TripPlan, days: number): TripPlan {
  const next = clampDays(days);
  return {
    ...plan,
    days: next,
    items: plan.items.map((item) => (item.day > next ? { ...item, day: next } : item)),
  };
}

/** Planning hours for a route's free-text duration ("5h", "half day", "1 day"). */
export function routeHours(duration: string): number {
  const v = duration.trim().toLowerCase();
  if (v.includes("half")) return 4;
  if (v.includes("day")) return FULL_DAY_HOURS;
  const hours = /(\d+(?:\.\d+)?)\s*h/.exec(v);
  if (hours) return Number(hours[1]);
  return 3;
}

/** Upper-bound planning hours for one item (we plan for the long end of the estimate). */
export function itemHours(
  item: Pick<TripItem, "kind" | "id">,
  findPlace: (id: string) => Place | undefined,
  findRoute: (id: string) => RouteItem | undefined,
): number {
  if (item.kind === "route") {
    const route = findRoute(item.id);
    return route ? routeHours(route.duration) : 0;
  }
  const place = findPlace(item.id);
  return place ? TYPICAL_VISIT[place.type].max : 0;
}

export function dayItems(plan: TripPlan, day: number) {
  return plan.items.filter((item) => item.day === day);
}

export function dayHours(
  plan: TripPlan,
  day: number,
  findPlace: (id: string) => Place | undefined,
  findRoute: (id: string) => RouteItem | undefined,
) {
  return dayItems(plan, day).reduce((sum, item) => sum + itemHours(item, findPlace, findRoute), 0);
}

/** The day a new pick should go to: the emptiest one, earliest on ties. */
export function suggestDay(
  plan: TripPlan,
  findPlace: (id: string) => Place | undefined,
  findRoute: (id: string) => RouteItem | undefined,
) {
  let best = 1;
  let bestHours = Infinity;
  for (let day = 1; day <= plan.days; day++) {
    const hours = dayHours(plan, day, findPlace, findRoute);
    if (hours < bestHours) {
      best = day;
      bestHours = hours;
    }
  }
  return best;
}

/** Days with at least one thing planned — drives the progress bar. */
export function plannedDayCount(plan: TripPlan) {
  return new Set(plan.items.map((item) => item.day)).size;
}

/**
 * The swipe deck: places not yet planned or skipped, liveliest first. Places on
 * a planned route still appear — a stop can be worth a second, separate visit.
 */
export function deck(plan: TripPlan, places: Place[]): Place[] {
  return places
    .filter((place) => !hasItem(plan, "place", place.id) && !plan.skipped.includes(place.id))
    .sort((a, b) => b.hotness - a.hotness || a.name.localeCompare(b.name));
}

/** Validates whatever came out of storage; anything unexpected → null (start fresh). */
export function parsePlan(raw: string | null): TripPlan | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TripPlan>;
    if (value.version !== 1 || typeof value.days !== "number" || !Array.isArray(value.items)) {
      return null;
    }
    const days = clampDays(value.days);
    const items = value.items
      .filter(
        (item): item is TripItem =>
          !!item &&
          (item.kind === "place" || item.kind === "route") &&
          typeof item.id === "string" &&
          typeof item.day === "number",
      )
      .map((item) => ({ ...item, day: Math.min(days, Math.max(1, Math.round(item.day))) }));
    const skipped = Array.isArray(value.skipped)
      ? value.skipped.filter((id): id is string => typeof id === "string")
      : [];
    return {
      version: 1,
      days,
      items,
      skipped,
      createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// Storage can throw (private mode, blocked site data) — the planner must keep
// working in memory when it does.
export function loadPlan(): TripPlan | null {
  try {
    return parsePlan(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function savePlan(plan: TripPlan | null) {
  try {
    if (plan) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // keep going in memory
  }
}

// "Near me": how far is each place from where the visitor is (or says they are
// staying), and in what order to show them. Pure functions + a tiny in-memory
// store, no network.
//
// Why: the region is spread out (a random pair of our places is ~31 km apart and
// the farthest are ~87 km), so a day built from arbitrary picks is not a real
// day. Distance has to be visible and sortable first.
//
// Privacy: the visitor's position is read once, when they tap the button. It is
// kept in memory only (never written to storage, never sent anywhere) and is
// rounded to ~100 m, which is plenty for "what is close". Only the *base* they
// choose ("I'm staying in Katakolo") is remembered, and that is a place name,
// not a coordinate of the person.

import { useSyncExternalStore } from "react";
import type { Place } from "@/lib/hp-model";
import { distanceKm } from "./place-defaults";

export type Lang = "GR" | "EN";

export type NearOrigin = {
  lat: number;
  lng: number;
  source: "gps" | "base";
  label: string;
  /** Set when the origin is one of the stay bases. */
  baseId?: string;
};

/** Straight-line km → likely road km. Rural Ilia is winding; 1.4 is a fair planning figure. */
export const ROAD_FACTOR = 1.4;
/** Average speed on these roads, km/h. A planning estimate, not routing. */
export const AVG_KMH = 45;

/** Estimated driving minutes for a straight-line distance, rounded to 5. */
export function driveMinutes(straightKm: number): number {
  if (!Number.isFinite(straightKm) || straightKm < 0) return 0;
  const minutes = ((straightKm * ROAD_FACTOR) / AVG_KMH) * 60;
  return Math.max(5, Math.round(minutes / 5) * 5);
}

/** Places a visitor is likely to be staying. Coordinates come from our own places. */
export type StayBase = { id: string; placeId: string; name: { GR: string; EN: string } };

export const STAY_BASES: StayBase[] = [
  { id: "katakolo", placeId: "katakolo-port", name: { GR: "Κατάκολο", EN: "Katakolo" } },
  { id: "pyrgos", placeId: "pyrgos-centre", name: { GR: "Πύργος", EN: "Pyrgos" } },
  { id: "olympia", placeId: "ancient-olympia", name: { GR: "Αρχαία Ολυμπία", EN: "Olympia" } },
  { id: "kourouta", placeId: "kourouta-beach", name: { GR: "Κουρούτα", EN: "Kourouta" } },
  { id: "amaliada", placeId: "amaliada-square", name: { GR: "Αμαλιάδα", EN: "Amaliada" } },
  { id: "kyllini", placeId: "kyllini-harbor", name: { GR: "Κυλλήνη", EN: "Kyllini" } },
  { id: "zacharo", placeId: "zacharo-beach", name: { GR: "Ζαχάρω", EN: "Zacharo" } },
];

/** The origin for a stay base, or null if that base's place is not in the data. */
export function baseOrigin(baseId: string, places: Place[], lang: Lang): NearOrigin | null {
  const base = STAY_BASES.find((b) => b.id === baseId);
  const place = base && places.find((p) => p.id === base.placeId);
  if (!base || !place) return null;
  return { lat: place.lat, lng: place.lng, source: "base", label: base.name[lang], baseId };
}

export type PlaceDistance = { place: Place; km: number; minutes: number };

/** Every place with its distance from `origin`, nearest first. */
export function withDistance(places: Place[], origin: NearOrigin): PlaceDistance[] {
  return places
    .map((place) => {
      const km = distanceKm(origin.lat, origin.lng, place.lat, place.lng);
      return { place, km, minutes: driveMinutes(km) };
    })
    .sort((a, b) => a.km - b.km);
}

/** "12 χλμ · ~20′" — under 1 km it says "κοντά"/"nearby" instead of a fake-precise number. */
export function distanceLabel(km: number, minutes: number, lang: Lang): string {
  if (km < 1) return lang === "GR" ? "Πολύ κοντά" : "Very close";
  const distance = km < 10 ? km.toFixed(1).replace(/\.0$/, "") : String(Math.round(km));
  const unit = lang === "GR" ? "χλμ" : "km";
  return `${distance} ${unit} · ~${minutes}′`;
}

// ───────────────────────── tiny shared store ─────────────────────────
// Both the Quick look and the trip deck read the same origin, so choosing it in
// one place applies in the other.

let current: NearOrigin | null = null;
const listeners = new Set<() => void>();

export function getOrigin() {
  return current;
}

export function setOrigin(origin: NearOrigin | null) {
  current = origin;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNearOrigin() {
  return useSyncExternalStore(subscribe, getOrigin, getOrigin);
}

const BASE_KEY = "hp.stay-base.v1";

/** The remembered stay base id, if any (a place name — not the visitor's coordinates). */
export function loadBaseId(): string | null {
  try {
    const value = window.localStorage.getItem(BASE_KEY);
    return STAY_BASES.some((b) => b.id === value) ? value : null;
  } catch {
    return null;
  }
}

export function saveBaseId(baseId: string | null) {
  try {
    if (baseId) window.localStorage.setItem(BASE_KEY, baseId);
    else window.localStorage.removeItem(BASE_KEY);
  } catch {
    // keep working in memory
  }
}

/** The browser location APIs we use; tests pass a stub. */
type LocationApis = {
  geolocation?: Pick<Geolocation, "getCurrentPosition">;
  permissions?: Pick<Permissions, "query">;
};

const browserLocation = (): LocationApis | undefined =>
  typeof navigator === "undefined" ? undefined : navigator;

/** A GPS position as an origin, rounded to ~100 m: plenty for "what is close". */
export function gpsOrigin(latitude: number, longitude: number, lang: Lang): NearOrigin {
  return {
    lat: Number(latitude.toFixed(3)),
    lng: Number(longitude.toFixed(3)),
    source: "gps",
    label: lang === "GR" ? "Η τοποθεσία μου" : "My location",
  };
}

/** One-time GPS read. Position is rounded to ~100 m and kept in memory only. */
export function readGps(
  lang: Lang,
  nav: LocationApis | undefined = browserLocation(),
): Promise<NearOrigin> {
  return new Promise((resolve, reject) => {
    if (!nav?.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    nav.geolocation.getCurrentPosition(
      (pos) => resolve(gpsOrigin(pos.coords.latitude, pos.coords.longitude, lang)),
      (error) => reject(error),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

/**
 * The visitor's position, but only if they already allowed this site to know it.
 * Never shows a permission prompt: a first open shows all of Ilia, and the locate
 * button is where the app asks. Same rounding and memory-only rule as `readGps`.
 */
export async function readGpsIfAllowed(
  lang: Lang,
  nav: LocationApis | undefined = browserLocation(),
): Promise<NearOrigin | null> {
  try {
    const status = await nav?.permissions?.query({ name: "geolocation" });
    if (status?.state !== "granted") return null;
    return await readGps(lang, nav);
  } catch {
    return null;
  }
}

/** True within `km` of at least one of our places: somewhere the map has something to show. */
export function isNearAnyPlace(
  origin: Pick<NearOrigin, "lat" | "lng">,
  places: readonly Pick<Place, "lat" | "lng">[],
  km = 25,
): boolean {
  return places.some((place) => distanceKm(origin.lat, origin.lng, place.lat, place.lng) <= km);
}

/**
 * `items` nearest first. Items without a location follow, in their original order;
 * without an origin nothing moves.
 */
export function byDistance<T>(
  items: readonly T[],
  locate: (item: T) => Pick<Place, "lat" | "lng"> | undefined,
  origin: Pick<NearOrigin, "lat" | "lng"> | null,
): T[] {
  if (!origin) return [...items];
  return items
    .map((item, index) => {
      const point = locate(item);
      const km = point
        ? distanceKm(origin.lat, origin.lng, point.lat, point.lng)
        : Number.POSITIVE_INFINITY;
      return { item, index, km };
    })
    .sort((a, b) => (a.km === b.km ? a.index - b.index : a.km - b.km))
    .map(({ item }) => item);
}

/**
 * A box centred on the visitor holding their `count` nearest places, so opening "near
 * you" shows what is around them: closer in a busy town, wider in the countryside.
 */
export function nearbyBounds(
  origin: Pick<NearOrigin, "lat" | "lng">,
  places: readonly Pick<Place, "lat" | "lng">[],
  count = 5,
): [[number, number], [number, number]] | null {
  const nearest = byDistance(places, (place) => place, origin).slice(0, count);
  if (!nearest.length) return null;
  const dLng = Math.max(...nearest.map((place) => Math.abs(place.lng - origin.lng)));
  const dLat = Math.max(...nearest.map((place) => Math.abs(place.lat - origin.lat)));
  return [
    [origin.lng - dLng, origin.lat - dLat],
    [origin.lng + dLng, origin.lat + dLat],
  ];
}

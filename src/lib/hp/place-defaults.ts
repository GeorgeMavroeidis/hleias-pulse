// Defaults for the "add a place" form, so a visitor or local does not have to
// type an area name or find a photo URL. Pure functions, no network.
//
// Why: the old form required latitude, longitude, an area and an image URL —
// things an ordinary person cannot supply. We derive what we can from the
// places we already have; the new place still lands in moderation
// (moderation_status = 'pending') before anyone else sees it.

import type { Place, PlaceType } from "@/lib/hp-model";

const EARTH_KM = 6371;

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Closest existing place, or null when there are no places / coordinates are not numbers. */
export function nearestPlace(lat: number, lng: number, places: Place[]): Place | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best: Place | null = null;
  let bestKm = Infinity;
  for (const place of places) {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue;
    const km = distanceKm(lat, lng, place.lat, place.lng);
    if (km < bestKm) {
      best = place;
      bestKm = km;
    }
  }
  return best;
}

/** A photo to use when the author gave none: an existing place of the same kind. */
export function defaultPlaceImage(type: PlaceType, places: Place[]): string {
  const withImage = places.filter((place) => place.imageUrl);
  return (withImage.find((place) => place.type === type) ?? withImage[0])?.imageUrl ?? "";
}

/** Coordinates to ~1 m: enough for a place, no false precision. */
export function roundCoordinate(value: number) {
  return Number(value.toFixed(5));
}

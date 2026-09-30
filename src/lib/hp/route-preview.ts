import type { RouteGeometry, RouteRoutingProfile } from "@/lib/hp-model";

export type RouteCoordinate = readonly [lng: number, lat: number];
export const MAX_ROUTE_GEOMETRY_POINTS = 20_000;
export type RoutePreviewResponse = {
  geometry: RouteGeometry;
  distanceMeters: number;
  durationSeconds: number;
};

export type CachedRoutePreview<Geometry> = {
  geometry: Geometry | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  inputHash: string | null;
  generatedAt: string | null;
};

/** A failed refresh may reuse a preview only when its route inputs still match. */
export function resolveRoutePreviewForSave<Geometry>(
  cached: CachedRoutePreview<Geometry> | null,
  inputHash: string | null,
  generated: { geometry: Geometry; distanceMeters: number; durationSeconds: number } | null,
  now: string,
): CachedRoutePreview<Geometry> {
  if (generated) {
    return {
      geometry: generated.geometry,
      distanceMeters: generated.distanceMeters,
      durationSeconds: generated.durationSeconds,
      inputHash,
      generatedAt: now,
    };
  }
  if (inputHash && cached?.inputHash === inputHash) return cached;
  return {
    geometry: null,
    distanceMeters: null,
    durationSeconds: null,
    inputHash: null,
    generatedAt: null,
  };
}

export function isRoutingProfile(value: unknown): value is RouteRoutingProfile {
  return value === "driving-car" || value === "foot-walking";
}

export function validateRouteCoordinates(value: unknown): RouteCoordinate[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 50)
    throw new Error("A route needs between 2 and 50 ordered stop coordinates.");
  return value.map((coordinate) => {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length !== 2 ||
      !Number.isFinite(coordinate[0]) ||
      !Number.isFinite(coordinate[1]) ||
      coordinate[0] < -180 ||
      coordinate[0] > 180 ||
      coordinate[1] < -90 ||
      coordinate[1] > 90
    )
      throw new Error("Route coordinates must be valid [longitude, latitude] pairs.");
    return [coordinate[0], coordinate[1]] as RouteCoordinate;
  });
}

export function routeInputHash(profile: RouteRoutingProfile, coordinates: RouteCoordinate[]) {
  const value = `${profile}|${coordinates.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join("|")}`;
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function parseRoutePreviewResponse(value: unknown): RoutePreviewResponse {
  if (!value || typeof value !== "object") throw new Error("Routing returned an empty response.");
  const response = value as Record<string, unknown>;
  const geometry = parseRouteGeometry(response.geometry);
  if (
    !geometry ||
    typeof response.distanceMeters !== "number" ||
    !Number.isFinite(response.distanceMeters) ||
    response.distanceMeters < 0 ||
    typeof response.durationSeconds !== "number" ||
    !Number.isFinite(response.durationSeconds) ||
    response.durationSeconds < 0
  )
    throw new Error("Routing returned a malformed route preview.");
  return {
    geometry,
    distanceMeters: response.distanceMeters,
    durationSeconds: response.durationSeconds,
  };
}

/** Reject malformed or oversized cached geometry before handing it to the map. */
export function parseRouteGeometry(value: unknown): RouteGeometry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const geometry = value as Record<string, unknown>;
  if (
    geometry.type !== "LineString" ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length < 2 ||
    geometry.coordinates.length > MAX_ROUTE_GEOMETRY_POINTS
  )
    return null;
  const coordinates: [number, number][] = [];
  for (const point of geometry.coordinates) {
    if (
      !Array.isArray(point) ||
      point.length < 2 ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1]) ||
      point[0] < -180 ||
      point[0] > 180 ||
      point[1] < -90 ||
      point[1] > 90
    )
      return null;
    coordinates.push([point[0], point[1]]);
  }
  return { type: "LineString", coordinates };
}

export function formatRouteDistance(meters: number | null) {
  return meters === null
    ? null
    : meters < 1000
      ? `${Math.round(meters)} m`
      : `${(meters / 1000).toFixed(1)} km`;
}
export function formatRouteDuration(seconds: number | null) {
  if (seconds === null) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

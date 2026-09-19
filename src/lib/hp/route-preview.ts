import type { RouteGeometry, RouteRoutingProfile } from "@/lib/hp-model";

export type RouteCoordinate = readonly [lng: number, lat: number];
export type RoutePreviewResponse = {
  geometry: RouteGeometry;
  distanceMeters: number;
  durationSeconds: number;
};

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
  const geometry = response.geometry as Record<string, unknown> | undefined;
  if (!Array.isArray(geometry?.coordinates) || geometry.coordinates.length < 2) {
    throw new Error("Routing returned a malformed route preview.");
  }
  const coordinates = geometry.coordinates.map((coordinate) => {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length < 2 ||
      !Number.isFinite(coordinate[0]) ||
      !Number.isFinite(coordinate[1])
    ) {
      throw new Error("Routing returned malformed route geometry.");
    }
    return [coordinate[0], coordinate[1]] as [number, number];
  });
  if (
    geometry?.type !== "LineString" ||
    typeof response.distanceMeters !== "number" ||
    !Number.isFinite(response.distanceMeters) ||
    response.distanceMeters < 0 ||
    typeof response.durationSeconds !== "number" ||
    !Number.isFinite(response.durationSeconds) ||
    response.durationSeconds < 0
  )
    throw new Error("Routing returned a malformed route preview.");
  return {
    geometry: { type: "LineString", coordinates },
    distanceMeters: response.distanceMeters,
    durationSeconds: response.durationSeconds,
  };
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

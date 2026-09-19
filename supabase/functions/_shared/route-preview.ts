export type RoutingProfile = "driving-car" | "foot-walking";
export type Coordinate = [number, number];
export function parseRoutePreviewRequest(value: unknown): {
  profile: RoutingProfile;
  coordinates: Coordinate[];
} {
  if (!value || typeof value !== "object") throw new Error("A JSON body is required.");
  const body = value as Record<string, unknown>;
  if (body.profile !== "driving-car" && body.profile !== "foot-walking")
    throw new Error("profile must be driving-car or foot-walking.");
  if (
    !Array.isArray(body.coordinates) ||
    body.coordinates.length < 2 ||
    body.coordinates.length > 50
  )
    throw new Error("coordinates must contain between 2 and 50 stops.");
  const coordinates = body.coordinates.map((item) => {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      !Number.isFinite(item[0]) ||
      !Number.isFinite(item[1]) ||
      item[0] < -180 ||
      item[0] > 180 ||
      item[1] < -90 ||
      item[1] > 90
    )
      throw new Error("Every coordinate must be a valid [longitude, latitude] pair.");
    return [item[0], item[1]] as Coordinate;
  });
  return { profile: body.profile, coordinates };
}
export function parseOpenRouteServiceResponse(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("OpenRouteService returned no data.");
  const feature = (value as { features?: unknown[] }).features?.[0] as
    | {
        geometry?: { type?: unknown; coordinates?: unknown };
        properties?: { summary?: { distance?: unknown; duration?: unknown } };
      }
    | undefined;
  const geometry = feature?.geometry;
  const summary = feature?.properties?.summary;
  if (
    geometry?.type !== "LineString" ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length < 2 ||
    typeof summary?.distance !== "number" ||
    !Number.isFinite(summary.distance) ||
    summary.distance < 0 ||
    typeof summary.duration !== "number" ||
    !Number.isFinite(summary.duration) ||
    summary.duration < 0
  )
    throw new Error("OpenRouteService returned a malformed route.");
  const coordinates = geometry.coordinates.map((item) => {
    if (
      !Array.isArray(item) ||
      item.length < 2 ||
      !Number.isFinite(item[0]) ||
      !Number.isFinite(item[1])
    )
      throw new Error("OpenRouteService returned malformed geometry.");
    return [item[0], item[1]] as Coordinate;
  });
  return {
    geometry: { type: "LineString" as const, coordinates },
    distanceMeters: Math.round(summary.distance),
    durationSeconds: Math.round(summary.duration),
  };
}
export const isRouteEditorRole = (value: unknown) => value === "owner" || value === "editor";

export function routePreviewAccessStatus(
  authorization: string | null,
  hasAuthenticatedUser: boolean,
  role: unknown,
): 401 | 403 | null {
  if (!authorization || !hasAuthenticatedUser) return 401;
  return isRouteEditorRole(role) ? null : 403;
}

export async function requestOpenRouteService(
  fetcher: typeof fetch,
  apiKey: string,
  profile: RoutingProfile,
  coordinates: Coordinate[],
) {
  const response = await fetcher(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates, instructions: false }),
    },
  );
  if (!response.ok) throw new Error(`OpenRouteService request failed (${response.status}).`);
  return parseOpenRouteServiceResponse(await response.json());
}

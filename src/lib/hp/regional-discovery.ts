import type { Place } from "../hp-model";
import {
  areaDefinitionForId,
  areaIdForPlaceId,
  groupPlacesByArea,
  toneForPlace,
  type AreaTone,
} from "./area-catalog";
import { DISCOVERY_CONFIG, type DiscoveryLens, type DiscoverySnapshot } from "./discovery";
import { coordinateBounds } from "./map-core";
import { mapDisclosure, pointInBounds, type MapBounds, type MapHierarchyLevel } from "./map-policy";
import {
  deriveEvidencePulseSignal,
  NEUTRAL_MARKER_PULSE,
  pulseInputIsFresh,
  type MarkerPulseInput,
  type MarkerPulseSignal,
} from "./marker-pulse";

/** Bounds of loaded members, never an administrative boundary. */
export type MapRegion = {
  id: string;
  name: string;
  tone: AreaTone;
  placeIds: string[];
  anchor: { lng: number; lat: number };
  bounds: MapBounds;
  standalone: boolean;
};
export type RegionalDiscovery = {
  region: MapRegion;
  searchedPlaceIds: string[];
  contextualPlaceIds: string[];
  signal: MarkerPulseSignal;
};
export type MapDiscoveryViewport = {
  center: { lat: number; lng: number };
  visibleAreaIds: string[];
  zoom: number;
  bearing: number;
  pitch: number;
  hierarchyLevel: MapHierarchyLevel;
  bounds: MapBounds;
  usableBounds: MapBounds;
  visiblePlaceIds: string[];
  primaryAreaId: string | null;
};

export type MapScreenRect = { left: number; right: number; top: number; bottom: number };
type ViewportPlace = Pick<Place, "id" | "lat" | "lng">;

/** Query a geographic envelope, then test exact visibility on rotated/pitched maps. */
export function visibleScreenMembers(
  rect: MapScreenRect,
  camera: {
    unproject: (point: [number, number]) => { lng: number; lat: number };
    project: (coordinate: [number, number]) => { x: number; y: number };
  },
  query: (bounds: MapBounds) => ViewportPlace[],
) {
  const corners = [
    [rect.left, rect.top],
    [rect.right, rect.top],
    [rect.right, rect.bottom],
    [rect.left, rect.bottom],
  ] as [number, number][];
  const bounds = coordinateBounds(
    corners.map((point) => {
      const coordinate = camera.unproject(point);
      return [coordinate.lng, coordinate.lat];
    }),
  );
  const places = query(bounds).filter((place) => {
    const point = camera.project([place.lng, place.lat]);
    return (
      point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
    );
  });
  return { bounds, places };
}

export function buildMapRegions(places: Place[]): MapRegion[] {
  const valid = places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  return [...groupPlacesByArea(valid)]
    .map(([id, members]) => {
      const def = areaDefinitionForId(id);
      const bounds = coordinateBounds(members.map((p) => [p.lng, p.lat]));
      return {
        id,
        name: def?.name ?? members[0].name,
        tone: def?.tone ?? toneForPlace(members[0]),
        placeIds: members.map((p) => p.id).sort(),
        bounds,
        standalone: !def,
        anchor: { lng: (bounds[0][0] + bounds[1][0]) / 2, lat: (bounds[0][1] + bounds[1][1]) / 2 },
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function deriveRegionalDiscovery(
  regions: MapRegion[],
  searchedIds: ReadonlySet<string>,
  lens: DiscoveryLens | null,
  discovery: DiscoverySnapshot,
  input: MarkerPulseInput,
  now: number,
): RegionalDiscovery[] {
  const fresh = pulseInputIsFresh(input, now);
  return regions.map((region) => {
    const searchedPlaceIds = region.placeIds.filter((id) => searchedIds.has(id));
    const contextualPlaceIds = searchedPlaceIds.filter(
      (id) =>
        !lens ||
        (discovery.places[id]?.lensRelevance[lens] ?? 0) >=
          DISCOVERY_CONFIG.recommendation.minimumLensRelevance,
    );
    // Evidence is normalized/deduplicated once at bootstrap. Pool observations,
    // not place states or summed contributor counts: one contributor stays one.
    const signal =
      fresh && !region.standalone && contextualPlaceIds.length > 0
        ? deriveEvidencePulseSignal(
            contextualPlaceIds.flatMap((id) => input.evidence[id] ?? []),
            now,
          )
        : NEUTRAL_MARKER_PULSE;
    return { region, searchedPlaceIds, contextualPlaceIds, signal };
  });
}

/** Geographic visibility is independent of symbol/marker collisions. */
export function discoveryViewport(
  center: { lat: number; lng: number },
  zoom: number,
  bounds: MapBounds,
  usableBounds: MapBounds,
  places: Pick<Place, "id" | "lat" | "lng">[],
  contextualIds: ReadonlySet<string>,
  orientation = { bearing: 0, pitch: 0 },
): MapDiscoveryViewport {
  const visible = places.filter((p) => pointInBounds(p.lng, p.lat, usableBounds));
  const areaIds = [...new Set(visible.map((p) => areaIdForPlaceId(p.id)))].sort();
  const areas = new Map<string, { count: number; lng: number; lat: number }>();
  visible.forEach((p) => {
    if (!contextualIds.has(p.id)) return;
    const id = areaIdForPlaceId(p.id);
    const row = areas.get(id) ?? { count: 0, lng: 0, lat: 0 };
    row.count++;
    row.lng += p.lng;
    row.lat += p.lat;
    areas.set(id, row);
  });
  const distance = (row: { count: number; lng: number; lat: number }) =>
    ((row.lng / row.count - center.lng) * Math.cos((center.lat * Math.PI) / 180)) ** 2 +
    (row.lat / row.count - center.lat) ** 2;
  const primaryAreaId =
    [...areas].sort(
      ([a, x], [b, y]) => y.count - x.count || distance(x) - distance(y) || a.localeCompare(b),
    )[0]?.[0] ?? null;
  return {
    center,
    zoom,
    ...orientation,
    hierarchyLevel: mapDisclosure(zoom).level,
    bounds,
    usableBounds,
    visibleAreaIds: areaIds,
    visiblePlaceIds: visible.map((p) => p.id).sort(),
    primaryAreaId,
  };
}

export function viewportSignature(viewport: MapDiscoveryViewport) {
  return JSON.stringify({
    ...viewport,
    center: [viewport.center.lng, viewport.center.lat].map((v) => +v.toFixed(5)),
    zoom: +viewport.zoom.toFixed(3),
    bounds: viewport.bounds.map((c) => c.map((v) => +v.toFixed(5))),
    usableBounds: viewport.usableBounds.map((c) => c.map((v) => +v.toFixed(5))),
  });
}

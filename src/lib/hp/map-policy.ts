/** One policy for geography, disclosure, clustering and camera limits. */
export const MAP_POLICY = {
  center: [21.52, 37.68] as [number, number],
  panBounds: [
    [19.4, 36.2],
    [23.5, 38.9],
  ] as [[number, number], [number, number]],
  minZoom: 8,
  maxZoom: 18,
  overviewZoom: 9.25,
  regionFadeStart: 10.5,
  regionFadeEnd: 11.5,
  clusterMaxZoom: 13,
  clusterRadius: 58,
  clusterMinPoints: 2,
  topologyFadeWidth: 0.35,
  regionFocusMaxZoom: 13.25,
  placeFocusZoom: 14.25,
  labelZoom: 15.5,
  motionZoom: 11.5,
  focusDurationMs: 380,
} as const;

export type MapHierarchyLevel = "region" | "transition" | "activity" | "place";
export type MapBounds = [[number, number], [number, number]];

export function smoothstep(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function mapDisclosure(zoom: number) {
  const detailOpacity = smoothstep(MAP_POLICY.regionFadeStart, MAP_POLICY.regionFadeEnd, zoom);
  const level: MapHierarchyLevel =
    zoom < MAP_POLICY.regionFadeStart
      ? "region"
      : zoom < MAP_POLICY.regionFadeEnd
        ? "transition"
        : zoom < MAP_POLICY.clusterMaxZoom + 1
          ? "activity"
          : "place";
  return { level, regionOpacity: 1 - detailOpacity, detailOpacity };
}

export function topologyBlend(zoom: number) {
  const lower = Math.max(MAP_POLICY.minZoom, Math.min(MAP_POLICY.maxZoom, Math.floor(zoom)));
  const upper = Math.min(MAP_POLICY.maxZoom, lower + 1);
  const mix = upper === lower ? 0 : smoothstep(upper - MAP_POLICY.topologyFadeWidth, upper, zoom);
  return { lower, upper, mix };
}

export function pointInBounds(lng: number, lat: number, bounds: MapBounds) {
  return lng >= bounds[0][0] && lng <= bounds[1][0] && lat >= bounds[0][1] && lat <= bounds[1][1];
}

export function paddedBounds(bounds: MapBounds): MapBounds {
  const width = bounds[1][0] - bounds[0][0];
  const height = bounds[1][1] - bounds[0][1];
  return [
    [bounds[0][0] - width / 2, bounds[0][1] - height / 2],
    [bounds[1][0] + width / 2, bounds[1][1] + height / 2],
  ];
}

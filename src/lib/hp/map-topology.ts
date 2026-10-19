import Supercluster from "supercluster";
import type { Place } from "../hp-model";
import { MAP_POLICY, mapDisclosure, topologyBlend, type MapBounds } from "./map-policy";

type Point = { placeId: string };
export type TopologyNode = {
  id: string;
  lng: number;
  lat: number;
  placeIds: string[];
  clusterId?: number;
};
export type BlendedTopologyNode = TopologyNode & { opacity: number };

/** Sorted coordinates make metadata/evidence refreshes retain index identity. */
export function topologyKey(places: Pick<Place, "id" | "lng" | "lat">[]) {
  return JSON.stringify(
    places
      .map((p) => [p.id, p.lng, p.lat])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

export function createMapTopology(key: string) {
  const points = JSON.parse(key) as [string, number, number][];
  const index = new Supercluster<Point>({
    maxZoom: MAP_POLICY.clusterMaxZoom,
    radius: MAP_POLICY.clusterRadius,
    minPoints: MAP_POLICY.clusterMinPoints,
  });
  index.load(
    points
      .filter(([, lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
      .map(([placeId, lng, lat]) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: { placeId },
      })),
  );
  const leaves = new Map<number, string[]>();
  // Bounded query cache; refreshing a viewport cannot accumulate old topologies.
  const queries = new Map<string, TopologyNode[]>();
  return {
    index,
    query(zoom: number, bounds: MapBounds): TopologyNode[] {
      const queryKey = `${zoom}:${JSON.stringify(bounds)}`;
      const cached = queries.get(queryKey);
      if (cached) return cached;
      const result = index
        .getClusters([bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]], zoom)
        .map((feature) => {
          const [lng, lat] = feature.geometry.coordinates;
          if ("cluster" in feature.properties && feature.properties.cluster) {
            const clusterId = feature.properties.cluster_id;
            let ids = leaves.get(clusterId);
            if (!ids) {
              ids = index
                .getLeaves(clusterId, Infinity)
                .map((p) => p.properties.placeId)
                .sort();
              leaves.set(clusterId, ids);
            }
            return { id: `activity-${clusterId}`, lng, lat, placeIds: ids, clusterId };
          }
          return {
            id: `place-${feature.properties.placeId}`,
            lng,
            lat,
            placeIds: [feature.properties.placeId],
          };
        });
      if (queries.size >= 8) queries.delete(queries.keys().next().value!);
      queries.set(queryKey, result);
      return result;
    },
    // Query individual points through the same spatial index, regardless of zoom.
    visiblePlaces(bounds: MapBounds) {
      return index
        .getClusters(
          [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]],
          MAP_POLICY.clusterMaxZoom + 1,
        )
        .map((p) => ({
          id: p.properties.placeId,
          lng: p.geometry.coordinates[0],
          lat: p.geometry.coordinates[1],
        }));
    },
  };
}

export function blendTopologies(
  lower: TopologyNode[],
  upper: TopologyNode[],
  zoom: number,
): BlendedTopologyNode[] {
  const { mix } = topologyBlend(zoom);
  const { detailOpacity } = mapDisclosure(zoom);
  if (detailOpacity === 0) return [];
  const before = new Map(lower.map((n) => [n.id, n]));
  const after = new Map(upper.map((n) => [n.id, n]));
  return [...new Set([...before.keys(), ...after.keys()])].flatMap((id) => {
    const node = before.get(id) ?? after.get(id)!;
    const opacity =
      detailOpacity * (before.has(id) && after.has(id) ? 1 : before.has(id) ? 1 - mix : mix);
    return opacity > 0.001 ? [{ ...node, opacity }] : [];
  });
}

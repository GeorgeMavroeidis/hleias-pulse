import type { StyleSpecification } from "maplibre-gl";

export function removeAdministrativeBoundaries(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.filter((layer) => {
      const id = layer.id.toLowerCase();
      const sourceLayer =
        "source-layer" in layer && typeof layer["source-layer"] === "string"
          ? layer["source-layer"].toLowerCase()
          : "";
      return (
        !id.includes("boundary") &&
        !id.includes("administrative") &&
        !sourceLayer.includes("boundary") &&
        !sourceLayer.includes("administrative")
      );
    }),
  };
}

export function toMapLibreCoordinate(lat: number, lng: number): [number, number] {
  return [lng, lat];
}

export function coordinateBounds(
  coordinates: Iterable<readonly [number, number]>,
): [[number, number], [number, number]] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  if (minLng === Infinity) throw new Error("At least one coordinate is required.");
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/** A failed source tile should never cover an otherwise usable map. */
export function isFatalBasemapError(mapHasLoaded: boolean, sourceId: unknown): boolean {
  return !mapHasLoaded && !(typeof sourceId === "string" && sourceId.length > 0);
}

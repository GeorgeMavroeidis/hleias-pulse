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
  coordinates: readonly (readonly [number, number])[],
): [[number, number], [number, number]] {
  if (coordinates.length === 0) throw new Error("At least one coordinate is required.");
  return [
    [Math.min(...coordinates.map(([lng]) => lng)), Math.min(...coordinates.map(([, lat]) => lat))],
    [Math.max(...coordinates.map(([lng]) => lng)), Math.max(...coordinates.map(([, lat]) => lat))],
  ];
}

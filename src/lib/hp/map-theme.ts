import type { LayerSpecification, StyleSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { ColorScheme } from "../theme";

/** The subset needed by the provider fallback; cartography supplies its resolved palette. */
export interface DarkBasemapPalette {
  land: string;
  water: string;
  waterLine: string;
  nature: string;
  building: string;
  urban: string;
  majorRoad: string;
  minorCasing: string;
  minorRoad: string;
  waterText: string;
  primaryText: string;
}

const DEFAULT_DARK_BASEMAP_PALETTE: Readonly<DarkBasemapPalette> = Object.freeze({
  land: "#142230",
  water: "#0b3047",
  waterLine: "#28536a",
  nature: "#213c39",
  building: "#334555",
  urban: "#1c2d3c",
  majorRoad: "#a28a70",
  minorCasing: "#273b4a",
  minorRoad: "#506575",
  waterText: "#8ac5dc",
  primaryText: "#dce2e5",
});

/** Only basemap paint changes: source IDs, geometry, layout and app overlays stay intact. */
export function darkBasemapPaint(
  layer: LayerSpecification,
  palette: Readonly<DarkBasemapPalette> = DEFAULT_DARK_BASEMAP_PALETTE,
): Record<string, string> {
  const name = `${layer.id} ${"source-layer" in layer ? layer["source-layer"] : ""}`.toLowerCase();
  const water = /water|ocean/.test(name);
  const green = /park|wood|forest|landcover|grass/.test(name);
  switch (layer.type) {
    case "background":
      return { "background-color": palette.land };
    case "fill":
      return {
        "fill-color": water
          ? palette.water
          : green
            ? palette.nature
            : /building/.test(name)
              ? palette.building
              : palette.urban,
      };
    case "fill-extrusion":
      return { "fill-extrusion-color": palette.building };
    case "line":
      return {
        "line-color": water
          ? palette.waterLine
          : /motorway|trunk/.test(name)
            ? palette.majorRoad
            : /casing|rail/.test(name)
              ? palette.minorCasing
              : palette.minorRoad,
      };
    case "symbol":
      return {
        "text-color": water ? palette.waterText : palette.primaryText,
        "text-halo-color": palette.land,
      };
    default:
      return {};
  }
}

export function themedBasemap(style: StyleSpecification, scheme: ColorScheme): StyleSpecification {
  if (scheme === "light") return style;
  return {
    ...style,
    layers: style.layers.map((layer) => ({
      ...layer,
      paint: { ...("paint" in layer ? layer.paint : {}), ...darkBasemapPaint(layer) },
    })) as LayerSpecification[],
  };
}

export function applyBasemapTheme(
  map: MapLibreMap,
  original: StyleSpecification,
  scheme: ColorScheme,
) {
  for (const layer of original.layers) {
    if (!map.getLayer(layer.id)) continue;
    const paint =
      "paint" in layer ? (layer.paint as Record<string, unknown> | undefined) : undefined;
    for (const [property, darkColor] of Object.entries(darkBasemapPaint(layer))) {
      map.setPaintProperty(
        layer.id,
        property as Parameters<MapLibreMap["setPaintProperty"]>[1],
        (scheme === "dark" ? darkColor : (paint?.[property] ?? null)) as Parameters<
          MapLibreMap["setPaintProperty"]
        >[2],
      );
    }
  }
}

import type { LayerSpecification, StyleSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { ColorScheme } from "../theme";

/** Only basemap paint changes: source IDs, geometry, layout and app overlays stay intact. */
export function darkBasemapPaint(layer: LayerSpecification): Record<string, string> {
  const name = `${layer.id} ${"source-layer" in layer ? layer["source-layer"] : ""}`.toLowerCase();
  const water = /water|ocean/.test(name);
  const green = /park|wood|forest|landcover|grass/.test(name);
  switch (layer.type) {
    case "background":
      return { "background-color": "#142230" };
    case "fill":
      return {
        "fill-color": water
          ? "#0b3047"
          : green
            ? "#213c39"
            : /building/.test(name)
              ? "#334555"
              : "#1c2d3c",
      };
    case "fill-extrusion":
      return { "fill-extrusion-color": "#334555" };
    case "line":
      return {
        "line-color": water
          ? "#28536a"
          : /motorway|trunk/.test(name)
            ? "#a28a70"
            : /casing|rail/.test(name)
              ? "#273b4a"
              : "#506575",
      };
    case "symbol":
      return { "text-color": water ? "#8ac5dc" : "#dce2e5", "text-halo-color": "#142230" };
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

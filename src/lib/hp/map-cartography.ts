import type { FilterSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import { removeAdministrativeBoundaries } from "./map-core";

/** Paint tokens are independent of density rules for Phase 6 atmosphere variants.
 * Keep glyphs/sprites/sources stable: a full style swap would remove app overlays. */
export interface MapCartographyPalette {
  land: string;
  water: string;
  waterLine: string;
  primaryText: string;
  secondaryText: string;
  waterText: string;
  nature: string;
  olive: string;
  sand: string;
  urban: string;
  building: string;
  buildingOutline: string;
  minorRoad: string;
  minorCasing: string;
  secondaryRoad: string;
  secondaryCasing: string;
  majorRoad: string;
  majorCasing: string;
}

export const DAY_MAP_PALETTE: Readonly<MapCartographyPalette> = Object.freeze({
  land: "#f6f0e6",
  water: "#a8c5ce",
  waterLine: "#7eabb9",
  primaryText: "#302e2a",
  secondaryText: "#68645b",
  waterText: "#425c68",
  nature: "#d9dfcd",
  olive: "#879570",
  sand: "#ebe2cf",
  urban: "#e7e0d4",
  building: "#e3dccf",
  buildingOutline: "#cfc6b8",
  minorRoad: "#fffaf2",
  minorCasing: "#d4ccc0",
  secondaryRoad: "#eadfc8",
  secondaryCasing: "#cabda4",
  majorRoad: "#e3c69f",
  majorCasing: "#b99c7b",
});

// These are the actual Bright IDs inspected on 2026-10-01. Match IDs AND
// types; do not recolor an upstream layer merely because its name looks similar.
const ROAD_PARTS = [
  "service-track",
  "motorway-link",
  "minor",
  "link",
  "secondary-tertiary",
  "trunk-primary",
  "primary",
  "trunk",
  "motorway",
  "path",
];
const ROAD_IDS = new Set(
  ["highway", "tunnel", "bridge"].flatMap((prefix) =>
    ROAD_PARTS.flatMap((part) => [`${prefix}-${part}`, `${prefix}-${part}-casing`]),
  ),
);
const RAIL_IDS = new Set([
  "railway",
  "railway-hatching",
  "railway-transit",
  "railway-transit-hatching",
  "railway-service",
  "railway-service-hatching",
  "tunnel-railway",
  "bridge-railway",
  "bridge-railway-hatching",
  "cablecar",
  "cablecar-dash",
]);
const WATERWAY_IDS = new Set([
  "waterway_tunnel",
  "waterway-other",
  "waterway-other-intermittent",
  "waterway-stream-canal",
  "waterway-stream-canal-intermittent",
  "waterway-river",
  "waterway-river-intermittent",
]);
const URBAN_IDS = new Set([
  "landuse-residential",
  "landuse-suburb",
  "landuse-commercial",
  "landuse-industrial",
  "landuse-hospital",
  "landuse-school",
  "landuse-railway",
]);
const SETTLEMENT_IDS = new Set([
  "label_city",
  "label_city_capital",
  "label_town",
  "label_village",
  "label_other",
  "label_state",
  "label_country_1",
  "label_country_2",
  "label_country_3",
]);
const WATER_LABEL_IDS = new Set([
  "waterway_line_label",
  "water_name_point_label",
  "water_name_line_label",
]);
const ROAD_LABEL_IDS = new Set(["highway-name-path", "highway-name-minor", "highway-name-major"]);
const POI_IDS = new Set(["poi_r1", "poi_r7", "poi_r20"]);
const SHIELD_IDS = new Set([
  "highway-shield-non-us",
  "highway-shield-us-interstate",
  "road_shield_us",
]);
const ORIENTATION_POIS: FilterSpecification = [
  "match",
  ["get", "class"],
  ["hospital", "museum", "castle", "monument", "park"],
  true,
  false,
];
const TRANSIT_POIS: FilterSpecification = [
  "any",
  ["==", ["get", "class"], "airport"],
  ["all", ["==", ["get", "class"], "bus"], ["==", ["get", "subclass"], "bus_station"]],
  [
    "all",
    ["match", ["get", "class"], ["rail", "railway"], true, false],
    ["match", ["get", "subclass"], ["station", "halt"], true, false],
  ],
];

function restrictFilter(
  original: FilterSpecification | undefined,
  restriction: FilterSpecification,
): FilterSpecification {
  if (
    Array.isArray(original) &&
    original[0] === "all" &&
    JSON.stringify(original.at(-1)) === JSON.stringify(restriction)
  )
    return original;
  // Bright uses expression filters; preserve its complete rank/geometry/network predicate.
  return original ? (["all", original, restriction] as FilterSpecification) : restriction;
}

function styleLayer(
  layer: LayerSpecification,
  p: Readonly<MapCartographyPalette>,
): LayerSpecification {
  const id = layer.id;
  if (layer.type === "background" && id === "background") {
    return { ...layer, paint: { ...layer.paint, "background-color": p.land } };
  }
  if (layer.type === "fill") {
    if (id === "water" || id === "water-intermittent") {
      return { ...layer, paint: { ...layer.paint, "fill-color": p.water } };
    }
    if (URBAN_IDS.has(id)) {
      return { ...layer, paint: { ...layer.paint, "fill-color": p.urban, "fill-opacity": 0.28 } };
    }
    if (["park", "landcover-grass", "landcover-grass-park", "landuse-cemetery"].includes(id)) {
      return {
        ...layer,
        paint: {
          ...layer.paint,
          "fill-color": p.nature,
          "fill-opacity": id === "park" ? 0.5 : 0.65,
        },
      };
    }
    if (id === "landcover-wood") {
      return {
        ...layer,
        paint: {
          ...layer.paint,
          "fill-color": p.olive,
          "fill-opacity": 0.18,
          "fill-outline-color": "transparent",
        },
      };
    }
    if (["landcover-glacier", "landcover-ice-shelf", "landcover-sand"].includes(id)) {
      return {
        ...layer,
        paint: { ...layer.paint, "fill-color": id === "landcover-sand" ? p.sand : p.minorRoad },
      };
    }
    if (id === "building" || id === "building-top") {
      return {
        ...layer,
        paint: {
          ...layer.paint,
          "fill-color": p.building,
          ...(id === "building-top" ? { "fill-outline-color": p.buildingOutline } : {}),
        },
      };
    }
    if (["aeroway-area", "road_area_pier", "highway-area"].includes(id)) {
      return { ...layer, paint: { ...layer.paint, "fill-color": p.minorRoad } };
    }
  }
  if (layer.type === "line") {
    if (ROAD_IDS.has(id)) {
      const casing = id.endsWith("-casing");
      // Generic link layers contain multiple classes: color from actual data.
      const color: NonNullable<typeof layer.paint>["line-color"] = /-path(?:-casing)?$/.test(id)
        ? casing
          ? p.land
          : p.minorCasing
        : /-link(?:-casing)?$/.test(id)
          ? [
              "match",
              ["get", "class"],
              ["motorway", "trunk", "primary"],
              casing ? p.majorCasing : p.majorRoad,
              casing ? p.secondaryCasing : p.secondaryRoad,
            ]
          : /motorway|trunk|primary/.test(id)
            ? casing
              ? p.majorCasing
              : p.majorRoad
            : /secondary|tertiary/.test(id)
              ? casing
                ? p.secondaryCasing
                : p.secondaryRoad
              : casing
                ? p.minorCasing
                : p.minorRoad;
      return {
        ...layer,
        paint: {
          ...layer.paint,
          "line-color": color,
        },
      };
    }
    let color: string | undefined;
    if (WATERWAY_IDS.has(id) || id === "ferry") color = p.waterLine;
    else if (RAIL_IDS.has(id)) color = p.minorCasing;
    else if (id === "road_pier") color = p.minorRoad;
    else if (["aeroway-taxiway", "aeroway-runway"].includes(id)) color = p.minorRoad;
    else if (["aeroway-taxiway-casing", "aeroway-runway-casing"].includes(id))
      color = p.minorCasing;
    if (color) return { ...layer, paint: { ...layer.paint, "line-color": color } };
  }
  if (layer.type === "symbol") {
    if (SETTLEMENT_IDS.has(id)) {
      const prominent = ["label_city", "label_city_capital", "label_town"].includes(id);
      return {
        ...layer,
        ...(id === "label_other" ? { minzoom: Math.max(layer.minzoom ?? 0, 13) } : {}),
        layout: {
          ...layer.layout,
          ...(prominent ? { "text-font": ["Noto Sans Bold"] } : {}),
          ...(id === "label_city"
            ? { "text-size": ["interpolate", ["linear"], ["zoom"], 8, 15, 14, 20] }
            : {}),
          ...(id === "label_town"
            ? { "text-size": ["interpolate", ["linear"], ["zoom"], 8, 13, 14, 16] }
            : {}),
          ...(id === "label_village"
            ? { "text-size": ["interpolate", ["linear"], ["zoom"], 9, 11, 14, 13] }
            : {}),
          ...(id === "label_other" ? { "text-transform": "none", "text-letter-spacing": 0 } : {}),
        },
        paint: {
          ...layer.paint,
          "text-color": prominent ? p.primaryText : p.secondaryText,
          "text-halo-color": p.land,
          "text-halo-width": 1.2,
          "text-halo-blur": 0.3,
        },
      };
    }
    if (POI_IDS.has(id) || id === "poi_transit" || id === "airport") {
      return {
        ...layer,
        ...(POI_IDS.has(id) ? { filter: restrictFilter(layer.filter, ORIENTATION_POIS) } : {}),
        ...(id === "poi_transit"
          ? {
              // Bright's class "rail" misses sampled provider class "railway".
              filter: TRANSIT_POIS,
              minzoom: Math.max(layer.minzoom ?? 0, 13),
              layout: {
                ...layer.layout,
                "icon-image": ["match", ["get", "class"], "railway", "rail", ["get", "class"]],
              },
            }
          : {}),
        paint: {
          ...layer.paint,
          "text-color": p.secondaryText,
          "text-halo-color": p.land,
          "text-halo-width": 1,
          "text-halo-blur": 0.3,
        },
      };
    }
    if (WATER_LABEL_IDS.has(id) || ROAD_LABEL_IDS.has(id) || SHIELD_IDS.has(id)) {
      const water = WATER_LABEL_IDS.has(id);
      const shield = SHIELD_IDS.has(id);
      return {
        ...layer,
        ...(id === "highway-name-minor" ? { minzoom: Math.max(layer.minzoom ?? 0, 16) } : {}),
        ...(id === "highway-name-path" ? { minzoom: Math.max(layer.minzoom ?? 0, 17) } : {}),
        ...(shield
          ? {
              minzoom: Math.max(layer.minzoom ?? 0, 11),
              filter: restrictFilter(layer.filter, [
                "match",
                ["get", "class"],
                ["motorway", "trunk", "primary"],
                true,
                false,
              ]),
              layout: { ...layer.layout, "symbol-spacing": 450 },
            }
          : {}),
        paint: {
          ...layer.paint,
          "text-color": water ? p.waterText : p.secondaryText,
          "text-halo-color": water ? p.water : p.land,
          "text-halo-width": shield ? 0 : 1,
          "text-halo-blur": 0.3,
        },
      };
    }
  }
  return layer;
}

/** Pure, one-time transform. Never call from move/zoom/filter/selection effects. */
export function createIliaMapStyle(
  upstream: StyleSpecification,
  palette: Readonly<MapCartographyPalette> = DAY_MAP_PALETTE,
): StyleSpecification {
  const boundaryFree = removeAdministrativeBoundaries(upstream);
  return {
    ...boundaryFree,
    layers: boundaryFree.layers.map((layer) => styleLayer(layer, palette)),
  };
}

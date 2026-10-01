import type {
  ExpressionSpecification,
  Map as MapLibreMap,
  SymbolLayerSpecification,
} from "maplibre-gl";
import { DAY_MAP_PALETTE } from "./map-cartography";
import { MAP_POLICY, mapDisclosure } from "./map-policy";
import type { RegionalDiscovery } from "./regional-discovery";
import type { TranslationParams } from "../i18n";

export const REGION_SOURCE_ID = "hp-regional-discovery";
export const REGION_LAYER_ID = "hp-regional-signals";
export const PULSE_NAMES = {
  quiet: "Quiet",
  emerging: "Emerging",
  active: "Active",
  lively: "Lively",
  fading: "Fading",
};
type Translate = (key: string, params?: TranslationParams) => string;

export function regionalDescription(
  row: RegionalDiscovery,
  filterLabel: string | null | undefined,
  t: Translate,
) {
  const count = row.contextualPlaceIds.length;
  const places = filterLabel
    ? t(count === 1 ? "{count} {filter} place" : "{count} {filter} places", {
        count,
        filter: filterLabel,
      })
    : t(count === 1 ? "{count} place" : "{count} places", { count });
  if (!count) return t("No matching places");
  return row.signal.level
    ? `${t("Recent community activity: {level}", { level: t(PULSE_NAMES[row.signal.level]) })} · ${places}`
    : t("Explore · {places}", { places });
}

export function regionalGeoJson(
  rows: RegionalDiscovery[],
  selectedId: string | null,
  filterLabel: string | null | undefined,
  t: Translate,
) {
  return {
    type: "FeatureCollection" as const,
    features: rows
      .filter((row) => row.searchedPlaceIds.length > 0)
      .map((row) => ({
        type: "Feature" as const,
        id: row.region.id,
        geometry: {
          type: "Point" as const,
          coordinates: [row.region.anchor.lng, row.region.anchor.lat],
        },
        // Deliberately exclude raw evidence, contributor IDs and internal scores.
        properties: {
          regionId: row.region.id,
          name: t(row.region.name),
          description: regionalDescription(row, filterLabel, t),
          count: row.contextualPlaceIds.length,
          priority:
            row.region.id === selectedId
              ? -10000
              : row.contextualPlaceIds.length
                ? -row.contextualPlaceIds.length
                : 1,
          selected: row.region.id === selectedId,
          contextOpacity:
            row.region.id === selectedId
              ? 1
              : selectedId
                ? row.contextualPlaceIds.length
                  ? 0.76
                  : 0.62
                : row.contextualPlaceIds.length
                  ? 1
                  : 0.55,
        },
      })),
  };
}

export function regionalSymbolLayer(): SymbolLayerSpecification {
  const stops: unknown[] = [];
  for (let step = 0; step <= 10; step++) {
    const zoom = MAP_POLICY.regionFadeStart + step / 10;
    stops.push(zoom, ["*", mapDisclosure(zoom).regionOpacity, ["get", "contextOpacity"]]);
  }
  // Zoom must be the input of the outermost interpolate expression.
  const opacity = ["interpolate", ["linear"], ["zoom"], ...stops] as ExpressionSpecification;
  return {
    id: REGION_LAYER_ID,
    source: REGION_SOURCE_ID,
    type: "symbol",
    maxzoom: MAP_POLICY.regionFadeEnd,
    layout: {
      "icon-image": ["case", ["get", "selected"], "hp-region-selected", "hp-region-core"],
      "icon-size": 1,
      "icon-allow-overlap": false,
      "icon-ignore-placement": false,
      "icon-optional": false,
      "text-optional": false,
      "symbol-sort-key": ["get", "priority"],
      "text-field": [
        "format",
        ["get", "name"],
        { "font-scale": 1 },
        "\n",
        {},
        ["get", "description"],
        { "font-scale": 0.72 },
      ],
      "text-font": ["Noto Sans Regular"],
      "text-size": 13,
      "text-anchor": "top",
      "text-offset": [0, 1.25],
      "text-max-width": 15,
      "text-padding": 5,
      "icon-padding": 5,
      "text-allow-overlap": false,
    },
    paint: {
      "icon-opacity": opacity,
      "text-opacity": opacity,
      "text-color": DAY_MAP_PALETTE.primaryText,
      "text-halo-color": DAY_MAP_PALETTE.land,
      "text-halo-width": 2,
      "text-halo-blur": 0.5,
    },
  };
}

/** One code-drawn sprite, matching existing Pulse geometry. No remote assets. */
export function installRegionalLayer(map: MapLibreMap) {
  if (map.getSource(REGION_SOURCE_ID)) return;
  const sunset =
    getComputedStyle(map.getContainer()).getPropertyValue("--hp-sunset").trim() || "#ed7948";
  for (const selected of [false, true]) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = DAY_MAP_PALETTE.land;
    ctx.beginPath();
    ctx.arc(32, 32, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = DAY_MAP_PALETTE.primaryText;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = sunset;
    ctx.beginPath();
    ctx.arc(32, 32, 14, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      ctx.beginPath();
      ctx.arc(32, 32, 25, 0, Math.PI * 2);
      ctx.stroke();
    }
    map.addImage(
      selected ? "hp-region-selected" : "hp-region-core",
      ctx.getImageData(0, 0, 64, 64),
      { pixelRatio: 2 },
    );
  }
  map.addSource(REGION_SOURCE_ID, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  // Last symbol layer places first in MapLibre's reverse-order collision pass.
  map.addLayer(regionalSymbolLayer());
}

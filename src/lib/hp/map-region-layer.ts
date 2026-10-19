import type {
  ExpressionSpecification,
  Map as MapLibreMap,
  SymbolLayerSpecification,
} from "maplibre-gl";
import { DAY_MAP_PALETTE, type MapCartographyPalette } from "./map-cartography";
import { MAP_POLICY, mapDisclosure } from "./map-policy";
import type { RegionalDiscovery } from "./regional-discovery";
import type { TranslationParams } from "../i18n";
import type { MarkerPulseSignal } from "./marker-pulse";
import { observationLabel } from "./surface-freshness";
import { evaluateFreshness } from "./freshness";

export const REGION_SOURCE_ID = "hp-regional-discovery";
export const REGION_LAYER_ID = "hp-regional-signals";
type Translate = (key: string, params?: TranslationParams) => string;
const TIER_NAMES = { quiet: "Quiet", moving: "Moving", hot: "Hot", live: "Live" } as const;

/** Public copy uses canonical activity tiers and real observation time, never CSS levels. */
export function markerActivityDescription(
  signal: MarkerPulseSignal,
  nowMs: number,
  language: "GR" | "EN",
  t: Translate,
  includeExact = true,
) {
  if (signal.level === null) return t("Community activity unavailable");
  const freshness = evaluateFreshness({ observedAt: signal.lastSignalAt, nowMs });
  // Retained snapshots can outlive their projection clock during recovery.
  // Re-check claims with the shared evidence boundaries, never the fetch time.
  const tier =
    signal.tier === "live" && (!freshness.isCurrent || signal.quality !== "confirmed")
      ? "hot"
      : signal.tier;
  const status = !signal.lastSignalAt
    ? signal.score > 0
      ? t("Community activity unavailable")
      : t("Quiet")
    : freshness.state === "unknown"
      ? t("Community activity unavailable")
      : !freshness.isRecent || signal.score === 0
        ? t("Historical community activity")
        : t("Recent community activity: {level}", { level: t(TIER_NAMES[tier]) });
  if (!signal.lastSignalAt) return status;
  const observed = observationLabel(signal.lastSignalAt, nowMs, language);
  return [status, observed.relative, includeExact ? observed.exact : undefined]
    .filter(Boolean)
    .join(" · ");
}

export function regionalDescription(
  row: RegionalDiscovery,
  filterLabel: string | null | undefined,
  t: Translate,
  nowMs: number,
  language: "GR" | "EN",
  includeExact = false,
) {
  const count = row.contextualPlaceIds.length;
  const places = filterLabel
    ? t(count === 1 ? "{count} {filter} place" : "{count} {filter} places", {
        count,
        filter: filterLabel,
      })
    : t(count === 1 ? "{count} place" : "{count} places", { count });
  if (!count) return t("No matching places");
  return row.signal.level === null
    ? t("Explore · {places}", { places })
    : `${markerActivityDescription(row.signal, nowMs, language, t, includeExact)} · ${places}`;
}

export function regionalGeoJson(
  rows: RegionalDiscovery[],
  selectedId: string | null,
  filterLabel: string | null | undefined,
  t: Translate,
  nowMs: number,
  language: "GR" | "EN",
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
          description: regionalDescription(row, filterLabel, t, nowMs, language),
          count: row.contextualPlaceIds.length,
          priority:
            row.region.id === selectedId
              ? -10000
              : row.contextualPlaceIds.length
                ? -row.contextualPlaceIds.length
                : 1,
          selected: row.region.id === selectedId,
          contextOpacity: row.contextualPlaceIds.length ? 1 : 0.55,
        },
      })),
  };
}

export function regionalSymbolLayer(
  palette: Readonly<MapCartographyPalette> = DAY_MAP_PALETTE,
): SymbolLayerSpecification {
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
      "text-color": palette.primaryText,
      "text-halo-color": palette.land,
      "text-halo-width": 2,
      "text-halo-blur": 0.5,
    },
  };
}

type RegionalPaintMap = Pick<MapLibreMap, "getLayer" | "setPaintProperty"> &
  Partial<Pick<MapLibreMap, "hasImage" | "updateImage">>;
type RegionalSprite = { id: string; selected: boolean; context: CanvasRenderingContext2D };
const regionalSprites = new WeakMap<
  object,
  { sprites: RegionalSprite[]; accent: string; signature: string }
>();
const spriteSignature = (palette: Readonly<MapCartographyPalette>) =>
  `${palette.land}:${palette.primaryText}`;

function drawRegionalSprite(
  sprite: RegionalSprite,
  palette: Readonly<MapCartographyPalette>,
  accent: string,
) {
  const ctx = sprite.context;
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = palette.land;
  ctx.beginPath();
  ctx.arc(32, 32, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = palette.primaryText;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(32, 32, 14, 0, Math.PI * 2);
  ctx.fill();
  if (sprite.selected) {
    ctx.beginPath();
    ctx.arc(32, 32, 25, 0, Math.PI * 2);
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, 64, 64);
}

/** Palette colors share the existing sprite IDs and geometry. Activity accent is independent. */
export function installRegionalLayer(
  map: MapLibreMap,
  palette: Readonly<MapCartographyPalette> = DAY_MAP_PALETTE,
) {
  if (map.getSource(REGION_SOURCE_ID)) return;
  const accent =
    getComputedStyle(map.getContainer()).getPropertyValue("--hp-sunset").trim() || "#ed7948";
  const sprites = [false, true].map((selected) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Regional sprite unavailable");
    const sprite = { id: selected ? "hp-region-selected" : "hp-region-core", selected, context };
    map.addImage(sprite.id, drawRegionalSprite(sprite, palette, accent), { pixelRatio: 2 });
    return sprite;
  });
  map.addSource(REGION_SOURCE_ID, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  // Last symbol layer places first in MapLibre's reverse-order collision pass.
  map.addLayer(regionalSymbolLayer(palette));
  regionalSprites.set(map, { sprites, accent, signature: spriteSignature(palette) });
}

/** Update colors only: no source, layer, sprite ID, disclosure, geometry or marker replacement. */
export function applyRegionalMapPalette(
  map: RegionalPaintMap,
  palette: Readonly<MapCartographyPalette>,
  duration: number,
) {
  if (!map.getLayer(REGION_LAYER_ID)) return;
  for (const [property, value] of [
    ["text-color", palette.primaryText],
    ["text-halo-color", palette.land],
  ] as const) {
    map.setPaintProperty(REGION_LAYER_ID, `${property}-transition`, { duration, delay: 0 });
    map.setPaintProperty(REGION_LAYER_ID, property, value);
  }
  const cached = regionalSprites.get(map);
  if (!cached || cached.signature === spriteSignature(palette) || !map.hasImage || !map.updateImage)
    return;
  for (const sprite of cached.sprites) {
    if (map.hasImage(sprite.id))
      map.updateImage(sprite.id, drawRegionalSprite(sprite, palette, cached.accent));
  }
  cached.signature = spriteSignature(palette);
}

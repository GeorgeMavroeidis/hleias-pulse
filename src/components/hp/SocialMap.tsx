import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Button } from "@/components/ui/button";
import { HP_MOTION } from "@/lib/hp/motion";
import { createMarkerExits } from "@/lib/hp/marker-exit";
import { IONIAN_LAND_POLYGONS } from "@/lib/hp/ionian-land";
import { isFatalBasemapError } from "@/lib/hp/map-core";
import {
  createMapViewportSync,
  localMapFault,
  loadMapStyleForAcceptance,
  startMapInitialization,
  uniqueMapPlaces,
  type MapAttemptState,
} from "@/lib/hp/map-initialization";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, Crosshair, MapPinned, Minus, Plus } from "lucide-react";
import {
  MAP_POLICY,
  mapDisclosure,
  topologyBlend,
  paddedBounds,
  type MapBounds,
} from "@/lib/hp/map-policy";
import { createMapTopology, topologyKey, blendTopologies } from "@/lib/hp/map-topology";
import {
  discoveryViewport,
  visibleScreenMembers,
  viewportSignature,
  type RegionalDiscovery,
  type MapDiscoveryViewport,
} from "@/lib/hp/regional-discovery";
import {
  installRegionalLayer,
  regionalGeoJson,
  regionalDescription,
  markerActivityDescription,
  REGION_LAYER_ID,
  REGION_SOURCE_ID,
} from "@/lib/hp/map-region-layer";
export type { MapDiscoveryViewport } from "@/lib/hp/regional-discovery";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  ErrorEvent as MapLibreErrorEvent,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  StyleSpecification,
  GeoJSONSource,
} from "maplibre-gl";
import { type EventItem, type Place } from "@/lib/hp-model";
import { createIliaMapStyle } from "@/lib/hp/map-cartography";
import { areaIdForPlace, type AreaTone } from "@/lib/hp/area-catalog";
import { eventCountForPlace, type MapAreaCluster } from "@/lib/hp/map-clusters";
export { buildAreaClusters, type MapAreaCluster } from "@/lib/hp/map-clusters";
import {
  aggregateClusterProminence,
  deriveMarkerProminence,
  type DiscoveryLens,
  type DiscoverySnapshot,
  type MarkerProminence,
} from "@/lib/hp/discovery";
import {
  aggregatePulseMetrics,
  pulseMetricForPlace,
  type PulseActivitySnapshot,
  type PulseTier,
} from "@/lib/hp/pulse-activity";
import { useI18n } from "@/lib/i18n";
import {
  childMarkerSize,
  clusterMarkerSize,
  markerMotionPhase,
  markerViewportDensity,
  markerLabelVisibility,
  MARKER_LABEL_WIDTH,
} from "@/lib/hp/map-visuals";
import {
  markerPulseForPlace,
  type MarkerPulseSignal,
  type MarkerPulseSnapshot,
} from "@/lib/hp/marker-pulse";
import type { TranslationParams } from "@/lib/i18n";

const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

async function loadIliaBasemap(signal: AbortSignal): Promise<StyleSpecification> {
  const response = await fetch(OPENFREEMAP_STYLE_URL, { signal });
  if (!response.ok) {
    throw new Error(`Basemap style request failed (${response.status}).`);
  }
  return createIliaMapStyle((await response.json()) as StyleSpecification);
}

/** A source-free style avoids worker-backed tile/GeoJSON loading in the local preview. */
function localPreviewBasemapStyle(): StyleSpecification {
  return {
    version: 8,
    name: "Ilia local preview",
    sources: {},
    layers: [
      {
        id: "hp-preview-sea",
        type: "background",
        paint: { "background-color": "#b9dce4" },
      },
    ],
  };
}

/**
 * Project the bundled Natural Earth coast into an SVG above the preview canvas.
 * MapLibre's GeoJSON worker is unavailable in some embedded browsers, but its
 * map projection and DOM markers still work there. This layer uses neither a
 * worker nor a network request and stays aligned during pan and zoom.
 */
function attachLocalPreviewLand(map: MapLibreMap): () => void {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.style.inset = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.zIndex = "1";
  svg.style.pointerEvents = "none";
  const paths = IONIAN_LAND_POLYGONS.map(() => {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("fill", "#eee7d8");
    path.setAttribute("stroke", "#b6b89c");
    path.setAttribute("stroke-width", "1.2");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("fill-rule", "evenodd");
    svg.append(path);
    return path;
  });
  map.getCanvasContainer().append(svg);

  let active = true;
  let frame: number | null = null;
  const draw = () => {
    frame = null;
    if (!active) return;
    const width = map.getContainer().clientWidth;
    const height = map.getContainer().clientHeight;
    if (width <= 0 || height <= 0) return;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    IONIAN_LAND_POLYGONS.forEach((polygon, index) => {
      const d = polygon
        .map(
          (ring) =>
            ring
              .map(([lng, lat], pointIndex) => {
                const point = map.project([lng, lat]);
                return `${pointIndex === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
              })
              .join(" ") + " Z",
        )
        .join(" ");
      paths[index].setAttribute("d", d);
    });
  };
  const scheduleDraw = () => {
    if (!active || frame !== null) return;
    frame = window.requestAnimationFrame(draw);
  };
  map.on("move", scheduleDraw);
  map.on("resize", scheduleDraw);
  scheduleDraw();
  return () => {
    active = false;
    map.off("move", scheduleDraw);
    map.off("resize", scheduleDraw);
    if (frame !== null) window.cancelAnimationFrame(frame);
    svg.remove();
  };
}

type LatLngTuple = [number, number];
type InteractiveMarkerElement = HTMLElement & {
  __hpClickHandler?: EventListener;
  __hpKeyHandler?: EventListener;
};

type MarkerRuntimeState = {
  lat: number;
  lng: number;
  opacity: number;
  selected: boolean;
  visible: boolean;
  zIndexOffset: number;
  lensOpacity: number;
  lensScale: number;
  prominenceBand: MarkerProminence["band"];
};

const ILIA_CENTER: LatLngTuple = [MAP_POLICY.center[1], MAP_POLICY.center[0]];
const PREVIEW_CENTER: LatLngTuple = [37.72, 21.38];
const PREVIEW_OVERVIEW_ZOOM = 8.6;
const MIN_ZOOM = MAP_POLICY.minZoom;
const MAX_ZOOM = MAP_POLICY.maxZoom;
const OVERVIEW_ZOOM = MAP_POLICY.overviewZoom;
const SPLIT_ZOOM = MAP_POLICY.regionFadeEnd;
const PLACE_FOCUS_ZOOM = MAP_POLICY.placeFocusZoom;
const RICH_VISUAL_ZOOM = MAP_POLICY.regionFocusMaxZoom;
const MAP_PAN_DURATION = HP_MOTION.pan / 1000;
const MAP_OVERVIEW_DURATION = HP_MOTION.overview / 1000;
const MAP_FOCUS_DURATION = MAP_POLICY.focusDurationMs / 1000;
const MIN_UTILITY_RAIL_HEIGHT = 248;
const MIN_MAP_CHROME_HEIGHT = 188;
const SAFE_MARKER_RADIUS = 48;

type SafeMapRect = { left: number; right: number; top: number; bottom: number };

const prefersReducedMapMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function safeMapRect(
  container: HTMLElement,
  bottomOverlayHeight: number,
  availableMapHeight: number,
  markerRadius = SAFE_MARKER_RADIUS,
): SafeMapRect {
  const railVisible = availableMapHeight >= MIN_UTILITY_RAIL_HEIGHT;
  const chromeVisible = availableMapHeight >= MIN_MAP_CHROME_HEIGHT;
  const edgeInset = 20 + markerRadius;
  const rawBottom = Math.max(
    edgeInset + 32,
    container.clientHeight - bottomOverlayHeight - 20 - markerRadius,
  );
  const desiredTop = (chromeVisible ? 108 : 20) + markerRadius;
  const top = Math.max(edgeInset, Math.min(desiredTop, rawBottom - 32));
  return {
    left: edgeInset,
    right: Math.max(edgeInset + 32, container.clientWidth - (railVisible ? 64 : 20) - markerRadius),
    top,
    bottom: Math.max(top + 32, rawBottom),
  };
}

function panDeltaIntoSafeRect(point: { x: number; y: number }, rect: SafeMapRect) {
  const x =
    point.x < rect.left ? point.x - rect.left : point.x > rect.right ? point.x - rect.right : 0;
  const y =
    point.y < rect.top ? point.y - rect.top : point.y > rect.bottom ? point.y - rect.bottom : 0;
  return { x, y };
}

function pointIsInSafeRect(point: { x: number; y: number }, rect: SafeMapRect) {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

type ChildRenderNode = {
  id: string;
  kind: "child";
  cluster: MapAreaCluster;
  place: Place;
  eventCount: number;
  latLng: LatLngTuple;
  opacity: number;
  selected: boolean;
  solo: boolean;
  tier: PulseTier;
  pulse: MarkerPulseSignal;
  prominence: MarkerProminence;
};

type ActivityClusterRenderNode = {
  id: string;
  kind: "activity-cluster";
  clusterId: number;
  dominantCluster: MapAreaCluster;
  leaves: Place[];
  latLng: LatLngTuple;
  opacity: number;
  pointCount: number;
  eventCount: number;
  postCount: number;
  hotness: number;
  selected: boolean;
  tone: AreaTone;
  tier: PulseTier;
  prominence: MarkerProminence;
};

type RenderNode = ActivityClusterRenderNode | ChildRenderNode;

function clusterIdForPlace(place: Place) {
  return areaIdForPlace(place);
}

export function getMapAreaIdForPlace(place: Place) {
  return clusterIdForPlace(place);
}

function createPulseIcon(kind: RenderNode["kind"]) {
  const element = document.createElement("div");
  element.className = `${kind === "child" ? "hp-child-marker" : "hp-activity-cluster"} hp-pulse-marker`;
  element.dataset.markerKind = kind;
  const shell = document.createElement("div");
  shell.className = `${kind === "child" ? "hp-child-marker__shell" : "hp-area-marker__shell"} hp-pulse-shell`;
  // Static anatomy only. Every content field is updated with textContent.
  for (const part of [
    "ring",
    "selection-ring",
    "selection-accent",
    "core",
    "event",
    "story",
    "label",
  ]) {
    const span = document.createElement("span");
    span.className = `hp-pulse-${part}`;
    span.setAttribute("aria-hidden", "true");
    shell.append(span);
  }
  element.append(shell);
  return element;
}

function updatePulseIcon(
  element: HTMLElement,
  node: RenderNode,
  hasStory: boolean,
  t: (key: string, params?: TranslationParams) => string,
  nowMs: number,
  language: "GR" | "EN",
) {
  const shell = element.firstElementChild as HTMLElement;
  const signal = node.kind === "child" ? node.pulse : null;
  const level = signal?.level ?? "neutral";
  if (shell.dataset.pulseLevel !== level) shell.dataset.pulseLevel = level;
  if (shell.dataset.signalQuality !== signal?.quality) {
    if (signal) shell.dataset.signalQuality = signal.quality;
    else delete shell.dataset.signalQuality;
  }
  const count = node.kind === "activity-cluster" ? node.pointCount : 0;
  const size =
    node.kind === "child" ? childMarkerSize(signal?.level ?? null) : clusterMarkerSize(count);
  const cssSize = `${size}px`;
  if (shell.style.getPropertyValue("--hp-core-size") !== cssSize)
    shell.style.setProperty("--hp-core-size", cssSize);
  if (!shell.style.getPropertyValue("--hp-motion-phase"))
    shell.style.setProperty("--hp-motion-phase", String(markerMotionPhase(node.id)));
  const hasEvents = node.kind === "child" && node.eventCount > 0;
  shell.classList.toggle("has-events", hasEvents);
  shell.classList.toggle("has-stories", hasStory);
  const name = node.kind === "child" ? node.place.name : node.dominantCluster.name;
  const setText = (selector: string, value: string) => {
    const part = shell.querySelector<HTMLElement>(selector);
    if (part && part.textContent !== value) part.textContent = value;
  };
  setText(".hp-pulse-core", count ? String(count) : "");
  setText(".hp-pulse-label", name);
  const activity = signal
    ? markerActivityDescription(signal, nowMs, language, t)
    : t("Community activity unavailable");
  const label =
    node.kind === "child"
      ? [
          t("Open {place}", { place: name }),
          activity,
          hasEvents ? t("Events listed") : "",
          hasStory ? t("Stories available") : "",
        ]
          .filter(Boolean)
          .join(". ")
      : t("Zoom into {count} places near {area}", { count, area: name });
  if (element.getAttribute("aria-label") !== label) element.setAttribute("aria-label", label);
  if (element.title !== label) element.title = label;
}

function applyMarkerZoomProfile(node: HTMLElement | null, zoom: number) {
  node?.classList.toggle("hp-map-motion-far", zoom < MAP_POLICY.motionZoom);
}

// Include the selected label footprint, while the geographic core stays fixed.
function markerCoreRadius(node: RenderNode, _zoom: number) {
  if (node.selected) return MARKER_LABEL_WIDTH / 2 + 6;
  const size =
    node.kind === "child" ? childMarkerSize(node.pulse.level) : clusterMarkerSize(node.pointCount);
  return size / 2 + 6;
}

interface Props {
  clusters: MapAreaCluster[];
  regions: RegionalDiscovery[];
  events: EventItem[];
  activitySnapshot: PulseActivitySnapshot;
  markerPulseSnapshot: MarkerPulseSnapshot;
  nowMs: number;
  selectedAreaId: string | null;
  selectedPlaceId?: string | null;
  activeFilterLabel?: string | null;
  activeLens?: DiscoveryLens | null;
  discoverySnapshot?: DiscoverySnapshot;
  storyPlaceIds?: ReadonlySet<string>;
  onSelectArea: (cluster: MapAreaCluster) => void;
  onSelectPlace: (place: Place, cluster: MapAreaCluster) => void;
  onOpenPlace: (place: Place) => void;
  totalPlaceCount: number;
  searchQuery?: string;
  onClearSearch?: () => void;
  onRefreshPlaces?: () => void;
  onAvailabilityChange?: (available: boolean) => void;
  onResetView: () => void;
  onClearSelection: () => void;
  onDiscoveryViewportChange?: (viewport: MapDiscoveryViewport) => void;
  canGoBack?: boolean;
  onBack?: () => void;
  bottomOverlayHeight: number;
  availableMapHeight: number;
  routePreview?: {
    stops: { lat: number; lng: number; label: string }[];
    geometry: [number, number][] | null;
  } | null;
  /** Fired on map long-press so the shell can open the composer pre-filled. */
  onMapLongPress?: (lat: number, lng: number) => void;
  previewMode?: boolean;
}

const NEUTRAL_PROMINENCE: MarkerProminence = {
  score: 1,
  band: "high",
  opacityFactor: 1,
  scaleFactor: 1,
  zIndexBoost: 0,
};

export function SocialMap({
  clusters,
  regions,
  events,
  activitySnapshot,
  markerPulseSnapshot,
  nowMs,
  selectedAreaId,
  selectedPlaceId,
  activeFilterLabel,
  activeLens = null,
  discoverySnapshot = { places: {}, areas: {} },
  storyPlaceIds,
  onSelectArea,
  onSelectPlace,
  onOpenPlace,
  totalPlaceCount,
  searchQuery = "",
  onClearSearch,
  onRefreshPlaces,
  onAvailabilityChange,
  onResetView,
  onClearSelection,
  onDiscoveryViewportChange,
  canGoBack = false,
  onBack,
  bottomOverlayHeight,
  availableMapHeight,
  routePreview = null,
  onMapLongPress,
  previewMode = false,
}: Props) {
  const { t, language } = useI18n();
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreModuleRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<Map<string, MapLibreMarker>>(new Map());
  const markerRuntimeRef = useRef<Map<string, MarkerRuntimeState>>(new Map());
  const markerExitsRef = useRef(createMarkerExits());
  const previewRegionMarkersRef = useRef<Map<string, MapLibreMarker>>(new Map());
  const renderNodesRef = useRef<Map<string, RenderNode>>(new Map());
  const scheduleMarkerViewportSyncRef = useRef<() => void>(() => {});
  const activateMarkerByIdRef = useRef<(id: string) => void>(() => undefined);
  const userMarkerRef = useRef<MapLibreMarker | null>(null);
  const routeStopMarkersRef = useRef<MapLibreMarker[]>([]);
  const onMapLongPressRef = useRef(onMapLongPress);
  onMapLongPressRef.current = onMapLongPress;
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;
  const onDiscoveryViewportChangeRef = useRef(onDiscoveryViewportChange);
  onDiscoveryViewportChangeRef.current = onDiscoveryViewportChange;
  const lastDiscoveryViewportRef = useRef("");
  const regionsRef = useRef(regions);
  regionsRef.current = regions;
  const selectRegionRef = useRef<(id: string) => void>(() => {});
  const userNavigatedRef = useRef(false);
  const explicitBackRef = useRef(false);
  const [settledBounds, setSettledBounds] = useState<MapBounds>(MAP_POLICY.panBounds);
  const [visibleRegionSymbolIds, setVisibleRegionSymbolIds] = useState<string[]>([]);
  const [settledViewport, setSettledViewport] = useState<MapDiscoveryViewport | null>(null);
  const bottomOverlayHeightRef = useRef(bottomOverlayHeight);
  bottomOverlayHeightRef.current = bottomOverlayHeight;
  const availableMapHeightRef = useRef(availableMapHeight);
  availableMapHeightRef.current = availableMapHeight;
  const didInitialFitRef = useRef(false);
  const lastMarkerActivationRef = useRef<{ id: string; at: number } | null>(null);
  const previousMapReadyRef = useRef(false);
  const previousSelectionRef = useRef<{ areaId: string | null; placeId: string | null }>({
    areaId: null,
    placeId: null,
  });
  const lastFocusedPlaceIdRef = useRef<string | null>(null);
  const selectionMotionUntilRef = useRef(0);
  const cameraHandledSelectionRef = useRef<string | null>(null);
  const ignoreBackgroundClickUntilRef = useRef(0);
  const lastZoomRef = useRef<number>(OVERVIEW_ZOOM);
  const [mapAttemptNumber, setMapAttemptNumber] = useState(0);
  const [mapAttemptState, setMapAttemptState] = useState<MapAttemptState>({
    attempt: 0,
    status: "loading",
  });
  const mapReady = mapAttemptState.status === "ready";
  const recoveryTitleRef = useRef<HTMLHeadingElement>(null);
  const onAvailabilityChangeRef = useRef(onAvailabilityChange);
  onAvailabilityChangeRef.current = onAvailabilityChange;
  useEffect(() => {
    onAvailabilityChangeRef.current?.(mapReady);
  }, [mapReady]);
  const restoreMapFocusRef = useRef(false);
  const fallbackPlaces = useMemo(
    () => uniqueMapPlaces(clusters.map((cluster) => cluster.places)),
    [clusters],
  );
  const [zoom, setZoom] = useState<number>(OVERVIEW_ZOOM);
  const [attributionExpanded, setAttributionExpanded] = useState(true);
  const selectionKey = `${selectedAreaId ?? ""}|${selectedPlaceId ?? ""}`;
  const selectionKeyRef = useRef(selectionKey);
  selectionKeyRef.current = selectionKey;

  const eventCounts = useMemo(() => eventCountForPlace(events), [events]);
  const clusterById = useMemo(
    () => new Map(clusters.map((cluster) => [cluster.id, cluster] as const)),
    [clusters],
  );
  const placeById = useMemo(() => {
    const places = new Map<string, { cluster: MapAreaCluster; place: Place }>();
    clusters.forEach((cluster) => {
      cluster.places.forEach((place) => places.set(place.id, { cluster, place }));
    });
    return places;
  }, [clusters]);
  const selectedAreaCluster = useMemo(
    () => (selectedAreaId ? (clusterById.get(selectedAreaId) ?? null) : null),
    [clusterById, selectedAreaId],
  );
  const selectedPlaceNode = useMemo(() => {
    if (!selectedPlaceId) return null;
    return placeById.get(selectedPlaceId) ?? null;
  }, [placeById, selectedPlaceId]);
  const isSplitZoom = zoom >= SPLIT_ZOOM;

  const coordinateKey = useMemo(
    () => topologyKey([...placeById.values()].map((n) => n.place)),
    [placeById],
  );
  const placeTopology = useMemo(() => createMapTopology(coordinateKey), [coordinateKey]);
  const placeTopologyRef = useRef(placeTopology);
  placeTopologyRef.current = placeTopology;
  const { lower: lowerZoom, upper: upperZoom } = topologyBlend(zoom);
  const topologyBounds = useMemo(() => paddedBounds(settledBounds), [settledBounds]);
  const topologyPair = useMemo(
    () => ({
      lower: placeTopology.query(lowerZoom, topologyBounds),
      upper: placeTopology.query(upperZoom, topologyBounds),
    }),
    [placeTopology, lowerZoom, upperZoom, topologyBounds],
  );
  const baseNodes = useMemo(() => {
    const nodes = new Map<string, RenderNode>();
    const topologyNodes = new Map(
      [...topologyPair.lower, ...topologyPair.upper].map((n) => [n.id, n]),
    );
    topologyNodes.forEach((node) => {
      if (node.clusterId === undefined) {
        const entry = placeById.get(node.placeIds[0]);
        if (!entry) return;
        const activity = pulseMetricForPlace(
          entry.place,
          activitySnapshot,
          eventCounts.get(entry.place.id) ?? 0,
        );
        nodes.set(node.id, {
          id: node.id,
          kind: "child",
          cluster: entry.cluster,
          place: entry.place,
          eventCount: activity.eventCount,
          latLng: [entry.place.lat, entry.place.lng],
          opacity: 1,
          selected: false,
          solo: entry.cluster.places.length === 1,
          tier: activity.tier,
          pulse: markerPulseForPlace(entry.place.id, markerPulseSnapshot),
          prominence: NEUTRAL_PROMINENCE,
        });
        return;
      }
      const leaves = node.placeIds.flatMap((id) => {
        const entry = placeById.get(id);
        return entry ? [entry.place] : [];
      });
      const membership = new Map<string, number>();
      leaves.forEach((p) =>
        membership.set(clusterIdForPlace(p), (membership.get(clusterIdForPlace(p)) ?? 0) + 1),
      );
      const dominantId = [...membership].sort(
        ([a, x], [b, y]) => y - x || a.localeCompare(b),
      )[0]?.[0];
      const dominantCluster = clusterById.get(dominantId);
      if (!dominantCluster) return;
      const activity = aggregatePulseMetrics(leaves, activitySnapshot, eventCounts);
      nodes.set(node.id, {
        id: node.id,
        kind: "activity-cluster",
        clusterId: node.clusterId,
        dominantCluster,
        leaves,
        latLng: [node.lat, node.lng],
        opacity: 1,
        pointCount: leaves.length,
        eventCount: activity.eventCount,
        postCount: activity.postCount,
        hotness: activity.hotness,
        selected: false,
        tone: dominantCluster.tone,
        tier: activity.tier,
        prominence: NEUTRAL_PROMINENCE,
      });
    });
    return nodes;
  }, [topologyPair, placeById, clusterById, activitySnapshot, eventCounts, markerPulseSnapshot]);
  const renderNodes = useMemo<RenderNode[]>(() => {
    const nodes = blendTopologies(topologyPair.lower, topologyPair.upper, zoom).flatMap((node) => {
      const base = baseNodes.get(node.id);
      return base ? [{ ...base, opacity: node.opacity }] : [];
    });
    if (selectedPlaceNode) {
      const id = `place-${selectedPlaceNode.place.id}`;
      let node = nodes.find((n) => n.id === id);
      if (!node) {
        const { place, cluster } = selectedPlaceNode;
        const activity = pulseMetricForPlace(
          place,
          activitySnapshot,
          eventCounts.get(place.id) ?? 0,
        );
        node = {
          id,
          kind: "child",
          place,
          cluster,
          eventCount: activity.eventCount,
          latLng: [place.lat, place.lng],
          opacity: 1,
          selected: true,
          solo: cluster.places.length === 1,
          tier: activity.tier,
          pulse: markerPulseForPlace(place.id, markerPulseSnapshot),
          prominence: NEUTRAL_PROMINENCE,
        };
        nodes.push(node);
      }
      node.selected = true;
      node.opacity = 1;
    } else if (selectedAreaId && zoom >= MAP_POLICY.regionFadeEnd) {
      const region = regions.find((row) => row.region.id === selectedAreaId)?.region;
      const matches = nodes.filter((n) =>
        n.kind === "child"
          ? n.cluster.id === selectedAreaId
          : n.kind === "activity-cluster" &&
            n.leaves.some((p) => clusterIdForPlace(p) === selectedAreaId),
      );
      const distance = (n: RenderNode) =>
        region
          ? (n.latLng[0] - region.anchor.lat) ** 2 + (n.latLng[1] - region.anchor.lng) ** 2
          : 0;
      matches.sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id));
      if (matches[0]) matches[0].selected = true;
    }
    const hasSelection = Boolean(selectedAreaId || selectedPlaceId);
    nodes.forEach((node) => {
      if (node.kind === "child")
        node.prominence = deriveMarkerProminence(
          discoverySnapshot.places[node.place.id],
          node.cluster.intelligence,
          activeLens,
          { selected: node.selected, hasSelection },
        );
      else if (node.kind === "activity-cluster")
        node.prominence = aggregateClusterProminence(
          node.leaves.map((place) =>
            deriveMarkerProminence(
              discoverySnapshot.places[place.id],
              placeById.get(place.id)?.cluster.intelligence,
              activeLens,
              { hasSelection },
            ),
          ),
          { selected: node.selected, hasSelection },
        );
    });
    return nodes;
  }, [
    zoom,
    topologyPair,
    baseNodes,
    selectedPlaceNode,
    selectedAreaId,
    selectedPlaceId,
    regions,
    activitySnapshot,
    eventCounts,
    markerPulseSnapshot,
    activeLens,
    discoverySnapshot,
    placeById,
  ]);

  renderNodesRef.current = new Map(renderNodes.map((node) => [node.id, node]));
  const primarySelectedNode = renderNodes.find((node) => node.selected) ?? null;
  const hasPrimaryMarkerSelection = Boolean(primarySelectedNode);
  const primarySelectedNodeRef = useRef(primarySelectedNode);
  primarySelectedNodeRef.current = primarySelectedNode;

  const summaryText = useMemo(() => {
    if (selectedPlaceNode) return selectedPlaceNode.place.name;
    if (selectedAreaCluster) return t("{area} places", { area: selectedAreaCluster.name });
    if (isSplitZoom) return t("Tap a place or cluster");
    if (activeFilterLabel) return t("{filter} areas", { filter: activeFilterLabel });
    return t("{count} places", {
      count: clusters.reduce((sum, cluster) => sum + cluster.places.length, 0),
    });
  }, [activeFilterLabel, clusters, isSplitZoom, selectedAreaCluster, selectedPlaceNode, t]);

  const discoveryChipClusters = useMemo(() => {
    const visible = new Set(
      settledViewport?.hierarchyLevel === "region" ||
        settledViewport?.hierarchyLevel === "transition"
        ? visibleRegionSymbolIds
        : (settledViewport?.visibleAreaIds ?? []),
    );
    return regions
      .filter(
        (row) =>
          row.searchedPlaceIds.length &&
          (visible.has(row.region.id) || row.region.id === selectedAreaId),
      )
      .sort(
        (a, b) =>
          Number(b.region.id === selectedAreaId) - Number(a.region.id === selectedAreaId) ||
          b.contextualPlaceIds.length - a.contextualPlaceIds.length ||
          a.region.id.localeCompare(b.region.id),
      )
      .slice(0, 24)
      .flatMap((row) => {
        const cluster = clusterById.get(row.region.id);
        return cluster ? [{ cluster, row }] : [];
      });
  }, [regions, selectedAreaId, settledViewport, visibleRegionSymbolIds, clusterById]);

  const zoomIntoCluster = useCallback((cluster: MapAreaCluster) => {
    const map = mapRef.current;
    const container = mapNodeRef.current;
    const region = regionsRef.current.find((row) => row.region.id === cluster.id)?.region;
    if (!map || !container || !region) return;
    userNavigatedRef.current = false;
    const viewport = safeMapRect(
      container,
      bottomOverlayHeightRef.current,
      availableMapHeightRef.current,
      24,
    );
    const padding = {
      left: viewport.left,
      right: container.clientWidth - viewport.right,
      top: viewport.top,
      bottom: container.clientHeight - viewport.bottom,
    };
    const reduceMotion = prefersReducedMapMotion();
    map.stop();
    selectionMotionUntilRef.current =
      Date.now() + (reduceMotion ? 0 : MAP_POLICY.focusDurationMs + 40);
    if (
      region.bounds[0][0] === region.bounds[1][0] &&
      region.bounds[0][1] === region.bounds[1][1]
    ) {
      map.easeTo({
        center: [region.anchor.lng, region.anchor.lat],
        zoom: MAP_POLICY.regionFocusMaxZoom,
        offset: [
          (viewport.left + viewport.right - container.clientWidth) / 2,
          (viewport.top + viewport.bottom - container.clientHeight) / 2,
        ],
        duration: reduceMotion ? 0 : MAP_POLICY.focusDurationMs,
      });
    } else
      map.fitBounds(region.bounds, {
        duration: reduceMotion ? 0 : MAP_POLICY.focusDurationMs,
        maxZoom: MAP_POLICY.regionFocusMaxZoom,
        padding,
      });
  }, []);

  const zoomIntoActivityCluster = useCallback(
    (node: ActivityClusterRenderNode) => {
      const map = mapRef.current;
      const container = mapNodeRef.current;
      if (!map || !container) return;

      const expansionZoom = placeTopology.index.getClusterExpansionZoom(node.clusterId);
      const targetZoom = Math.min(PLACE_FOCUS_ZOOM, Math.max(map.getZoom() + 0.75, expansionZoom));
      const viewport = safeMapRect(
        container,
        bottomOverlayHeightRef.current,
        availableMapHeightRef.current,
        markerCoreRadius({ ...node, selected: true }, targetZoom),
      );
      const desiredPoint = {
        x: (viewport.left + viewport.right) / 2,
        y: (viewport.top + viewport.bottom) / 2,
      };
      const offset: [number, number] = [
        desiredPoint.x - container.clientWidth / 2,
        desiredPoint.y - container.clientHeight / 2,
      ];
      const reduceMotion = prefersReducedMapMotion();
      userNavigatedRef.current = false;
      map.stop();
      selectionMotionUntilRef.current =
        Date.now() + (reduceMotion ? 0 : MAP_POLICY.focusDurationMs + 40);
      if (reduceMotion) {
        map.easeTo({
          center: [node.latLng[1], node.latLng[0]],
          zoom: targetZoom,
          offset,
          duration: 0,
        });
      } else {
        map.flyTo({
          center: [node.latLng[1], node.latLng[0]],
          zoom: targetZoom,
          offset,
          duration: MAP_FOCUS_DURATION * 1000,
          essential: true,
        });
      }
    },
    [placeTopology],
  );

  const flyToOverview = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    userNavigatedRef.current = false;
    map.stop();
    if (prefersReducedMapMotion()) {
      map.jumpTo({ center: [ILIA_CENTER[1], ILIA_CENTER[0]], zoom: OVERVIEW_ZOOM });
    } else {
      map.flyTo({
        center: [ILIA_CENTER[1], ILIA_CENTER[0]],
        zoom: OVERVIEW_ZOOM,
        duration: MAP_OVERVIEW_DURATION * 1000,
        essential: true,
      });
    }
  }, []);

  activateMarkerByIdRef.current = (id: string) => {
    const node = renderNodesRef.current.get(id);
    if (!node) return;

    const now = Date.now();
    const previousActivation = lastMarkerActivationRef.current;
    if (previousActivation?.id === id && now - previousActivation.at < 420) return;
    lastMarkerActivationRef.current = { id, at: now };

    if (node.kind === "activity-cluster") {
      const nextSelectionKey = `${node.dominantCluster.id}|`;
      if (selectionKeyRef.current !== nextSelectionKey) {
        cameraHandledSelectionRef.current = nextSelectionKey;
      }
      onSelectArea(node.dominantCluster);
      zoomIntoActivityCluster(node);
    } else {
      onSelectPlace(node.place, node.cluster);
    }
  };

  selectRegionRef.current = (id) => {
    const cluster = clusterById.get(id);
    if (!cluster) return;
    cameraHandledSelectionRef.current = `${id}|`;
    onSelectArea(cluster);
    zoomIntoCluster(cluster);
  };

  useEffect(() => {
    const wasReady = previousMapReadyRef.current;
    previousMapReadyRef.current = mapReady;
    if (!mapReady) return;
    const previous = previousSelectionRef.current;
    const next = { areaId: selectedAreaId, placeId: selectedPlaceId ?? null };
    // Preserve pending restoration until its actual place/area data is ready.
    if (next.areaId && !next.placeId && !clusterById.has(next.areaId)) return;
    previousSelectionRef.current = next;
    if (!wasReady && next.areaId && !next.placeId) {
      const cluster = clusterById.get(next.areaId);
      if (cluster) zoomIntoCluster(cluster);
      return;
    }
    const key = `${next.areaId ?? ""}|${next.placeId ?? ""}`;
    if (cameraHandledSelectionRef.current === key) {
      cameraHandledSelectionRef.current = null;
      return;
    }
    if (next.areaId && !next.placeId && (next.areaId !== previous.areaId || previous.placeId)) {
      const cluster = clusterById.get(next.areaId);
      if (cluster) zoomIntoCluster(cluster);
    }
    if (
      explicitBackRef.current &&
      !next.areaId &&
      !next.placeId &&
      (previous.areaId || previous.placeId)
    )
      flyToOverview();
    explicitBackRef.current = false;
    // Filter-pruned selection does not move the user's viewport.
  }, [clusterById, flyToOverview, mapReady, selectedAreaId, selectedPlaceId, zoomIntoCluster]);

  useEffect(() => {
    let map: MapLibreMap | null = null;
    let mapHasLoaded = false;
    let zoomFrame: number | null = null;
    let effectsResumeFrame: number | null = null;
    let resizeFrame: number | null = null;
    const activeMapMotion = new Set<"move" | "zoom">();
    const markers = markersRef.current;
    const markerRuntimes = markerRuntimeRef.current;
    const container = mapNodeRef.current;
    const attempt = startMapInitialization({
      attempt: mapAttemptNumber,
      onStateChange: setMapAttemptState,
      loadLibrary: () => import("maplibre-gl"),
      loadStyle: (signal) =>
        loadMapStyleForAcceptance(
          localMapFault(
            {
              DEV: import.meta.env.DEV,
              MODE: import.meta.env.MODE,
              VITE_HLEIAS_LOCAL_ONLY: import.meta.env.VITE_HLEIAS_LOCAL_ONLY,
            },
            window.location.hostname,
            window.location.search,
            mapAttemptNumber,
          ),
          signal,
          () =>
            previewMode ? Promise.resolve(localPreviewBasemapStyle()) : loadIliaBasemap(signal),
        ),
      createMap: (maplibre, basemapStyle) => {
        if (!container) throw new Error("Map container unavailable");
        maplibre.setWorkerUrl(mapWorkerUrl);
        maplibreModuleRef.current = maplibre;
        return new maplibre.Map({
          container,
          style: basemapStyle,
          attributionControl: false,
          center: previewMode
            ? [PREVIEW_CENTER[1], PREVIEW_CENTER[0]]
            : [ILIA_CENTER[1], ILIA_CENTER[0]],
          doubleClickZoom: true,
          maxBounds: MAP_POLICY.panBounds,
          crossSourceCollisions: true,
          maxZoom: MAX_ZOOM,
          minZoom: MIN_ZOOM,
          zoom: previewMode ? PREVIEW_OVERVIEW_ZOOM : OVERVIEW_ZOOM,
          maplibreLogo: false,
          renderWorldCopies: false,
        });
      },
      removeMap: (instance) => instance.remove(),
      prepareMap: (instance, maplibre, attempt) => {
        map = instance;
        mapRef.current = map;
        if (previewMode) attempt.addCleanup(attachLocalPreviewLand(map));
        const onBasemapError = (event: MapLibreErrorEvent) => {
          if (!attempt.isActive()) return;
          const sourceId = "sourceId" in event ? event.sourceId : undefined;
          if (isFatalBasemapError(mapHasLoaded, sourceId)) {
            attempt.fail();
          }
        };
        map.on("error", onBasemapError);
        attempt.addCleanup(() => map?.off("error", onBasemapError));

        const onMapClick = (event: {
          originalEvent: MouseEvent;
          point: { x: number; y: number };
        }) => {
          if (!attempt.isActive() || Date.now() < ignoreBackgroundClickUntilRef.current) return;
          if (
            !previewMode &&
            map &&
            mapRef.current === map &&
            mapDisclosure(map.getZoom()).regionOpacity > 0.08 &&
            map.getLayer(REGION_LAYER_ID)
          ) {
            const [hit] = map.queryRenderedFeatures(
              [
                [event.point.x - 14, event.point.y - 14],
                [event.point.x + 14, event.point.y + 14],
              ],
              { layers: [REGION_LAYER_ID] },
            );
            if (hit?.properties?.regionId) {
              selectRegionRef.current(String(hit.properties.regionId));
              return;
            }
          }
          const target = event.originalEvent?.target as Element | null;
          if (target?.closest(".maplibregl-marker, .maplibregl-control-container, button, a"))
            return;
          if (selectionKeyRef.current === "|") return;

          cameraHandledSelectionRef.current = "|";
          onClearSelectionRef.current();
        };
        map.on("click", onMapClick);
        attempt.addCleanup(() => map?.off("click", onMapClick));

        if (mapNodeRef.current) {
          const mapContainer = mapNodeRef.current;
          const resizeObserver = new ResizeObserver(() => {
            if (attempt.isActive()) map?.resize();
          });
          resizeObserver.observe(mapContainer);
          attempt.addCleanup(() => resizeObserver.disconnect());
        }

        // Long-press -> drop-pin (open composer pre-filled)
        const container = mapNodeRef.current;
        if (container) {
          let pressTimer: number | null = null;
          let pressPoint: { x: number; y: number } | null = null;
          const clearPress = () => {
            if (pressTimer !== null) window.clearTimeout(pressTimer);
            pressTimer = null;
            pressPoint = null;
          };
          const onDown = (ev: PointerEvent) => {
            if (!attempt.isActive() || ev.button !== 0) return;
            const target = ev.target as HTMLElement | null;
            if (target?.closest(".maplibregl-marker, .maplibregl-control-container, button, a"))
              return;
            pressPoint = { x: ev.clientX, y: ev.clientY };
            pressTimer = window.setTimeout(() => {
              if (!attempt.isActive() || !map || !pressPoint) return;
              const rect = container.getBoundingClientRect();
              const ll = map.unproject([pressPoint.x - rect.left, pressPoint.y - rect.top]);
              ignoreBackgroundClickUntilRef.current = Date.now() + 700;
              onMapLongPressRef.current?.(ll.lat, ll.lng);
              clearPress();
            }, 480);
          };
          const onMove = (ev: PointerEvent) => {
            if (!pressPoint) return;
            if (
              Math.abs(ev.clientX - pressPoint.x) > 10 ||
              Math.abs(ev.clientY - pressPoint.y) > 10
            ) {
              clearPress();
            }
          };
          container.addEventListener("pointerdown", onDown);
          container.addEventListener("pointermove", onMove);
          container.addEventListener("pointerup", clearPress);
          container.addEventListener("pointercancel", clearPress);
          container.addEventListener("pointerleave", clearPress);
          attempt.addCleanup(() => {
            clearPress();
            container.removeEventListener("pointerdown", onDown);
            container.removeEventListener("pointermove", onMove);
            container.removeEventListener("pointerup", clearPress);
            container.removeEventListener("pointercancel", clearPress);
            container.removeEventListener("pointerleave", clearPress);
          });
        }

        const syncZoom = () => {
          if (!attempt.isActive() || !map) return;
          if (zoomFrame !== null) return;
          zoomFrame = window.requestAnimationFrame(() => {
            zoomFrame = null;
            if (!attempt.isActive() || !map) return;
            const nextZoom = map.getZoom();
            lastZoomRef.current = nextZoom;
            applyMarkerZoomProfile(mapNodeRef.current, nextZoom);
            setZoom(nextZoom);
          });
        };
        map.on("zoom", syncZoom);
        map.on("zoomend", syncZoom);
        attempt.addCleanup(() => {
          map?.off("zoom", syncZoom);
          map?.off("zoomend", syncZoom);
        });
        const pauseMarkerEffects = (kind: "move" | "zoom") => {
          if (!attempt.isActive()) return;
          activeMapMotion.add(kind);
          if (effectsResumeFrame !== null) {
            window.cancelAnimationFrame(effectsResumeFrame);
            effectsResumeFrame = null;
          }
          mapNodeRef.current?.classList.add("hp-map-is-moving");
        };
        const resumeMarkerEffects = (kind: "move" | "zoom") => {
          if (!attempt.isActive()) return;
          activeMapMotion.delete(kind);
          if (activeMapMotion.size > 0) return;
          effectsResumeFrame = window.requestAnimationFrame(() => {
            effectsResumeFrame = null;
            if (!attempt.isActive()) return;
            mapNodeRef.current?.classList.remove("hp-map-is-moving");
            scheduleMarkerViewportSyncRef.current();
          });
        };
        const onMoveStart = () => pauseMarkerEffects("move");
        const onZoomStart = () => pauseMarkerEffects("zoom");
        const onMoveEnd = () => {
          resumeMarkerEffects("move");
        };
        const onZoomEnd = () => resumeMarkerEffects("zoom");
        map.on("movestart", onMoveStart);
        map.on("zoomstart", onZoomStart);
        map.on("moveend", onMoveEnd);
        map.on("zoomend", onZoomEnd);
        attempt.addCleanup(() => {
          map?.off("movestart", onMoveStart);
          map?.off("zoomstart", onZoomStart);
          map?.off("moveend", onMoveEnd);
          map?.off("zoomend", onZoomEnd);
        });
        const interruptCamera = () => {
          if (!attempt.isActive() || mapRef.current !== instance) return;
          userNavigatedRef.current = true;
          didInitialFitRef.current = true;
          selectionMotionUntilRef.current = 0;
          instance.stop();
        };
        const gestureSurface = instance.getCanvasContainer();
        gestureSurface.addEventListener("pointerdown", interruptCamera, true);
        gestureSurface.addEventListener("wheel", interruptCamera, { passive: true, capture: true });
        gestureSurface.addEventListener("keydown", interruptCamera, true);
        attempt.addCleanup(() => {
          gestureSurface.removeEventListener("pointerdown", interruptCamera, true);
          gestureSurface.removeEventListener("wheel", interruptCamera, true);
          gestureSurface.removeEventListener("keydown", interruptCamera, true);
        });
        const onMapReady = () => {
          if (!attempt.isActive() || !map) return;
          try {
            if (!previewMode) installRegionalLayer(map);
          } catch {
            attempt.fail();
            return;
          }
          mapHasLoaded = true;
          const readyZoom = map.getZoom();
          lastZoomRef.current = readyZoom;
          applyMarkerZoomProfile(mapNodeRef.current, readyZoom);
          setZoom(readyZoom);
          attempt.ready();
          resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = null;
            if (attempt.isActive()) map?.resize();
          });
        };
        const readyEvent = previewMode ? "style.load" : "load";
        map.once(readyEvent, onMapReady);
        attempt.addCleanup(() => map?.off(readyEvent, onMapReady));
      },
    });
    // Registered before the async import/fetch can settle, including constructor
    // failure paths where MapLibre has appended DOM but returned no map object.
    attempt.addCleanup(() => {
      if (zoomFrame !== null) window.cancelAnimationFrame(zoomFrame);
      if (effectsResumeFrame !== null) window.cancelAnimationFrame(effectsResumeFrame);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      markerExitsRef.current.flush();
      previewRegionMarkersRef.current.forEach((marker) => marker.remove());
      previewRegionMarkersRef.current.clear();
      markers.forEach((marker) => marker.remove());
      markers.clear();
      markerRuntimes.clear();
      renderNodesRef.current.clear();
      routeStopMarkersRef.current.forEach((marker) => marker.remove());
      routeStopMarkersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      mapRef.current = null;
      maplibreModuleRef.current = null;
      map = null;
      container?.replaceChildren();
      container?.classList.remove("hp-map-is-moving");
      didInitialFitRef.current = false;
      userNavigatedRef.current = false;
      explicitBackRef.current = false;
      lastFocusedPlaceIdRef.current = null;
      cameraHandledSelectionRef.current = null;
      lastDiscoveryViewportRef.current = "";
      scheduleMarkerViewportSyncRef.current = () => {};
    });
    return () => attempt.dispose();
  }, [previewMode, mapAttemptNumber]);

  useEffect(() => {
    const focused = document.activeElement;
    const focusOnRecovery =
      !focused || focused === document.body || focused === recoveryTitleRef.current;
    if (restoreMapFocusRef.current) {
      // A user who moved into search or opened details during the retry keeps
      // their focus there when the asynchronous attempt settles.
      if (!focusOnRecovery) {
        restoreMapFocusRef.current = false;
        return;
      }
      if (mapAttemptState.status === "ready") {
        mapNodeRef.current?.focus({ preventScroll: true });
        restoreMapFocusRef.current = false;
      } else {
        recoveryTitleRef.current?.focus({ preventScroll: true });
      }
      return;
    }
    if (mapAttemptState.status !== "error") return;
    if (focusOnRecovery || mapNodeRef.current?.contains(focused)) {
      recoveryTitleRef.current?.focus({ preventScroll: true });
    }
  }, [mapAttemptState]);

  const retryMap = () => {
    restoreMapFocusRef.current = true;
    recoveryTitleRef.current?.focus({ preventScroll: true });
    setMapAttemptState({ attempt: mapAttemptNumber + 1, status: "loading" });
    setMapAttemptNumber((value) => value + 1);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const viewportSync = createMapViewportSync({
      map,
      getCurrentMap: () => mapRef.current,
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (frame) => window.cancelAnimationFrame(frame),
      readViewport: () => {
        // The settle event schedules a fresh pass; do not re-grid each zoom frame.
        if (mapNodeRef.current?.classList.contains("hp-map-is-moving")) return null;
        const size = { x: map.getCanvas().clientWidth, y: map.getCanvas().clientHeight };
        const height = Math.max(
          0,
          Math.min(size.y - bottomOverlayHeightRef.current, availableMapHeightRef.current),
        );
        const nodes = [...renderNodesRef.current.values()].map((node) => {
          const point = map.project([node.latLng[1], node.latLng[0]]);
          return {
            id: node.id,
            x: point.x,
            y: point.y,
            opacity: node.opacity,
            level: node.kind === "child" ? node.pulse.level : null,
            score: node.kind === "child" ? node.pulse.score : 0,
            selected: node.selected,
            label:
              node.kind === "child"
                ? node.place.name
                : node.selected
                  ? node.dominantCluster.name
                  : undefined,
            prominence: node.prominence.score,
            labelOffset: node.kind === "child" ? 17 : 27,
            labelScale: node.prominence.scaleFactor,
          };
        });
        const density = markerViewportDensity(nodes, size.x, height);
        const shownLabels = markerLabelVisibility(nodes, size.x, height, map.getZoom());
        mapNodeRef.current?.classList.toggle("hp-pulse-paused", document.hidden);
        markersRef.current.forEach((marker, id) => {
          const shell = marker.getElement()?.firstElementChild as HTMLElement | null;
          if (!shell) return;
          shell.classList.toggle("is-viewport-paused", document.hidden || !density.visible.has(id));
          shell.classList.toggle("is-marker-dense", density.dense.has(id));
          shell.classList.toggle("is-motion-suppressed", density.suppressed.has(id));
          shell.classList.toggle("has-visible-label", shownLabels.has(id));
        });
        const center = map.getCenter();
        const rawBounds = map.getBounds();
        const bounds: MapBounds = [
          [rawBounds.getWest(), rawBounds.getSouth()],
          [rawBounds.getEast(), rawBounds.getNorth()],
        ];
        const container = mapNodeRef.current;
        if (!container) return null;
        const rect = safeMapRect(
          container,
          bottomOverlayHeightRef.current,
          availableMapHeightRef.current,
          0,
        );
        const symbolIds = previewMode
          ? regionsRef.current
              .filter((row) => {
                if (
                  !row.searchedPlaceIds.length ||
                  mapDisclosure(map.getZoom()).regionOpacity <= 0.08
                )
                  return false;
                const point = map.project([row.region.anchor.lng, row.region.anchor.lat]);
                return pointIsInSafeRect(point, rect);
              })
              .map((row) => row.region.id)
              .sort()
          : map.getZoom() < MAP_POLICY.regionFadeEnd && map.getLayer(REGION_LAYER_ID)
            ? [
                ...new Set(
                  map
                    .queryRenderedFeatures(
                      [
                        [rect.left, rect.top],
                        [rect.right, rect.bottom],
                      ],
                      { layers: [REGION_LAYER_ID] },
                    )
                    .map((feature) => String(feature.properties.regionId)),
                ),
              ].sort()
            : [];
        const { bounds: usableBounds, places: visiblePlaces } = visibleScreenMembers(
          rect,
          { unproject: (point) => map.unproject(point), project: (point) => map.project(point) },
          (bounds) =>
            availableMapHeightRef.current > 0 ? placeTopologyRef.current.visiblePlaces(bounds) : [],
        );
        const contextualIds = new Set(regionsRef.current.flatMap((row) => row.contextualPlaceIds));
        const viewport = discoveryViewport(
          { lat: center.lat, lng: center.lng },
          map.getZoom(),
          bounds,
          usableBounds,
          visiblePlaces,
          contextualIds,
          { bearing: map.getBearing(), pitch: map.getPitch() },
        );
        return { viewport, bounds, symbolIds };
      },
      publishViewport: ({ viewport, bounds, symbolIds }) => {
        setVisibleRegionSymbolIds((previous) =>
          previous.join("|") === symbolIds.join("|") ? previous : symbolIds,
        );
        const signature = viewportSignature(viewport);
        if (signature !== lastDiscoveryViewportRef.current) {
          lastDiscoveryViewportRef.current = signature;
          setSettledBounds((previous) =>
            JSON.stringify(previous) === JSON.stringify(bounds) ? previous : bounds,
          );
          setSettledViewport(viewport);
          onDiscoveryViewportChangeRef.current?.(viewport);
        }
      },
    });
    const schedule = viewportSync.schedule;
    const onVisibilityChange = () => {
      if (!viewportSync.isCurrent()) return;
      mapNodeRef.current?.classList.toggle("hp-pulse-paused", document.hidden);
      schedule();
    };
    scheduleMarkerViewportSyncRef.current = schedule;
    map.on("moveend", schedule);
    map.on("zoomend", schedule);
    map.on("resize", schedule);
    map.on("idle", schedule);
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
    return () => {
      viewportSync.dispose();
      if (scheduleMarkerViewportSyncRef.current === schedule)
        scheduleMarkerViewportSyncRef.current = () => {};
      map.off("moveend", schedule);
      map.off("zoomend", schedule);
      map.off("resize", schedule);
      map.off("idle", schedule);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [mapReady, previewMode]);

  useEffect(() => {
    scheduleMarkerViewportSyncRef.current();
  }, [bottomOverlayHeight, availableMapHeight, regions, placeTopology, activitySnapshot]);

  useEffect(() => {
    const map = mapRef.current;
    if (previewMode || !map || !mapReady || mapRef.current !== map) return;
    const source = map.getSource(REGION_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(regionalGeoJson(regions, selectedAreaId, activeFilterLabel, t, nowMs, language));
  }, [mapReady, regions, selectedAreaId, activeFilterLabel, t, nowMs, language, previewMode]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = maplibreModuleRef.current;
    if (!previewMode || !mapReady || !map || !maplibre) return;
    const currentIds = new Set(
      regions.filter((row) => row.searchedPlaceIds.length).map((row) => row.region.id),
    );
    previewRegionMarkersRef.current.forEach((marker, id) => {
      if (currentIds.has(id)) return;
      marker.remove();
      previewRegionMarkersRef.current.delete(id);
    });
    const opacity = mapDisclosure(zoom).regionOpacity;
    regions.forEach((row) => {
      if (!currentIds.has(row.region.id) || mapRef.current !== map) return;
      let marker = previewRegionMarkersRef.current.get(row.region.id);
      if (!marker) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "hp-preview-region-marker";
        const core = document.createElement("span");
        core.className = "hp-preview-region-core";
        core.setAttribute("aria-hidden", "true");
        const name = document.createElement("span");
        name.className = "hp-preview-region-name";
        const description = document.createElement("span");
        description.className = "hp-preview-region-description";
        button.append(core, name, description);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (mapRef.current !== map || button.tabIndex < 0) return;
          selectRegionRef.current(row.region.id);
        });
        marker = new maplibre.Marker({ element: button, anchor: "top" })
          .setLngLat([row.region.anchor.lng, row.region.anchor.lat])
          .addTo(map);
        previewRegionMarkersRef.current.set(row.region.id, marker);
      }
      const element = marker.getElement();
      const description = regionalDescription(row, activeFilterLabel, t, nowMs, language);
      const accessible = `${t(row.region.name)}. ${regionalDescription(row, activeFilterLabel, t, nowMs, language, true)}`;
      element.querySelector(".hp-preview-region-name")!.textContent = t(row.region.name);
      element.querySelector(".hp-preview-region-description")!.textContent = description;
      element.setAttribute("aria-label", accessible);
      element.title = accessible;
      element.setAttribute("aria-pressed", String(selectedAreaId === row.region.id));
      element.style.opacity = String(opacity * (row.contextualPlaceIds.length ? 1 : 0.55));
      element.style.pointerEvents = opacity > 0.08 ? "auto" : "none";
      element.style.visibility = opacity > 0.001 ? "visible" : "hidden";
      element.setAttribute("aria-hidden", String(opacity <= 0.08));
      element.tabIndex = opacity > 0.08 ? 0 : -1;
      marker.setLngLat([row.region.anchor.lng, row.region.anchor.lat]);
    });
    scheduleMarkerViewportSyncRef.current();
  }, [mapReady, previewMode, regions, selectedAreaId, activeFilterLabel, zoom, nowMs, language, t]);

  useEffect(() => {
    const maplibre = maplibreModuleRef.current;
    const map = mapRef.current;
    if (!maplibre || !map || !mapReady) return;

    const exits = markerExitsRef.current;
    const nodeIds = new Set(renderNodes.map((node) => node.id));
    markersRef.current.forEach((marker, id) => {
      if (nodeIds.has(id)) {
        // The exiting element was made inert. Force interaction restoration even
        // when its geographic and visual state otherwise matches the old node.
        if (exits.cancel(id)) markerRuntimeRef.current.delete(id);
        marker.getElement().classList.remove("is-exiting");
        return;
      }
      const element = marker.getElement();
      element.style.pointerEvents = "none";
      element.tabIndex = -1;
      element.setAttribute("aria-hidden", "true");
      element.classList.add("is-exiting");
      element.style.opacity = "0";
      const remove = () => {
        if (mapRef.current !== map || markersRef.current.get(id) !== marker) return;
        marker.remove();
        markersRef.current.delete(id);
        markerRuntimeRef.current.delete(id);
      };
      if (prefersReducedMapMotion()) {
        exits.cancel(id);
        remove();
      } else exits.start(id, remove);
    });

    renderNodes.forEach((node) => {
      const zIndexOffset = node.selected
        ? 2400
        : node.kind === "child"
          ? 1400 + node.prominence.zIndexBoost
          : 900 + Math.round(node.hotness * 10) + node.prominence.zIndexBoost;

      const hasStory = node.kind === "child" && (storyPlaceIds?.has(node.place.id) ?? false);
      let marker = markersRef.current.get(node.id);
      const created = !marker;
      if (!marker) {
        marker = new maplibre.Marker({ element: createPulseIcon(node.kind), anchor: "center" })
          .setLngLat([node.latLng[1], node.latLng[0]])
          .addTo(map);
        markersRef.current.set(node.id, marker);
      }
      const previousRuntime = markerRuntimeRef.current.get(node.id);
      updatePulseIcon(marker.getElement(), node, hasStory, t, nowMs, language);
      const visuallyVisible = node.opacity > 0.08;
      const visibleForInteraction = visuallyVisible;
      if (
        !previousRuntime ||
        previousRuntime.lat !== node.latLng[0] ||
        previousRuntime.lng !== node.latLng[1]
      ) {
        marker.setLngLat([node.latLng[1], node.latLng[0]]);
      }

      const markerElement = marker.getElement() as InteractiveMarkerElement | null;
      if (markerElement) {
        markerElement.style.opacity = node.opacity.toFixed(3);
        markerElement.style.zIndex = String(zIndexOffset);
        const markerShell = markerElement.firstElementChild as HTMLElement | null;
        const shouldSyncProminence =
          created ||
          !previousRuntime ||
          Math.abs(previousRuntime.lensOpacity - node.prominence.opacityFactor) > 0.0001 ||
          Math.abs(previousRuntime.lensScale - node.prominence.scaleFactor) > 0.0001 ||
          previousRuntime.prominenceBand !== node.prominence.band;

        if (markerShell && shouldSyncProminence) {
          markerShell.style.setProperty(
            "--hp-marker-lens-opacity-target",
            node.prominence.opacityFactor.toFixed(3),
          );
          markerShell.style.setProperty(
            "--hp-marker-lens-scale-target",
            node.prominence.scaleFactor.toFixed(3),
          );
          markerShell.dataset.discoveryProminence = node.prominence.band;
        }
        const shouldSyncInteraction =
          created ||
          !previousRuntime ||
          previousRuntime.selected !== node.selected ||
          previousRuntime.visible !== visibleForInteraction ||
          previousRuntime.opacity > 0.001 !== node.opacity > 0.001;

        if (shouldSyncInteraction) {
          markerElement.style.pointerEvents = visibleForInteraction ? "auto" : "none";
          markerElement.style.visibility = node.opacity > 0.001 ? "visible" : "hidden";
          markerElement.setAttribute("aria-hidden", visuallyVisible ? "false" : "true");
          markerElement.setAttribute("aria-pressed", node.selected ? "true" : "false");
          markerElement.tabIndex = visibleForInteraction ? 0 : -1;
          markerShell?.classList.toggle("is-selected", node.selected);
        }

        if (created) {
          if (markerElement.__hpClickHandler)
            markerElement.removeEventListener("click", markerElement.__hpClickHandler, true);
          if (markerElement.__hpKeyHandler)
            markerElement.removeEventListener("keydown", markerElement.__hpKeyHandler, true);
          const activateFromEvent: EventListener = (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            activateMarkerByIdRef.current(node.id);
          };
          const keyHandler: EventListener = (event) => {
            const keyEvent = event as KeyboardEvent;
            if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
            keyEvent.preventDefault();
            keyEvent.stopImmediatePropagation();
            keyEvent.stopPropagation();
            activateMarkerByIdRef.current(node.id);
          };

          markerElement.setAttribute("role", "button");
          markerElement.dataset.hpNodeId = node.id;
          markerElement.addEventListener("click", activateFromEvent, true);
          markerElement.addEventListener("keydown", keyHandler, true);
          markerElement.__hpClickHandler = activateFromEvent;
          markerElement.__hpKeyHandler = keyHandler;
        }
      }

      markerRuntimeRef.current.set(node.id, {
        lat: node.latLng[0],
        lng: node.latLng[1],
        opacity: node.opacity,
        selected: node.selected,
        visible: visibleForInteraction,
        zIndexOffset,
        lensOpacity: node.prominence.opacityFactor,
        lensScale: node.prominence.scaleFactor,
        prominenceBand: node.prominence.band,
      });
    });
    scheduleMarkerViewportSyncRef.current();
  }, [mapReady, renderNodes, storyPlaceIds, zoom, t, nowMs, language]);

  useEffect(() => {
    const map = mapRef.current;
    const container = mapNodeRef.current;
    if (!selectedPlaceId) {
      lastFocusedPlaceIdRef.current = null;
      return;
    }
    if (!map || !container || !mapReady || lastFocusedPlaceIdRef.current === selectedPlaceId)
      return;

    if (!selectedPlaceNode) return;

    lastFocusedPlaceIdRef.current = selectedPlaceId;
    userNavigatedRef.current = false;

    const latLng: LatLngTuple = [selectedPlaceNode.place.lat, selectedPlaceNode.place.lng];
    const viewport = safeMapRect(
      container,
      bottomOverlayHeight,
      availableMapHeight,
      primarySelectedNode
        ? markerCoreRadius(primarySelectedNode, map.getZoom())
        : SAFE_MARKER_RADIUS,
    );
    const currentPoint = map.project([latLng[1], latLng[0]]);
    const currentZoom = map.getZoom();

    if (currentZoom >= RICH_VISUAL_ZOOM && pointIsInSafeRect(currentPoint, viewport)) return;

    const reduceMotion = prefersReducedMapMotion();
    map.stop();

    if (currentZoom >= RICH_VISUAL_ZOOM) {
      const delta = panDeltaIntoSafeRect(currentPoint, viewport);
      if (delta.x === 0 && delta.y === 0) return;
      selectionMotionUntilRef.current = Date.now() + (reduceMotion ? 0 : HP_MOTION.pan + 40);
      map.panBy([delta.x, delta.y], {
        duration: reduceMotion ? 0 : MAP_PAN_DURATION * 1000,
      });
      return;
    }

    selectionMotionUntilRef.current =
      Date.now() + (reduceMotion ? 0 : MAP_POLICY.focusDurationMs + 40);
    const bottomPadding = Math.min(460, Math.max(180, bottomOverlayHeight + 40));
    const focusOffset = Math.min(270, Math.max(128, bottomPadding * 0.44));
    if (reduceMotion) {
      map.easeTo({
        center: [latLng[1], latLng[0]],
        zoom: PLACE_FOCUS_ZOOM,
        offset: [0, -focusOffset],
        duration: 0,
      });
    } else {
      map.flyTo({
        center: [latLng[1], latLng[0]],
        zoom: PLACE_FOCUS_ZOOM,
        offset: [0, -focusOffset],
        duration: MAP_FOCUS_DURATION * 1000,
        essential: true,
      });
    }
  }, [
    availableMapHeight,
    bottomOverlayHeight,
    mapReady,
    primarySelectedNode,
    selectedPlaceId,
    selectedPlaceNode,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const container = mapNodeRef.current;
    const selectedNode = primarySelectedNodeRef.current;
    if (!map || !container || !mapReady || !selectedNode || bottomOverlayHeight <= 0) {
      return;
    }

    let active = true;
    let frame: number | null = null;
    let timer: number | null = null;
    let correctionCount = 0;
    const keepSelectionVisible = () => {
      if (!active || mapRef.current !== map || userNavigatedRef.current) return;
      const remainingMotion = selectionMotionUntilRef.current - Date.now();
      if (remainingMotion > 0) {
        timer = window.setTimeout(() => {
          if (!active || mapRef.current !== map) return;
          frame = window.requestAnimationFrame(keepSelectionVisible);
        }, remainingMotion + 16);
        return;
      }

      const point = map.project([selectedNode.latLng[1], selectedNode.latLng[0]]);
      const viewport = safeMapRect(
        container,
        bottomOverlayHeight,
        availableMapHeight,
        markerCoreRadius(selectedNode, map.getZoom()),
      );
      const delta = panDeltaIntoSafeRect(point, viewport);
      if (delta.x !== 0 || delta.y !== 0) {
        map.panBy([delta.x, delta.y], { duration: 0 });
        correctionCount += 1;
        if (correctionCount < 3) {
          frame = window.requestAnimationFrame(keepSelectionVisible);
        }
      }
    };

    frame = window.requestAnimationFrame(keepSelectionVisible);
    return () => {
      active = false;
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [availableMapHeight, bottomOverlayHeight, mapReady, selectionKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || isSplitZoom || clusters.length === 0) return;
    if (selectedAreaId || selectedPlaceId) return;
    // Only auto-fit once per mount so live data refreshes never yank the map.
    if (didInitialFitRef.current || userNavigatedRef.current || routePreview) return;
    if (!regions.length) return;
    didInitialFitRef.current = true;
    const bounds: MapBounds = [
      [
        Math.min(...regions.map((row) => row.region.bounds[0][0])),
        Math.min(...regions.map((row) => row.region.bounds[0][1])),
      ],
      [
        Math.max(...regions.map((row) => row.region.bounds[1][0])),
        Math.max(...regions.map((row) => row.region.bounds[1][1])),
      ],
    ];
    map.fitBounds(bounds, {
      duration: prefersReducedMapMotion() ? 0 : MAP_OVERVIEW_DURATION * 1000,
      maxZoom: OVERVIEW_ZOOM,
      padding: { left: 52, top: 108, right: 52, bottom: 210 },
    });
  }, [clusters, regions, isSplitZoom, mapReady, selectedAreaId, selectedPlaceId, routePreview]);

  useEffect(() => {
    const maplibre = maplibreModuleRef.current;
    const map = mapRef.current;
    routeStopMarkersRef.current.forEach((marker) => marker.remove());
    routeStopMarkersRef.current = [];
    if (previewMode || !maplibre || !map || !mapReady) return;
    const sourceId = "hp-route-source";
    const solidId = "hp-route-solid";
    const fallbackId = "hp-route-fallback";
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] },
        },
      });
      const beforeId = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
      map.addLayer(
        {
          id: solidId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
          paint: { "line-color": "#e06a32", "line-width": 4, "line-opacity": 0.92 },
        },
        beforeId,
      );
      map.addLayer(
        {
          id: fallbackId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
          paint: {
            "line-color": "#e06a32",
            "line-width": 4,
            "line-opacity": 0.92,
            "line-dasharray": [0.5, 3],
          },
        },
        beforeId,
      );
    }
    if (!routePreview || routePreview.stops.length < 2) {
      map.setLayoutProperty(solidId, "visibility", "none");
      map.setLayoutProperty(fallbackId, "visibility", "none");
      return;
    }
    const coordinates = routePreview.geometry?.length
      ? routePreview.geometry
      : routePreview.stops.map((stop) => [stop.lng, stop.lat] as [number, number]);
    (map.getSource(sourceId) as import("maplibre-gl").GeoJSONSource).setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    });
    map.setLayoutProperty(solidId, "visibility", routePreview.geometry ? "visible" : "none");
    map.setLayoutProperty(fallbackId, "visibility", routePreview.geometry ? "none" : "visible");
    const routeMarkers = routePreview.stops.map((stop, index) => {
      const element = document.createElement("div");
      element.className = "hp-route-stop-marker";
      const number = document.createElement("span");
      number.className = "hp-route-stop";
      number.title = stop.label;
      number.textContent = String(index + 1);
      element.append(number);
      return new maplibre.Marker({ element, anchor: "center" })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
    });
    routeStopMarkersRef.current = routeMarkers;
    const reduceMotion = prefersReducedMapMotion();
    const routeBottomPadding = Math.max(188, bottomOverlayHeightRef.current + 40);
    map.stop();
    map.fitBounds(
      [
        [
          Math.min(...coordinates.map(([lng]) => lng)),
          Math.min(...coordinates.map(([, lat]) => lat)),
        ],
        [
          Math.max(...coordinates.map(([lng]) => lng)),
          Math.max(...coordinates.map(([, lat]) => lat)),
        ],
      ],
      {
        duration: reduceMotion ? 0 : MAP_FOCUS_DURATION * 1000,
        maxZoom: PLACE_FOCUS_ZOOM,
        padding: { left: 48, top: 116, right: 48, bottom: routeBottomPadding },
      },
    );

    return () => {
      routeMarkers.forEach((marker) => marker.remove());
      if (routeStopMarkersRef.current === routeMarkers) routeStopMarkersRef.current = [];
    };
  }, [mapReady, routePreview, previewMode]);

  const resetToOverview = () => {
    if (selectionKeyRef.current !== "|") cameraHandledSelectionRef.current = "|";
    flyToOverview();
    onResetView();
  };

  const selectDiscoveryCluster = (cluster: MapAreaCluster) => {
    const nextSelectionKey = `${cluster.id}|`;
    if (selectionKeyRef.current !== nextSelectionKey) {
      cameraHandledSelectionRef.current = nextSelectionKey;
    }
    onSelectArea(cluster);
    zoomIntoCluster(cluster);
  };

  const zoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const locateUser = () => {
    if (previewMode) return;
    const map = mapRef.current;
    const maplibre = maplibreModuleRef.current;
    if (!map || !maplibre || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (mapRef.current !== map || maplibreModuleRef.current !== maplibre) return;
        const lngLat: [number, number] = [coords.longitude, coords.latitude];
        if (userMarkerRef.current) userMarkerRef.current.setLngLat(lngLat);
        else {
          const element = document.createElement("div");
          element.className = "hp-user-marker";
          element.innerHTML =
            '<span class="hp-user-dot" style="display:block;width:15px;height:15px"></span>';
          userMarkerRef.current = new maplibre.Marker({ element, anchor: "center" })
            .setLngLat(lngLat)
            .addTo(map);
        }
        map.flyTo({
          center: lngLat,
          zoom: Math.max(map.getZoom(), 15),
          duration: 650,
          essential: true,
        });
      },
      (error) => console.warn("Could not locate the device.", error),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 },
    );
  };

  useEffect(() => {
    if (!mapReady) return;
    setAttributionExpanded(true);
    const container = mapNodeRef.current;
    const collapse = () => setAttributionExpanded(false);
    const timer = window.setTimeout(collapse, 5000);
    container?.addEventListener("pointerdown", collapse, { once: true });
    container?.addEventListener("wheel", collapse, { once: true });
    return () => {
      window.clearTimeout(timer);
      container?.removeEventListener("pointerdown", collapse);
      container?.removeEventListener("wheel", collapse);
    };
  }, [mapReady]);

  const utilityRailHidden = availableMapHeight < MIN_UTILITY_RAIL_HEIGHT;
  const mapChromeHidden = availableMapHeight < MIN_MAP_CHROME_HEIGHT;
  const mapStyle = {
    "--hp-map-bottom-overlay-height": `${Math.max(0, bottomOverlayHeight)}px`,
  } as CSSProperties;

  return (
    <div
      className={`hp-real-map relative ${mapReady ? "z-0" : "z-40"} h-full w-full overflow-hidden bg-hp-paper ${hasPrimaryMarkerSelection ? "has-marker-selection" : ""} ${activeLens ? "has-discovery-lens" : ""} ${mapChromeHidden ? "is-map-compressed" : ""}`}
      data-map-state={mapAttemptState.status}
      data-map-attempt={mapAttemptState.attempt}
      data-discovery-lens={activeLens ?? undefined}
      data-map-hierarchy={mapDisclosure(zoom).level}
      data-attribution-position={
        availableMapHeight < MIN_UTILITY_RAIL_HEIGHT + 64 ? "left" : undefined
      }
      style={mapStyle}
    >
      <div
        ref={mapNodeRef}
        className="h-full w-full"
        tabIndex={mapReady ? 0 : -1}
        role="region"
        aria-busy={!mapReady}
        inert={!mapReady}
        aria-hidden={!mapReady}
        aria-label={t("Interactive map of Ilia")}
      />

      {!mapReady && (
        <section className="hp-map-recovery" aria-label={t("Map recovery")}>
          <div className="hp-map-recovery__status">
            <h2 ref={recoveryTitleRef} tabIndex={-1} className="hp-map-recovery__title">
              {t(mapAttemptState.status === "error" ? "Map unavailable" : "Loading map")}
            </h2>
            <p role={mapAttemptState.status === "error" ? "alert" : "status"}>
              {t(
                mapAttemptState.status === "error"
                  ? mapAttemptState.failure === "timeout"
                    ? "The map is taking too long to load."
                    : "The map could not be loaded."
                  : "You can browse places while the map loads.",
              )}
            </p>
            {mapAttemptState.status === "error" && (
              <button type="button" className="hp-map-recovery__action" onClick={retryMap}>
                {t("Retry map")}
              </button>
            )}
          </div>
          <div className="hp-map-recovery__places">
            <h3>{t("Browse places")}</h3>
            {searchQuery.trim() && <p>{t("Results for {query}", { query: searchQuery.trim() })}</p>}
            {fallbackPlaces.length > 0 ? (
              <ul
                className="hp-map-recovery__list"
                aria-label={t("Places matching the map filters")}
              >
                {fallbackPlaces.map((place) => (
                  <li key={place.id}>
                    <button type="button" onClick={() => onOpenPlace(place)}>
                      <span>{place.name}</span>
                      <span>{place.area}</span>
                      <span className="sr-only">{t("Open place details")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hp-map-recovery__empty">
                <p>
                  {t(
                    totalPlaceCount === 0
                      ? "No places available right now."
                      : "No places match this search.",
                  )}
                </p>
                {totalPlaceCount > 0 && searchQuery.trim() && onClearSearch ? (
                  <button type="button" className="hp-map-recovery__action" onClick={onClearSearch}>
                    {t("Clear search")}
                  </button>
                ) : onRefreshPlaces ? (
                  <button
                    type="button"
                    className="hp-map-recovery__action"
                    onClick={onRefreshPlaces}
                  >
                    {t("Refresh places")}
                  </button>
                ) : (
                  <p>{t("Try again when your connection is available.")}</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {mapReady && (
        <div className="hp-map-attribution" data-expanded={attributionExpanded ? "true" : "false"}>
          {attributionExpanded && (
            <div className="hp-map-attribution__credits" role="note">
              {previewMode ? (
                <>Coastline: Natural Earth · simulated markers</>
              ) : (
                <>
                  ©{" "}
                  <a href="https://www.openmaptiles.org" target="_blank" rel="noreferrer">
                    OpenMapTiles
                  </a>
                  {" · "}©{" "}
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenStreetMap
                  </a>
                  {" · "}
                  <a href="https://openrouteservice.org" target="_blank" rel="noreferrer">
                    openrouteservice / HeiGIT
                  </a>
                </>
              )}
            </div>
          )}
          <button
            type="button"
            className="hp-map-attribution__info"
            aria-label={t("Map licences")}
            aria-expanded={attributionExpanded}
            onClick={() => setAttributionExpanded((value) => !value)}
          >
            ⓘ
          </button>
        </div>
      )}

      {mapReady && canGoBack && onBack && (
        <Button
          variant="hpGhost"
          size="hpIcon"
          type="button"
          onClick={() => {
            explicitBackRef.current = true;
            onBack();
          }}
          className="hp-control-surface hp-map-back absolute"
          aria-label={t("Back to previous map view")}
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </Button>
      )}

      {mapReady && (
        <div className="hp-map-summary pointer-events-none">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-hp-sunset" />
          <span className="hp-map-summary__text">{summaryText}</span>
        </div>
      )}

      {mapReady && discoveryChipClusters.length > 0 && (
        <div
          className={`hp-map-chip-rail hp-no-scrollbar ${canGoBack ? "has-back" : ""} ${selectedAreaId ? "has-selection" : ""}`}
          inert={mapChromeHidden ? true : undefined}
          aria-hidden={mapChromeHidden ? true : undefined}
          aria-label={t("Visible map areas")}
        >
          {discoveryChipClusters.map(({ cluster, row }) => {
            const selected = cluster.id === selectedAreaId;
            return (
              <button
                key={cluster.id}
                type="button"
                onClick={() => selectDiscoveryCluster(cluster)}
                aria-pressed={selected}
                aria-label={`${t(cluster.name)}. ${regionalDescription(row, activeFilterLabel, t, nowMs, language, true)}`}
                title={regionalDescription(row, activeFilterLabel, t, nowMs, language, true)}
                tabIndex={mapChromeHidden ? -1 : undefined}
                className={`hp-map-chip ${selected ? "is-active" : ""}`}
              >
                <span className="hp-map-chip__face">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-hp-sunset" />
                  {t(cluster.name)}
                  <span className="hp-map-chip__count">{row.contextualPlaceIds.length}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {mapReady && (
        <div
          className={`hp-map-utility-rail ${utilityRailHidden ? "is-hidden" : ""}`}
          inert={utilityRailHidden ? true : undefined}
          aria-hidden={utilityRailHidden ? true : undefined}
        >
          <div className="hp-map-control-group" role="group" aria-label={t("Map zoom controls")}>
            <Button
              variant="hpMap"
              size="hpIcon"
              type="button"
              onClick={() => mapRef.current?.zoomIn()}
              disabled={!mapReady || zoom >= MAX_ZOOM}
              tabIndex={utilityRailHidden ? -1 : undefined}
              aria-label={t("Zoom in map")}
            >
              <Plus size={17} strokeWidth={2.5} />
            </Button>
            <Button
              variant="hpMap"
              size="hpIcon"
              type="button"
              onClick={zoomOut}
              disabled={!mapReady || zoom <= MIN_ZOOM}
              tabIndex={utilityRailHidden ? -1 : undefined}
              aria-label={t("Zoom out map")}
            >
              <Minus size={17} strokeWidth={2.5} />
            </Button>
          </div>
          <div className="hp-map-control-group" role="group" aria-label={t("Map view controls")}>
            {!previewMode && (
              <Button
                variant="hpMap"
                size="hpIcon"
                type="button"
                onClick={locateUser}
                disabled={!mapReady}
                tabIndex={utilityRailHidden ? -1 : undefined}
                aria-label={t("Find my location")}
              >
                <Crosshair size={17} strokeWidth={2.2} />
              </Button>
            )}
            <Button
              variant="hpMap"
              size="hpIcon"
              type="button"
              onClick={resetToOverview}
              disabled={!mapReady}
              tabIndex={utilityRailHidden ? -1 : undefined}
              aria-label={t("Show Ilia overview")}
            >
              <MapPinned size={17} strokeWidth={2.2} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, Crosshair, MapPinned, Minus, Plus } from "lucide-react";
import Supercluster from "supercluster";
import "leaflet/dist/leaflet.css";
import { type EventItem, type Place } from "@/lib/hp-model";
import { useImageUrls } from "@/lib/hp/image-cache";
import {
  areaDefinitionForId,
  areaIdForPlace,
  groupPlacesByArea,
  toneForPlace,
  type AreaTone,
} from "@/lib/hp/area-catalog";
import {
  getAreaIntelligence,
  type AreaIntelligence,
  type AreaIntelligenceSnapshot,
} from "@/lib/hp/area-intelligence";
import {
  aggregatePulseMetrics,
  pulseMetricForPlace,
  type PulseActivitySnapshot,
  type PulseTier,
} from "@/lib/hp/pulse-activity";
import { useI18n } from "@/lib/i18n";
import {
  childMarkerSize,
  markerPresenceScale,
  markerMotionPhase,
  markerViewportDensity,
  MAX_MARKER_CORE_BEAT,
  markerWaveStrength,
  markerMapFillScale,
} from "@/lib/hp/map-visuals";

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletMarker = import("leaflet").Marker;
type LatLngTuple = import("leaflet").LatLngTuple;
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
};

const ILIA_CENTER: LatLngTuple = [37.68, 21.52];
// Generous pan bounds: maxBounds only keeps users roughly around Ilia. It must
// never wall in a zoomed region (South Coast ~37.41 used to hit the south edge
// at 37.3 and feel "locked"). Low viscosity so panning always feels free.
const MAP_PAN_BOUNDS: [LatLngTuple, LatLngTuple] = [
  [36.2, 19.4],
  [38.9, 23.5],
];
const MIN_ZOOM = 8;
const MAX_ZOOM = 18;
const OVERVIEW_ZOOM = 9.25;
const SPLIT_ZOOM = 12.5;
const DETAIL_CLUSTER_MAX_ZOOM = 13;
const PLACE_FOCUS_ZOOM = 14.25;
// Progressive disclosure bands. Area summaries lead the overview, individual
// places emerge through the middle zooms, and rich metadata finishes revealing
// at the same zoom used when a place is focused.
const PLACE_REVEAL_START = 9.75;
const PLACE_REVEAL_END = 12.75;
const AREA_FADE_START = 10.25;
const AREA_FADE_END = 12.75;
const ACTIVITY_CLUSTER_START = 11.5;
const ACTIVITY_CLUSTER_FULL = 12.5;
const MEDIUM_VISUAL_END = 12.25;
const DETAIL_VISUAL_START = 12.25;
const RICH_VISUAL_START = 13.25;
const ALL_MARKERS_RICH_ZOOM = 15.5;
// Highest zoom an area click will fly to. Tight clusters (e.g. Ancient Olympia,
// whose pins sit within ~800m) need ~z16 to separate; spread areas stay lower.
const AREA_FOCUS_MAX_ZOOM = 16.25;
const ILIA_DETAIL_BBOX: [number, number, number, number] = [19.9, 36.35, 23.25, 39.15];
const MAP_PAN_DURATION = 0.28;
const MAP_OVERVIEW_DURATION = 0.34;
const MAP_FOCUS_DURATION = 0.38;
const MAP_EASE_LINEARITY = 0.25;
const RICH_VISUAL_ZOOM = 13.25;
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

type AreaStatus = PulseTier;

export type MapAreaCluster = {
  id: string;
  name: string;
  title: string;
  tone: AreaTone;
  status: AreaStatus;
  lat: number;
  lng: number;
  places: Place[];
  childPlaces: Place[];
  leadPlace: Place;
  activityLine: string;
  eventCount: number;
  postCount: number;
  commentCount: number;
  hotness: number;
  activityScore: number;
  intelligence: AreaIntelligence | null;
  labelOffsetPx: number;
  avatars: string[];
};

type ClusterRenderNode = {
  id: string;
  kind: "cluster";
  cluster: MapAreaCluster;
  latLng: LatLngTuple;
  opacity: number;
  selected: boolean;
  tier: PulseTier;
};

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
};

type RenderNode = ClusterRenderNode | ActivityClusterRenderNode | ChildRenderNode;

type PlacePointProperties = {
  placeId: string;
  areaId: string;
  eventCount: number;
  postCount: number;
  commentCount: number;
  hotness: number;
  tone: AreaTone;
};

type ActivityClusterProperties = {
  eventCount: number;
  postCount: number;
  commentCount: number;
  hotness: number;
};

function clusterIdForPlace(place: Place) {
  return areaIdForPlace(place);
}

export function getMapAreaIdForPlace(place: Place) {
  return clusterIdForPlace(place);
}

function eventCountForPlace(events: EventItem[]) {
  return events.reduce<Map<string, number>>((counts, event) => {
    counts.set(event.placeId, (counts.get(event.placeId) ?? 0) + 1);
    return counts;
  }, new Map());
}

function scorePlace(place: Place, activitySnapshot: PulseActivitySnapshot, fallbackEventCount = 0) {
  return pulseMetricForPlace(place, activitySnapshot, fallbackEventCount).score;
}

function activityLineForCluster(
  tone: AreaTone,
  places: Place[],
  postCount: number,
  eventCount: number,
) {
  const hasSunset = places.some(
    (place) => place.type === "sunset" || place.tags.includes("sunset"),
  );
  if (eventCount > 0 && postCount > 0)
    return `${postCount} posts · ${eventCount} event${eventCount === 1 ? "" : "s"}`;
  if (eventCount > 0) return `${eventCount} event${eventCount === 1 ? "" : "s"} tonight`;
  if (hasSunset) return `sunset · ${postCount} posts`;
  if (tone === "nature" || tone === "village") return `${postCount} tips`;
  if (tone === "music") return `tonight · ${postCount} posts`;
  return `${postCount} posts`;
}

function markerStyle(size: number, id: string) {
  return `--marker-size:${size}px;--hp-motion-phase:${markerMotionPhase(id)}`;
}

function clusterSize(status: AreaStatus) {
  const base = status === "live" ? 76 : status === "hot" ? 70 : status === "moving" ? 64 : 60;
  return base;
}

function activityClusterSize(pointCount: number) {
  const base = pointCount >= 8 ? 72 : pointCount >= 5 ? 64 : pointCount >= 3 ? 56 : 50;
  return base;
}

function uniqueAvatars(places: Place[]) {
  const seen = new Set<string>();
  return places
    .flatMap((place) => place.avatars)
    .filter((avatar) => {
      if (seen.has(avatar)) return false;
      seen.add(avatar);
      return true;
    });
}

function centerOfPlaces(places: Place[], fallback: LatLngTuple): LatLngTuple {
  if (places.length === 0) return fallback;

  let minLat = places[0].lat;
  let maxLat = places[0].lat;
  let minLng = places[0].lng;
  let maxLng = places[0].lng;

  places.forEach((place) => {
    minLat = Math.min(minLat, place.lat);
    maxLat = Math.max(maxLat, place.lat);
    minLng = Math.min(minLng, place.lng);
    maxLng = Math.max(maxLng, place.lng);
  });

  const lat = (minLat + maxLat) / 2;
  const lng = (minLng + maxLng) / 2;

  return [lat, lng];
}

export function buildAreaClusters(
  places: Place[],
  events: EventItem[],
  activitySnapshot: PulseActivitySnapshot = {},
  intelligenceSnapshot: AreaIntelligenceSnapshot = {},
): MapAreaCluster[] {
  const eventCounts = eventCountForPlace(events);

  // Group by curated neighbourhood; places not in any def become standalone
  // single-pin "areas" (id `solo-<placeId>`) so they still render on the map.
  const grouped = groupPlacesByArea(places);

  return [...grouped.entries()]
    .map(([id, areaPlaces]) => {
      const def = areaDefinitionForId(id);
      const sortedPlaces = [...areaPlaces].sort(
        (a, b) =>
          scorePlace(b, activitySnapshot, eventCounts.get(b.id) ?? 0) -
          scorePlace(a, activitySnapshot, eventCounts.get(a.id) ?? 0),
      );
      const lead = sortedPlaces[0];
      const activity = aggregatePulseMetrics(areaPlaces, activitySnapshot, eventCounts);
      const eventCount = activity.eventCount;
      const postCount = activity.postCount;
      const hotness = activity.hotness;
      const status = activity.tier;
      const tone = def?.tone ?? toneForPlace(lead);
      const name = def?.name ?? lead.name;
      const [lat, lng] = centerOfPlaces(areaPlaces, [lead.lat, lead.lng]);

      return {
        id,
        name,
        title: def?.title ?? name,
        tone,
        status,
        lat,
        lng,
        places: sortedPlaces,
        childPlaces: sortedPlaces,
        leadPlace: lead,
        activityLine: activityLineForCluster(tone, areaPlaces, postCount, eventCount),
        eventCount,
        postCount,
        commentCount: activity.commentCount,
        hotness,
        activityScore: activity.score,
        intelligence: getAreaIntelligence(intelligenceSnapshot, id),
        labelOffsetPx: 0,
        avatars: uniqueAvatars(sortedPlaces).slice(0, 3),
      };
    })
    .sort((a, b) => b.activityScore - a.activityScore);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Transparent 1x1 shown until the device-cached thumbnail resolves. The
// collage/media containers already paint a soft neutral background, so this
// reads as a calm placeholder rather than a broken image.
const PLACEHOLDER_IMG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";
const MARKER_EFFECTS_VERSION = "4";
const MARKER_EFFECTS_HTML = `
  <span class="hp-marker-effects" data-effects-version="${MARKER_EFFECTS_VERSION}">
    <span class="hp-marker-field"></span>
    <span class="hp-marker-wave"></span>
    <span class="hp-marker-sweep"></span>
  </span>
`;

function resolveUrl(resolve: (url: string) => string, url: string) {
  const value = url ? resolve(url) : "";
  return value || PLACEHOLDER_IMG;
}

function createAreaIcon(
  L: LeafletModule,
  cluster: MapAreaCluster,
  resolve: (url: string) => string,
) {
  const size = clusterSize(cluster.status);
  const images = cluster.places.slice(0, 3);
  const collage = images
    .map(
      (place, index) =>
        `<img class="hp-area-marker__photo hp-area-marker__photo--${index + 1}" src="${escapeHtml(
          resolveUrl(resolve, place.imageUrl),
        )}" alt="" loading="lazy" />`,
    )
    .join("");
  const avatars = cluster.avatars
    .slice(0, 3)
    .map(
      (avatar) => `<img src="${escapeHtml(resolveUrl(resolve, avatar))}" alt="" loading="lazy" />`,
    )
    .join("");
  const statusLabel = cluster.status === "quiet" ? "" : cluster.status;

  return L.divIcon({
    className: "hp-area-marker",
    html: `
      <div
        class="hp-area-marker__shell is-pulse-${cluster.status} ${cluster.status === "live" ? "is-live" : ""} ${cluster.status === "hot" ? "is-hot" : ""}"
        style="${markerStyle(size, cluster.id)}"
      >
        ${MARKER_EFFECTS_HTML}
        <span class="hp-marker-core">
          <span class="hp-area-marker__ring"></span>
          <span class="hp-area-marker__collage hp-area-marker__collage--${images.length}">${collage}</span>
          <span class="hp-area-marker__shade"></span>
          ${statusLabel ? `<span class="hp-area-marker__status">${escapeHtml(statusLabel)}</span>` : ""}
          <span class="hp-area-marker__copy">
            <strong>${escapeHtml(cluster.name)}</strong>
            <em>${escapeHtml(cluster.activityLine)}</em>
          </span>
          ${avatars ? `<span class="hp-area-marker__avatars">${avatars}</span>` : ""}
          ${cluster.status !== "quiet" ? '<span class="hp-area-marker__dot"></span>' : ""}
        </span>
      </div>
    `,
    // A stable one-pixel Leaflet anchor lets CSS scale the visual around the
    // real coordinate without rebuilding/re-anchoring the DivIcon while zooming.
    iconSize: [1, 1],
    iconAnchor: [0.5, 0.5],
  });
}

function createChildIcon(
  L: LeafletModule,
  place: Place,
  eventCount: number,
  tier: PulseTier,
  hasStories = false,
  solo = false,
  resolve: (url: string) => string = (url) => url,
) {
  const size = childMarkerSize(tier);
  const line =
    eventCount > 0
      ? `${eventCount} event${eventCount === 1 ? "" : "s"}`
      : `${place.recentPostCount} posts`;
  const avatars = place.avatars
    .slice(0, 2)
    .map(
      (avatar) => `<img src="${escapeHtml(resolveUrl(resolve, avatar))}" alt="" loading="lazy" />`,
    )
    .join("");
  const statusLabel = tier === "live" ? "live" : tier === "hot" ? "hot" : "";

  return L.divIcon({
    className: "hp-child-marker",
    html: `
      <div
        class="hp-child-marker__shell is-pulse-${tier} ${hasStories ? "has-stories" : ""} ${solo ? "is-solo" : ""} ${tier === "live" ? "is-live" : ""} ${tier === "hot" ? "is-hot" : ""}"
        style="${markerStyle(size, place.id)}"
      >
        ${MARKER_EFFECTS_HTML}
        <span class="hp-marker-core">
          ${hasStories ? '<span class="hp-child-marker__story-ring"></span>' : ""}
          <span class="hp-child-marker__ring"></span>
          <span class="hp-child-marker__media">
            <img class="hp-child-marker__image" src="${escapeHtml(
              resolveUrl(resolve, place.imageUrl),
            )}" alt="" loading="lazy" />
            <span class="hp-child-marker__shade"></span>
            <span class="hp-child-marker__copy">
              <strong>${escapeHtml(shortPlaceName(place.name))}</strong>
              <em>${escapeHtml(line)}</em>
            </span>
          </span>
          ${tier !== "quiet" ? '<span class="hp-child-marker__dot"></span>' : ""}
          ${statusLabel ? `<span class="hp-child-marker__status">${statusLabel}</span>` : ""}
          ${avatars ? `<span class="hp-child-marker__avatars">${avatars}</span>` : ""}
        </span>
      </div>
    `,
    iconSize: [1, 1],
    iconAnchor: [0.5, 0.5],
  });
}

function createActivityClusterIcon(
  L: LeafletModule,
  node: ActivityClusterRenderNode,
  resolve: (url: string) => string,
) {
  const size = activityClusterSize(node.pointCount);
  const images = [...node.leaves]
    .sort((a, b) => b.hotness - a.hotness || a.id.localeCompare(b.id))
    .slice(0, 3);
  const collage = images
    .map(
      (place, index) =>
        `<img class="hp-area-marker__photo hp-area-marker__photo--${index + 1}" src="${escapeHtml(
          resolveUrl(resolve, place.imageUrl),
        )}" alt="" loading="lazy" />`,
    )
    .join("");
  const line =
    node.eventCount > 0
      ? `${node.eventCount} event${node.eventCount === 1 ? "" : "s"}`
      : `${node.postCount} posts`;

  return L.divIcon({
    className: "hp-activity-cluster",
    html: `
      <div
        class="hp-area-marker__shell hp-area-marker__shell--activity is-pulse-${node.tier} ${node.tier === "live" ? "is-live" : ""} ${node.tier === "hot" ? "is-hot" : ""}"
        style="${markerStyle(size, node.id)}"
      >
        ${MARKER_EFFECTS_HTML}
        <span class="hp-marker-core">
          <span class="hp-area-marker__ring"></span>
          <span class="hp-area-marker__collage hp-area-marker__collage--${images.length}">${collage}</span>
          <span class="hp-area-marker__shade"></span>
          <span class="hp-area-marker__copy">
            <strong>${escapeHtml(node.dominantCluster.name)}</strong>
            <em>${escapeHtml(line)}</em>
          </span>
          ${node.tier !== "quiet" ? '<span class="hp-area-marker__dot"></span>' : ""}
        </span>
      </div>
    `,
    iconSize: [1, 1],
    iconAnchor: [0.5, 0.5],
  });
}

function shortPlaceName(name: string) {
  const words = name.split(" ");
  if (words.length <= 2) return name;
  return words.slice(0, 2).join(" ");
}

function superclusterZoom(zoom: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(zoom)));
}

function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(start: number, end: number, value: number) {
  const t = clamp01((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

type ZoomAnchor = readonly [zoom: number, value: number];

function interpolateZoomAnchors(zoom: number, anchors: readonly ZoomAnchor[]) {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (!first || !last) return 0;
  if (zoom <= first[0]) return first[1];
  if (zoom >= last[0]) return last[1];

  for (let index = 1; index < anchors.length; index += 1) {
    const previous = anchors[index - 1];
    const next = anchors[index];
    if (!previous || !next || zoom > next[0]) continue;
    const progress = smoothstep(previous[0], next[0], zoom);
    return previous[1] + (next[1] - previous[1]) * progress;
  }

  return last[1];
}

function markerZoomProfile(zoom: number) {
  const childScale = interpolateZoomAnchors(zoom, [
    [MIN_ZOOM, 0.24],
    [OVERVIEW_ZOOM, 0.24],
    [11.5, 0.52],
    [12.5, 0.68],
    [PLACE_FOCUS_ZOOM, 0.9],
    [ALL_MARKERS_RICH_ZOOM, 1],
  ]);
  const soloScale = interpolateZoomAnchors(zoom, [
    [MIN_ZOOM, 0.38],
    [OVERVIEW_ZOOM, 0.38],
    [11.5, 0.58],
    [12.5, 0.68],
    [PLACE_FOCUS_ZOOM, 0.9],
    [ALL_MARKERS_RICH_ZOOM, 1],
  ]);

  return {
    medium: smoothstep(PLACE_REVEAL_START, MEDIUM_VISUAL_END, zoom),
    detail: smoothstep(DETAIL_VISUAL_START, PLACE_FOCUS_ZOOM, zoom),
    rich: smoothstep(RICH_VISUAL_START, PLACE_FOCUS_ZOOM, zoom),
    ultra: smoothstep(PLACE_FOCUS_ZOOM, ALL_MARKERS_RICH_ZOOM, zoom),
    childScale,
    soloScale,
    areaScale: interpolateZoomAnchors(zoom, [
      [MIN_ZOOM, 0.38],
      [OVERVIEW_ZOOM, 0.38],
      [11.5, 0.52],
      [AREA_FADE_END, 0.62],
    ]),
    activityScale: interpolateZoomAnchors(zoom, [
      [ACTIVITY_CLUSTER_START, 0.58],
      [ACTIVITY_CLUSTER_FULL, 0.75],
      [DETAIL_CLUSTER_MAX_ZOOM, 0.84],
      [PLACE_FOCUS_ZOOM, 0.9],
    ]),
    surfaceOpacity: interpolateZoomAnchors(zoom, [
      [MIN_ZOOM, 0.74],
      [OVERVIEW_ZOOM, 0.78],
      [11.5, 0.86],
      [12.5, 0.92],
      [PLACE_FOCUS_ZOOM, 0.98],
      [ALL_MARKERS_RICH_ZOOM, 1],
    ]),
    auraOpacity: interpolateZoomAnchors(zoom, [
      [MIN_ZOOM, 0.3],
      [OVERVIEW_ZOOM, 0.34],
      [11.5, 0.42],
      [12.5, 0.48],
      [PLACE_FOCUS_ZOOM, 0.58],
      [ALL_MARKERS_RICH_ZOOM, 0.6],
    ]),
    ringOpacity: interpolateZoomAnchors(zoom, [
      [MIN_ZOOM, 0.68],
      [OVERVIEW_ZOOM, 0.72],
      [12.5, 0.86],
      [PLACE_FOCUS_ZOOM, 0.96],
      [ALL_MARKERS_RICH_ZOOM, 1],
    ]),
  };
}

function applyMarkerZoomProfile(node: HTMLElement | null, zoom: number) {
  if (!node) return;
  const profile = markerZoomProfile(zoom);
  const farPulse = 1 - smoothstep(OVERVIEW_ZOOM, PLACE_FOCUS_ZOOM, zoom);
  const themeDetail = smoothstep(10.5, RICH_VISUAL_START, zoom);
  node.style.setProperty("--hp-map-fill-scale", markerMapFillScale(zoom).toFixed(4));
  for (const tier of ["quiet", "moving", "hot", "live"] as const) {
    node.style.setProperty(`--hp-presence-${tier}`, markerPresenceScale(zoom, tier).toFixed(4));
  }
  node.classList.toggle("hp-map-identity-far", zoom < 10.5);
  node.style.setProperty("--hp-map-medium", profile.medium.toFixed(4));
  node.style.setProperty("--hp-map-detail", profile.detail.toFixed(4));
  node.style.setProperty("--hp-map-rich", profile.rich.toFixed(4));
  node.style.setProperty("--hp-map-ultra", profile.ultra.toFixed(4));
  node.style.setProperty("--hp-map-child-scale", profile.childScale.toFixed(4));
  node.style.setProperty("--hp-map-nearby-scale", profile.childScale.toFixed(4));
  node.style.setProperty("--hp-map-solo-scale", profile.soloScale.toFixed(4));
  node.style.setProperty("--hp-map-area-scale", profile.areaScale.toFixed(4));
  node.style.setProperty("--hp-map-activity-scale", profile.activityScale.toFixed(4));
  node.style.setProperty("--hp-map-surface-opacity", profile.surfaceOpacity.toFixed(4));
  node.style.setProperty("--hp-map-aura-opacity", profile.auraOpacity.toFixed(4));
  node.style.setProperty("--hp-map-ring-opacity", profile.ringOpacity.toFixed(4));
  node.style.setProperty(
    "--hp-map-media-opacity",
    interpolateZoomAnchors(zoom, [
      [MIN_ZOOM, 0.82],
      [11.5, 0.86],
      [12.5, 0.92],
      [PLACE_FOCUS_ZOOM, 0.98],
      [ALL_MARKERS_RICH_ZOOM, 1],
    ]).toFixed(4),
  );
  node.style.setProperty(
    "--hp-map-media-scale",
    interpolateZoomAnchors(zoom, [
      [MIN_ZOOM, 0.94],
      [12.5, 0.97],
      [PLACE_FOCUS_ZOOM, 1],
    ]).toFixed(4),
  );
  node.style.setProperty("--hp-map-rich-scale", (0.8 + profile.rich * 0.2).toFixed(4));
  node.style.setProperty("--hp-map-dot-opacity", (0.35 + profile.medium * 0.65).toFixed(4));
  node.style.setProperty("--hp-map-copy-offset", `${((1 - profile.rich) * 0.2).toFixed(4)}rem`);
  node.style.setProperty("--hp-map-pulse-moving-peak", (1.04 + farPulse * 0.08).toFixed(4));
  node.style.setProperty("--hp-map-pulse-hot-peak", (1.08 + farPulse * 0.14).toFixed(4));
  node.style.setProperty("--hp-map-pulse-live-peak", (1.12 + farPulse * 0.18).toFixed(4));
  node.style.setProperty("--hp-map-theme-detail", themeDetail.toFixed(4));
  node.style.setProperty("--hp-map-wave-strength", markerWaveStrength(zoom).toFixed(4));
}

// Conservative theme-independent radius: Pulse is the largest core. Include
// the rim/dot, but not the decorative wave, to avoid unnecessary camera pans.
function markerCoreRadius(node: RenderNode, zoom: number) {
  const profile = markerZoomProfile(zoom);
  const size =
    node.kind === "child"
      ? childMarkerSize(node.tier)
      : node.kind === "cluster"
        ? clusterSize(node.tier)
        : activityClusterSize(node.pointCount);
  const scale =
    node.kind === "cluster"
      ? profile.areaScale
      : node.kind === "activity-cluster"
        ? profile.activityScale
        : node.solo && !node.selected
          ? profile.soloScale
          : profile.childScale;
  return (
    (size *
      scale *
      markerPresenceScale(zoom, node.tier) *
      markerMapFillScale(zoom) *
      (node.selected ? 1.1 : 1) *
      MAX_MARKER_CORE_BEAT) /
      2 +
    6
  );
}

function centroidOfPlaces(places: Place[], fallback: LatLngTuple): LatLngTuple {
  if (places.length === 0) return fallback;
  let lat = 0;
  let lng = 0;
  for (const place of places) {
    lat += place.lat;
    lng += place.lng;
  }
  return [lat / places.length, lng / places.length];
}

// Pins are always on the map at their real coordinates. Opacity ramps with zoom
// so the overview stays calm and detail emerges smoothly instead of popping.
function placeOpacityForZoom(zoom: number) {
  return smoothstep(PLACE_REVEAL_START, PLACE_REVEAL_END, zoom);
}

// Area clusters are helpers only: they dissolve as the real pins take over.
function areaClusterOpacityForZoom(zoom: number) {
  if (zoom <= AREA_FADE_START) return 1;
  return 1 - smoothstep(AREA_FADE_START, AREA_FADE_END, zoom);
}

// An activity bubble fades out as you approach the zoom where its members
// separate, so the split into real pins reads as one continuous motion.
function activityClusterOpacityForZoom(zoom: number, expansionZoom: number) {
  const distance = expansionZoom - zoom;
  if (distance <= 0) return 0;
  const reveal = smoothstep(ACTIVITY_CLUSTER_START, ACTIVITY_CLUSTER_FULL, zoom);
  return reveal * clamp01(distance / 0.9);
}

function isActivityClusterFeature(
  feature:
    | Supercluster.ClusterFeature<ActivityClusterProperties>
    | Supercluster.PointFeature<PlacePointProperties>,
): feature is Supercluster.ClusterFeature<ActivityClusterProperties> {
  return Boolean((feature.properties as Supercluster.ClusterProperties).cluster);
}

function createPlaceFeature(
  place: Place,
  cluster: MapAreaCluster,
  eventCount: number,
  activitySnapshot: PulseActivitySnapshot,
): Supercluster.PointFeature<PlacePointProperties> {
  const activity = pulseMetricForPlace(place, activitySnapshot, eventCount);
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [place.lng, place.lat],
    },
    properties: {
      placeId: place.id,
      areaId: cluster.id,
      eventCount: activity.eventCount,
      postCount: activity.postCount,
      commentCount: activity.commentCount,
      hotness: activity.hotness,
      tone: cluster.tone,
    },
  };
}

interface Props {
  clusters: MapAreaCluster[];
  events: EventItem[];
  activitySnapshot: PulseActivitySnapshot;
  selectedAreaId: string | null;
  selectedPlaceId?: string | null;
  activeFilterLabel?: string | null;
  storyPlaceIds?: ReadonlySet<string>;
  onSelectArea: (cluster: MapAreaCluster) => void;
  onSelectPlace: (place: Place, cluster: MapAreaCluster) => void;
  onResetView: () => void;
  onClearSelection: () => void;
  canGoBack?: boolean;
  onBack?: () => void;
  bottomOverlayHeight: number;
  availableMapHeight: number;
  /** Ordered lat/lng path to draw as a route polyline (e.g. an open route's stops). */
  routePath?: { lat: number; lng: number; label: string }[] | null;
  /** Fired on map long-press so the shell can open the composer pre-filled. */
  onMapLongPress?: (lat: number, lng: number) => void;
}

export function SocialMap({
  clusters,
  events,
  activitySnapshot,
  selectedAreaId,
  selectedPlaceId,
  activeFilterLabel,
  storyPlaceIds,
  onSelectArea,
  onSelectPlace,
  onResetView,
  onClearSelection,
  canGoBack = false,
  onBack,
  bottomOverlayHeight,
  availableMapHeight,
  routePath = null,
  onMapLongPress,
}: Props) {
  const { t } = useI18n();
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const markersRef = useRef<Map<string, LeafletMarker>>(new Map());
  const markerSigRef = useRef<Map<string, string>>(new Map());
  const markerRuntimeRef = useRef<Map<string, MarkerRuntimeState>>(new Map());
  const markerClickHandlerRef = useRef<Map<string, () => void>>(new Map());
  const renderNodesRef = useRef<Map<string, RenderNode>>(new Map());
  const scheduleMarkerViewportSyncRef = useRef<() => void>(() => {});
  const activitySnapshotRef = useRef(activitySnapshot);
  activitySnapshotRef.current = activitySnapshot;
  const activateMarkerByIdRef = useRef<(id: string) => void>(() => undefined);
  const userMarkerRef = useRef<LeafletMarker | null>(null);
  const routeLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const onMapLongPressRef = useRef(onMapLongPress);
  onMapLongPressRef.current = onMapLongPress;
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;
  const bottomOverlayHeightRef = useRef(bottomOverlayHeight);
  bottomOverlayHeightRef.current = bottomOverlayHeight;
  const availableMapHeightRef = useRef(availableMapHeight);
  availableMapHeightRef.current = availableMapHeight;
  const didInitialFitRef = useRef(false);
  const lastMarkerActivationRef = useRef<{ id: string; at: number } | null>(null);
  const previousSelectionRef = useRef<{ areaId: string | null; placeId: string | null }>({
    areaId: null,
    placeId: null,
  });
  const lastFocusedPlaceIdRef = useRef<string | null>(null);
  const selectionMotionUntilRef = useRef(0);
  const cameraHandledSelectionRef = useRef<string | null>(null);
  const ignoreBackgroundClickUntilRef = useRef(0);
  const lastZoomRef = useRef(OVERVIEW_ZOOM);
  const [mapReady, setMapReady] = useState(false);
  const [zoom, setZoom] = useState(OVERVIEW_ZOOM);
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

  // Collect every image URL the map can show (place photos + avatars) and warm
  // the on-device cache. Each URL resolves to a compressed blob: URL once cached;
  // until then (or if the source blocks CORS) it falls back to the remote URL so
  // the marker always shows the real image — never a broken/empty tile.
  const allImageUrls = useMemo(() => {
    const set = new Set<string>();
    clusters.forEach((cluster) => {
      cluster.places.forEach((place) => {
        if (place.imageUrl) set.add(place.imageUrl);
        place.avatars.forEach((avatar) => avatar && set.add(avatar));
      });
      cluster.avatars.forEach((avatar) => avatar && set.add(avatar));
    });
    return Array.from(set);
  }, [clusters]);
  const imageMap = useImageUrls(allImageUrls);
  const resolveImg = useCallback(
    (url: string) => (url ? (imageMap.get(url) ?? url) : ""),
    [imageMap],
  );

  const placeClusterIndex = useMemo(() => {
    const index = new Supercluster<PlacePointProperties, ActivityClusterProperties>({
      maxZoom: DETAIL_CLUSTER_MAX_ZOOM,
      minPoints: 2,
      radius: 58,
      map: (props) => ({
        eventCount: props.eventCount,
        postCount: props.postCount,
        commentCount: props.commentCount,
        hotness: props.hotness,
      }),
      reduce: (accumulated, props) => {
        accumulated.eventCount += props.eventCount;
        accumulated.postCount += props.postCount;
        accumulated.commentCount += props.commentCount;
        accumulated.hotness = Math.max(accumulated.hotness, props.hotness);
      },
    });

    index.load(
      clusters.flatMap((cluster) =>
        cluster.childPlaces.map((place) =>
          createPlaceFeature(place, cluster, eventCounts.get(place.id) ?? 0, activitySnapshot),
        ),
      ),
    );
    return index;
  }, [activitySnapshot, clusters, eventCounts]);

  const renderNodes = useMemo<RenderNode[]>(() => {
    const nodes: RenderNode[] = [];
    const placeOpacity = placeOpacityForZoom(zoom);

    // 1) Every place is ALWAYS on the map at its true coordinate. Selection only
    //    flags the active pin; nothing ever shoves a pin off its real location,
    //    so zoom/pan never makes locations "change place".
    clusters.forEach((cluster) => {
      cluster.places.forEach((place) => {
        const selected = place.id === selectedPlaceId;
        const solo = cluster.places.length === 1;
        const activity = pulseMetricForPlace(
          place,
          activitySnapshot,
          eventCounts.get(place.id) ?? 0,
        );
        nodes.push({
          id: `child-${cluster.id}-${place.id}`,
          kind: "child",
          cluster,
          place,
          eventCount: activity.eventCount,
          latLng: [place.lat, place.lng],
          opacity: selected ? 1 : solo ? Math.max(0.72, placeOpacity) : placeOpacity,
          selected,
          solo,
          tier: activity.tier,
        });
      });
    });

    // 2) Area clusters ride on top as helpers and fade out as pins emerge.
    //    Standalone single-pin areas skip the bubble (they're just a pin).
    if (zoom < AREA_FADE_END) {
      const areaOpacity = areaClusterOpacityForZoom(zoom);
      if (areaOpacity > 0.001) {
        clusters.forEach((cluster) => {
          if (cluster.places.length < 2) return;
          const selected = Boolean(
            selectedAreaId &&
            !selectedPlaceId &&
            zoom < ACTIVITY_CLUSTER_FULL &&
            cluster.id === selectedAreaId,
          );
          nodes.push({
            id: `cluster-${cluster.id}`,
            kind: "cluster",
            cluster,
            latLng: [cluster.lat, cluster.lng],
            opacity: selected ? 1 : areaOpacity,
            selected,
            tier: cluster.status,
          });
        });
      }
    }

    // 3) At detail zoom, activity bubbles group dense spots. Each one is placed
    //    at the centroid of its members and fades into the already-rendered pins
    //    as you zoom toward its expansion zoom -> clean split, no relocation.
    if (zoom >= ACTIVITY_CLUSTER_START) {
      const features = placeClusterIndex.getClusters(ILIA_DETAIL_BBOX, superclusterZoom(zoom));
      features.forEach((feature) => {
        if (!isActivityClusterFeature(feature)) return;

        const leaves = placeClusterIndex
          .getLeaves(feature.properties.cluster_id, Infinity)
          .map((leaf) => placeById.get(leaf.properties.placeId)?.place)
          .filter((place): place is Place => Boolean(place));
        if (leaves.length === 0) return;

        const expansionZoom = placeClusterIndex.getClusterExpansionZoom(
          feature.properties.cluster_id,
        );
        const opacity = activityClusterOpacityForZoom(zoom, expansionZoom);
        if (opacity <= 0.001) return;

        const areaScores = new Map<string, number>();
        leaves.forEach((place) => {
          const areaId = clusterIdForPlace(place);
          areaScores.set(
            areaId,
            (areaScores.get(areaId) ?? 0) + scorePlace(place, activitySnapshot),
          );
        });
        const dominantAreaId = [...areaScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        const dominantCluster =
          (dominantAreaId ? clusterById.get(dominantAreaId) : null) ??
          placeById.get(leaves[0].id)?.cluster;
        if (!dominantCluster) return;

        const [lng, lat] = feature.geometry.coordinates;
        const centroid = centroidOfPlaces(leaves, [lat, lng]);
        const activity = aggregatePulseMetrics(leaves, activitySnapshot, eventCounts);

        nodes.push({
          id: `activity-${feature.properties.cluster_id}`,
          kind: "activity-cluster",
          clusterId: feature.properties.cluster_id,
          dominantCluster,
          leaves,
          latLng: centroid,
          opacity,
          pointCount: feature.properties.point_count,
          eventCount: activity.eventCount,
          postCount: activity.postCount,
          hotness: activity.hotness,
          selected: false,
          tone: dominantCluster.tone,
          tier: activity.tier,
        });
      });
    }

    if (selectedAreaId && !selectedPlaceId && zoom >= ACTIVITY_CLUSTER_FULL) {
      const selectedArea = clusterById.get(selectedAreaId);
      const candidates = nodes.filter(
        (node): node is ActivityClusterRenderNode =>
          node.kind === "activity-cluster" &&
          node.leaves.some((place) => clusterIdForPlace(place) === selectedAreaId),
      );
      candidates.sort((first, second) => {
        if (!selectedArea) return second.hotness - first.hotness;
        const firstDistance =
          (first.latLng[0] - selectedArea.lat) ** 2 + (first.latLng[1] - selectedArea.lng) ** 2;
        const secondDistance =
          (second.latLng[0] - selectedArea.lat) ** 2 + (second.latLng[1] - selectedArea.lng) ** 2;
        return firstDistance - secondDistance || second.hotness - first.hotness;
      });
      if (candidates[0]) {
        candidates[0].selected = true;
        candidates[0].opacity = 1;
      }

      // Dense activity bubbles disappear once their children fully separate.
      // Keep one area representative selected at those close zooms so the
      // current area never loses its visual anchor while the sheet is open.
      if (selectedArea && !candidates[0]) {
        const existingAreaNode = nodes.find(
          (node): node is ClusterRenderNode =>
            node.kind === "cluster" && node.cluster.id === selectedArea.id,
        );
        if (existingAreaNode) {
          existingAreaNode.opacity = 1;
          existingAreaNode.selected = true;
        } else {
          nodes.push({
            id: `cluster-${selectedArea.id}`,
            kind: "cluster",
            cluster: selectedArea,
            latLng: [selectedArea.lat, selectedArea.lng],
            opacity: 1,
            selected: true,
            tier: selectedArea.status,
          });
        }
      }
    }

    return nodes;
  }, [
    activitySnapshot,
    clusterById,
    clusters,
    eventCounts,
    placeById,
    placeClusterIndex,
    selectedAreaId,
    selectedPlaceId,
    zoom,
  ]);

  renderNodesRef.current = new Map(renderNodes.map((node) => [node.id, node]));
  const primarySelectedNode = renderNodes.find((node) => node.selected) ?? null;
  const hasPrimaryMarkerSelection = Boolean(primarySelectedNode);

  const summaryText = useMemo(() => {
    if (selectedPlaceNode) return selectedPlaceNode.place.name;
    if (selectedAreaCluster) return `${selectedAreaCluster.name} places`;
    if (isSplitZoom) return "Tap a place or cluster";
    if (activeFilterLabel) return `${activeFilterLabel} areas`;
    if (clusters.some((cluster) => cluster.tone === "beach" && cluster.status !== "quiet")) {
      return "Hot around the coast";
    }
    return `${clusters.length} area${clusters.length === 1 ? "" : "s"} moving tonight`;
  }, [activeFilterLabel, clusters, isSplitZoom, selectedAreaCluster, selectedPlaceNode]);

  const zoomIntoCluster = useCallback((cluster: MapAreaCluster) => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const container = mapNodeRef.current;
    if (!L || !map || !container) return;

    const places = cluster.childPlaces;
    const overlayHeight = bottomOverlayHeightRef.current;
    const viewport = safeMapRect(container, overlayHeight, availableMapHeightRef.current);
    const childrenAlreadySafe =
      map.getZoom() >= SPLIT_ZOOM &&
      places.length > 0 &&
      places.every((place) =>
        pointIsInSafeRect(map.latLngToContainerPoint([place.lat, place.lng]), viewport),
      );
    if (childrenAlreadySafe) return;

    const visibleMapHeight = Math.max(80, container.clientHeight - overlayHeight);
    const topPadding = Math.min(96, Math.max(52, Math.round(visibleMapHeight * 0.35)));
    const maximumBottomPadding = Math.max(96, container.clientHeight - topPadding - 72);
    const bottomPadding = Math.min(maximumBottomPadding, Math.max(96, overlayHeight + 24));
    const reduceMotion = prefersReducedMapMotion();
    map.stop();
    selectionMotionUntilRef.current = Date.now() + (reduceMotion ? 0 : 420);

    if (places.length <= 1) {
      const focus: LatLngTuple = places[0]
        ? [places[0].lat, places[0].lng]
        : [cluster.lat, cluster.lng];
      const targetZoom = Math.min(PLACE_FOCUS_ZOOM, Math.max(SPLIT_ZOOM, map.getZoom() + 0.5));
      const projected = map.project(focus, targetZoom);
      const shifted = map.unproject([projected.x, projected.y + bottomPadding * 0.42], targetZoom);
      if (reduceMotion) {
        map.setView([shifted.lat, shifted.lng], targetZoom, { animate: false });
      } else {
        map.flyTo([shifted.lat, shifted.lng], targetZoom, {
          duration: MAP_FOCUS_DURATION,
          easeLinearity: MAP_EASE_LINEARITY,
        });
      }
      return;
    }

    // Frame EVERY pin above the bottom sheet. The high maxZoom is the key:
    // a tight cluster like Ancient Olympia (pins within ~800m) now flies in to
    // ~z15, where the pins clearly separate and the supercluster bubble
    // (which stops clustering above z13) can no longer swallow them.
    const bounds = L.latLngBounds(places.map((place) => [place.lat, place.lng] as LatLngTuple)).pad(
      0.25,
    );
    map.fitBounds(bounds, {
      animate: !reduceMotion,
      duration: MAP_FOCUS_DURATION,
      easeLinearity: MAP_EASE_LINEARITY,
      maxZoom: AREA_FOCUS_MAX_ZOOM,
      paddingTopLeft: [48, topPadding],
      paddingBottomRight: [48, bottomPadding],
    });
  }, []);

  const zoomIntoActivityCluster = useCallback(
    (node: ActivityClusterRenderNode) => {
      const map = mapRef.current;
      const container = mapNodeRef.current;
      if (!map || !container) return;

      const expansionZoom = placeClusterIndex.getClusterExpansionZoom(node.clusterId);
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
      const projected = map.project(node.latLng, targetZoom);
      const targetCenter = map.unproject(
        [
          projected.x + container.clientWidth / 2 - desiredPoint.x,
          projected.y + container.clientHeight / 2 - desiredPoint.y,
        ],
        targetZoom,
      );
      const reduceMotion = prefersReducedMapMotion();
      map.stop();
      selectionMotionUntilRef.current = Date.now() + (reduceMotion ? 0 : 420);
      if (reduceMotion) {
        map.setView(targetCenter, targetZoom, { animate: false });
      } else {
        map.flyTo(targetCenter, targetZoom, {
          duration: MAP_FOCUS_DURATION,
          easeLinearity: MAP_EASE_LINEARITY,
        });
      }
    },
    [placeClusterIndex],
  );

  const flyToOverview = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.stop();
    if (prefersReducedMapMotion()) {
      map.setView(ILIA_CENTER, OVERVIEW_ZOOM, { animate: false });
    } else {
      map.flyTo(ILIA_CENTER, OVERVIEW_ZOOM, {
        duration: MAP_OVERVIEW_DURATION,
        easeLinearity: MAP_EASE_LINEARITY,
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

    if (node.kind === "cluster") {
      const nextSelectionKey = `${node.cluster.id}|`;
      if (selectionKeyRef.current !== nextSelectionKey) {
        cameraHandledSelectionRef.current = nextSelectionKey;
      }
      onSelectArea(node.cluster);
      zoomIntoCluster(node.cluster);
    } else if (node.kind === "activity-cluster") {
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

  useEffect(() => {
    const previous = previousSelectionRef.current;
    const next = { areaId: selectedAreaId, placeId: selectedPlaceId ?? null };
    previousSelectionRef.current = next;

    if (!mapReady) return;

    const nextSelectionKey = `${next.areaId ?? ""}|${next.placeId ?? ""}`;
    if (cameraHandledSelectionRef.current === nextSelectionKey) {
      cameraHandledSelectionRef.current = null;
      return;
    }

    if (previous.placeId && !next.placeId && next.areaId) {
      const cluster = clusters.find((item) => item.id === next.areaId);
      if (cluster) zoomIntoCluster(cluster);
      return;
    }

    if ((previous.areaId || previous.placeId) && !next.areaId && !next.placeId) {
      flyToOverview();
    }
  }, [clusters, flyToOverview, mapReady, selectedAreaId, selectedPlaceId, zoomIntoCluster]);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    let zoomFrame: number | null = null;
    let effectsResumeFrame: number | null = null;
    const activeMapMotion = new Set<"move" | "zoom">();
    const cleanupFns: Array<() => void> = [];
    const markers = markersRef.current;
    const markerSigs = markerSigRef.current;
    const markerRuntimes = markerRuntimeRef.current;
    const markerClickHandlers = markerClickHandlerRef.current;

    import("leaflet").then((L) => {
      if (cancelled || !mapNodeRef.current) return;

      leafletRef.current = L;
      map = L.map(mapNodeRef.current, {
        attributionControl: true,
        center: ILIA_CENTER,
        doubleClickZoom: true,
        maxBounds: MAP_PAN_BOUNDS,
        maxBoundsViscosity: 0.3,
        maxZoom: MAX_ZOOM,
        minZoom: MIN_ZOOM,
        scrollWheelZoom: "center",
        tapHold: false,
        tapTolerance: 18,
        touchZoom: true,
        wheelDebounceTime: 18,
        wheelPxPerZoomLevel: 70,
        zoom: OVERVIEW_ZOOM,
        zoomDelta: 0.5,
        zoomControl: false,
        zoomSnap: 0.25,
      });
      const guidePane = map.createPane("hp-marker-guides");
      guidePane.style.zIndex = "625";
      guidePane.style.pointerEvents = "none";

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
        subdomains: "abcd",
        opacity: 1,
      }).addTo(map);

      const onMapClick = (event: import("leaflet").LeafletMouseEvent) => {
        if (Date.now() < ignoreBackgroundClickUntilRef.current) return;
        const target = event.originalEvent?.target as Element | null;
        if (target?.closest(".leaflet-marker-icon, .leaflet-control, button, a")) return;
        if (selectionKeyRef.current === "|") return;

        cameraHandledSelectionRef.current = "|";
        onClearSelectionRef.current();
      };
      map.on("click", onMapClick);
      cleanupFns.push(() => map?.off("click", onMapClick));

      if (mapNodeRef.current) {
        const mapContainer = mapNodeRef.current;
        const resizeObserver = new ResizeObserver(() => {
          map?.invalidateSize({ animate: false, pan: false });
        });
        resizeObserver.observe(mapContainer);
        cleanupFns.push(() => resizeObserver.disconnect());
      }

      // Geolocation -> pulsing "you are here" dot
      const onLocationFound = (e: import("leaflet").LocationEvent) => {
        if (cancelled || !map) return;
        const latlng = e.latlng;
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng(latlng);
        } else {
          userMarkerRef.current = L.marker(latlng, {
            interactive: false,
            keyboard: false,
            zIndexOffset: 2000,
            icon: L.divIcon({
              className: "hp-user-marker",
              html: '<span class="hp-user-dot" style="display:block;width:15px;height:15px"></span>',
              iconSize: [15, 15],
              iconAnchor: [7.5, 7.5],
            }),
          }).addTo(map);
        }
      };
      map.on("locationfound", onLocationFound);
      cleanupFns.push(() => map?.off("locationfound", onLocationFound));

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
          if (ev.button !== 0) return;
          const target = ev.target as HTMLElement | null;
          if (target?.closest(".leaflet-marker-icon, .leaflet-control, button, a")) return;
          pressPoint = { x: ev.clientX, y: ev.clientY };
          pressTimer = window.setTimeout(() => {
            if (!map || !pressPoint) return;
            const rect = container.getBoundingClientRect();
            const ll = map.containerPointToLatLng([
              pressPoint.x - rect.left,
              pressPoint.y - rect.top,
            ]);
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
        cleanupFns.push(() => {
          clearPress();
          container.removeEventListener("pointerdown", onDown);
          container.removeEventListener("pointermove", onMove);
          container.removeEventListener("pointerup", clearPress);
          container.removeEventListener("pointercancel", clearPress);
          container.removeEventListener("pointerleave", clearPress);
        });
      }

      const syncZoom = () => {
        if (!map) return;
        if (zoomFrame !== null) return;
        zoomFrame = window.requestAnimationFrame(() => {
          zoomFrame = null;
          if (!map) return;
          const nextZoom = map.getZoom();
          lastZoomRef.current = nextZoom;
          applyMarkerZoomProfile(mapNodeRef.current, nextZoom);
          setZoom(nextZoom);
        });
      };
      map.on("zoom zoomend", syncZoom);
      const pauseMarkerEffects = (kind: "move" | "zoom") => {
        activeMapMotion.add(kind);
        if (effectsResumeFrame !== null) {
          window.cancelAnimationFrame(effectsResumeFrame);
          effectsResumeFrame = null;
        }
        mapNodeRef.current?.classList.add("hp-map-is-moving");
      };
      const resumeMarkerEffects = (kind: "move" | "zoom") => {
        activeMapMotion.delete(kind);
        if (activeMapMotion.size > 0) return;
        effectsResumeFrame = window.requestAnimationFrame(() => {
          effectsResumeFrame = null;
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
      cleanupFns.push(() => {
        map?.off("movestart", onMoveStart);
        map?.off("zoomstart", onZoomStart);
        map?.off("moveend", onMoveEnd);
        map?.off("zoomend", onZoomEnd);
      });
      map.whenReady(() => {
        if (cancelled || !map) return;
        mapRef.current = map;
        const readyZoom = map.getZoom();
        lastZoomRef.current = readyZoom;
        applyMarkerZoomProfile(mapNodeRef.current, readyZoom);
        setZoom(readyZoom);
        setMapReady(true);
        window.setTimeout(() => map?.invalidateSize(), 0);
      });
    });

    return () => {
      cancelled = true;
      if (zoomFrame !== null) {
        window.cancelAnimationFrame(zoomFrame);
      }
      if (effectsResumeFrame !== null) {
        window.cancelAnimationFrame(effectsResumeFrame);
      }
      cleanupFns.forEach((cleanup) => cleanup());
      setMapReady(false);
      markerClickHandlers.forEach((handler, id) => markers.get(id)?.off("click", handler));
      markers.clear();
      markerSigs.clear();
      markerRuntimes.clear();
      markerClickHandlers.clear();
      map?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      userMarkerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        // The settle event schedules a fresh pass; do not re-grid each zoom frame.
        if (mapNodeRef.current?.classList.contains("hp-map-is-moving")) return;
        const size = map.getSize();
        const height = Math.max(
          0,
          Math.min(size.y - bottomOverlayHeightRef.current, availableMapHeightRef.current),
        );
        const nodes = [...renderNodesRef.current.values()].map((node) => {
          const point = map.latLngToContainerPoint(node.latLng);
          const score =
            node.kind === "child"
              ? scorePlace(node.place, activitySnapshotRef.current, node.eventCount)
              : node.kind === "cluster"
                ? node.cluster.activityScore
                : node.leaves.reduce(
                    (sum, place) => sum + scorePlace(place, activitySnapshotRef.current),
                    0,
                  );
          return {
            id: node.id,
            x: point.x,
            y: point.y,
            opacity: node.opacity,
            tier: node.tier,
            selected: node.selected,
            score,
          };
        });
        const density = markerViewportDensity(nodes, size.x, height);
        mapNodeRef.current?.classList.toggle("hp-pulse-paused", document.hidden);
        markersRef.current.forEach((marker, id) => {
          const shell = marker.getElement()?.firstElementChild as HTMLElement | null;
          if (!shell) return;
          shell.classList.toggle("is-viewport-paused", document.hidden || !density.visible.has(id));
          shell.classList.toggle("is-marker-dense", density.dense.has(id));
          shell.classList.toggle("is-motion-suppressed", density.suppressed.has(id));
        });
      });
    };
    const onVisibilityChange = () => {
      // A hidden document may suspend rAF, so pause its animations immediately.
      mapNodeRef.current?.classList.toggle("hp-pulse-paused", document.hidden);
      schedule();
    };
    scheduleMarkerViewportSyncRef.current = schedule;
    map.on("moveend zoomend resize", schedule);
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      scheduleMarkerViewportSyncRef.current = () => {};
      map.off("moveend zoomend resize", schedule);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [mapReady]);

  useEffect(() => {
    scheduleMarkerViewportSyncRef.current();
  }, [bottomOverlayHeight, availableMapHeight, activitySnapshot]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;

    const nodeIds = new Set(renderNodes.map((node) => node.id));
    markersRef.current.forEach((marker, id) => {
      if (nodeIds.has(id)) return;
      const clickHandler = markerClickHandlerRef.current.get(id);
      if (clickHandler) marker.off("click", clickHandler);
      marker.remove();
      markersRef.current.delete(id);
      markerSigRef.current.delete(id);
      markerRuntimeRef.current.delete(id);
      markerClickHandlerRef.current.delete(id);
    });

    renderNodes.forEach((node) => {
      const zIndexOffset = node.selected
        ? 2400
        : node.kind === "child"
          ? 1400
          : node.kind === "activity-cluster"
            ? 900 + Math.round(node.hotness * 10)
            : 700 + Math.round(node.cluster.hotness * 10);

      // Signature captures only what changes the icon's *visual content*.
      // Interaction state is applied directly to the existing DOM and never
      // rebuilds image/collage content.
      const hasStory = node.kind === "child" && (storyPlaceIds?.has(node.place.id) ?? false);
      // The image token makes a marker rebuild the moment its cached thumbnail
      // resolves (placeholder -> blob URL), without rebuilding on pure zoom.
      const imageToken =
        node.kind === "cluster"
          ? node.cluster.places
              .slice(0, 3)
              .map((p) => resolveImg(p.imageUrl))
              .join(",") +
            "|" +
            node.cluster.avatars.map((a) => resolveImg(a)).join(",")
          : node.kind === "activity-cluster"
            ? node.leaves
                .slice(0, 3)
                .map((p) => resolveImg(p.imageUrl))
                .join(",")
            : [node.place.imageUrl, ...node.place.avatars.slice(0, 2)]
                .map((url) => resolveImg(url))
                .join(",");
      const sig = [
        `effects-${MARKER_EFFECTS_VERSION}`,
        node.kind,
        node.kind === "cluster"
          ? `${node.cluster.id}:${node.cluster.status}:${imageToken}`
          : node.kind === "activity-cluster"
            ? `${node.clusterId}:${node.pointCount}:${node.tier}:${node.tone}:${imageToken}`
            : `${node.place.id}:${node.tier}:${hasStory ? 1 : 0}:${node.solo ? 1 : 0}:${node.eventCount}:${imageToken}`,
      ].join("|");
      let marker = markersRef.current.get(node.id);
      const needsRebuild = markerSigRef.current.get(node.id) !== sig;
      const createIcon = () =>
        node.kind === "cluster"
          ? createAreaIcon(L, node.cluster, resolveImg)
          : node.kind === "activity-cluster"
            ? createActivityClusterIcon(L, node, resolveImg)
            : createChildIcon(
                L,
                node.place,
                node.eventCount,
                node.tier,
                hasStory,
                node.solo,
                resolveImg,
              );

      if (!marker) {
        marker = L.marker(node.latLng, {
          icon: createIcon(),
          riseOnHover: true,
          zIndexOffset,
        }).addTo(map);
        markersRef.current.set(node.id, marker);
        const clickHandler = () => activateMarkerByIdRef.current(node.id);
        marker.on("click", clickHandler);
        markerClickHandlerRef.current.set(node.id, clickHandler);
      } else if (needsRebuild) {
        marker.setIcon(createIcon());
      }

      if (needsRebuild) markerSigRef.current.set(node.id, sig);

      const previousRuntime = markerRuntimeRef.current.get(node.id);
      if (node.kind === "cluster") {
        const shell = marker.getElement()?.querySelector<HTMLElement>(".hp-area-marker__shell");
        const intelligence = node.cluster.intelligence;
        if (shell && intelligence) {
          shell.dataset.areaState = intelligence.state;
          shell.dataset.signalQuality = intelligence.signalQuality;
          shell.dataset.emerging = intelligence.emerging ? "true" : "false";
        } else if (shell) {
          delete shell.dataset.areaState;
          delete shell.dataset.signalQuality;
          delete shell.dataset.emerging;
        }
      }
      const isPassiveAreaAnchor =
        node.kind !== "child" && node.selected && placeOpacityForZoom(zoom) > 0.08;
      const visuallyVisible = node.opacity > 0.08;
      const visibleForInteraction = visuallyVisible && !isPassiveAreaAnchor;
      if (
        !previousRuntime ||
        previousRuntime.lat !== node.latLng[0] ||
        previousRuntime.lng !== node.latLng[1]
      ) {
        marker.setLatLng(node.latLng);
      }
      if (!previousRuntime || Math.abs(previousRuntime.opacity - node.opacity) > 0.0001) {
        marker.setOpacity(node.opacity);
      }
      if (!previousRuntime || previousRuntime.zIndexOffset !== zIndexOffset) {
        marker.setZIndexOffset(zIndexOffset);
      }

      const markerElement = marker.getElement() as InteractiveMarkerElement | null;
      if (markerElement) {
        const markerShell = markerElement.firstElementChild as HTMLElement | null;
        const shouldSyncInteraction =
          needsRebuild ||
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
          markerElement.classList.toggle("is-selection-anchor", isPassiveAreaAnchor);
          markerShell?.classList.toggle("is-selected", node.selected);
        }

        if (needsRebuild) {
          // Leaflet can reuse the outer icon element when replacing its content.
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
          markerElement.setAttribute(
            "aria-label",
            node.kind === "cluster"
              ? `Zoom into ${node.cluster.places.length} places near ${node.cluster.name}`
              : node.kind === "activity-cluster"
                ? `Zoom into ${node.pointCount} activities near ${node.dominantCluster.name}`
                : `Open ${node.place.name}`,
          );
          markerElement.dataset.hpNodeId = node.id;
          markerElement.addEventListener("click", activateFromEvent, true);
          markerElement.addEventListener("keydown", keyHandler, true);
          markerShell?.addEventListener("click", activateFromEvent, true);
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
      });
    });
    scheduleMarkerViewportSyncRef.current();
  }, [mapReady, renderNodes, resolveImg, storyPlaceIds, zoom]);

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

    const latLng: LatLngTuple = [selectedPlaceNode.place.lat, selectedPlaceNode.place.lng];
    const viewport = safeMapRect(
      container,
      bottomOverlayHeight,
      availableMapHeight,
      primarySelectedNode
        ? markerCoreRadius(primarySelectedNode, map.getZoom())
        : SAFE_MARKER_RADIUS,
    );
    const currentPoint = map.latLngToContainerPoint(latLng);
    const currentZoom = map.getZoom();

    if (currentZoom >= RICH_VISUAL_ZOOM && pointIsInSafeRect(currentPoint, viewport)) return;

    const reduceMotion = prefersReducedMapMotion();
    map.stop();

    if (currentZoom >= RICH_VISUAL_ZOOM) {
      const delta = panDeltaIntoSafeRect(currentPoint, viewport);
      if (delta.x === 0 && delta.y === 0) return;
      selectionMotionUntilRef.current = Date.now() + (reduceMotion ? 0 : 320);
      map.panBy([delta.x, delta.y], {
        animate: !reduceMotion,
        duration: MAP_PAN_DURATION,
        easeLinearity: MAP_EASE_LINEARITY,
      });
      return;
    }

    selectionMotionUntilRef.current = Date.now() + (reduceMotion ? 0 : 420);
    const bottomPadding = Math.min(460, Math.max(180, bottomOverlayHeight + 40));
    const focusOffset = Math.min(270, Math.max(128, bottomPadding * 0.44));
    const targetPoint = map.project(latLng, PLACE_FOCUS_ZOOM);
    const offsetCenter = map.unproject(
      [targetPoint.x, targetPoint.y + focusOffset],
      PLACE_FOCUS_ZOOM,
    );
    const targetCenter: LatLngTuple = [offsetCenter.lat, offsetCenter.lng];

    if (reduceMotion) {
      map.setView(targetCenter, PLACE_FOCUS_ZOOM, { animate: false });
    } else {
      map.flyTo(targetCenter, PLACE_FOCUS_ZOOM, {
        duration: MAP_FOCUS_DURATION,
        easeLinearity: MAP_EASE_LINEARITY,
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
    if (!map || !container || !mapReady || !primarySelectedNode || bottomOverlayHeight <= 0) {
      return;
    }

    let frame: number | null = null;
    let timer: number | null = null;
    let correctionCount = 0;
    const keepSelectionVisible = () => {
      const remainingMotion = selectionMotionUntilRef.current - Date.now();
      if (remainingMotion > 0) {
        timer = window.setTimeout(() => {
          frame = window.requestAnimationFrame(keepSelectionVisible);
        }, remainingMotion + 16);
        return;
      }

      const point = map.latLngToContainerPoint(primarySelectedNode.latLng);
      const viewport = safeMapRect(
        container,
        bottomOverlayHeight,
        availableMapHeight,
        markerCoreRadius(primarySelectedNode, map.getZoom()),
      );
      const delta = panDeltaIntoSafeRect(point, viewport);
      if (delta.x !== 0 || delta.y !== 0) {
        map.panBy([delta.x, delta.y], { animate: false });
        correctionCount += 1;
        if (correctionCount < 3) {
          frame = window.requestAnimationFrame(keepSelectionVisible);
        }
      }
    };

    frame = window.requestAnimationFrame(keepSelectionVisible);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [availableMapHeight, bottomOverlayHeight, mapReady, primarySelectedNode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || isSplitZoom || clusters.length === 0) return;
    if (selectedAreaId || selectedPlaceId) return;
    // Only auto-fit once per mount so live data refreshes never yank the map.
    if (didInitialFitRef.current) return;
    didInitialFitRef.current = true;

    const bounds = clusters.map((cluster) => [cluster.lat, cluster.lng] as LatLngTuple);
    map.fitBounds(bounds, {
      animate: !prefersReducedMapMotion(),
      duration: MAP_OVERVIEW_DURATION,
      maxZoom: OVERVIEW_ZOOM,
      paddingBottomRight: [52, 210],
      paddingTopLeft: [52, 108],
    });
  }, [clusters, isSplitZoom, mapReady, selectedAreaId, selectedPlaceId]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    routeLayerRef.current?.remove();
    routeLayerRef.current = null;

    if (!L || !map || !mapReady || !routePath || routePath.length < 2) return;

    const group = L.layerGroup().addTo(map);
    const latLngs = routePath.map((stop) => [stop.lat, stop.lng] as LatLngTuple);
    const line = L.polyline(latLngs, {
      className: "hp-route-line",
      color: "var(--hp-sunset)",
      dashArray: "2 12",
      interactive: false,
      opacity: 0.92,
      weight: 4,
    }).addTo(group);

    routePath.forEach((stop, index) => {
      L.marker([stop.lat, stop.lng], {
        interactive: false,
        keyboard: false,
        zIndexOffset: 1800,
        icon: L.divIcon({
          className: "hp-route-stop-marker",
          html: `<span class="hp-route-stop" title="${escapeHtml(stop.label)}">${index + 1}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(group);
    });

    routeLayerRef.current = group;
    const reduceMotion = prefersReducedMapMotion();
    const routeBottomPadding = Math.max(188, bottomOverlayHeightRef.current + 40);
    map.stop();
    map.fitBounds(line.getBounds().pad(0.22), {
      animate: !reduceMotion,
      duration: MAP_FOCUS_DURATION,
      maxZoom: PLACE_FOCUS_ZOOM,
      paddingBottomRight: [48, routeBottomPadding],
      paddingTopLeft: [48, 116],
    });

    return () => {
      group.remove();
      if (routeLayerRef.current === group) routeLayerRef.current = null;
    };
  }, [mapReady, routePath]);

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
    const map = mapRef.current;
    if (!map) return;
    map.locate({ enableHighAccuracy: true, maxZoom: 15, setView: true });
  };

  const utilityRailHidden = availableMapHeight < MIN_UTILITY_RAIL_HEIGHT;
  const mapChromeHidden = availableMapHeight < MIN_MAP_CHROME_HEIGHT;
  const mapStyle = {
    "--hp-map-bottom-overlay-height": `${Math.max(0, bottomOverlayHeight)}px`,
  } as CSSProperties;

  return (
    <div
      className={`hp-real-map relative z-0 h-full w-full overflow-hidden bg-hp-paper ${hasPrimaryMarkerSelection ? "has-marker-selection" : ""} ${mapChromeHidden ? "is-map-compressed" : ""}`}
      style={mapStyle}
    >
      <div ref={mapNodeRef} className="h-full w-full" aria-label={t("Interactive map of Ilia")} />

      {!mapReady && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-hp-paper/70">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-hp-ink/15 border-t-hp-sunset">
            <span className="sr-only">{t("Loading map")}</span>
          </div>
        </div>
      )}

      {canGoBack && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="hp-icon-button hp-control-surface hp-map-back absolute"
          aria-label={t("Back to previous map view")}
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
      )}

      <div className="hp-map-summary pointer-events-none">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-hp-sunset" />
        <span className="hp-map-summary__text">{summaryText}</span>
      </div>

      {clusters.length > 0 && (
        <div
          className={`hp-map-chip-rail hp-no-scrollbar ${canGoBack ? "has-back" : ""} ${selectedAreaId ? "has-selection" : ""}`}
          inert={mapChromeHidden ? true : undefined}
          aria-hidden={mapChromeHidden ? true : undefined}
          aria-label={t("Top map areas")}
        >
          {clusters
            .filter((cluster) => cluster.places.length > 1)
            .slice(0, 6)
            .map((cluster) => {
              const selected = cluster.id === selectedAreaId;
              return (
                <button
                  key={cluster.id}
                  type="button"
                  onClick={() => selectDiscoveryCluster(cluster)}
                  aria-pressed={selected}
                  tabIndex={mapChromeHidden ? -1 : undefined}
                  className={`hp-chip hp-map-chip ${selected ? "is-active" : ""}`}
                >
                  <span className="hp-map-chip__face">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-hp-sunset" />
                    {cluster.name}
                    <span className="text-hp-muted">{cluster.places.length}</span>
                  </span>
                </button>
              );
            })}
        </div>
      )}

      <div
        className={`hp-map-utility-rail ${utilityRailHidden ? "is-hidden" : ""}`}
        inert={utilityRailHidden ? true : undefined}
        aria-hidden={utilityRailHidden ? true : undefined}
      >
        <div className="hp-map-control-group" role="group" aria-label={t("Map zoom controls")}>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            disabled={!mapReady || zoom >= MAX_ZOOM}
            tabIndex={utilityRailHidden ? -1 : undefined}
            className="hp-icon-button hp-map-icon-button"
            aria-label={t("Zoom in map")}
          >
            <Plus size={17} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={zoomOut}
            disabled={!mapReady || zoom <= MIN_ZOOM}
            tabIndex={utilityRailHidden ? -1 : undefined}
            className="hp-icon-button hp-map-icon-button"
            aria-label={t("Zoom out map")}
          >
            <Minus size={17} strokeWidth={2.5} />
          </button>
        </div>
        <div className="hp-map-control-group" role="group" aria-label={t("Map view controls")}>
          <button
            type="button"
            onClick={locateUser}
            disabled={!mapReady}
            tabIndex={utilityRailHidden ? -1 : undefined}
            className="hp-icon-button hp-map-icon-button"
            aria-label={t("Find my location")}
          >
            <Crosshair size={17} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={resetToOverview}
            disabled={!mapReady}
            tabIndex={utilityRailHidden ? -1 : undefined}
            className="hp-icon-button hp-map-icon-button"
            aria-label={t("Show Ilia overview")}
          >
            <MapPinned size={17} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}

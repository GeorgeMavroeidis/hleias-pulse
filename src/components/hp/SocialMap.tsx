import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Crosshair, MapPinned, Minus, Plus } from "lucide-react";
import Supercluster from "supercluster";
import "leaflet/dist/leaflet.css";
import { type EventItem, type Place } from "@/lib/hp-model";
import { useImageUrls } from "@/lib/hp/image-cache";
import { useI18n } from "@/lib/i18n";

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletMarker = import("leaflet").Marker;
type LatLngTuple = import("leaflet").LatLngTuple;
type InteractiveMarkerElement = HTMLElement & {
  __hpClickHandler?: EventListener;
  __hpKeyHandler?: EventListener;
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
// Zoom band where individual pins cross-fade in while area clusters dissolve,
// so the split from "cluster bubble" to "real pins" is smooth, never a hard pop.
const PLACE_DETAIL_ZOOM = 11;
const AREA_FADE_START = OVERVIEW_ZOOM + 1.4;
// Highest zoom an area click will fly to. Tight clusters (e.g. Ancient Olympia,
// whose pins sit within ~800m) need ~z16 to separate; spread areas stay lower.
const AREA_FOCUS_MAX_ZOOM = 16.25;
const ILIA_DETAIL_BBOX: [number, number, number, number] = [19.9, 36.35, 23.25, 39.15];

type AreaTone = "beach" | "culture" | "local" | "music" | "nature" | "village";
type AreaStatus = "quiet" | "moving" | "hot" | "live";

type AreaDef = {
  id: string;
  name: string;
  title: string;
  tone: AreaTone;
  /** Explicit, geographically-tight membership. Areas are real neighbourhoods,
   * assembled from actual coordinates — not fuzzy string matching. */
  placeIds: string[];
};

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
  hotness: number;
  labelOffsetPx: number;
  avatars: string[];
};

type ClusterRenderNode = {
  id: string;
  kind: "cluster";
  cluster: MapAreaCluster;
  latLng: LatLngTuple;
  opacity: number;
  rank: number;
  selected: boolean;
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
  compact: boolean;
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
};

type RenderNode = ClusterRenderNode | ActivityClusterRenderNode | ChildRenderNode;

type PlacePointProperties = {
  placeId: string;
  areaId: string;
  eventCount: number;
  postCount: number;
  hotness: number;
  tone: AreaTone;
};

type ActivityClusterProperties = {
  eventCount: number;
  postCount: number;
  hotness: number;
};

// Curated from a proximity analysis of every place's real lat/lng
// (scripts/hp-seed-data.ts). Each area is a genuine neighbourhood (max spread
// ~6km) so clicking it can always frame its pins close & separated. Isolated
// places are intentionally left out — they render as standalone pins, not
// force-fit into a faraway bubble.
const AREA_DEFS: AreaDef[] = [
  {
    id: "olympia",
    name: "Ancient Olympia",
    title: "Olympia pulse",
    tone: "culture",
    placeIds: ["ancient-olympia", "olympia-stadium", "olympia-museum", "olympic-games-museum"],
  },
  {
    id: "ancient-elis",
    name: "Ancient Elis",
    title: "Ancient Elis",
    tone: "culture",
    placeIds: ["ancient-elis", "elis-agora"],
  },
  {
    id: "katakolo",
    name: "Katakolo",
    title: "Katakolo sunset",
    tone: "beach",
    placeIds: [
      "katakolo-port",
      "katakolo-sunset",
      "katakolo-kiani-akti",
      "agios-andreas",
      "lechaina-zacharo-flower",
    ],
  },
  {
    id: "skafidia",
    name: "Skafidia",
    title: "Skafidia coast",
    tone: "beach",
    placeIds: ["skafidia", "skafidia-monastery", "korakochori", "mercouri-estate"],
  },
  {
    id: "kourouta",
    name: "Kourouta",
    title: "Kourouta tonight",
    tone: "music",
    placeIds: ["kourouta-beach", "kourouta-sunset", "palouki-beach", "amaliada-square"],
  },
  {
    id: "kyllini",
    name: "Kyllini",
    title: "Kyllini harbor",
    tone: "beach",
    placeIds: ["kyllini-beach", "kyllini-harbor", "kyllini-old-beach"],
  },
  {
    id: "chlemoutsi",
    name: "Chlemoutsi",
    title: "Chlemoutsi & Arkoudi",
    tone: "culture",
    placeIds: ["chlemoutsi", "chlemoutsi-sea-view", "loutra-kyllinis", "arkoudi-beach"],
  },
  {
    id: "pyrgos",
    name: "Pyrgos",
    title: "Pyrgos is moving",
    tone: "local",
    placeIds: ["pyrgos-centre", "pyrgos-night"],
  },
  {
    id: "pineios",
    name: "Pineios",
    title: "Pineios plain",
    tone: "local",
    placeIds: ["vartholomio", "gastouni"],
  },
  {
    id: "zacharo",
    name: "Zacharo",
    title: "Zacharo sunset",
    tone: "beach",
    placeIds: ["zacharo-beach", "kaiafas-lake", "kaiafas-sunset"],
  },
  {
    id: "kakovatos",
    name: "Kakovatos",
    title: "Kakovatos",
    tone: "beach",
    placeIds: ["kakovatos-beach", "kakovatos-inland"],
  },
  {
    id: "south-coast",
    name: "South Coast",
    title: "South Coast pulse",
    tone: "beach",
    placeIds: ["giannitsochori", "tholo-beach"],
  },
  {
    id: "foloi",
    name: "Foloi Forest",
    title: "Foloi tips",
    tone: "nature",
    placeIds: ["foloi-forest", "foloi-deep"],
  },
  {
    id: "nemouta",
    name: "Nemouta",
    title: "Nemouta waterfalls",
    tone: "nature",
    placeIds: ["nemouta-waterfalls", "nemouta-village"],
  },
  {
    id: "andritsaina",
    name: "Andritsaina",
    title: "Andritsaina village",
    tone: "village",
    placeIds: ["andritsaina", "andritsaina-streets"],
  },
  {
    id: "bassae",
    name: "Bassae",
    title: "Temple of Bassae",
    tone: "culture",
    placeIds: ["bassae-temple", "bassae-inside"],
  },
];

const PLACE_AREA_ID: Map<string, string> = new Map(
  AREA_DEFS.flatMap((def) => def.placeIds.map((id) => [id, def.id] as const)),
);

function areaIdForPlace(place: Place): string {
  // Known place -> its curated neighbourhood; otherwise a standalone area
  // (renders as a lone pin, no bubble).
  return PLACE_AREA_ID.get(place.id) ?? `solo-${place.id}`;
}

function areaDefForId(id: string): AreaDef | null {
  return AREA_DEFS.find((def) => def.id === id) ?? null;
}

function toneForPlace(place: Place): AreaTone {
  if (place.type === "beach" || place.type === "sunset") return "beach";
  if (place.type === "culture") return "culture";
  if (place.type === "nature") return "nature";
  if (place.type === "village" || place.type === "night") return "village";
  return "local";
}

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

function scorePlace(place: Place, eventCount = 0) {
  return (
    place.hotness * 10 + place.recentPostCount * 1.8 + eventCount * 14 + place.commentCount * 0.45
  );
}

function statusForCluster(places: Place[], eventCount: number, hotness: number): AreaStatus {
  if (places.some((place) => place.status === "busy") || (eventCount >= 2 && hotness >= 9)) {
    return "live";
  }
  if (hotness >= 8.2 || eventCount > 0) return "hot";
  if (hotness >= 5.5 || places.length >= 3) return "moving";
  return "quiet";
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

function toneColor(tone: AreaTone) {
  if (tone === "beach") return "var(--hp-sea)";
  if (tone === "culture") return "var(--hp-deep)";
  if (tone === "nature") return "var(--hp-olive)";
  if (tone === "music" || tone === "village") return "var(--hp-purple)";
  return "var(--hp-sunset)";
}

function typeColorToken(place: Place) {
  if (place.type === "beach") return "var(--hp-sea)";
  if (place.type === "nature") return "var(--hp-olive)";
  if (place.type === "night" || place.type === "village") return "var(--hp-purple)";
  if (place.type === "culture") return "var(--hp-deep)";
  return "var(--hp-sunset)";
}

function clusterSize(status: AreaStatus, selected: boolean, compact: boolean) {
  if (compact) return selected ? 54 : 42;
  const base = status === "live" ? 82 : status === "hot" ? 70 : status === "moving" ? 58 : 48;
  return Math.round(base * (selected ? 1.08 : 1));
}

function childSize(place: Place, selected: boolean) {
  const base = place.hotness >= 8 ? 60 : place.hotness >= 6 ? 54 : 48;
  return Math.round(base * (selected ? 1.1 : 1));
}

function activityClusterSize(pointCount: number, selected: boolean) {
  const base = pointCount >= 8 ? 72 : pointCount >= 5 ? 64 : pointCount >= 3 ? 56 : 50;
  return Math.round(base * (selected ? 1.06 : 1));
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

export function buildAreaClusters(places: Place[], events: EventItem[]): MapAreaCluster[] {
  const eventCounts = eventCountForPlace(events);

  // Group by curated neighbourhood; places not in any def become standalone
  // single-pin "areas" (id `solo-<placeId>`) so they still render on the map.
  const grouped = new Map<string, Place[]>();
  places.forEach((place) => {
    const id = areaIdForPlace(place);
    const arr = grouped.get(id);
    if (arr) arr.push(place);
    else grouped.set(id, [place]);
  });

  return [...grouped.entries()]
    .map(([id, areaPlaces]) => {
      const def = areaDefForId(id);
      const sortedPlaces = [...areaPlaces].sort(
        (a, b) =>
          scorePlace(b, eventCounts.get(b.id) ?? 0) - scorePlace(a, eventCounts.get(a.id) ?? 0),
      );
      const lead = sortedPlaces[0];
      const placeIds = new Set(areaPlaces.map((place) => place.id));
      const eventCount = events.filter((event) => placeIds.has(event.placeId)).length;
      const postCount = areaPlaces.reduce((sum, place) => sum + place.recentPostCount, 0);
      const averageHotness =
        areaPlaces.reduce((sum, place) => sum + place.hotness, 0) / Math.max(areaPlaces.length, 1);
      const hotness = Math.min(
        10,
        Math.max(...areaPlaces.map((place) => place.hotness), averageHotness + eventCount * 0.85),
      );
      const status = statusForCluster(areaPlaces, eventCount, hotness);
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
        hotness,
        labelOffsetPx: 0,
        avatars: uniqueAvatars(sortedPlaces).slice(0, 3),
      };
    })
    .sort((a, b) => b.hotness + b.eventCount * 0.5 - (a.hotness + a.eventCount * 0.5));
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

function resolveUrl(resolve: (url: string) => string, url: string) {
  const value = url ? resolve(url) : "";
  return value || PLACEHOLDER_IMG;
}

function createAreaIcon(
  L: LeafletModule,
  cluster: MapAreaCluster,
  selected: boolean,
  rank: number,
  resolve: (url: string) => string,
) {
  const compact = !selected && cluster.status !== "live" && rank > 1;
  const size = clusterSize(cluster.status, selected, compact);
  const labelOffsetPx = selected ? 0 : cluster.labelOffsetPx;
  const color = toneColor(cluster.tone);
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
  const statusLabel =
    cluster.status === "quiet"
      ? ""
      : selected || rank <= 1 || cluster.status === "live"
        ? cluster.status
        : "";

  const glows = cluster.status === "live" || cluster.status === "hot";
  const glowSize = Math.round(size * 1.9);
  const glow = glows
    ? `<span class="hp-marker-glow" style="width:${glowSize}px;height:${glowSize}px;--glow-color:${color};"></span>`
    : "";

  return L.divIcon({
    className: "hp-area-marker",
    html: `
      <div
        class="hp-area-marker__shell ${selected ? "is-selected" : ""} ${cluster.status === "live" ? "is-live" : ""} ${compact ? "is-compact" : ""}"
        style="--marker-size:${size}px;--marker-color:${color};"
      >
        ${glow}<span class="hp-area-marker__ring"></span>
        <span class="hp-area-marker__collage">${collage}</span>
        <span class="hp-area-marker__shade"></span>
        <span class="hp-area-marker__initial">${escapeHtml(cluster.name.slice(0, 1))}</span>
        ${statusLabel ? `<span class="hp-area-marker__status">${escapeHtml(statusLabel)}</span>` : ""}
        <span class="hp-area-marker__copy">
          <strong>${escapeHtml(cluster.name)}</strong>
          <em>${escapeHtml(cluster.activityLine)}</em>
        </span>
        ${avatars ? `<span class="hp-area-marker__avatars">${avatars}</span>` : ""}
        ${cluster.status !== "quiet" ? '<span class="hp-area-marker__dot"></span>' : ""}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2 - labelOffsetPx, size / 2],
  });
}

function createChildIcon(
  L: LeafletModule,
  place: Place,
  eventCount: number,
  selected: boolean,
  hasStories = false,
  compact = false,
  resolve: (url: string) => string = (url) => url,
) {
  const color = typeColorToken(place);

  if (compact) {
    const size = selected ? 18 : 13;
    return L.divIcon({
      className: "hp-child-marker hp-child-marker--dot",
      html: `<span class="hp-child-marker__dot-pin ${selected ? "is-selected" : ""}" style="--marker-color:${color};"></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  const size = childSize(place, selected);
  const line =
    eventCount > 0
      ? `${eventCount} event${eventCount === 1 ? "" : "s"}`
      : `${place.recentPostCount} posts`;

  return L.divIcon({
    className: "hp-child-marker",
    html: `
      <div
        class="hp-child-marker__shell ${selected ? "is-selected" : ""} ${hasStories ? "has-stories" : ""}"
        style="--marker-size:${size}px;--marker-color:${color};"
      >
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
          ${place.recentPostCount > 0 ? '<span class="hp-child-marker__dot"></span>' : ""}
        </span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createActivityClusterIcon(
  L: LeafletModule,
  node: ActivityClusterRenderNode,
  resolve: (url: string) => string,
) {
  const size = activityClusterSize(node.pointCount, node.selected);
  const color = toneColor(node.tone);
  const images = node.leaves.slice(0, 3);
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
        class="hp-area-marker__shell hp-area-marker__shell--activity ${node.selected ? "is-selected" : ""}"
        style="--marker-size:${size}px;--marker-color:${color};"
      >
        <span class="hp-area-marker__ring"></span>
        <span class="hp-area-marker__collage">${collage}</span>
        <span class="hp-area-marker__shade"></span>
        <span class="hp-area-marker__count">${node.pointCount}</span>
        <span class="hp-area-marker__copy">
          <strong>${escapeHtml(node.dominantCluster.name)}</strong>
          <em>${escapeHtml(line)}</em>
        </span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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
  if (zoom >= SPLIT_ZOOM) return 1;
  const start = OVERVIEW_ZOOM + 0.5;
  const t = clamp01((zoom - start) / (SPLIT_ZOOM - start));
  return 0.16 + 0.84 * t;
}

// Area clusters are helpers only: they dissolve as the real pins take over.
function areaClusterOpacityForZoom(zoom: number) {
  if (zoom <= AREA_FADE_START) return 1;
  return clamp01(1 - (zoom - AREA_FADE_START) / (SPLIT_ZOOM - AREA_FADE_START));
}

// An activity bubble fades out as you approach the zoom where its members
// separate, so the split into real pins reads as one continuous motion.
function activityClusterOpacityForZoom(zoom: number, expansionZoom: number) {
  const distance = expansionZoom - zoom;
  if (distance <= 0) return 0;
  return clamp01(distance / 0.9);
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
): Supercluster.PointFeature<PlacePointProperties> {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [place.lng, place.lat],
    },
    properties: {
      placeId: place.id,
      areaId: cluster.id,
      eventCount,
      postCount: place.recentPostCount,
      hotness: place.hotness,
      tone: cluster.tone,
    },
  };
}

interface Props {
  clusters: MapAreaCluster[];
  events: EventItem[];
  selectedAreaId: string | null;
  selectedPlaceId?: string | null;
  activeFilterLabel?: string | null;
  storyPlaceIds?: ReadonlySet<string>;
  onSelectArea: (cluster: MapAreaCluster) => void;
  onSelectPlace: (place: Place, cluster: MapAreaCluster) => void;
  onResetView: () => void;
  canGoBack?: boolean;
  onBack?: () => void;
  areaFocusBottomPadding?: number;
  selectedBottomPadding?: number;
  /** Ordered lat/lng path to draw as a route polyline (e.g. an open route's stops). */
  routePath?: { lat: number; lng: number; label: string }[] | null;
  /** Fired on map long-press so the shell can open the composer pre-filled. */
  onMapLongPress?: (lat: number, lng: number) => void;
}

export function SocialMap({
  clusters,
  events,
  selectedAreaId,
  selectedPlaceId,
  activeFilterLabel,
  storyPlaceIds,
  onSelectArea,
  onSelectPlace,
  onResetView,
  canGoBack = false,
  onBack,
  areaFocusBottomPadding = 0,
  selectedBottomPadding = 0,
  routePath = null,
  onMapLongPress,
}: Props) {
  const { t } = useI18n();
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const markersRef = useRef<Map<string, LeafletMarker>>(new Map());
  const markerSigRef = useRef<Map<string, string>>(new Map());
  const userMarkerRef = useRef<LeafletMarker | null>(null);
  const routeLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const onMapLongPressRef = useRef(onMapLongPress);
  onMapLongPressRef.current = onMapLongPress;
  const didInitialFitRef = useRef(false);
  const lastMarkerActivationRef = useRef<{ id: string; at: number } | null>(null);
  const previousSelectionRef = useRef<{ areaId: string | null; placeId: string | null }>({
    areaId: null,
    placeId: null,
  });
  const lastZoomRef = useRef(OVERVIEW_ZOOM);
  const [mapReady, setMapReady] = useState(false);
  const [zoom, setZoom] = useState(OVERVIEW_ZOOM);

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
        hotness: props.hotness,
      }),
      reduce: (accumulated, props) => {
        accumulated.eventCount += props.eventCount;
        accumulated.postCount += props.postCount;
        accumulated.hotness = Math.max(accumulated.hotness, props.hotness);
      },
    });

    index.load(
      clusters.flatMap((cluster) =>
        cluster.childPlaces.map((place) =>
          createPlaceFeature(place, cluster, eventCounts.get(place.id) ?? 0),
        ),
      ),
    );
    return index;
  }, [clusters, eventCounts]);

  const renderNodes = useMemo<RenderNode[]>(() => {
    const nodes: RenderNode[] = [];
    const compact = zoom < PLACE_DETAIL_ZOOM;
    const placeOpacity = placeOpacityForZoom(zoom);

    // 1) Every place is ALWAYS on the map at its true coordinate. Selection only
    //    flags the active pin; nothing ever shoves a pin off its real location,
    //    so zoom/pan never makes locations "change place".
    clusters.forEach((cluster) => {
      cluster.places.forEach((place) => {
        const selected = place.id === selectedPlaceId;
        nodes.push({
          id: `child-${cluster.id}-${place.id}`,
          kind: "child",
          cluster,
          place,
          eventCount: eventCounts.get(place.id) ?? 0,
          latLng: [place.lat, place.lng],
          opacity: selected ? 1 : placeOpacity,
          selected,
          compact,
        });
      });
    });

    // 2) Area clusters ride on top as helpers and fade out as pins emerge.
    //    Standalone single-pin areas skip the bubble (they're just a pin).
    if (!isSplitZoom) {
      const areaOpacity = areaClusterOpacityForZoom(zoom);
      if (areaOpacity > 0.001) {
        clusters.forEach((cluster, index) => {
          if (cluster.places.length < 2) return;
          nodes.push({
            id: `cluster-${cluster.id}`,
            kind: "cluster",
            cluster,
            latLng: [cluster.lat, cluster.lng],
            opacity: cluster.id === selectedAreaId ? Math.max(areaOpacity, 0.6) : areaOpacity,
            rank: index,
            selected: cluster.id === selectedAreaId,
          });
        });
      }
    }

    // 3) At detail zoom, activity bubbles group dense spots. Each one is placed
    //    at the centroid of its members and fades into the already-rendered pins
    //    as you zoom toward its expansion zoom -> clean split, no relocation.
    if (isSplitZoom) {
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
          areaScores.set(areaId, (areaScores.get(areaId) ?? 0) + scorePlace(place));
        });
        const dominantAreaId = [...areaScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        const dominantCluster =
          (dominantAreaId ? clusterById.get(dominantAreaId) : null) ??
          placeById.get(leaves[0].id)?.cluster;
        if (!dominantCluster) return;

        const [lng, lat] = feature.geometry.coordinates;
        const centroid = centroidOfPlaces(leaves, [lat, lng]);

        nodes.push({
          id: `activity-${feature.properties.cluster_id}`,
          kind: "activity-cluster",
          clusterId: feature.properties.cluster_id,
          dominantCluster,
          leaves,
          latLng: centroid,
          opacity,
          pointCount: feature.properties.point_count,
          eventCount: feature.properties.eventCount,
          postCount: feature.properties.postCount,
          hotness: feature.properties.hotness,
          selected: Boolean(
            selectedAreaId && leaves.some((place) => clusterIdForPlace(place) === selectedAreaId),
          ),
          tone: dominantCluster.tone,
        });
      });
    }

    return nodes;
  }, [
    clusterById,
    clusters,
    eventCounts,
    isSplitZoom,
    placeById,
    placeClusterIndex,
    selectedAreaId,
    selectedPlaceId,
    zoom,
  ]);

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

  const zoomIntoCluster = useCallback(
    (cluster: MapAreaCluster) => {
      const L = leafletRef.current;
      const map = mapRef.current;
      if (!L || !map) return;

      const places = cluster.childPlaces;
      const bottomPadding = Math.min(430, Math.max(190, areaFocusBottomPadding));

      if (places.length <= 1) {
        const focus: LatLngTuple = places[0]
          ? [places[0].lat, places[0].lng]
          : [cluster.lat, cluster.lng];
        const targetZoom = Math.min(PLACE_FOCUS_ZOOM, Math.max(SPLIT_ZOOM, map.getZoom() + 0.5));
        const projected = map.project(focus, targetZoom);
        const shifted = map.unproject(
          [projected.x, projected.y + bottomPadding * 0.42],
          targetZoom,
        );
        map.flyTo([shifted.lat, shifted.lng], targetZoom, {
          duration: 0.6,
          easeLinearity: 0.25,
        });
        return;
      }

      // Frame EVERY pin above the bottom sheet. The high maxZoom is the key:
      // a tight cluster like Ancient Olympia (pins within ~800m) now flies in to
      // ~z15, where the pins clearly separate and the supercluster bubble
      // (which stops clustering above z13) can no longer swallow them.
      const bounds = L.latLngBounds(
        places.map((place) => [place.lat, place.lng] as LatLngTuple),
      ).pad(0.25);
      map.fitBounds(bounds, {
        animate: true,
        duration: 0.62,
        easeLinearity: 0.25,
        maxZoom: AREA_FOCUS_MAX_ZOOM,
        paddingTopLeft: [56, 120],
        paddingBottomRight: [56, bottomPadding],
      });
    },
    [areaFocusBottomPadding],
  );

  const zoomIntoActivityCluster = useCallback(
    (node: ActivityClusterRenderNode) => {
      const map = mapRef.current;
      if (!map) return;

      const expansionZoom = placeClusterIndex.getClusterExpansionZoom(node.clusterId);
      const targetZoom = Math.min(PLACE_FOCUS_ZOOM, Math.max(map.getZoom() + 0.75, expansionZoom));
      map.flyTo(node.latLng, targetZoom, {
        duration: 0.55,
        easeLinearity: 0.25,
      });
    },
    [placeClusterIndex],
  );

  const flyToOverview = useCallback(() => {
    mapRef.current?.flyTo(ILIA_CENTER, OVERVIEW_ZOOM, { duration: 0.45, easeLinearity: 0.25 });
  }, []);

  useEffect(() => {
    const previous = previousSelectionRef.current;
    const next = { areaId: selectedAreaId, placeId: selectedPlaceId ?? null };
    previousSelectionRef.current = next;

    if (!mapReady) return;

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
    const cleanupFns: Array<() => void> = [];
    const markers = markersRef.current;
    const markerSigs = markerSigRef.current;

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
          setZoom(nextZoom);
        });
      };
      map.on("zoom zoomend", syncZoom);
      map.whenReady(() => {
        if (cancelled || !map) return;
        mapRef.current = map;
        const readyZoom = map.getZoom();
        lastZoomRef.current = readyZoom;
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
      cleanupFns.forEach((cleanup) => cleanup());
      setMapReady(false);
      markers.clear();
      markerSigs.clear();
      map?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      userMarkerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;

    const nodeIds = new Set(renderNodes.map((node) => node.id));
    markersRef.current.forEach((marker, id) => {
      if (nodeIds.has(id)) return;
      marker.remove();
      markersRef.current.delete(id);
      markerSigRef.current.delete(id);
    });

    renderNodes.forEach((node) => {
      const icon =
        node.kind === "cluster"
          ? createAreaIcon(L, node.cluster, node.selected, node.rank, resolveImg)
          : node.kind === "activity-cluster"
            ? createActivityClusterIcon(L, node, resolveImg)
            : createChildIcon(
                L,
                node.place,
                node.eventCount,
                node.selected,
                storyPlaceIds?.has(node.place.id) ?? false,
                node.compact,
                resolveImg,
              );
      let marker = markersRef.current.get(node.id);
      const activateMarker = () => {
        const now = Date.now();
        const previousActivation = lastMarkerActivationRef.current;
        if (previousActivation && now - previousActivation.at < 420) return;
        lastMarkerActivationRef.current = { id: node.id, at: now };

        if (node.kind === "cluster") {
          onSelectArea(node.cluster);
          zoomIntoCluster(node.cluster);
        } else if (node.kind === "activity-cluster") {
          onSelectArea(node.dominantCluster);
          zoomIntoActivityCluster(node);
        } else {
          onSelectPlace(node.place, node.cluster);
        }
      };

      const zIndexOffset =
        node.kind === "child"
          ? node.selected
            ? 1700
            : 1400
          : node.kind === "activity-cluster"
            ? (node.selected ? 1100 : 900) + Math.round(node.hotness * 10)
            : (node.selected ? 1200 : 700) + Math.round(node.cluster.hotness * 10);

      // Signature captures only what changes the icon's *visual content*.
      // Opacity & position are applied cheaply below, so a pure zoom step no
      // longer rebuilds every marker's DOM (this was the zoom stutter).
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
            : resolveImg(node.place.imageUrl);
      const sig = [
        node.kind,
        node.kind === "cluster"
          ? `${node.cluster.id}:${node.cluster.status}:${node.selected ? 1 : 0}:${node.rank}:${imageToken}`
          : node.kind === "activity-cluster"
            ? `${node.clusterId}:${node.pointCount}:${node.selected ? 1 : 0}:${node.tone}:${imageToken}`
            : `${node.place.id}:${node.selected ? 1 : 0}:${hasStory ? 1 : 0}:${node.eventCount}:${node.compact ? 1 : 0}:${imageToken}`,
      ].join("|");
      const needsRebuild = markerSigRef.current.get(node.id) !== sig;

      if (!marker) {
        marker = L.marker(node.latLng, {
          icon,
          riseOnHover: true,
          zIndexOffset,
        }).addTo(map);
        markersRef.current.set(node.id, marker);
      }

      // Cheap every-frame updates (no DOM rebuild):
      marker.off("click");
      marker.on("click", activateMarker);
      marker.setLatLng(node.latLng);
      marker.setOpacity(node.opacity);
      marker.setZIndexOffset(zIndexOffset);

      // Rebuild icon + re-wire DOM only when the content actually changed.
      if (needsRebuild) {
        marker.setIcon(icon);
        markerSigRef.current.set(node.id, sig);

        const markerElement = marker.getElement();
        if (markerElement) {
          const interactiveElement = markerElement as InteractiveMarkerElement;
          if (interactiveElement.__hpClickHandler) {
            interactiveElement.removeEventListener(
              "click",
              interactiveElement.__hpClickHandler,
              true,
            );
          }
          if (interactiveElement.__hpKeyHandler) {
            interactiveElement.removeEventListener(
              "keydown",
              interactiveElement.__hpKeyHandler,
              true,
            );
          }
          const activateFromEvent: EventListener = (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            activateMarker();
          };
          const keyHandler: EventListener = (event) => {
            const keyEvent = event as KeyboardEvent;
            if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
            keyEvent.preventDefault();
            keyEvent.stopImmediatePropagation();
            keyEvent.stopPropagation();
            activateMarker();
          };

          markerElement.setAttribute("role", "button");
          markerElement.setAttribute(
            "aria-label",
            node.kind === "cluster"
              ? `Zoom into ${node.cluster.name}`
              : node.kind === "activity-cluster"
                ? `Zoom into ${node.pointCount} activities near ${node.dominantCluster.name}`
                : `Open ${node.place.name}`,
          );
          markerElement.dataset.hpNodeId = node.id;
          markerElement.tabIndex = 0;
          markerElement.addEventListener("click", activateFromEvent, true);
          markerElement.addEventListener("keydown", keyHandler, true);
          const markerShell = markerElement.firstElementChild;
          markerShell?.addEventListener("click", activateFromEvent, true);
          interactiveElement.__hpClickHandler = activateFromEvent;
          interactiveElement.__hpKeyHandler = keyHandler;
        }
      }
    });
  }, [
    mapReady,
    onSelectArea,
    onSelectPlace,
    renderNodes,
    resolveImg,
    storyPlaceIds,
    zoomIntoActivityCluster,
    zoomIntoCluster,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedPlaceId) return;

    if (!selectedPlaceNode) return;

    const latLng: LatLngTuple = [selectedPlaceNode.place.lat, selectedPlaceNode.place.lng];
    const bottomPadding = Math.min(460, Math.max(220, selectedBottomPadding));
    const focusOffset = Math.min(270, Math.max(128, bottomPadding * 0.44));
    const targetPoint = map.project(latLng, PLACE_FOCUS_ZOOM);
    const offsetCenter = map.unproject(
      [targetPoint.x, targetPoint.y + focusOffset],
      PLACE_FOCUS_ZOOM,
    );
    const targetCenter: LatLngTuple = [offsetCenter.lat, offsetCenter.lng];

    map.stop();

    if (Math.abs(map.getZoom() - PLACE_FOCUS_ZOOM) > 0.1) {
      map.flyTo(targetCenter, PLACE_FOCUS_ZOOM, {
        duration: 0.42,
        easeLinearity: 0.24,
      });
      return;
    }

    map.panTo(targetCenter, {
      animate: true,
      duration: 0.32,
      easeLinearity: 0.24,
    });
  }, [mapReady, selectedBottomPadding, selectedPlaceId, selectedPlaceNode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || isSplitZoom || clusters.length === 0) return;
    if (selectedAreaId || selectedPlaceId) return;
    // Only auto-fit once per mount so live data refreshes never yank the map.
    if (didInitialFitRef.current) return;
    didInitialFitRef.current = true;

    const bounds = clusters.map((cluster) => [cluster.lat, cluster.lng] as LatLngTuple);
    map.fitBounds(bounds, {
      animate: true,
      duration: 0.35,
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
    map.fitBounds(line.getBounds().pad(0.22), {
      animate: true,
      duration: 0.4,
      maxZoom: PLACE_FOCUS_ZOOM,
      paddingBottomRight: [48, selectedBottomPadding || 188],
      paddingTopLeft: [48, 116],
    });

    return () => {
      group.remove();
      if (routeLayerRef.current === group) routeLayerRef.current = null;
    };
  }, [mapReady, routePath, selectedBottomPadding]);

  const resetToOverview = () => {
    flyToOverview();
    onResetView();
  };

  const selectDiscoveryCluster = (cluster: MapAreaCluster) => {
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

  return (
    <div className="hp-real-map relative z-0 h-full w-full overflow-hidden bg-hp-paper">
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
          className="absolute left-3 top-14 z-20 grid h-10 w-10 place-items-center rounded-full border border-hp-ink/10 bg-hp-paper/95 text-hp-ink shadow backdrop-blur transition active:scale-95"
          aria-label={t("Back to previous map view")}
        >
          <ChevronLeft size={18} strokeWidth={2.6} />
        </button>
      )}

      <div className="pointer-events-none absolute left-1/2 top-3 z-20 max-w-[72%] -translate-x-1/2 rounded-full border border-hp-ink/10 bg-hp-paper/95 px-3 py-1.5 text-center text-[11px] font-semibold text-hp-ink/80 shadow-sm backdrop-blur">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-hp-sunset" />
        {summaryText}
      </div>

      {clusters.length > 0 && (
        <div
          className={`hp-no-scrollbar absolute ${canGoBack ? "left-16" : "left-3"} right-16 top-14 z-20 flex gap-2 overflow-x-auto pb-2`}
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
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-left text-[11px] font-bold shadow-sm backdrop-blur transition active:scale-95 ${
                    selected
                      ? "border-hp-ink bg-hp-ink text-hp-paper"
                      : "border-hp-ink/10 bg-hp-paper/95 text-hp-ink"
                  }`}
                >
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-hp-sunset" />
                  {cluster.name}
                  <span className={selected ? "ml-1 text-hp-paper/70" : "ml-1 text-hp-muted"}>
                    {cluster.places.length}
                  </span>
                </button>
              );
            })}
        </div>
      )}

      <div className="absolute right-3 top-14 z-20 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          disabled={!mapReady || zoom >= MAX_ZOOM}
          className="grid h-10 w-10 place-items-center rounded-full border border-hp-ink/10 bg-hp-paper/95 text-hp-ink shadow backdrop-blur disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={t("Zoom in map")}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={zoomOut}
          disabled={!mapReady || zoom <= MIN_ZOOM}
          className="grid h-10 w-10 place-items-center rounded-full border border-hp-ink/10 bg-hp-paper/95 text-hp-ink shadow backdrop-blur disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={t("Zoom out map")}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          onClick={locateUser}
          disabled={!mapReady}
          className="grid h-10 w-10 place-items-center rounded-full border border-hp-ink/10 bg-hp-paper/95 text-hp-ink shadow backdrop-blur disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={t("Find my location")}
        >
          <Crosshair size={16} />
        </button>
        <button
          type="button"
          onClick={resetToOverview}
          disabled={!mapReady}
          className="grid h-10 w-10 place-items-center rounded-full border border-hp-ink/10 bg-hp-paper/95 text-hp-ink shadow backdrop-blur disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={t("Show Ilia overview")}
        >
          <MapPinned size={16} />
        </button>
      </div>
    </div>
  );
}

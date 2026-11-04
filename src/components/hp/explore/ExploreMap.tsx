import { useEffect, useImperativeHandle, useRef, useState, type Ref, type RefObject } from "react";
import type {
  ErrorEvent as MapLibreErrorEvent,
  GeoJSONSource,
  Map as MapLibreMap,
  MapLibreEvent,
  Marker as MapLibreMarker,
  StyleSpecification,
} from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import Supercluster from "supercluster";
import { RefreshCw } from "lucide-react";
import {
  applyMapAppearance,
  createMapAppearanceStyle,
  type MapAppearance,
} from "@/lib/hp/map-cartography";
import { isFatalBasemapError } from "@/lib/hp/map-core";
import {
  loadMapStyleForAcceptance,
  localMapFault,
  startMapInitialization,
  type MapAttemptState,
} from "@/lib/hp/map-initialization";
import { MAP_POLICY } from "@/lib/hp/map-policy";
import type { MapCameraSnapshot } from "@/lib/hp/map-discovery-state";
import { createMapLocationRequest, type MapLocationStatus } from "@/lib/hp/map-location";
import { HP_MAP_EASE } from "@/lib/hp/motion";
import type { ExploreMedia, GeoPhotoGroup } from "@/lib/hp/explore-media";
import { useI18n } from "@/lib/i18n";
import {
  createAreaMarker,
  createBloomMarker,
  createClusterMarker,
  createPlaceMarker,
  createRouteStopMarker,
  createUserMarker,
  type AreaMarkerData,
  type ClusterMarkerData,
  type PlaceMarkerData,
} from "./explore-markers";

const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
/** Below this zoom the map speaks in areas; at or above it, in places. */
export const EXPLORE_DETAIL_ZOOM = 10.15;
const CLOSE_ZOOM = 13.4;
const PLACE_ZOOM = 14.6;
const MOVE_MS = 720;

export type MapPadding = { top: number; bottom: number; left: number; right: number };
export type Bounds = [[number, number], [number, number]];

export type CameraIntent =
  | { key: string; kind: "overview"; bounds: Bounds | null }
  | { key: string; kind: "fit"; bounds: Bounds; maxZoom?: number }
  | { key: string; kind: "focus"; lat: number; lng: number; zoom?: number };

export type ExploreArea = AreaMarkerData & { lat: number; lng: number };
export type ExplorePlace = PlaceMarkerData & { lat: number; lng: number };

export type ExploreMapHandle = {
  zoomBy: (delta: number) => void;
  locate: () => void;
  /** Gently pans so a point clears the chrome and carousel, without zooming. */
  reveal: (lat: number, lng: number) => void;
};

type RoutePreview = {
  stops: { lat: number; lng: number; label: string }[];
  geometry: [number, number][] | null;
} | null;

type Props = {
  appearance: MapAppearance;
  themeReady: boolean;
  areas: ExploreArea[];
  places: ExplorePlace[];
  /** Search and area views show place pins at any zoom. */
  forcePlaces: boolean;
  selectedPlaceId: string | null;
  /** Photo stacks pinned at their own coordinates around the selected place. */
  bloom: GeoPhotoGroup[];
  camera: CameraIntent | null;
  padding: MapPadding;
  initialCamera: MapCameraSnapshot | null;
  cameraCaptureRef?: RefObject<(() => MapCameraSnapshot | null) | null>;
  routePreview: RoutePreview;
  routeFrameRevision: number;
  handleRef?: Ref<ExploreMapHandle>;
  onAreaActivate: (id: string) => void;
  onPlaceActivate: (id: string) => void;
  onBloomActivate: (mediaId: string) => void;
  onBackground: () => void;
  onInteractionChange: (interacting: boolean) => void;
  onLongPress?: (lat: number, lng: number) => void;
  onAvailabilityChange?: (available: boolean) => void;
  onLocationStatus?: (status: MapLocationStatus) => void;
};

type PlaceFeature = Supercluster.PointFeature<{ id: string }>;
type MarkerHandle<D> = { marker: MapLibreMarker; update: (data: D) => void };

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

async function loadProviderBasemap(signal: AbortSignal): Promise<StyleSpecification> {
  const response = await fetch(OPENFREEMAP_STYLE_URL, { signal });
  if (!response.ok) throw new Error(`Basemap style request failed (${response.status}).`);
  return (await response.json()) as StyleSpecification;
}

export function ExploreMap(props: Props) {
  const { t } = useI18n();
  const propsRef = useRef(props);
  propsRef.current = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const providerRef = useRef<StyleSpecification | null>(null);
  const areaMarkers = useRef(new Map<string, MarkerHandle<AreaMarkerData>>());
  const placeMarkers = useRef(new Map<string, MarkerHandle<PlaceMarkerData>>());
  const clusterMarkers = useRef(new Map<string, MarkerHandle<ClusterMarkerData>>());
  const bloomMarkers = useRef<MapLibreMarker[]>([]);
  const routeMarkers = useRef<MapLibreMarker[]>([]);
  const userMarker = useRef<MapLibreMarker | null>(null);
  const indexRef = useRef<Supercluster<{ id: string }> | null>(null);
  const appliedCameraKey = useRef<string | null>(null);
  const framedRouteRevision = useRef<number | null>(initialCameraRefValue(props.initialCamera));
  const initialCameraRef = useRef(props.initialCamera);
  const syncFrame = useRef<number | null>(null);
  const ignoreClicksUntil = useRef(0);
  const [attemptNumber, setAttemptNumber] = useState(0);
  const [attemptState, setAttemptState] = useState<MapAttemptState>({
    attempt: 0,
    status: "loading",
  });
  const mapReady = attemptState.status === "ready";

  // ---- marker reconciliation -------------------------------------------------
  const syncMarkersRef = useRef<() => void>(() => {});
  syncMarkersRef.current = () => {
    const map = mapRef.current;
    const lib = libRef.current;
    const root = rootRef.current;
    if (!map || !lib || !root) return;
    const { areas, places, forcePlaces, selectedPlaceId } = propsRef.current;
    const zoom = map.getZoom();
    const detail = forcePlaces || zoom >= EXPLORE_DETAIL_ZOOM;
    root.dataset.scale = detail ? "detail" : "overview";
    root.dataset.zoomband = zoom >= CLOSE_ZOOM ? "close" : "far";

    // Areas: few and always mounted; CSS hides them at detail scale. Like map
    // labels, a lower-ranked area that would overlap a higher-ranked one at this
    // zoom collapses to a photo dot until there is room for it.
    const liveAreas = new Set<string>();
    const ranked = [...areas].sort(
      (a, b) =>
        Number(b.state === "focused") - Number(a.state === "focused") ||
        Number(b.state !== "dimmed") - Number(a.state !== "dimmed") ||
        Number(b.hot) - Number(a.hot) ||
        Number(b.hasStories) - Number(a.hasStories) ||
        b.count - a.count,
    );
    const claimed: { x: number; y: number }[] = [];
    for (const area of ranked) {
      liveAreas.add(area.id);
      const point = map.project([area.lng, area.lat]);
      const collapsed = claimed.some(
        (other) => Math.abs(other.x - point.x) < 74 && Math.abs(other.y - point.y) < 84,
      );
      if (!collapsed) claimed.push(point);
      let handle = areaMarkers.current.get(area.id);
      if (!handle) {
        const id = area.id;
        const created = createAreaMarker(() => propsRef.current.onAreaActivate(id));
        const marker = new lib.Marker({ element: created.element, anchor: "center" })
          .setLngLat([area.lng, area.lat])
          .addTo(map);
        handle = { marker, update: created.update };
        areaMarkers.current.set(area.id, handle);
      } else {
        handle.marker.setLngLat([area.lng, area.lat]);
      }
      handle.update({ ...area, collapsed });
    }
    for (const [id, handle] of areaMarkers.current) {
      if (liveAreas.has(id)) continue;
      handle.marker.remove();
      areaMarkers.current.delete(id);
    }

    if (!detail) return;
    const index = indexRef.current;
    const byId = new Map(places.map((place) => [place.id, place]));
    const wantedPlaces = new Set<string>();
    const wantedClusters = new Map<
      string,
      { lng: number; lat: number; clusterId: number; count: number }
    >();
    if (index) {
      const bounds = map.getBounds();
      const padLng = (bounds.getEast() - bounds.getWest()) * 0.25;
      const padLat = (bounds.getNorth() - bounds.getSouth()) * 0.25;
      const features = index.getClusters(
        [
          bounds.getWest() - padLng,
          bounds.getSouth() - padLat,
          bounds.getEast() + padLng,
          bounds.getNorth() + padLat,
        ],
        Math.floor(zoom),
      );
      for (const feature of features) {
        const [lng, lat] = feature.geometry.coordinates;
        const properties = feature.properties as {
          id?: string;
          cluster?: boolean;
          cluster_id?: number;
          point_count?: number;
        };
        if (properties.cluster && properties.cluster_id !== undefined) {
          wantedClusters.set(`c:${properties.cluster_id}`, {
            lng,
            lat,
            clusterId: properties.cluster_id,
            count: properties.point_count ?? 0,
          });
        } else if (properties.id) {
          wantedPlaces.add(properties.id);
        }
      }
    }
    if (selectedPlaceId && byId.has(selectedPlaceId)) wantedPlaces.add(selectedPlaceId);

    // Names appear where they fit: selected and focused first, then live places.
    // A label is refused if it would cover another label or another pin's photo.
    const labelled = new Set<string>();
    const pinBoxes = [...wantedPlaces].flatMap((id) => {
      const place = byId.get(id);
      if (!place) return [];
      const point = map.project([place.lng, place.lat]);
      return [{ id, x: point.x, y: point.y }];
    });
    const labelRank = (id: string) => {
      const place = byId.get(id);
      if (!place) return 0;
      if (place.state === "selected") return 4;
      if (place.state === "focused") return 3;
      if (place.state === "dimmed") return -1;
      return place.live ? 2 : 1;
    };
    const takenLabels: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const pin of [...pinBoxes].sort((a, b) => labelRank(b.id) - labelRank(a.id))) {
      const rank = labelRank(pin.id);
      if (rank < 0 || (rank < 3 && zoom < CLOSE_ZOOM)) continue;
      const half = Math.min(84, 14 + (byId.get(pin.id)?.name.length ?? 10) * 3.4);
      const box = { x0: pin.x - half, x1: pin.x + half, y0: pin.y + 26, y1: pin.y + 50 };
      const hitsLabel = takenLabels.some(
        (other) => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0,
      );
      const hitsPin = pinBoxes.some(
        (other) =>
          other.id !== pin.id &&
          other.x + 24 > box.x0 &&
          other.x - 24 < box.x1 &&
          other.y + 24 > box.y0 &&
          other.y - 24 < box.y1,
      );
      if (rank < 3 && (hitsLabel || hitsPin)) continue;
      takenLabels.push(box);
      labelled.add(pin.id);
    }

    for (const id of wantedPlaces) {
      const place = byId.get(id);
      if (!place) continue;
      let handle = placeMarkers.current.get(id);
      if (!handle) {
        const created = createPlaceMarker(
          () => propsRef.current.onPlaceActivate(id),
          (mediaId) => propsRef.current.onBloomActivate(mediaId),
        );
        const marker = new lib.Marker({ element: created.element, anchor: "center" })
          .setLngLat([place.lng, place.lat])
          .addTo(map);
        handle = { marker, update: created.update };
        placeMarkers.current.set(id, handle);
      } else {
        handle.marker.setLngLat([place.lng, place.lat]);
      }
      handle.update({ ...place, showLabel: labelled.has(id) });
    }
    for (const [id, handle] of placeMarkers.current) {
      if (wantedPlaces.has(id)) continue;
      handle.marker.remove();
      placeMarkers.current.delete(id);
    }

    for (const [key, cluster] of wantedClusters) {
      let handle = clusterMarkers.current.get(key);
      if (!handle) {
        const clusterId = cluster.clusterId;
        const created = createClusterMarker(() => {
          const currentMap = mapRef.current;
          const currentIndex = indexRef.current;
          if (!currentMap || !currentIndex) return;
          const target = Math.min(currentIndex.getClusterExpansionZoom(clusterId) + 0.35, 16);
          currentMap.easeTo({
            center: [cluster.lng, cluster.lat],
            zoom: target,
            padding: propsRef.current.padding,
            duration: reducedMotion() ? 0 : 560,
            easing: HP_MAP_EASE,
          });
        });
        const marker = new lib.Marker({ element: created.element, anchor: "center" })
          .setLngLat([cluster.lng, cluster.lat])
          .addTo(map);
        handle = { marker, update: created.update };
        clusterMarkers.current.set(key, handle);
      }
      const leaves = index?.getLeaves(cluster.clusterId, 3) ?? [];
      const leafPlaces = leaves
        .map((leaf) => byId.get((leaf.properties as { id: string }).id))
        .filter((place): place is ExplorePlace => Boolean(place));
      handle.update({
        count: cluster.count,
        covers: leafPlaces.map((place) => place.cover ?? "").filter(Boolean),
        hasStories: leafPlaces.some((place) => place.hasStories),
        ariaLabel: t("{count} places — zoom in", { count: cluster.count }),
      });
    }
    for (const [key, handle] of clusterMarkers.current) {
      if (wantedClusters.has(key)) continue;
      handle.marker.remove();
      clusterMarkers.current.delete(key);
    }
  };

  const scheduleSync = () => {
    if (syncFrame.current !== null) return;
    syncFrame.current = window.requestAnimationFrame(() => {
      syncFrame.current = null;
      syncMarkersRef.current();
    });
  };

  // ---- camera ----------------------------------------------------------------
  const applyCameraRef = useRef<(intent: CameraIntent, instant?: boolean) => void>(() => {});
  applyCameraRef.current = (intent, instant = false) => {
    const map = mapRef.current;
    if (!map) return;
    const { padding } = propsRef.current;
    const duration = instant || reducedMotion() ? 0 : MOVE_MS;
    map.stop();
    if (intent.kind === "focus") {
      const zoom = Math.max(map.getZoom(), intent.zoom ?? PLACE_ZOOM);
      const far = map.getZoom() < EXPLORE_DETAIL_ZOOM;
      const options = {
        center: [intent.lng, intent.lat] as [number, number],
        zoom,
        padding,
        duration: far ? duration * 1.35 : duration,
        easing: HP_MAP_EASE,
        essential: true,
      };
      if (far) map.flyTo({ ...options, curve: 1.3 });
      else map.easeTo(options);
      return;
    }
    const bounds = intent.kind === "overview" ? intent.bounds : intent.bounds;
    if (!bounds) {
      map.easeTo({
        center: MAP_POLICY.center,
        zoom: MAP_POLICY.overviewZoom,
        padding,
        duration,
        easing: HP_MAP_EASE,
      });
      return;
    }
    // fitBounds applies the padding exactly once; cameraForBounds + easeTo({padding})
    // would offset the view by the padding twice.
    map.fitBounds(bounds, {
      padding,
      maxZoom: intent.kind === "overview" ? 9.7 : (intent.maxZoom ?? 14.2),
      duration,
      easing: HP_MAP_EASE,
    });
  };

  useImperativeHandle(
    props.handleRef,
    () => ({
      zoomBy(delta) {
        const map = mapRef.current;
        if (!map) return;
        map.easeTo({ zoom: map.getZoom() + delta, duration: reducedMotion() ? 0 : 260 });
      },
      locate() {
        locationRequest.current?.start(navigator.geolocation);
      },
      reveal(lat, lng) {
        const map = mapRef.current;
        const root = rootRef.current;
        if (!map || !root) return;
        const { padding } = propsRef.current;
        const point = map.project([lng, lat]);
        const width = root.clientWidth;
        const height = root.clientHeight;
        const margin = 36;
        const inside =
          point.x > padding.left + margin &&
          point.x < width - padding.right - margin &&
          point.y > padding.top + margin &&
          point.y < height - padding.bottom - margin;
        if (inside) return;
        map.easeTo({
          center: [lng, lat],
          padding,
          duration: reducedMotion() ? 0 : 520,
          easing: HP_MAP_EASE,
        });
      },
    }),
    [],
  );

  // ---- location ----------------------------------------------------------------
  const locationRequest = useRef<ReturnType<typeof createMapLocationRequest> | null>(null);
  if (!locationRequest.current) {
    locationRequest.current = createMapLocationRequest(
      (status) => propsRef.current.onLocationStatus?.(status),
      ({ coords }) => {
        const map = mapRef.current;
        const lib = libRef.current;
        if (!map || !lib) return;
        const lngLat: [number, number] = [coords.longitude, coords.latitude];
        if (userMarker.current) userMarker.current.setLngLat(lngLat);
        else {
          userMarker.current = new lib.Marker({ element: createUserMarker(), anchor: "center" })
            .setLngLat(lngLat)
            .addTo(map);
        }
        map.stop().easeTo({
          center: lngLat,
          zoom: Math.max(map.getZoom(), 13.5),
          padding: propsRef.current.padding,
          duration: reducedMotion() ? 0 : 640,
          easing: HP_MAP_EASE,
        });
      },
    );
  }

  // ---- map lifecycle -------------------------------------------------------------
  useEffect(() => {
    if (!props.themeReady) return;
    const container = canvasRef.current;
    let map: MapLibreMap | null = null;
    let loaded = false;
    const areaStore = areaMarkers.current;
    const placeStore = placeMarkers.current;
    const clusterStore = clusterMarkers.current;
    const attempt = startMapInitialization({
      attempt: attemptNumber,
      onStateChange: setAttemptState,
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
            attemptNumber,
          ),
          signal,
          () => loadProviderBasemap(signal),
        ),
      createMap: (maplibre, provider) => {
        if (!container) throw new Error("Map container unavailable");
        maplibre.setWorkerUrl(mapWorkerUrl);
        libRef.current = maplibre;
        providerRef.current = structuredClone(provider);
        const restored = initialCameraRef.current;
        return new maplibre.Map({
          container,
          style: createMapAppearanceStyle(providerRef.current, propsRef.current.appearance),
          attributionControl: {
            compact: true,
            customAttribution:
              '<a href="https://openrouteservice.org/" target="_blank" rel="noopener noreferrer">openrouteservice / HeiGIT</a>',
          },
          maplibreLogo: false,
          renderWorldCopies: false,
          maxBounds: MAP_POLICY.panBounds,
          minZoom: MAP_POLICY.minZoom,
          maxZoom: MAP_POLICY.maxZoom,
          center: restored?.center ?? MAP_POLICY.center,
          zoom: restored?.zoom ?? MAP_POLICY.overviewZoom,
          bearing: 0,
          pitch: 0,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          fadeDuration: 180,
        });
      },
      removeMap: (instance) => instance.remove(),
      prepareMap: (instance, _maplibre, lifecycle) => {
        map = instance;
        mapRef.current = instance;
        instance.touchZoomRotate.disableRotation();
        const onError = (event: MapLibreErrorEvent) => {
          if (!lifecycle.isActive()) return;
          const sourceId = "sourceId" in event ? event.sourceId : undefined;
          if (isFatalBasemapError(loaded, sourceId)) lifecycle.fail();
        };
        instance.on("error", onError);

        const onClick = (event: { originalEvent: MouseEvent }) => {
          if (Date.now() < ignoreClicksUntil.current) return;
          const target = event.originalEvent?.target as Element | null;
          if (target?.closest(".xp-marker, .maplibregl-control-container, button, a")) return;
          propsRef.current.onBackground();
        };
        instance.on("click", onClick);

        const onMoveStart = (event: MapLibreEvent & { originalEvent?: Event }) => {
          if (event.originalEvent) propsRef.current.onInteractionChange(true);
        };
        const onMoveEnd = () => {
          propsRef.current.onInteractionChange(false);
          scheduleSync();
        };
        const onZoom = () => scheduleSync();
        instance.on("movestart", onMoveStart);
        instance.on("moveend", onMoveEnd);
        instance.on("zoom", onZoom);

        const resizeObserver = new ResizeObserver(() => {
          if (lifecycle.isActive()) instance.resize();
        });
        if (container) resizeObserver.observe(container);

        // Long-press drops a pin into the composer.
        let pressTimer: number | null = null;
        let pressPoint: { x: number; y: number } | null = null;
        const clearPress = () => {
          if (pressTimer !== null) window.clearTimeout(pressTimer);
          pressTimer = null;
          pressPoint = null;
        };
        const onDown = (event: PointerEvent) => {
          if (event.button !== 0 || !container) return;
          if ((event.target as Element | null)?.closest(".xp-marker, button, a")) return;
          pressPoint = { x: event.clientX, y: event.clientY };
          pressTimer = window.setTimeout(() => {
            if (!pressPoint || !lifecycle.isActive()) return;
            const rect = container.getBoundingClientRect();
            const lngLat = instance.unproject([pressPoint.x - rect.left, pressPoint.y - rect.top]);
            ignoreClicksUntil.current = Date.now() + 700;
            propsRef.current.onLongPress?.(lngLat.lat, lngLat.lng);
            clearPress();
          }, 520);
        };
        const onPointerMove = (event: PointerEvent) => {
          if (!pressPoint) return;
          if (
            Math.abs(event.clientX - pressPoint.x) > 10 ||
            Math.abs(event.clientY - pressPoint.y) > 10
          )
            clearPress();
        };
        container?.addEventListener("pointerdown", onDown);
        container?.addEventListener("pointermove", onPointerMove);
        container?.addEventListener("pointerup", clearPress);
        container?.addEventListener("pointercancel", clearPress);

        const onReady = () => {
          if (!lifecycle.isActive()) return;
          loaded = true;
          // The basemap is the stage, not the show: its own labels and icons step
          // back so the photographs lead. Opacity only — no layout or colour change.
          for (const layer of instance.getStyle().layers) {
            if (layer.type !== "symbol" || layer.id.startsWith("hp-")) continue;
            instance.setPaintProperty(layer.id, "text-opacity", 0.62);
            instance.setPaintProperty(layer.id, "icon-opacity", 0.45);
          }
          // Start the credits as a small (i); one tap expands them.
          container
            ?.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show")
            ?.classList.remove("maplibregl-compact-show");
          lifecycle.ready();
          window.requestAnimationFrame(() => {
            if (lifecycle.isActive()) instance.resize();
          });
        };
        instance.once("load", onReady);

        lifecycle.addCleanup(() => {
          clearPress();
          container?.removeEventListener("pointerdown", onDown);
          container?.removeEventListener("pointermove", onPointerMove);
          container?.removeEventListener("pointerup", clearPress);
          container?.removeEventListener("pointercancel", clearPress);
          resizeObserver.disconnect();
          instance.off("error", onError);
          instance.off("click", onClick);
          instance.off("movestart", onMoveStart);
          instance.off("moveend", onMoveEnd);
          instance.off("zoom", onZoom);
          instance.off("load", onReady);
          if (loaded) {
            const center = instance.getCenter();
            initialCameraRef.current = {
              center: [center.lng, center.lat],
              zoom: instance.getZoom(),
              bearing: 0,
              pitch: 0,
              framedRouteRevision: framedRouteRevision.current,
            };
          }
        });
      },
    });
    attempt.addCleanup(() => {
      if (syncFrame.current !== null) window.cancelAnimationFrame(syncFrame.current);
      syncFrame.current = null;
      locationRequest.current?.cancel();
      areaStore.forEach((handle) => handle.marker.remove());
      areaStore.clear();
      placeStore.forEach((handle) => handle.marker.remove());
      placeStore.clear();
      clusterStore.forEach((handle) => handle.marker.remove());
      clusterStore.clear();
      bloomMarkers.current.forEach((marker) => marker.remove());
      bloomMarkers.current = [];
      routeMarkers.current.forEach((marker) => marker.remove());
      routeMarkers.current = [];
      userMarker.current?.remove();
      userMarker.current = null;
      appliedCameraKey.current = null;
      mapRef.current = null;
      libRef.current = null;
      providerRef.current = null;
      map = null;
      container?.replaceChildren();
    });
    return () => attempt.dispose();
    // Theme readiness and retries rebuild the map; everything else updates in place.
  }, [props.themeReady, attemptNumber]);

  useEffect(() => {
    props.onAvailabilityChange?.(mapReady);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  // Camera snapshot for leaving and re-entering the Map tab.
  useEffect(() => {
    const ref = props.cameraCaptureRef;
    if (!ref) return;
    ref.current = () => {
      const map = mapRef.current;
      if (!map) return initialCameraRef.current;
      const center = map.getCenter();
      return {
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        bearing: 0,
        pitch: 0,
        framedRouteRevision: framedRouteRevision.current,
      };
    };
    return () => {
      if (ref.current) ref.current = null;
    };
  }, [props.cameraCaptureRef]);

  // Appearance follows Light/Dark and the time of day without rebuilding the map.
  const { colorScheme, atmosphere } = props.appearance;
  useEffect(() => {
    const map = mapRef.current;
    const provider = providerRef.current;
    if (!mapReady || !map || !provider) return;
    applyMapAppearance(map, provider, { colorScheme, atmosphere }, reducedMotion() ? 0 : 700);
  }, [mapReady, colorScheme, atmosphere]);

  // Clustering index: every place except the selected one (always drawn on its own).
  const placesKey = props.places.map((place) => `${place.id}@${place.lat},${place.lng}`).join("|");
  useEffect(() => {
    // Inside a chosen area (or a search) every place is shown on its own once
    // zoomed in; across the region, nearby places merge until there is room.
    const index = new Supercluster<{ id: string }>({
      radius: 54,
      maxZoom: props.forcePlaces ? 12 : 15,
      minPoints: 2,
    });
    const features: PlaceFeature[] = props.places
      .filter((place) => place.id !== props.selectedPlaceId)
      .map((place) => ({
        type: "Feature",
        properties: { id: place.id },
        geometry: { type: "Point", coordinates: [place.lng, place.lat] },
      }));
    index.load(features);
    indexRef.current = index;
    if (mapReady) scheduleSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesKey, props.selectedPlaceId, props.forcePlaces, mapReady]);

  // Marker contents and states follow every data change.
  useEffect(() => {
    if (mapReady) scheduleSync();
  }, [mapReady, props.areas, props.places, props.forcePlaces, props.selectedPlaceId]);

  // Camera intents: each new key is one deliberate move.
  const cameraKey = props.camera?.key ?? null;
  useEffect(() => {
    if (!mapReady || !props.camera) return;
    if (appliedCameraKey.current === props.camera.key) return;
    const first = appliedCameraKey.current === null;
    appliedCameraKey.current = props.camera.key;
    // A restored camera wins over the default overview on re-entry.
    if (first && props.camera.kind === "overview" && initialCameraRef.current) return;
    applyCameraRef.current(props.camera, first && props.camera.kind === "overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, cameraKey]);

  // Geotagged photos bloom out around the selected place, at their real spots.
  const bloomKey = props.bloom.map((group) => `${group.id}:${group.items.length}`).join("|");
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    bloomMarkers.current.forEach((marker) => marker.remove());
    bloomMarkers.current = [];
    if (!mapReady || !map || !lib) return;
    bloomMarkers.current = props.bloom.map((group, index) => {
      const lead: ExploreMedia = group.items[0];
      return new lib.Marker({
        element: createBloomMarker(lead, group.items.length, index, () =>
          propsRef.current.onBloomActivate(lead.id),
        ),
        anchor: "center",
      })
        .setLngLat([group.lng, group.lat])
        .addTo(map);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, bloomKey]);

  // Route preview line and numbered stops.
  const { routePreview, routeFrameRevision } = props;
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    routeMarkers.current.forEach((marker) => marker.remove());
    routeMarkers.current = [];
    if (!mapReady || !map || !lib) return;
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
      const paint = { "line-color": "#ff5b35", "line-width": 4.5, "line-opacity": 0.95 };
      map.addLayer(
        {
          id: solidId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
          paint,
        },
        beforeId,
      );
      map.addLayer(
        {
          id: fallbackId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
          paint: { ...paint, "line-dasharray": [0.5, 2.6] },
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
    (map.getSource(sourceId) as GeoJSONSource).setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    });
    map.setLayoutProperty(solidId, "visibility", routePreview.geometry ? "visible" : "none");
    map.setLayoutProperty(fallbackId, "visibility", routePreview.geometry ? "none" : "visible");
    routeMarkers.current = routePreview.stops.map((stop, index) =>
      new lib.Marker({ element: createRouteStopMarker(index, stop.label), anchor: "center" })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map),
    );
    if (framedRouteRevision.current !== routeFrameRevision) {
      framedRouteRevision.current = routeFrameRevision;
      const lngs = coordinates.map(([lng]) => lng);
      const lats = coordinates.map(([, lat]) => lat);
      applyCameraRef.current({
        key: `route:${routeFrameRevision}`,
        kind: "fit",
        bounds: [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        maxZoom: PLACE_ZOOM,
      });
    }
  }, [mapReady, routePreview, routeFrameRevision]);

  return (
    <div
      ref={rootRef}
      className="xp-map"
      data-scale="overview"
      data-ready={mapReady ? "true" : "false"}
    >
      <div ref={canvasRef} className="xp-map__canvas" aria-label={t("Map of Ilia")} role="region" />
      {attemptState.status === "loading" && <div className="xp-map__veil" aria-hidden="true" />}
      {attemptState.status === "error" && (
        <div className="xp-map__error" role="alert">
          <div className="xp-map__error-card">
            <strong>{t("Map unavailable")}</strong>
            <span>
              {t(
                attemptState.failure === "timeout"
                  ? "The map took too long to load."
                  : "The map could not load right now.",
              )}
            </span>
            <button type="button" onClick={() => setAttemptNumber((value) => value + 1)}>
              <RefreshCw size={15} aria-hidden="true" />
              {t("Try again")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function initialCameraRefValue(camera: MapCameraSnapshot | null) {
  return camera?.framedRouteRevision ?? null;
}

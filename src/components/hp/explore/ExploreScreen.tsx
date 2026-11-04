import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { AnimatePresence } from "framer-motion";
import { LocateFixed, Minus, Plus } from "lucide-react";
import type { Place, Post } from "@/lib/hp-model";
import type { PulseAccountState } from "@/lib/hp-auth";
import { useTheme } from "@/lib/theme-provider";
import { useI18n } from "@/lib/i18n";
import type { DiscoveryLens, DiscoverySnapshot } from "@/lib/hp/discovery";
import type { MapAreaCluster } from "@/lib/hp/map-clusters";
import type { MapCameraSnapshot, MapSelection } from "@/lib/hp/map-discovery-state";
import { LOCATION_MESSAGE } from "@/lib/hp/map-location";
import type { MarkerPulseSnapshot } from "@/lib/hp/marker-pulse";
import type { PlaceStoryGroup } from "@/lib/hp/place-stories";
import type { AtmospherePaletteKey } from "@/lib/hp/temporal-atmosphere";
import { useCommonsPhotos } from "@/lib/hp/commons-photos";
import { formatCountdown, iliaSky, iliaTime } from "@/lib/hp/sky";
import {
  areaCover,
  areaMatchesLens,
  placeGallery,
  placeMatchesLens,
  placesBounds,
  rankAreas,
  rankPlaces,
  placeBloom,
  type ExploreMedia,
  areaDisplayName,
} from "@/lib/hp/explore-media";
import type { MarkerMotion } from "../pulse-shared";
import { ExploreChrome } from "./ExploreChrome";
import { ExploreCarousel, type CarouselItem } from "./ExploreCarousel";
import {
  ExploreMap,
  type CameraIntent,
  type ExploreArea,
  type ExploreMapHandle,
  type ExplorePlace,
  type MapPadding,
} from "./ExploreMap";
import { ExplorePhotoViewer } from "./ExplorePhotoViewer";

type RoutePreview = {
  stops: { lat: number; lng: number; label: string }[];
  geometry: [number, number][] | null;
} | null;

type Props = {
  places: Place[];
  mapPlaces: Place[];
  clusters: MapAreaCluster[];
  posts: Post[];
  storyGroups: PlaceStoryGroup[];
  storyPlaceIds: ReadonlySet<string>;
  selection: MapSelection;
  activeLens: DiscoveryLens | null;
  onLensChange: (lens: DiscoveryLens | null) => void;
  discoverySnapshot: DiscoverySnapshot;
  markerPulseSnapshot: MarkerPulseSnapshot;
  query: string;
  setQuery: (query: string) => void;
  savedIds: readonly string[];
  onToggleSave: (placeId: string) => void;
  onShare: (place: Place) => void;
  onSelectArea: (cluster: MapAreaCluster) => void;
  onSelectPlace: (place: Place) => void;
  onClear: () => void;
  onBack: () => void;
  onOpenPlace: (place: Place) => void;
  onOpenStory: (placeId: string) => void;
  onMapLongPress?: (lat: number, lng: number) => void;
  onAvailabilityChange?: (available: boolean) => void;
  initialCamera: MapCameraSnapshot | null;
  cameraCaptureRef?: RefObject<(() => MapCameraSnapshot | null) | null>;
  routePreview: RoutePreview;
  routeFrameRevision: number;
  atmospherePalette: AtmospherePaletteKey;
  account: PulseAccountState;
  onOpenAccount: () => void;
  onOpenAuth: () => void;
  onOpenDeals: () => void;
  markerMotion: MarkerMotion;
  onSetMarkerMotion: (motion: MarkerMotion) => void;
  onSetLanguage: (language: "GR" | "EN") => void;
  onToast: (message: string) => void;
  /** The shared clock: the overview speaks about Ilia's light right now. */
  nowMs?: number;
};

const INTERACTION_RELEASE_MS = 520;
const SEARCH_SETTLE_MS = 420;

export function ExploreScreen(props: Props) {
  const {
    places,
    mapPlaces,
    clusters,
    posts,
    storyGroups,
    storyPlaceIds,
    selection,
    activeLens,
    discoverySnapshot,
    markerPulseSnapshot,
    query,
    savedIds,
  } = props;
  const { t, language } = useI18n();
  const { colorScheme, ready: themeReady } = useTheme();
  const mapHandle = useRef<ExploreMapHandle>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [interacting, setInteracting] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chromeBottom, setChromeBottom] = useState(112);
  const [carouselHeight, setCarouselHeight] = useState(260);
  const [cameraNonce, setCameraNonce] = useState(0);
  const [viewer, setViewer] = useState<{
    items: ExploreMedia[];
    index: number;
    place: Place;
  } | null>(null);
  const releaseTimer = useRef<number | null>(null);

  const placeById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);
  const clusterById = useMemo(
    () => new Map(clusters.map((cluster) => [cluster.id, cluster])),
    [clusters],
  );
  const storyGroupByPlace = useMemo(
    () => new Map(storyGroups.map((group) => [group.placeId, group])),
    [storyGroups],
  );
  const postsByPlace = useMemo(() => {
    const grouped = new Map<string, Post[]>();
    for (const post of posts) {
      if (!post.imageUrl?.trim()) continue;
      const list = grouped.get(post.placeId) ?? [];
      list.push(post);
      grouped.set(post.placeId, list);
    }
    return grouped;
  }, [posts]);
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);

  // Settled search text drives the camera; every keystroke drives the list.
  const [settledQuery, setSettledQuery] = useState(query.trim());
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledQuery(query.trim()), SEARCH_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const searching = query.trim().length > 0;
  const regionId = selection.kind === "idle" ? null : selection.regionId;
  const selectedArea = regionId ? (clusterById.get(regionId) ?? null) : null;
  const selectedPlace =
    selection.kind === "placeSelected" ? (placeById.get(selection.placeId) ?? null) : null;
  const mode: "overview" | "area" | "search" = searching
    ? "search"
    : selectedArea
      ? "area"
      : "overview";
  const areaPlaceIds = useMemo(
    () => new Set(selectedArea?.places.map((place) => place.id) ?? []),
    [selectedArea],
  );

  // Clear a stale carousel focus when the context changes.
  useEffect(() => setFocusedId(null), [mode, regionId]);

  const commons = useCommonsPhotos(selectedPlace);
  const galleryFor = useCallback(
    (place: Place, withCommons: ExploreMedia[] = [], limit = 24) =>
      placeGallery(place, {
        posts: postsByPlace.get(place.id) ?? [],
        storyGroup: storyGroupByPlace.get(place.id) ?? null,
        commons: withCommons,
        limit,
      }),
    [postsByPlace, storyGroupByPlace],
  );
  const bloom = useMemo(
    () =>
      selectedPlace
        ? placeBloom(selectedPlace, galleryFor(selectedPlace), commons)
        : { halo: [], far: [] },
    [selectedPlace, commons, galleryFor],
  );

  const liveLabelForPlace = useCallback(
    (place: Place) => {
      const level = markerPulseSnapshot[place.id]?.level;
      if (level === "lively") return t("Live now");
      if (level === "active") return t("Busy now");
      if (level === "emerging") return t("Picking up");
      if (storyGroupByPlace.get(place.id)?.live) return t("Live stories");
      return null;
    },
    [markerPulseSnapshot, storyGroupByPlace, t],
  );

  // ---- carousel -----------------------------------------------------------------
  const carouselItems = useMemo<CarouselItem[]>(() => {
    const placeItem = (place: Place): CarouselItem => ({
      kind: "place",
      id: place.id,
      place,
      storyGroup: storyGroupByPlace.get(place.id) ?? null,
      liveLabel: liveLabelForPlace(place),
      matches: placeMatchesLens(place.id, activeLens, discoverySnapshot),
      saved: savedSet.has(place.id),
      photoCount: galleryFor(place).length,
    });
    const rankOptions = {
      lens: activeLens,
      discovery: discoverySnapshot,
      pulse: markerPulseSnapshot,
      storyPlaceIds,
    };
    if (mode === "search") return rankPlaces(mapPlaces, rankOptions).slice(0, 30).map(placeItem);
    if (mode === "area" && selectedArea) {
      const visible = mapPlaces.filter((place) => areaPlaceIds.has(place.id));
      return rankPlaces(visible, rankOptions).map(placeItem);
    }
    return rankAreas(clusters, { lens: activeLens, discovery: discoverySnapshot }).map((area) => ({
      kind: "area",
      id: area.id,
      area,
      cover: areaCover(area, storyPlaceIds),
      hasStories: area.places.some((place) => storyPlaceIds.has(place.id)),
      liveLabel:
        area.status === "live" ? t("Live now") : area.status === "hot" ? t("Hot right now") : null,
      matches: areaMatchesLens(area, activeLens, discoverySnapshot),
    }));
  }, [
    mode,
    mapPlaces,
    selectedArea,
    areaPlaceIds,
    clusters,
    activeLens,
    discoverySnapshot,
    markerPulseSnapshot,
    storyPlaceIds,
    storyGroupByPlace,
    savedSet,
    galleryFor,
    liveLabelForPlace,
    t,
  ]);

  const placeCount = mapPlaces.length;
  const carouselTitle =
    mode === "search"
      ? t("Results for “{query}”", { query: query.trim() })
      : mode === "area" && selectedArea
        ? areaDisplayName(selectedArea, language, t)
        : t("Explore Ilia");
  const sky = props.nowMs !== undefined ? iliaSky(props.nowMs) : null;
  const skyText = sky?.sun
    ? sky.sun.kind === "sunset"
      ? t("Sunset in {time}", { time: formatCountdown(sky.sun.minutes, language) })
      : t("Sunrise at {time}", { time: iliaTime(sky.sun.at) })
    : null;
  const carouselSubtitle =
    mode === "overview"
      ? (skyText ??
        t("{areas} areas · {places} places", { areas: clusters.length, places: placeCount }))
      : t("{count} places", { count: carouselItems.length });

  // ---- map data -------------------------------------------------------------------
  const mapAreas = useMemo<ExploreArea[]>(() => {
    if (mode === "search") return [];
    return clusters.map((area) => {
      const cover = areaCover(area, storyPlaceIds);
      const behind = area.places
        .filter((place) => place.id !== cover.id && place.imageUrl)
        .slice(0, 2)
        .map((place) => place.imageUrl);
      const matches = areaMatchesLens(area, activeLens, discoverySnapshot);
      return {
        id: area.id,
        name: areaDisplayName(area, language, t),
        count: area.places.length,
        cover: cover.imageUrl,
        behind,
        hasStories: area.places.some((place) => storyPlaceIds.has(place.id)),
        hot: area.status === "hot" || area.status === "live",
        state: !matches ? "dimmed" : focusedId === area.id ? "focused" : "idle",
        lat: area.lat,
        lng: area.lng,
      };
    });
  }, [mode, clusters, storyPlaceIds, activeLens, discoverySnapshot, focusedId]);

  const mapPins = useMemo<ExplorePlace[]>(
    () =>
      mapPlaces.map((place) => {
        const gallery = galleryFor(place);
        const matches = placeMatchesLens(place.id, activeLens, discoverySnapshot);
        const outsideArea = mode === "area" && !areaPlaceIds.has(place.id);
        const selected = selectedPlace?.id === place.id;
        const name = language === "GR" && place.greekName ? place.greekName : place.name;
        const live = liveLabelForPlace(place);
        return {
          id: place.id,
          name,
          type: place.type,
          cover: place.imageUrl,
          fan: gallery.slice(1, 3).map((item) => item.url),
          hasStories: storyPlaceIds.has(place.id),
          live: Boolean(live),
          state: selected
            ? "selected"
            : focusedId === place.id
              ? "focused"
              : !matches || outsideArea
                ? "dimmed"
                : "idle",
          halo: selected ? bloom.halo.map((item) => ({ id: item.id, url: item.url })) : undefined,
          showLabel: selected || focusedId === place.id,
          ariaLabel: [name, place.area, live].filter(Boolean).join(", "),
          lat: place.lat,
          lng: place.lng,
        };
      }),
    [
      mapPlaces,
      galleryFor,
      activeLens,
      discoverySnapshot,
      mode,
      areaPlaceIds,
      selectedPlace,
      language,
      liveLabelForPlace,
      storyPlaceIds,
      focusedId,
      bloom,
    ],
  );

  const camera = useMemo<CameraIntent>(() => {
    if (selectedPlace) {
      return {
        key: `place:${selectedPlace.id}:${cameraNonce}`,
        kind: "focus",
        lat: selectedPlace.lat,
        lng: selectedPlace.lng,
        zoom: 14.8,
      };
    }
    if (searching && settledQuery) {
      const bounds = placesBounds(mapPlaces, 0.01);
      if (bounds) return { key: `search:${settledQuery}`, kind: "fit", bounds, maxZoom: 13.2 };
    }
    if (selectedArea) {
      const bounds = placesBounds(
        selectedArea.places,
        selectedArea.places.length > 1 ? 0.006 : 0.012,
      );
      if (bounds)
        return {
          key: `area:${selectedArea.id}:${cameraNonce}`,
          kind: "fit",
          bounds,
          maxZoom: 15.2,
        };
    }
    return { key: "overview", kind: "overview", bounds: placesBounds(clusters, 0.04) };
  }, [selectedPlace, searching, settledQuery, mapPlaces, selectedArea, clusters, cameraNonce]);

  const padding = useMemo<MapPadding>(
    () => ({
      top: immersive ? 40 : chromeBottom + 18,
      bottom: immersive ? 120 : carouselHeight + 24,
      left: 28,
      right: 28,
    }),
    [immersive, chromeBottom, carouselHeight],
  );

  // ---- interactions ------------------------------------------------------------------
  const onInteractionChange = useCallback((active: boolean) => {
    if (releaseTimer.current !== null) window.clearTimeout(releaseTimer.current);
    releaseTimer.current = null;
    if (active) setInteracting(true);
    else
      releaseTimer.current = window.setTimeout(() => setInteracting(false), INTERACTION_RELEASE_MS);
  }, []);
  useEffect(
    () => () => {
      if (releaseTimer.current !== null) window.clearTimeout(releaseTimer.current);
    },
    [],
  );

  const selectPlace = (place: Place) => {
    setImmersive(false);
    setCameraNonce((value) => value + 1);
    props.onSelectPlace(place);
  };

  const activateCard = (item: CarouselItem) => {
    if (item.kind === "area") {
      setCameraNonce((value) => value + 1);
      props.onSelectArea(item.area);
    } else selectPlace(item.place);
  };

  const onCarouselFocus = (id: string) => {
    if (selectedPlace) {
      const place = placeById.get(id);
      if (place) props.onSelectPlace(place);
      return;
    }
    setFocusedId(id);
    const target =
      mode === "overview" ? clusterById.get(id) : (placeById.get(id) as Place | undefined);
    if (target) mapHandle.current?.reveal(target.lat, target.lng);
  };

  const onBackground = () => {
    if (searchOpen) return;
    if (selectedPlace) props.onBack();
    else if (selectedArea) props.onClear();
    else if (searching) props.setQuery("");
    else setImmersive((value) => !value);
  };

  const onBack =
    mode === "search"
      ? () => props.setQuery("")
      : mode === "area"
        ? () => (selectedPlace ? props.onBack() : props.onClear())
        : undefined;

  const openBloom = (mediaId: string) => {
    if (!selectedPlace) return;
    // The full gallery: a tapped photo must never fall past a display limit.
    const items = galleryFor(selectedPlace, commons, Number.MAX_SAFE_INTEGER);
    const index = Math.max(
      0,
      items.findIndex((item) => item.id === mediaId),
    );
    setViewer({ items, index, place: selectedPlace });
  };

  return (
    <div
      className="xp-screen"
      data-immersive={immersive ? "true" : "false"}
      data-interacting={interacting ? "true" : "false"}
      data-mode={mode}
      style={
        {
          "--xp-carousel-h": `${carouselHeight}px`,
          "--xp-chrome-b": `${chromeBottom}px`,
        } as CSSProperties
      }
    >
      <ExploreMap
        appearance={{ colorScheme, atmosphere: props.atmospherePalette }}
        themeReady={themeReady}
        areas={mapAreas}
        places={mapPins}
        forcePlaces={mode !== "overview"}
        selectedPlaceId={selectedPlace?.id ?? null}
        bloom={bloom.far}
        camera={camera}
        padding={padding}
        initialCamera={props.initialCamera}
        cameraCaptureRef={props.cameraCaptureRef}
        routePreview={props.routePreview}
        routeFrameRevision={props.routeFrameRevision}
        handleRef={mapHandle}
        onAreaActivate={(id) => {
          const area = clusterById.get(id);
          if (!area) return;
          setImmersive(false);
          setCameraNonce((value) => value + 1);
          props.onSelectArea(area);
        }}
        onPlaceActivate={(id) => {
          const place = placeById.get(id);
          if (!place) return;
          if (selectedPlace?.id === id) props.onOpenPlace(place);
          else selectPlace(place);
        }}
        onBloomActivate={openBloom}
        onBackground={onBackground}
        onInteractionChange={onInteractionChange}
        onLongPress={props.onMapLongPress}
        onAvailabilityChange={props.onAvailabilityChange}
        onLocationStatus={(status) => {
          if (status === "denied" || status === "timeout" || status === "unavailable")
            props.onToast(t(LOCATION_MESSAGE[status]));
        }}
      />

      <ExploreChrome
        query={query}
        setQuery={props.setQuery}
        places={places}
        onPickPlace={selectPlace}
        activeLens={activeLens}
        onLensChange={props.onLensChange}
        dimmed={interacting}
        hidden={immersive}
        account={props.account}
        onOpenAccount={props.onOpenAccount}
        onOpenAuth={props.onOpenAuth}
        onOpenDeals={props.onOpenDeals}
        markerMotion={props.markerMotion}
        onSetMarkerMotion={props.onSetMarkerMotion}
        onSetLanguage={props.onSetLanguage}
        onSearchOpenChange={setSearchOpen}
        onHeightChange={setChromeBottom}
      />

      <div
        className="xp-controls"
        data-hidden={immersive ? "true" : "false"}
        style={{ bottom: carouselHeight + 12 }}
      >
        <div className="xp-controls__zoom xp-glass">
          <button
            type="button"
            onClick={() => mapHandle.current?.zoomBy(1)}
            aria-label={t("Zoom in")}
          >
            <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => mapHandle.current?.zoomBy(-1)}
            aria-label={t("Zoom out")}
          >
            <Minus size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="xp-controls__locate xp-glass"
          onClick={() => mapHandle.current?.locate()}
          aria-label={t("Show my location")}
        >
          <LocateFixed size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      <ExploreCarousel
        items={carouselItems}
        title={carouselTitle}
        subtitle={carouselSubtitle}
        onBack={onBack}
        focusedId={focusedId}
        selectedId={selectedPlace?.id ?? null}
        hidden={immersive}
        onFocus={onCarouselFocus}
        onActivate={activateCard}
        onOpenStory={props.onOpenStory}
        onToggleSave={props.onToggleSave}
        onShare={props.onShare}
        onOpenPlace={props.onOpenPlace}
        emptyTitle={t(searching ? "No places match that search." : "Nothing to show here yet.")}
        emptyAction={
          searching ? { label: t("Clear search"), onClick: () => props.setQuery("") } : undefined
        }
        onHeightChange={setCarouselHeight}
      />

      <AnimatePresence>
        {viewer && (
          <ExplorePhotoViewer
            items={viewer.items}
            startIndex={viewer.index}
            title={
              language === "GR" && viewer.place.greekName
                ? viewer.place.greekName
                : viewer.place.name
            }
            onClose={() => setViewer(null)}
            onOpenPlace={() => {
              const place = viewer.place;
              setViewer(null);
              props.onOpenPlace(place);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

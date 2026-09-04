import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Radio,
  Bookmark,
  Share2,
  Clock,
  MapPin,
  ExternalLink,
  BadgeCheck,
  Gift,
} from "lucide-react";
import { typeColor, type Place } from "@/lib/hp-model";
import { type PulseData } from "@/lib/hp-api";
import { useI18n } from "@/lib/i18n";
import { ImageBox } from "./ImageBox";
import { type MapAreaCluster } from "./SocialMap";
import { toneStyle, type PlaceStoryGroup } from "@/lib/hp/place-stories";
import { type DiscoveryLens, type DiscoveryRecommendation } from "@/lib/hp/discovery";
import {
  AREA_STATE_LABEL,
  SIGNAL_QUALITY_LABEL,
  HP_TRANSITION,
  openStreetMapUrl,
} from "./pulse-shared";

type SheetDragHandlers = {
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

export type DiscoverySuggestion = {
  recommendation: DiscoveryRecommendation;
  cluster: MapAreaCluster;
};

export function MapBottomSheet({
  cluster,
  selectedPlace,
  events,
  storyGroups,
  onOpenStory,
  height,
  peek,
  half,
  full,
  onSetSnap,
  onIdleHeightMeasured,
  onOpenDetails,
  onSavePlace,
  onSharePlace,
  savedPlaceIds,
  claimedPlaceIds,
  dealPlaceIds,
  activeLens,
  searchQuery,
  showDiscoveryEmptyState,
  discoverySuggestion,
  onOpenDiscoverySuggestion,
  onClearLens,
  onClearSearch,
}: {
  cluster: MapAreaCluster | null;
  selectedPlace: Place | null;
  events: PulseData["events"];
  storyGroups: PlaceStoryGroup[];
  onOpenStory: (placeId: string) => void;
  height: number;
  peek: number;
  half: number;
  full: number;
  onSetSnap: (h: number) => void;
  onIdleHeightMeasured: (height: number) => void;
  onOpenDetails: (p: Place) => void;
  onSavePlace: (id: string) => void;
  onSharePlace: (place: Place) => void;
  savedPlaceIds: string[];
  claimedPlaceIds: string[];
  dealPlaceIds: string[];
  activeLens: DiscoveryLens | null;
  searchQuery: string;
  showDiscoveryEmptyState: boolean;
  discoverySuggestion: DiscoverySuggestion | null;
  onOpenDiscoverySuggestion: (cluster: MapAreaCluster) => void;
  onClearLens: () => void;
  onClearSearch: () => void;
}) {
  const { t } = useI18n();
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);
  const idleContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (cluster) return;
    const handle = handleRef.current;
    const content = idleContentRef.current;
    if (!handle || !content) return;
    // Measure intrinsic children, not the animated/constrained sheet height.
    // This also responds to translated wrapping, font loading and text zoom.
    const measure = () =>
      onIdleHeightMeasured(Math.max(72, Math.ceil(handle.offsetHeight + content.offsetHeight + 1)));
    const observer = new ResizeObserver(measure);
    observer.observe(handle);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [cluster, onIdleHeightMeasured]);
  const isSelectedCollapsed = Boolean(cluster) && height <= peek + 8;
  const isExpanded = Boolean(cluster) && height >= full - 24;
  const dragState = useRef<{
    pointerId: number;
    startHeight: number;
    startY: number;
    lastY: number;
    lastAt: number;
    velocityY: number;
  } | null>(null);

  const clampSheetHeight = (value: number) =>
    cluster ? Math.min(full, Math.max(peek, value)) : peek;

  const snapSheet = (currentHeight: number, velocityY: number) => {
    const height = clampSheetHeight(currentHeight);
    const snapPoints = cluster ? [peek, half, full] : [peek];
    const closestSnap = snapPoints.reduce((closest, point) =>
      Math.abs(point - height) < Math.abs(closest - height) ? point : closest,
    );

    if (!cluster) {
      onSetSnap(peek);
      return;
    }

    if (velocityY < -180) {
      onSetSnap(snapPoints.find((point) => point > height + 4) ?? full);
    } else if (velocityY > 180) {
      onSetSnap([...snapPoints].reverse().find((point) => point < height - 4) ?? peek);
    } else {
      onSetSnap(closestSnap);
    }
  };

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    dragState.current = {
      pointerId: event.pointerId,
      startHeight: height,
      startY: event.clientY,
      lastY: event.clientY,
      lastAt: event.timeStamp,
      velocityY: 0,
    };
    setIsDraggingSheet(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail for synthetic or already-cancelled pointer streams.
    }
    event.preventDefault();
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const elapsed = Math.max(event.timeStamp - state.lastAt, 16);
    state.velocityY = ((event.clientY - state.lastY) / elapsed) * 1000;
    state.lastY = event.clientY;
    state.lastAt = event.timeStamp;

    onSetSnap(clampSheetHeight(state.startHeight - (event.clientY - state.startY)));
    event.preventDefault();
  };

  const finishHandleDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const currentHeight = clampSheetHeight(state.startHeight - (event.clientY - state.startY));
    const velocityY = state.velocityY;
    dragState.current = null;
    setIsDraggingSheet(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The drag has already ended; keeping the last computed height is fine.
    }
    snapSheet(currentHeight, velocityY);
  };

  const sheetDragHandlers: SheetDragHandlers = {
    onPointerCancel: finishHandleDrag,
    onPointerDown: onHandlePointerDown,
    onPointerMove: onHandlePointerMove,
    onPointerUp: finishHandleDrag,
  };

  return (
    <motion.div
      style={{ height }}
      animate={{ height }}
      transition={isDraggingSheet ? { duration: 0 } : HP_TRANSITION.panel}
      className={`hp-map-sheet ${!cluster ? "is-idle" : ""} absolute inset-x-0 bottom-0 z-30 flex min-h-0 flex-col overflow-hidden overscroll-contain rounded-t-3xl border-t border-hp-ink/10 bg-hp-paper/98 shadow-[0_-12px_40px_rgba(23,20,17,0.18)]`}
    >
      {/* Drag handle */}
      <div
        ref={handleRef}
        {...sheetDragHandlers}
        className="hp-map-sheet-handle touch-none select-none cursor-grab pt-2 pb-1 active:cursor-grabbing"
      >
        <div className="mx-auto h-1.5 w-12 rounded-full bg-hp-ink/15" />
        {cluster && !isSelectedCollapsed && (
          <div className="flex justify-center gap-2 pt-2">
            {[
              { h: peek, label: "collapsed" },
              { h: half, label: "preview" },
              { h: full, label: "full" },
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => onSetSnap(s.h)}
                aria-label={t("Set sheet to {position}", { position: t(s.label) })}
                aria-pressed={Math.abs(height - s.h) < 4}
                className="hp-sheet-snap-button"
              >
                <span
                  className={`hp-sheet-snap-indicator ${Math.abs(height - s.h) < 4 ? "is-active" : ""}`}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {!isSelectedCollapsed && (
          <motion.div
            ref={cluster ? undefined : idleContentRef}
            key={
              selectedPlace ? `place-${selectedPlace.id}` : cluster ? `area-${cluster.id}` : "idle"
            }
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={HP_TRANSITION.sheetContent}
            className={`hp-safe-px min-h-0 pt-0 ${cluster ? "pb-5" : "hp-map-sheet__idle-content"} ${
              cluster
                ? `flex flex-1 overscroll-contain ${isExpanded ? "overflow-y-auto" : "overflow-hidden"}`
                : "overscroll-contain"
            }`}
          >
            {cluster ? (
              <AreaSheetContent
                cluster={cluster}
                selectedPlace={selectedPlace}
                events={events}
                expanded={isExpanded}
                savedPlaceIds={savedPlaceIds}
                claimedPlaceIds={claimedPlaceIds}
                dealPlaceIds={dealPlaceIds}
                storyGroups={storyGroups}
                onOpenStory={onOpenStory}
                onSavePlace={onSavePlace}
                onSharePlace={onSharePlace}
                onOpenDetails={onOpenDetails}
                showDiscoveryEmptyState={showDiscoveryEmptyState}
                discoverySuggestion={discoverySuggestion}
                onOpenDiscoverySuggestion={onOpenDiscoverySuggestion}
                activeLens={activeLens}
                onClearLens={onClearLens}
              />
            ) : (
              <TonightPulseContent
                searchQuery={searchQuery}
                activeLens={activeLens}
                showDiscoveryEmptyState={showDiscoveryEmptyState}
                discoverySuggestion={discoverySuggestion}
                onOpenDiscoverySuggestion={onOpenDiscoverySuggestion}
                onClearLens={onClearLens}
                onClearSearch={onClearSearch}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TonightPulseContent({
  searchQuery,
  activeLens,
  showDiscoveryEmptyState,
  discoverySuggestion,
  onOpenDiscoverySuggestion,
  onClearLens,
  onClearSearch,
}: {
  searchQuery: string;
  activeLens: DiscoveryLens | null;
  showDiscoveryEmptyState: boolean;
  discoverySuggestion: DiscoverySuggestion | null;
  onOpenDiscoverySuggestion: (cluster: MapAreaCluster) => void;
  onClearLens: () => void;
  onClearSearch: () => void;
}) {
  const { t } = useI18n();
  if (searchQuery.trim()) {
    return (
      <div className="hp-map-sheet__idle-copy hp-discovery-empty-state">
        <h3 className="text-[16px] font-black text-hp-ink">{t("No matching places here")}</h3>
        <p className="text-[12px] text-hp-muted">
          {t("Clear the search to see nearby activity again.")}
        </p>
        <button type="button" onClick={onClearSearch} className="hp-discovery-empty-action">
          {t("Clear search")}
        </button>
      </div>
    );
  }

  if (showDiscoveryEmptyState) {
    return (
      <DiscoveryEmptyState
        activeLens={activeLens}
        suggestion={discoverySuggestion}
        onOpenSuggestion={onOpenDiscoverySuggestion}
        onClearLens={onClearLens}
      />
    );
  }
  return (
    <div className="hp-map-sheet__idle-copy">
      <h3 className="text-[16px] font-black text-hp-ink">{t("Tonight's pulse")}</h3>
      <p className="text-[12px] text-hp-muted">{t("Tap a bubble to see what's happening.")}</p>
    </div>
  );
}

function DiscoveryEmptyState({
  activeLens,
  suggestion,
  onOpenSuggestion,
  onClearLens,
}: {
  activeLens: DiscoveryLens | null;
  suggestion: DiscoverySuggestion | null;
  onOpenSuggestion: (cluster: MapAreaCluster) => void;
  onClearLens: () => void;
}) {
  const { t } = useI18n();
  const reason = suggestion?.recommendation.reason;
  const message = suggestion
    ? reason === "emerging" || reason === "rising"
      ? t("Activity is rising near {area} · {distance} km", {
          area: suggestion.cluster.name,
          distance: Math.max(1, Math.round(suggestion.recommendation.distanceKm)),
        })
      : reason === "hot"
        ? t("{area} is active now · {distance} km", {
            area: suggestion.cluster.name,
            distance: Math.max(1, Math.round(suggestion.recommendation.distanceKm)),
          })
        : t("{area} is becoming more active · {distance} km", {
            area: suggestion.cluster.name,
            distance: Math.max(1, Math.round(suggestion.recommendation.distanceKm)),
          })
    : null;

  return (
    <div className="hp-map-sheet__idle-copy hp-discovery-empty-state">
      <h3 className="text-[16px] font-black text-hp-ink">{t("Quiet here right now")}</h3>
      {message ? (
        <button
          type="button"
          onClick={() => suggestion && onOpenSuggestion(suggestion.cluster)}
          className="hp-discovery-recommendation"
        >
          <MapPin size={15} aria-hidden="true" />
          <span>{message}</span>
        </button>
      ) : (
        <p className="text-[12px] text-hp-muted">
          {t("No strong nearby signal yet. Try another lens or explore the map.")}
        </p>
      )}
      {activeLens && (
        <button type="button" onClick={onClearLens} className="hp-discovery-empty-action">
          {t("Clear lens")}
        </button>
      )}
    </div>
  );
}

function AreaSheetContent({
  cluster,
  selectedPlace,
  events,
  expanded,
  savedPlaceIds,
  claimedPlaceIds,
  dealPlaceIds,
  storyGroups,
  onOpenStory,
  onSavePlace,
  onSharePlace,
  onOpenDetails,
  showDiscoveryEmptyState,
  discoverySuggestion,
  onOpenDiscoverySuggestion,
  activeLens,
  onClearLens,
}: {
  cluster: MapAreaCluster;
  selectedPlace: Place | null;
  events: PulseData["events"];
  expanded: boolean;
  savedPlaceIds: string[];
  claimedPlaceIds: string[];
  dealPlaceIds: string[];
  storyGroups: PlaceStoryGroup[];
  onOpenStory: (placeId: string) => void;
  onSavePlace: (id: string) => void;
  onSharePlace: (place: Place) => void;
  onOpenDetails: (p: Place) => void;
  showDiscoveryEmptyState: boolean;
  discoverySuggestion: DiscoverySuggestion | null;
  onOpenDiscoverySuggestion: (cluster: MapAreaCluster) => void;
  activeLens: DiscoveryLens | null;
  onClearLens: () => void;
}) {
  const { language, t } = useI18n();
  const placeIds = new Set(cluster.places.map((place) => place.id));
  const isPlaceSheet = Boolean(selectedPlace && placeIds.has(selectedPlace.id));
  const areaStoryGroups = storyGroups.filter((group) => placeIds.has(group.placeId));

  if (!isPlaceSheet) {
    const intelligence = cluster.intelligence;
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="flex gap-3">
          <div className="grid h-16 w-16 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-2xl border border-hp-ink/10 bg-hp-ink/5">
            {cluster.places.slice(0, 4).map((place) => (
              <ImageBox
                key={place.id}
                src={place.imageUrl}
                alt=""
                className="h-8 w-full"
                rounded="rounded-none"
              />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-bold text-hp-ink/70">
              <span className="inline-block h-2 w-2 rounded-full bg-hp-sunset" />
              <span>{cluster.activityLine}</span>
            </div>
            <h3 className="mt-1 text-[16px] font-black text-hp-ink">{cluster.name}</h3>
            {intelligence && (
              <div
                className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-hp-ink/65"
                data-area-state={intelligence.state}
                data-signal-quality={intelligence.signalQuality}
                data-emerging={intelligence.emerging ? "true" : "false"}
              >
                <span>
                  {t(AREA_STATE_LABEL[intelligence.state])} ·{" "}
                  {t(SIGNAL_QUALITY_LABEL[intelligence.signalQuality])}
                </span>
                {intelligence.emerging && (
                  <span className="rounded-full border border-hp-sunset/25 bg-hp-sunset/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-hp-sunset">
                    {t("Emerging")}
                  </span>
                )}
              </div>
            )}
            {showDiscoveryEmptyState && (
              <div className="mt-2">
                <DiscoveryEmptyState
                  activeLens={activeLens}
                  suggestion={discoverySuggestion}
                  onOpenSuggestion={onOpenDiscoverySuggestion}
                  onClearLens={onClearLens}
                />
              </div>
            )}
            <p className="text-[11px] text-hp-muted">
              {language === "GR"
                ? `${cluster.places.length} σημεία σε αυτή την περιοχή`
                : `${cluster.places.length} clustered places in this area`}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-hp-ink/70">
              <span className="inline-flex items-center gap-0.5">
                <Radio size={11} />
                {cluster.postCount} {language === "GR" ? "δημοσιεύσεις" : "posts"}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <Clock size={11} />
                {cluster.eventCount} {language === "GR" ? "εκδηλώσεις" : "events"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-hp-ink/10 bg-white/60 p-2.5">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
            {language === "GR" ? "Σημεία της περιοχής" : "Clustered elements"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cluster.places.map((place) => (
              <span
                key={place.id}
                className="rounded-full bg-hp-ink/5 px-2 py-1 text-[11px] font-bold text-hp-ink/75"
              >
                {place.name}
                {claimedPlaceIds.includes(place.id) && (
                  <BadgeCheck size={11} className="ml-1 inline" />
                )}
                {dealPlaceIds.includes(place.id) && <Gift size={11} className="ml-1 inline" />}
              </span>
            ))}
          </div>
        </div>

        {areaStoryGroups.length > 0 && (
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                {language === "GR" ? `Stories από ${cluster.name}` : `Stories from ${cluster.name}`}
              </span>
              <span className="text-[10px] font-semibold text-hp-muted">
                {areaStoryGroups.length}
              </span>
            </div>
            <div className="hp-no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {areaStoryGroups.map((group) => {
                const tone = toneStyle(group.hasUnseen ? group.tone : "muted");
                return (
                  <button
                    key={group.placeId}
                    type="button"
                    onClick={() => onOpenStory(group.placeId)}
                    aria-label={
                      language === "GR"
                        ? `Άνοιγμα stories για ${group.placeName}`
                        : `Open stories for ${group.placeName}`
                    }
                    className="flex w-14 shrink-0 flex-col items-center gap-1"
                  >
                    <div className="rounded-full p-[2px]" style={{ background: tone.gradient }}>
                      <ImageBox
                        src={group.stories[0].mediaUrl}
                        alt={group.placeName}
                        className="h-12 w-12"
                        rounded="rounded-full"
                      />
                    </div>
                    <span className="block w-full truncate text-center text-[9px] font-bold text-hp-ink/80">
                      {group.placeName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  const focusPlace = selectedPlace;
  if (!focusPlace) return null;

  const saved = savedPlaceIds.includes(focusPlace.id);
  const placeEvents = events.filter((event) => event.placeId === focusPlace.id);

  return (
    <div className={expanded ? "w-full" : "flex h-full min-h-0 w-full flex-col"}>
      <div className="flex gap-3">
        <ImageBox
          src={focusPlace.imageUrl}
          alt={focusPlace.name}
          className="h-16 w-16 shrink-0"
          rounded="rounded-2xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-bold text-hp-ink/70">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: typeColor[focusPlace.type] }}
            />
            <span>
              {focusPlace.type} · {focusPlace.bestTime}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <h3 className="text-[16px] font-black text-hp-ink">{focusPlace.name}</h3>
            {claimedPlaceIds.includes(focusPlace.id) && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-hp-sunset/12 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-hp-sunset"
                title={t("Verified business")}
              >
                <BadgeCheck size={10} /> {t("Business")}
              </span>
            )}
            {dealPlaceIds.includes(focusPlace.id) && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-hp-sunset/12 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-hp-sunset"
                title={t("This place has an app deal")}
              >
                <Gift size={10} /> {t("Deal")}
              </span>
            )}
          </div>
          <p className="text-[11px] text-hp-muted">
            {focusPlace.greekName} · {focusPlace.area}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-hp-ink/70">
            <span className="inline-flex items-center gap-0.5">
              <Radio size={11} />
              {focusPlace.recentPostCount} {language === "GR" ? "δημοσιεύσεις" : "posts"}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <Clock size={11} />
              {placeEvents.length} {language === "GR" ? "εκδηλώσεις" : "events"}
            </span>
          </div>
        </div>
      </div>

      <p
        className={`mt-3 text-[13px] leading-snug text-hp-ink/80 ${expanded ? "" : "line-clamp-2"}`}
      >
        {focusPlace.short}
      </p>

      {expanded && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {focusPlace.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-hp-ink/5 px-2 py-1 text-[10px] font-bold text-hp-ink/65"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className={`${expanded ? "mt-2" : "mt-auto pt-2"} flex items-center gap-2`}>
        <button
          type="button"
          onClick={() => onSavePlace(focusPlace.id)}
          className={`flex-1 whitespace-nowrap rounded-full border py-2 text-[12px] font-bold ${saved ? "border-hp-sunset bg-hp-sunset/10 text-hp-sunset" : "border-hp-ink/15 text-hp-ink"}`}
        >
          <Bookmark size={13} className="mr-1 inline" /> {t(saved ? "Saved" : "Save")}
        </button>
        <button
          type="button"
          onClick={() => onOpenDetails(focusPlace)}
          className="flex-1 whitespace-nowrap rounded-full bg-hp-ink py-2 text-[12px] font-bold text-hp-paper"
        >
          {language === "GR" ? "Λεπτομέρειες" : "Details"}
        </button>
        <a
          href={openStreetMapUrl(focusPlace)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("Open {place} in OpenStreetMap", { place: focusPlace.name })}
          className="grid h-9 w-9 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
        >
          <ExternalLink size={13} />
        </a>
        <button
          type="button"
          onClick={() => onSharePlace(focusPlace)}
          aria-label={t("Share {place}", { place: focusPlace.name })}
          className="grid h-9 w-9 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
        >
          <Share2 size={13} />
        </button>
      </div>
    </div>
  );
}

/* ============== Pulse Feed ============== */

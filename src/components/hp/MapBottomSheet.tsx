import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import {
  Bookmark,
  Share2,
  MapPin,
  ExternalLink,
  BadgeCheck,
  Gift,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  X,
  CalendarDays,
} from "lucide-react";
import type { Place } from "@/lib/hp-model";
import { useI18n } from "@/lib/i18n";
import { regionalDescription } from "@/lib/hp/map-region-layer";
import { communityActivityCopy, temporalHeadline } from "@/lib/hp/context-copy";
import { regionalDescriptorKeys, REGION_IDENTITIES } from "@/lib/hp/region-identity";
import type { TemporalPresentation } from "@/lib/hp/temporal-atmosphere";
import { markerPulseForPlace, type MarkerPulseSnapshot } from "@/lib/hp/marker-pulse";
import {
  releaseSheetSnap,
  sheetSnapPoints,
  type MapDiscoveryState,
  type SheetSnap,
  type SheetSnapHeights,
} from "@/lib/hp/map-discovery-state";
import type {
  DiscoveryEvent,
  DiscoveryRegionRow,
  MapDiscoveryContent,
} from "@/lib/hp/map-discovery-content";
import type { SheetGeometry } from "@/lib/hp/sheet-geometry";
import type { PlaceStoryGroup } from "@/lib/hp/place-stories";
import { ImageBox } from "./ImageBox";
import { DISCOVERY_LENS_LABEL, HP_TRANSITION, openStreetMapUrl } from "./pulse-shared";

type Props = {
  atmosphere: TemporalPresentation;
  state: MapDiscoveryState;
  content: MapDiscoveryContent;
  selectedPlace: Place | null;
  markerPulseSnapshot: MarkerPulseSnapshot;
  heights: SheetSnapHeights;
  geometry: SheetGeometry;
  onSnap: (snap: SheetSnap) => void;
  onCollapsedHeightMeasured: (height: number) => void;
  onSelectRegion: (regionId: string) => void;
  onSelectPlace: (place: Place) => void;
  onClear: () => void;
  onBack: () => void;
  onOpenDetails: (place: Place) => void;
  onOpenEvent: (event: DiscoveryEvent) => void;
  onSavePlace: (id: string) => void;
  onSharePlace: (place: Place) => void;
  onOpenStory: (placeId: string) => void;
  onClearLens: () => void;
  onClearSearch: () => void;
  savedPlaceIds: string[];
  claimedPlaceIds: string[];
  dealPlaceIds: string[];
  storyGroups: PlaceStoryGroup[];
  searchQuery: string;
  dataStatus: "loading" | "ready" | "error";
  selectedPlaceMatchesLens: boolean;
};

export function MapBottomSheet(props: Props) {
  const { state, content, selectedPlace, heights, geometry, onSnap, onCollapsedHeightMeasured } =
    props;
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const height = useMotionValue(heights[state.snap]);
  const headerRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    pointerId: number;
    startHeight: number;
    startY: number;
    lastY: number;
    lastAt: number;
    velocityY: number;
  } | null>(null);
  const selectionKey =
    state.selection.kind === "idle"
      ? "idle"
      : state.selection.kind === "placeSelected"
        ? state.selection.placeId
        : state.selection.regionId;
  const previousKey = useRef(selectionKey);
  const row =
    state.selection.kind !== "idle" ? content.regions.get(state.selection.regionId) : null;
  const lensLabel = state.activeLens ? t(DISCOVERY_LENS_LABEL[state.activeLens]) : null;
  const temporalCopy = temporalHeadline(props.atmosphere);
  const title = selectedPlace?.name ?? (row ? t(row.discovery.region.name) : t(temporalCopy.key));
  const identity = row && !selectedPlace ? row.discovery.region.identity : null;
  const count = selectedPlace
    ? content.events.filter((event) => event.placeId === selectedPlace.id).length
    : (row?.places.length ?? content.matchingVisiblePlaceCount);
  const summary = selectedPlace
    ? `${t(selectedPlace.type)} · ${t(count === 1 ? "{count} scheduled event" : "{count} scheduled events", { count })}`
    : props.dataStatus !== "ready" || (!state.viewport && !row)
      ? t("Explore what is happening around Ilia")
      : t(
          row
            ? count === 1
              ? "{count} matching place"
              : "{count} matching places"
            : count === 1
              ? "{count} matching place in view"
              : "{count} matching places in view",
          { count },
        );

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () =>
      onCollapsedHeightMeasured(Math.ceil(header.getBoundingClientRect().height) + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    measure();
    return () => observer.disconnect();
  }, [onCollapsedHeightMeasured]);

  useEffect(
    () => height.on("change", (value) => geometry.set({ height: value, moving: true })),
    [geometry, height],
  );
  useEffect(() => {
    if (dragging) return;
    let cancelled = false;
    const target = heights[state.snap];
    geometry.set({ height: height.get(), moving: true });
    const animation = animate(height, target, {
      ...HP_TRANSITION.panel,
      duration: reducedMotion ? 0 : HP_TRANSITION.panel.duration,
    });
    void animation.then(() => {
      if (!cancelled) geometry.set({ height: target, moving: false });
    });
    return () => {
      cancelled = true;
      animation.stop();
    };
  }, [dragging, geometry, height, heights, state.snap, reducedMotion, selectionKey]);

  useEffect(() => {
    if (previousKey.current === selectionKey) return;
    previousKey.current = selectionKey;
    if (drag.current) {
      const pointerId = drag.current.pointerId;
      if (headerRef.current?.hasPointerCapture(pointerId))
        headerRef.current.releasePointerCapture(pointerId);
      drag.current = null;
      setDragging(false);
    }
    if (contentRef.current) contentRef.current.scrollTop = 0;
    if (state.selection.kind === "idle" && document.activeElement === document.body)
      summaryRef.current?.focus({ preventScroll: true });
  }, [selectionKey, state.selection.kind]);

  const clamp = (value: number) => Math.min(heights.expanded, Math.max(heights.collapsed, value));
  const finish = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    onSnap(
      cancelled
        ? state.snap
        : releaseSheetSnap(
            clamp(current.startHeight - event.clientY + current.startY),
            current.velocityY,
            heights,
          ),
    );
  };
  const points = sheetSnapPoints(heights);
  const nextSnap =
    state.snap === "expanded"
      ? "preview"
      : (points.find((snap) => heights[snap] > heights[state.snap] + 1) ?? "expanded");
  const dismiss = () => {
    props.onClear();
    summaryRef.current?.focus({ preventScroll: true });
  };

  return (
    <motion.section
      style={{
        height,
        ...({
          ...(identity ? { "--hp-region-accent": REGION_IDENTITIES[identity.primary].accent } : {}),
        } as CSSProperties),
      }}
      className="hp-map-sheet hp-discovery-sheet absolute inset-x-0 bottom-0 z-30 flex min-h-0 flex-col overflow-hidden"
      role="region"
      aria-labelledby="hp-discovery-title"
      data-selection={state.selection.kind}
      data-snap={state.snap}
      data-dragging={dragging ? "true" : "false"}
      data-region-identity={identity?.primary}
    >
      <div
        ref={headerRef}
        className="hp-discovery-sheet__header touch-none select-none"
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as HTMLElement).closest("button, a")) return;
          height.stop();
          drag.current = {
            pointerId: event.pointerId,
            startHeight: height.get(),
            startY: event.clientY,
            lastY: event.clientY,
            lastAt: event.timeStamp,
            velocityY: 0,
          };
          setDragging(true);
          geometry.set({ height: height.get(), moving: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          current.velocityY =
            ((event.clientY - current.lastY) / Math.max(event.timeStamp - current.lastAt, 16)) *
            1000;
          current.lastY = event.clientY;
          current.lastAt = event.timeStamp;
          height.set(clamp(current.startHeight - event.clientY + current.startY));
          event.preventDefault();
        }}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => finish(event, true)}
      >
        <div className="hp-sheet-handle-mark" aria-hidden="true" />
        <div className="hp-discovery-sheet__summary-row">
          <h2 className="min-w-0 flex-1" aria-label={title}>
            <button
              ref={summaryRef}
              type="button"
              className="hp-discovery-sheet__summary"
              aria-expanded={state.snap !== "collapsed"}
              aria-controls="hp-discovery-content"
              aria-label={`${title}. ${summary}. ${t(
                state.snap === "expanded" ? "Set sheet to preview" : "Expand discovery sheet",
              )}`}
              onClick={() => onSnap(nextSnap)}
            >
              <span
                id="hp-discovery-title"
                data-copy-source={selectedPlace || row ? "regional-metadata" : temporalCopy.source}
              >
                {title}
              </span>
              <span className="hp-discovery-sheet__subtitle">{summary}</span>
            </button>
          </h2>
          {state.selection.kind !== "idle" && (
            <button
              type="button"
              className="hp-discovery-sheet__icon"
              onClick={props.onBack}
              aria-label={t("Back to previous map view")}
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <button
            type="button"
            className="hp-discovery-sheet__icon"
            onClick={() => onSnap(nextSnap)}
            aria-label={t(
              state.snap === "expanded" ? "Set sheet to preview" : "Expand discovery sheet",
            )}
          >
            {state.snap === "expanded" ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
          {state.snap !== "collapsed" && (
            <button
              type="button"
              className="hp-discovery-sheet__icon"
              onClick={dismiss}
              aria-label={t(
                state.selection.kind === "idle"
                  ? "Collapse discovery sheet"
                  : "Clear map selection",
              )}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {state.selection.kind !== "idle" ? t("Selected {name}", { name: title }) : ""}
      </span>
      {state.snap !== "collapsed" && (
        <div
          id="hp-discovery-content"
          ref={contentRef}
          className="hp-discovery-sheet__content hp-safe-px min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {state.activeLens && selectedPlace && !props.selectedPlaceMatchesLens && (
            <p className="hp-discovery-sheet__notice">
              {t("This place does not match the {filter} lens.", { filter: lensLabel ?? "" })}{" "}
              <button type="button" onClick={props.onClearLens}>
                {t("Clear lens")}
              </button>
            </p>
          )}
          {selectedPlace ? (
            <PlaceDiscoveryContent {...props} place={selectedPlace} />
          ) : row ? (
            <RegionDiscoveryContent {...props} row={row} lensLabel={lensLabel} />
          ) : (
            <>
              <h3 className="hp-discovery-sheet__section-title">{t("Explore this view")}</h3>
              {content.visibleRegions.length ? (
                <ul className="hp-discovery-sheet__list">
                  {content.visibleRegions.map((region) => (
                    <li key={region.discovery.region.id}>
                      <button
                        type="button"
                        className="hp-discovery-sheet__row"
                        onClick={() => props.onSelectRegion(region.discovery.region.id)}
                      >
                        <MapPin size={18} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <strong>{t(region.discovery.region.name)}</strong>
                          <span>
                            {t(
                              region.visiblePlaceCount === 1
                                ? "{count} place in view"
                                : "{count} places in view",
                              { count: region.visiblePlaceCount },
                            )}
                            {region.visibleEventCount > 0
                              ? ` · ${t(region.visibleEventCount === 1 ? "{count} scheduled event" : "{count} scheduled events", { count: region.visibleEventCount })}`
                              : ""}
                          </span>
                          <span data-copy-source="regional-metadata">
                            {regionalDescriptorKeys(
                              region.discovery.region.identity,
                              region.categories,
                            )
                              .map((key) => t(key))
                              .join(" · ")}
                          </span>
                          {communityActivityCopy(region.discovery.signal) && (
                            <span data-copy-source="community-activity">
                              {regionalDescription(
                                {
                                  ...region.discovery,
                                  contextualPlaceIds: region.places
                                    .filter((place) =>
                                      state.viewport?.visiblePlaceIds.includes(place.id),
                                    )
                                    .map((place) => place.id),
                                },
                                lensLabel,
                                t,
                              )}
                            </span>
                          )}
                        </span>
                        <ChevronUp size={16} className="rotate-90" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <DiscoveryEmpty {...props} />
              )}
            </>
          )}
        </div>
      )}
    </motion.section>
  );
}

function DiscoveryEmpty(props: Props) {
  const { t } = useI18n();
  const title =
    props.dataStatus === "loading"
      ? "Loading pulse data…"
      : props.dataStatus === "error"
        ? "Could not load pulse data."
        : props.searchQuery.trim()
          ? "No matching places here"
          : "No matching places in this view";
  return (
    <div className="hp-discovery-sheet__empty">
      <p>{t(title)}</p>
      <p>{t("Explore what is happening around Ilia")}</p>
      {props.searchQuery.trim() && (
        <button type="button" onClick={props.onClearSearch}>
          {t("Clear search")}
        </button>
      )}
      {props.state.activeLens && (
        <button type="button" onClick={props.onClearLens}>
          {t("Clear lens")}
        </button>
      )}
    </div>
  );
}
function RegionDiscoveryContent(
  props: Props & { row: DiscoveryRegionRow; lensLabel: string | null },
) {
  const { t } = useI18n();
  const { row } = props;
  return (
    <>
      <p
        className="hp-discovery-sheet__context"
        data-copy-source={
          communityActivityCopy(row.discovery.signal) ? "community-activity" : "fallback"
        }
      >
        {regionalDescription(row.discovery, props.lensLabel, t)}
      </p>
      <p className="hp-discovery-sheet__description" data-copy-source="regional-metadata">
        {regionalDescriptorKeys(row.discovery.region.identity, row.categories)
          .map((key) => t(key))
          .join(" · ")}
      </p>
      <div className="hp-discovery-sheet__section-heading">
        <h3>{t("Places")}</h3>
        <button type="button" onClick={() => props.onSnap("expanded")}>
          {t("Explore {area}", { area: t(row.discovery.region.name) })} →
        </button>
      </div>
      {row.places.length ? (
        <ul className="hp-discovery-sheet__list">
          {row.places.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className="hp-discovery-sheet__row"
                onClick={() => props.onSelectPlace(place)}
              >
                <ImageBox
                  key={`${place.id}:${place.imageUrl}`}
                  src={place.imageUrl}
                  alt=""
                  className="h-12 w-12 shrink-0"
                  rounded="rounded-xl"
                  gradientFallback="var(--hp-paper)"
                  failedContent={<MapPin size={16} aria-hidden="true" />}
                />
                <span className="min-w-0 flex-1">
                  <strong>{place.name}</strong>
                  <span>
                    {t(place.type)} · {place.area}
                  </span>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <DiscoveryEmpty {...props} />
      )}
      <DiscoveryEvents events={row.events} onOpen={props.onOpenEvent} />
    </>
  );
}
function DiscoveryEvents({
  events,
  onOpen,
}: {
  events: DiscoveryEvent[];
  onOpen: (event: DiscoveryEvent) => void;
}) {
  const { language, t } = useI18n();
  return (
    <>
      <h3 className="hp-discovery-sheet__section-title">
        {t(events.length === 1 ? "{count} scheduled event" : "{count} scheduled events", {
          count: events.length,
        })}
      </h3>
      {events.length > 0 && (
        <ul className="hp-discovery-sheet__list">
          {events.map((event) => (
            <li key={event.key}>
              <button
                type="button"
                className="hp-discovery-sheet__row"
                onClick={() => onOpen(event)}
              >
                <CalendarDays size={18} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <strong>
                    {event.kind === "cultural" && language === "GR"
                      ? event.event.greekTitle || event.title
                      : event.title}
                  </strong>
                  <span>
                    {new Intl.DateTimeFormat(language === "GR" ? "el-GR" : "en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(event.date))}
                  </span>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
function PlaceDiscoveryContent(props: Props & { place: Place }) {
  const { place, state } = props;
  const { t } = useI18n();
  const saved = props.savedPlaceIds.includes(place.id);
  const story = props.storyGroups.find((group) => group.placeId === place.id);
  const signal = markerPulseForPlace(place.id, props.markerPulseSnapshot);
  const activityCopy = communityActivityCopy(signal);
  return (
    <>
      {place.imageUrl ? (
        <ImageBox
          key={`${place.id}:${place.imageUrl}`}
          src={place.imageUrl}
          alt={t("Photo of {place}", { place: place.name })}
          failedContent={t("No photo available")}
          gradientFallback="var(--hp-paper)"
          className={`hp-discovery-sheet__photo ${state.snap === "expanded" ? "is-expanded" : ""}`}
        />
      ) : (
        <div className="hp-discovery-sheet__photo hp-discovery-sheet__photo-fallback">
          {t("No photo available")}
        </div>
      )}
      <div className="hp-discovery-sheet__place-meta">
        <span>{place.area}</span>
        {props.claimedPlaceIds.includes(place.id) && (
          <span>
            <BadgeCheck size={13} aria-hidden="true" /> {t("Verified business")}
          </span>
        )}
        {props.dealPlaceIds.includes(place.id) && (
          <span>
            <Gift size={13} aria-hidden="true" /> {t("Deal")}
          </span>
        )}
      </div>
      {activityCopy && (
        <p className="hp-discovery-sheet__context" data-copy-source={activityCopy.source}>
          {t(activityCopy.key, { level: t(String(activityCopy.params!.level)) })}
        </p>
      )}
      <p className="hp-discovery-sheet__description">{place.short}</p>
      <div className="hp-discovery-sheet__place-meta">
        {place.budget && <span>{place.budget}</span>}
        {place.bestTime && <span>{place.bestTime}</span>}
      </div>
      <div className="hp-discovery-sheet__actions">
        <button type="button" onClick={() => props.onSavePlace(place.id)} aria-pressed={saved}>
          <Bookmark size={15} aria-hidden="true" />
          {t(saved ? "Saved" : "Save")}
        </button>
        <button type="button" className="is-primary" onClick={() => props.onOpenDetails(place)}>
          {t("Details")}
        </button>
        <a
          href={openStreetMapUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("Open {place} in OpenStreetMap", { place: place.name })}
        >
          <ExternalLink size={16} />
        </a>
        <button
          type="button"
          onClick={() => props.onSharePlace(place)}
          aria-label={t("Share {place}", { place: place.name })}
        >
          <Share2 size={16} />
        </button>
      </div>
      {story && (
        <button
          type="button"
          className="hp-discovery-sheet__story"
          onClick={() => props.onOpenStory(place.id)}
        >
          {t("Open stories for {place}", { place: place.name })} →
        </button>
      )}
      {state.snap === "expanded" && place.tags.length > 0 && (
        <p className="hp-discovery-sheet__tags">{place.tags.map((tag) => `#${tag}`).join(" · ")}</p>
      )}
      <DiscoveryEvents
        events={props.content.events.filter((event) => event.placeId === place.id)}
        onOpen={props.onOpenEvent}
      />
    </>
  );
}

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowUpRight, Bookmark, ChevronLeft, Images, Share2 } from "lucide-react";
import type { Place } from "@/lib/hp-model";
import type { MapAreaCluster } from "@/lib/hp/map-clusters";
import type { PlaceStoryGroup } from "@/lib/hp/place-stories";
import { thumbnailUrl } from "@/lib/hp/explore-media";
import { useI18n } from "@/lib/i18n";
import { DirectionsLink } from "../DirectionsLink";
import { typeIconSvg } from "./explore-markers";

export type CarouselAreaItem = {
  kind: "area";
  id: string;
  area: MapAreaCluster;
  cover: Place;
  hasStories: boolean;
  liveLabel: string | null;
  matches: boolean;
};

export type CarouselPlaceItem = {
  kind: "place";
  id: string;
  place: Place;
  storyGroup: PlaceStoryGroup | null;
  liveLabel: string | null;
  matches: boolean;
  saved: boolean;
  photoCount: number;
};

export type CarouselItem = CarouselAreaItem | CarouselPlaceItem;

type Props = {
  items: CarouselItem[];
  title: string;
  subtitle: string;
  onBack?: () => void;
  focusedId: string | null;
  selectedId: string | null;
  hidden: boolean;
  onFocus: (id: string) => void;
  onActivate: (item: CarouselItem) => void;
  onOpenStory: (placeId: string) => void;
  onToggleSave: (placeId: string) => void;
  onShare: (place: Place) => void;
  onOpenPlace: (place: Place) => void;
  emptyTitle: string;
  emptyAction?: { label: string; onClick: () => void };
  onHeightChange?: (height: number) => void;
};

const FOCUS_SETTLE_MS = 90;

export function ExploreCarousel({
  items,
  title,
  subtitle,
  onBack,
  focusedId,
  selectedId,
  hidden,
  onFocus,
  onActivate,
  onOpenStory,
  onToggleSave,
  onShare,
  onOpenPlace,
  emptyTitle,
  emptyAction,
  onHeightChange,
}: Props) {
  const { t, language } = useI18n();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const userFocusRef = useRef<string | null>(null);
  const programmaticUntil = useRef(0);
  const settleTimer = useRef<number | null>(null);
  const itemsKey = items.map((item) => item.id).join("|");

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !onHeightChange) return;
    const report = () => {
      const parent = node.offsetParent as HTMLElement | null;
      if (!parent) return;
      const top = node.getBoundingClientRect().top - parent.getBoundingClientRect().top;
      onHeightChange(Math.max(0, Math.round(parent.clientHeight - top)));
    };
    const observer = new ResizeObserver(report);
    observer.observe(node);
    report();
    return () => observer.disconnect();
  }, [onHeightChange, hidden]);

  // A new list starts at its first card.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    programmaticUntil.current = Date.now() + 250;
    track.scrollTo({ left: 0, behavior: "auto" });
    userFocusRef.current = null;
  }, [itemsKey]);

  // Selection or focus set from the map brings its card to the centre.
  useEffect(() => {
    const track = trackRef.current;
    const id = selectedId ?? focusedId;
    if (!track || !id) return;
    if (userFocusRef.current === id) return;
    const card = track.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`);
    if (!card) return;
    programmaticUntil.current = Date.now() + (reduceMotion ? 120 : 650);
    track.scrollTo({
      left: card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [selectedId, focusedId, itemsKey, reduceMotion]);

  const onScroll = () => {
    if (Date.now() < programmaticUntil.current) return;
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      const track = trackRef.current;
      if (!track) return;
      const center = track.scrollLeft + track.clientWidth / 2;
      let best: { id: string; distance: number } | null = null;
      for (const card of track.querySelectorAll<HTMLElement>("[data-card-id]")) {
        const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
        if (!best || distance < best.distance) best = { id: card.dataset.cardId ?? "", distance };
      }
      if (best?.id && best.id !== focusedId && best.id !== selectedId) {
        userFocusRef.current = best.id;
        onFocus(best.id);
      }
    }, FOCUS_SETTLE_MS);
  };

  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    [],
  );

  return (
    <section
      ref={rootRef}
      className="xp-carousel"
      data-hidden={hidden ? "true" : "false"}
      aria-label={title}
    >
      <header className="xp-carousel__head">
        {onBack && (
          <button
            type="button"
            className="xp-carousel__back xp-glass"
            onClick={onBack}
            aria-label={t("Back")}
          >
            <ChevronLeft size={18} strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
        <div className="xp-carousel__title xp-glass">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
      </header>
      <div ref={trackRef} className="xp-track hp-no-scrollbar" role="list" onScroll={onScroll}>
        {items.length === 0 && (
          <div className="xp-card xp-card--empty" role="listitem">
            <strong>{emptyTitle}</strong>
            {emptyAction && (
              <button type="button" onClick={emptyAction.onClick}>
                {emptyAction.label}
              </button>
            )}
          </div>
        )}
        {items.map((item) => {
          const selected = item.id === selectedId;
          const focused = !selected && item.id === focusedId;
          if (item.kind === "area") {
            const { area, cover } = item;
            const avatars = area.avatars.slice(0, 3);
            return (
              <article
                key={item.id}
                role="listitem"
                data-card-id={item.id}
                className="xp-card xp-card--area"
                data-focused={focused ? "true" : "false"}
                data-dimmed={item.matches ? "false" : "true"}
              >
                <span className="xp-card__media" aria-hidden="true">
                  <img
                    src={thumbnailUrl(cover.imageUrl, 500)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <span className="xp-card__shade" aria-hidden="true" />
                <button
                  type="button"
                  className="xp-card__hit"
                  onClick={() => onActivate(item)}
                  aria-label={t("Explore {area}, {count} places", {
                    area: area.name,
                    count: area.places.length,
                  })}
                />
                <span className="xp-card__top">
                  {item.liveLabel ? (
                    <span className="xp-chip xp-chip--live">{item.liveLabel}</span>
                  ) : (
                    <span />
                  )}
                  <span className="xp-chip">
                    {t("{count} places", { count: area.places.length })}
                  </span>
                </span>
                <span className="xp-card__copy">
                  <strong>{area.name}</strong>
                  <span className="xp-card__meta">
                    {avatars.length > 0 && (
                      <span className="xp-faces" aria-hidden="true">
                        {avatars.map((avatar) => (
                          <img key={avatar} src={avatar} alt="" loading="lazy" decoding="async" />
                        ))}
                      </span>
                    )}
                    <span>
                      {language === "GR" && cover.greekName ? cover.greekName : cover.name}
                    </span>
                  </span>
                </span>
                {item.hasStories && <span className="xp-card__story-dot" aria-hidden="true" />}
              </article>
            );
          }
          const { place, storyGroup } = item;
          const name = language === "GR" && place.greekName ? place.greekName : place.name;
          return (
            <article
              key={item.id}
              role="listitem"
              data-card-id={item.id}
              className="xp-card xp-card--place"
              data-selected={selected ? "true" : "false"}
              data-focused={focused ? "true" : "false"}
              data-dimmed={item.matches ? "false" : "true"}
            >
              <span className="xp-card__media" aria-hidden="true">
                <img
                  src={thumbnailUrl(place.imageUrl, 500)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </span>
              <span className="xp-card__shade" aria-hidden="true" />
              <button
                type="button"
                className="xp-card__hit"
                onClick={() => (selected ? onOpenPlace(place) : onActivate(item))}
                aria-label={t(selected ? "Open {place}" : "Show {place} on the map", {
                  place: name,
                })}
              />
              <span className="xp-card__top">
                {storyGroup ? (
                  <button
                    type="button"
                    className="xp-story-bubble"
                    data-unseen={storyGroup.hasUnseen ? "true" : "false"}
                    onClick={() => onOpenStory(place.id)}
                    aria-label={t("Open stories from {place}", { place: name })}
                  >
                    <img
                      src={thumbnailUrl(storyGroup.stories[0]?.mediaUrl ?? place.imageUrl, 120)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                ) : (
                  <span
                    className="xp-type"
                    data-type={place.type}
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: typeIconSvg(place.type, 12) }}
                  />
                )}
                <button
                  type="button"
                  className="xp-save"
                  aria-pressed={item.saved}
                  onClick={() => onToggleSave(place.id)}
                  aria-label={t(item.saved ? "Remove from saved" : "Save {place}", { place: name })}
                >
                  <Bookmark size={15} strokeWidth={2.3} aria-hidden="true" />
                </button>
              </span>
              <span className="xp-card__copy">
                {item.liveLabel && <span className="xp-chip xp-chip--live">{item.liveLabel}</span>}
                <strong>{name}</strong>
                <span className="xp-card__meta">
                  <span>{place.area}</span>
                  {item.photoCount > 1 && (
                    <span className="xp-card__photos">
                      <Images size={12} strokeWidth={2.3} aria-hidden="true" />
                      {item.photoCount}
                    </span>
                  )}
                </span>
              </span>
              {selected && (
                <span className="xp-card__actions">
                  <DirectionsLink
                    destination={{ lat: place.lat, lng: place.lng, label: place.name }}
                    className="xp-action xp-action--primary"
                  />
                  <button
                    type="button"
                    className="xp-action xp-action--icon"
                    onClick={() => onShare(place)}
                    aria-label={t("Share")}
                  >
                    <Share2 size={16} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <button type="button" className="xp-action" onClick={() => onOpenPlace(place)}>
                    {t("Open")}
                    <ArrowUpRight size={15} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                </span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

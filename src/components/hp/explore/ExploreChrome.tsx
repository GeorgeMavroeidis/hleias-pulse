import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Coffee,
  Gift,
  Music2,
  Palette,
  Search,
  TreePalm,
  Users,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Place } from "@/lib/hp-model";
import type { PulseAccountState } from "@/lib/hp-auth";
import { DISCOVERY_LENSES, type DiscoveryLens } from "@/lib/hp/discovery";
import { thumbnailUrl } from "@/lib/hp/explore-media";
import { useI18n } from "@/lib/i18n";
import { AccountBubble } from "../AuthAccountSheets";
import { AppearanceMenuContent } from "../PulseTopBar";
import {
  DISCOVERY_LENS_LABEL,
  HP_TRANSITION,
  matchesPlaceQuery,
  type MarkerMotion,
} from "../pulse-shared";

const LENS_ICON: Record<DiscoveryLens, LucideIcon> = {
  chill: Coffee,
  social: Users,
  music: Music2,
  beach: TreePalm,
  food: UtensilsCrossed,
};

type Props = {
  query: string;
  setQuery: (query: string) => void;
  places: Place[];
  onPickPlace: (place: Place) => void;
  activeLens: DiscoveryLens | null;
  onLensChange: (lens: DiscoveryLens | null) => void;
  /** The map is being dragged: step back so the map has the stage. */
  dimmed: boolean;
  /** Immersive mode: chrome leaves entirely. */
  hidden: boolean;
  account: PulseAccountState;
  onOpenAccount: () => void;
  onOpenAuth: () => void;
  onOpenDeals: () => void;
  markerMotion: MarkerMotion;
  onSetMarkerMotion: (motion: MarkerMotion) => void;
  onSetLanguage: (language: "GR" | "EN") => void;
  onSearchOpenChange?: (open: boolean) => void;
  onHeightChange?: (bottom: number) => void;
};

export function ExploreChrome({
  query,
  setQuery,
  places,
  onPickPlace,
  activeLens,
  onLensChange,
  dimmed,
  hidden,
  account,
  onOpenAccount,
  onOpenAuth,
  onOpenDeals,
  markerMotion,
  onSetMarkerMotion,
  onSetLanguage,
  onSearchOpenChange,
  onHeightChange,
}: Props) {
  const { t, language } = useI18n();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const appearanceButtonRef = useRef<HTMLButtonElement>(null);
  const appearanceMenuRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  useEffect(() => onSearchOpenChange?.(searchOpen), [searchOpen, onSearchOpenChange]);

  // Report where the chrome ends so the camera keeps pins out from under it.
  useEffect(() => {
    const node = rootRef.current;
    if (!node || !onHeightChange) return;
    const report = () => {
      const parent = node.offsetParent as HTMLElement | null;
      const top = parent
        ? node.getBoundingClientRect().top - parent.getBoundingClientRect().top
        : 0;
      onHeightChange(Math.round(top + node.offsetHeight));
    };
    const observer = new ResizeObserver(report);
    observer.observe(node);
    report();
    return () => observer.disconnect();
  }, [onHeightChange]);

  useEffect(() => {
    if (!appearanceOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (appearanceButtonRef.current?.contains(target) ||
          appearanceMenuRef.current?.contains(target))
      )
        return;
      setAppearanceOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setAppearanceOpen(false);
      appearanceButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [appearanceOpen]);

  const suggestions = useMemo(() => {
    const trimmed = query.trim();
    const pool = trimmed ? places.filter((place) => matchesPlaceQuery(place, trimmed)) : places;
    return [...pool].sort((a, b) => b.hotness - a.hotness).slice(0, 6);
  }, [places, query]);

  const closeSearch = () => {
    setSearchOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div
      ref={rootRef}
      className="xp-chrome"
      data-dimmed={dimmed && !searchOpen ? "true" : "false"}
      data-hidden={hidden && !searchOpen ? "true" : "false"}
      data-search={searchOpen ? "true" : "false"}
    >
      <div className="xp-chrome__row">
        <div className="xp-search xp-glass" data-active={searchOpen || query ? "true" : "false"}>
          <Search size={17} strokeWidth={2.2} className="xp-search__icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="xp-search__input"
            name="hp-explore-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label={t("Search ΗΛΕΙΑ PULSE")}
            placeholder={t("Search Ilia")}
            value={query}
            onFocus={() => {
              setAppearanceOpen(false);
              setSearchOpen(true);
            }}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (query) setQuery("");
                else closeSearch();
              }
              if (event.key === "Enter") closeSearch();
            }}
          />
          {(query || searchOpen) && (
            <button
              type="button"
              className="xp-search__clear"
              aria-label={t(query ? "Clear search" : "Close search")}
              onClick={() => {
                if (query) {
                  setQuery("");
                  inputRef.current?.focus();
                } else closeSearch();
              }}
            >
              <X size={14} strokeWidth={2.6} aria-hidden="true" />
            </button>
          )}
          {!searchOpen && (
            <>
              <span className="xp-search__divider" aria-hidden="true" />
              <button
                type="button"
                className="xp-icon-button"
                onClick={onOpenDeals}
                aria-label={t("Open deals")}
              >
                <Gift size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                ref={appearanceButtonRef}
                type="button"
                className="xp-icon-button"
                data-active={appearanceOpen ? "true" : "false"}
                onClick={() => setAppearanceOpen((open) => !open)}
                aria-label={t(appearanceOpen ? "Close appearance menu" : "Open appearance menu")}
                aria-expanded={appearanceOpen}
                aria-controls="xp-appearance-menu"
              >
                <Palette size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        <div className="xp-account xp-glass">
          <AccountBubble account={account} onOpenAccount={onOpenAccount} onOpenAuth={onOpenAuth} />
        </div>
      </div>

      <AnimatePresence>
        {appearanceOpen && (
          <motion.div
            ref={appearanceMenuRef}
            id="xp-appearance-menu"
            role="dialog"
            aria-label={t("Appearance")}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0 } : HP_TRANSITION.panel}
            className="hp-appearance-menu xp-appearance"
          >
            <AppearanceMenuContent
              markerMotion={markerMotion}
              onSetMarkerMotion={onSetMarkerMotion}
              onSetLanguage={onSetLanguage}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {searchOpen ? (
          <motion.div
            key="suggestions"
            className="xp-suggest xp-glass"
            role="listbox"
            aria-label={t(query.trim() ? "Matching places" : "Popular right now")}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={reduceMotion ? { duration: 0 } : HP_TRANSITION.panel}
          >
            <p className="xp-suggest__title">
              {t(query.trim() ? "Matching places" : "Popular right now")}
            </p>
            {suggestions.length === 0 ? (
              <p className="xp-suggest__empty">{t("No places match that search.")}</p>
            ) : (
              suggestions.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="xp-suggest__item"
                  // Pointer down, not click: the input's blur must not close the list first.
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setQuery("");
                    closeSearch();
                    onPickPlace(place);
                  }}
                >
                  <span className="xp-suggest__thumb">
                    {place.imageUrl ? (
                      <img
                        src={thumbnailUrl(place.imageUrl, 120)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                  </span>
                  <span className="xp-suggest__copy">
                    <strong>
                      {language === "GR" && place.greekName ? place.greekName : place.name}
                    </strong>
                    <small>{place.area}</small>
                  </span>
                </button>
              ))
            )}
          </motion.div>
        ) : (
          <motion.div
            key="lenses"
            className="xp-lenses hp-no-scrollbar"
            role="group"
            aria-label={t("Map discovery lenses")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : HP_TRANSITION.state}
          >
            {DISCOVERY_LENSES.map((lens) => {
              const Icon = LENS_ICON[lens];
              const selected = lens === activeLens;
              return (
                <button
                  key={lens}
                  type="button"
                  className="xp-lens xp-glass"
                  aria-pressed={selected}
                  onClick={() => onLensChange(selected ? null : lens)}
                >
                  <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
                  {t(DISCOVERY_LENS_LABEL[lens])}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      {searchOpen && (
        <button
          type="button"
          className="xp-chrome__scrim"
          aria-label={t("Close search")}
          tabIndex={-1}
          onClick={closeSearch}
        />
      )}
    </div>
  );
}

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search, Check, Gift, Palette } from "lucide-react";
import { type PulseAccountState } from "@/lib/hp-auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AccountBubble } from "./AuthAccountSheets";
import { DISCOVERY_LENSES, type DiscoveryLens } from "@/lib/hp/discovery";
import {
  type MarkerMotion,
  DISCOVERY_LENS_LABEL,
  HP_TRANSITION,
  MARKER_MOTION_OPTIONS,
} from "./pulse-shared";

export function Toast({ msg }: { msg: string | null }) {
  return (
    <AnimatePresence>
      {msg && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute bottom-24 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-hp-ink px-4 py-2 text-xs font-semibold text-hp-paper shadow-xl"
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ============== TopBar ============== */
interface TopBarProps {
  query: string;
  setQuery: (query: string) => void;
  onSetLanguage: (language: "GR" | "EN") => void;
  markerMotion: MarkerMotion;
  onSetMarkerMotion: (theme: MarkerMotion) => void;
  appearanceOpen: boolean;
  setAppearanceOpen: Dispatch<SetStateAction<boolean>>;
  showSearch: boolean;
  setShowSearch: Dispatch<SetStateAction<boolean>>;
  account: PulseAccountState;
  onOpenAccount: () => void;
  onOpenAuth: () => void;
  onOpenDeals: () => void;
}

export function TopBar({
  query,
  setQuery,
  onSetLanguage,
  markerMotion,
  onSetMarkerMotion,
  appearanceOpen,
  setAppearanceOpen,
  showSearch,
  setShowSearch,
  account,
  onOpenAccount,
  onOpenAuth,
  onOpenDeals,
}: TopBarProps) {
  const { language, t } = useI18n();
  const reducedMotion = useReducedMotion();
  const searchActive = showSearch || query.trim().length > 0;
  const activeMarkerMotion =
    MARKER_MOTION_OPTIONS.find((theme) => theme.id === markerMotion) ?? MARKER_MOTION_OPTIONS[0];
  const appearanceButtonRef = useRef<HTMLButtonElement>(null);
  const appearanceMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!appearanceOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (appearanceButtonRef.current?.contains(target) ||
          appearanceMenuRef.current?.contains(target))
      ) {
        return;
      }
      setAppearanceOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAppearanceOpen(false);
      appearanceButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [appearanceOpen, setAppearanceOpen]);

  return (
    <div className="hp-topbar relative z-[60]">
      <div className="hp-topbar-row hp-safe-px">
        <div className="hp-topbar-brand" aria-label="ΗΛΕΙΑ PULSE">
          <img
            src="/brand/ilia-pulse-logo.png"
            alt=""
            width={38}
            height={38}
            aria-hidden="true"
            className="hp-topbar-logo"
          />
          <div className="hp-brand leading-[0.85]">
            <div className="text-[14px] font-black tracking-[0.04em] text-hp-ink">ΗΛΕΙΑ</div>
            <div className="text-[14px] font-black tracking-[0.18em] text-hp-sunset">PULSE</div>
          </div>
        </div>
        <div className="hp-topbar-actions">
          <button
            type="button"
            onClick={onOpenDeals}
            className="hp-deals-action"
            aria-label={t("Open deals")}
          >
            <Gift size={17} strokeWidth={2} aria-hidden="true" />
            <span className="hp-deals-action-label">{t("Deals")}</span>
          </button>
          <Button
            variant="hpGhost"
            size="hpIcon"
            type="button"
            onClick={() => {
              setAppearanceOpen(false);
              setShowSearch((s) => !s);
            }}
            className={`hp-topbar-search ${searchActive ? "is-active" : ""} ${query.trim() ? "has-query" : ""}`}
            aria-label={t(showSearch ? "Close search" : "Open search")}
            aria-expanded={showSearch}
            aria-pressed={searchActive}
          >
            <Search size={18} strokeWidth={2} aria-hidden="true" />
          </Button>
          <Button
            variant="hpGhost"
            size="hpIcon"
            ref={appearanceButtonRef}
            type="button"
            onClick={() => {
              setShowSearch(false);
              setAppearanceOpen((open) => !open);
            }}
            className={`hp-appearance-trigger ${appearanceOpen ? "is-active" : ""}`}
            aria-label={t(appearanceOpen ? "Close appearance menu" : "Open appearance menu")}
            aria-expanded={appearanceOpen}
            aria-controls="hp-appearance-menu"
            data-marker-motion={markerMotion}
          >
            <Palette size={18} strokeWidth={2} aria-hidden="true" />
          </Button>
          <AccountBubble account={account} onOpenAccount={onOpenAccount} onOpenAuth={onOpenAuth} />
        </div>
      </div>
      <div className="hp-topbar-subtitle hp-safe-px">
        <p className="hp-topbar-subtitle-copy">{t("Local spots, routes, and tips.")}</p>
      </div>
      <AnimatePresence>
        {appearanceOpen && (
          <motion.div
            ref={appearanceMenuRef}
            id="hp-appearance-menu"
            role="dialog"
            aria-label={t("Appearance")}
            initial={{ opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -3, scale: 0.99 }}
            transition={reducedMotion ? { duration: 0 } : HP_TRANSITION.state}
            className="hp-appearance-menu"
          >
            <div className="hp-appearance-section">
              <span className="hp-appearance-label">{t("Language")}</span>
              <div className="hp-appearance-language" role="group" aria-label={t("Language")}>
                {(["GR", "EN"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onSetLanguage(option)}
                    className="hp-appearance-language-option"
                    aria-pressed={language === option}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="hp-appearance-section">
              <div className="hp-appearance-section-heading">
                <span className="hp-appearance-label">{t("Marker motion")}</span>
                <span className="hp-animation-theme-current" aria-live="polite">
                  {t("Current: {theme}", { theme: activeMarkerMotion.label })}
                </span>
              </div>
              <div
                className="hp-animation-theme-options"
                role="radiogroup"
                aria-label={t("Marker motion")}
              >
                {MARKER_MOTION_OPTIONS.map((theme) => {
                  const selected = markerMotion === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onSetMarkerMotion(theme.id)}
                      className="hp-animation-theme-option"
                      data-marker-motion={theme.id}
                    >
                      <span
                        className="hp-pulse-preview"
                        data-pulse-level="active"
                        aria-hidden="true"
                      >
                        <span className="hp-pulse-ring" />
                        <span className="hp-pulse-core" />
                      </span>
                      <span className="hp-animation-theme-copy">
                        <strong>{t(theme.label)}</strong>
                        <small>{t(theme.description)}</small>
                      </span>
                      <span className="hp-animation-theme-check" aria-hidden="true">
                        {selected && <Check size={15} strokeWidth={2.7} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : HP_TRANSITION.state}
            className="hp-safe-px overflow-hidden"
          >
            <div className="hp-search-field mb-2 flex items-center gap-2 px-3 py-2">
              <Search size={14} className="text-hp-muted" />
              <input
                name="hp-search"
                aria-label={t("Search ΗΛΕΙΑ PULSE")}
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  language === "GR"
                    ? "παραλία, πανηγύρι, ηλιοβασίλεμα…"
                    : "beach, panigyri, sunset…"
                }
                className="w-full bg-transparent text-sm outline-none placeholder:text-hp-muted"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============== Vibe chips ============== */
export function VibeChips({
  chips,
  active,
  setActive,
}: {
  chips: string[];
  active: string | null;
  setActive: (v: string | null) => void;
}) {
  return (
    <div className="hp-no-scrollbar hp-safe-px flex gap-2 overflow-x-auto border-b border-hp-ink/10 bg-hp-paper py-2">
      {chips.map((c) => {
        const on = active === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => setActive(on ? null : c)}
            aria-pressed={on}
            className={`hp-chip shrink-0 text-[12px] ${on ? "is-active" : ""}`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

export function DiscoveryLensRail({
  active,
  onChange,
}: {
  active: DiscoveryLens | null;
  onChange: (lens: DiscoveryLens | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="hp-discovery-lens-rail hp-no-scrollbar hp-safe-px"
      role="group"
      aria-label={t("Map discovery lenses")}
    >
      {DISCOVERY_LENSES.map((lens) => {
        const selected = lens === active;
        return (
          <button
            key={lens}
            type="button"
            onClick={() => onChange(selected ? null : lens)}
            aria-pressed={selected}
            className={`hp-discovery-lens ${selected ? "is-active" : ""}`}
          >
            {t(DISCOVERY_LENS_LABEL[lens])}
          </button>
        );
      })}
    </div>
  );
}

/* ============== Map Bottom Sheet (snap states) ============== */

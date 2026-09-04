import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Check, Gift, Palette } from "lucide-react";
import { type PulseAccountState } from "@/lib/hp-auth";
import { useI18n } from "@/lib/i18n";
import { AccountBubble } from "./AuthAccountSheets";
import { DISCOVERY_LENSES, type DiscoveryLens } from "@/lib/hp/discovery";
import {
  type MarkerAnimationTheme,
  DISCOVERY_LENS_LABEL,
  HP_TRANSITION,
  MARKER_ANIMATION_THEMES,
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
  animationTheme: MarkerAnimationTheme;
  onSetAnimationTheme: (theme: MarkerAnimationTheme) => void;
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
  animationTheme,
  onSetAnimationTheme,
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
  const searchActive = showSearch || query.trim().length > 0;
  const activeAnimationTheme =
    MARKER_ANIMATION_THEMES.find((theme) => theme.id === animationTheme) ??
    MARKER_ANIMATION_THEMES[0];
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
    <div className="relative z-[60] border-b border-hp-ink/10 bg-hp-paper/95">
      <div className="hp-safe-px flex items-center justify-between pt-2.5">
        <div className="flex items-center gap-2.5" aria-label="ΗΛΕΙΑ PULSE">
          <img
            src="/brand/ilia-pulse-logo.png"
            alt=""
            width={38}
            height={38}
            aria-hidden="true"
            className="h-10 w-10 rounded-xl bg-hp-paper object-contain"
          />
          <div className="hp-brand leading-[0.85]">
            <div className="text-[14px] font-black tracking-[0.04em] text-hp-ink">ΗΛΕΙΑ</div>
            <div className="text-[14px] font-black tracking-[0.18em] text-hp-sunset">PULSE</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenDeals}
            className="hp-deals-pill inline-flex items-center gap-1 rounded-full border border-hp-sunset/30 bg-hp-sunset/10 px-2.5 py-1.5 text-[11px] font-bold text-hp-sunset"
            aria-label={t("Open deals")}
          >
            <Gift size={13} strokeWidth={2.6} />
            {t("Deals")}
          </button>
          <button
            type="button"
            onClick={() => {
              setAppearanceOpen(false);
              setShowSearch((s) => !s);
            }}
            className={`hp-icon-button hp-topbar-search h-9 w-9 ${searchActive ? "is-active" : ""} ${query.trim() ? "has-query" : ""}`}
            aria-label={t(showSearch ? "Close search" : "Open search")}
            aria-expanded={showSearch}
            aria-pressed={searchActive}
          >
            <Search size={16} strokeWidth={2.2} />
          </button>
          <button
            ref={appearanceButtonRef}
            type="button"
            onClick={() => {
              setShowSearch(false);
              setAppearanceOpen((open) => !open);
            }}
            className={`hp-icon-button hp-appearance-trigger h-9 w-9 ${appearanceOpen ? "is-active" : ""}`}
            aria-label={t(appearanceOpen ? "Close appearance menu" : "Open appearance menu")}
            aria-expanded={appearanceOpen}
            aria-controls="hp-appearance-menu"
            data-active-theme={animationTheme}
          >
            <Palette size={16} strokeWidth={2.2} />
          </button>
          <AccountBubble account={account} onOpenAccount={onOpenAccount} onOpenAuth={onOpenAuth} />
        </div>
      </div>
      <div className="hp-safe-px pb-1.5 pt-0.5">
        <p className="text-[12px] text-hp-muted">{t("Local spots, routes, and tips.")}</p>
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
            transition={HP_TRANSITION.state}
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
                <span className="hp-appearance-label">{t("Marker animation")}</span>
                <span className="hp-animation-theme-current" aria-live="polite">
                  {t("Current: {theme}", { theme: activeAnimationTheme.label })}
                </span>
              </div>
              <div
                className="hp-animation-theme-options"
                role="radiogroup"
                aria-label={t("Marker animation")}
              >
                {MARKER_ANIMATION_THEMES.map((theme) => {
                  const selected = animationTheme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onSetAnimationTheme(theme.id)}
                      className="hp-animation-theme-option"
                      data-theme-preview={theme.id}
                    >
                      <span className="hp-animation-theme-preview is-pulse-hot" aria-hidden="true">
                        <span className="hp-marker-effects">
                          <span className="hp-marker-field" />
                          <span className="hp-marker-wave" />
                          <span className="hp-marker-sweep" />
                        </span>
                        <span className="hp-marker-core hp-animation-theme-preview__core" />
                      </span>
                      <span className="hp-animation-theme-copy">
                        <strong>{theme.label}</strong>
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
            transition={HP_TRANSITION.state}
            className="hp-safe-px overflow-hidden"
          >
            <div className="hp-search-field mb-2 flex items-center gap-2 rounded-full border border-hp-ink/10 px-3 py-2">
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
      className="hp-discovery-lens-rail hp-no-scrollbar hp-safe-px flex gap-2 overflow-x-auto border-b border-hp-ink/10 bg-hp-paper py-2"
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
            className={`hp-chip hp-discovery-lens shrink-0 text-[12px] ${selected ? "is-active" : ""}`}
          >
            {t(DISCOVERY_LENS_LABEL[lens])}
          </button>
        );
      })}
    </div>
  );
}

/* ============== Map Bottom Sheet (snap states) ============== */

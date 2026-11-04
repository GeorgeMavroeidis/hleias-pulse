import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  Heart,
  Layers,
  Minus,
  Plus,
  Route as RouteIcon,
  RotateCcw,
  X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Place, RouteItem } from "@/lib/hp-model";
import { placeSummary, routeSummary } from "@/lib/hp/summaries";
import {
  FULL_DAY_HOURS,
  MAX_DAYS,
  MIN_DAYS,
  addItem,
  DEFAULT_DAYS,
  createPlan,
  dayHours,
  dayItems,
  deck,
  hasItem,
  itemHours,
  moveItem,
  plannedDayCount,
  removeItem,
  resetSkipped,
  setDays,
  skip,
  suggestDay,
  type TripPlan,
} from "@/lib/hp/trip-plan";
import { useTripPlan } from "./use-trip-plan";
import {
  ESSENTIALS_CARDS,
  ESSENTIALS_SECTIONS,
  sectionCounts,
  type EssentialsSectionId,
} from "@/lib/hp/essentials";
import { SECTION_GRADIENT, SECTION_ICONS } from "./essentials-icons";
import { ImageBox } from "./ImageBox";
import { NearMeBar } from "./NearMeBar";
import { distanceLabel, useNearOrigin, withDistance } from "@/lib/hp/near-me";
import { PhotoTile } from "./QuickLookScreen";

// Region is fixed until a second one exists (docs/TOURIST_STAY_PACK.md).
const REGION = "ilia";

// Each day gets its own colour, cycling, so a week of cards is easy to tell apart.
const DAY_COLORS = [
  "bg-hp-sunset",
  "bg-hp-sea",
  "bg-hp-olive",
  "bg-hp-purple",
  "bg-hp-deep",
  "bg-amber-500",
];
const dayColor = (day: number) => DAY_COLORS[(day - 1) % DAY_COLORS.length];

/** Big photo header with a title on top — the first thing a visitor sees. */
function TripHero({
  imageUrl,
  title,
  subtitle,
  children,
}: {
  imageUrl: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative mb-4 min-h-[170px] overflow-hidden rounded-3xl shadow-[0_14px_30px_-16px_rgba(23,20,17,0.6)]">
      {/* ImageBox is itself position:relative, so it sits in an absolute wrapper
          to fill the header without pushing it taller. */}
      <div className="absolute inset-0">
        <ImageBox src={imageUrl} alt="" className="h-full w-full" rounded="rounded-3xl" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" />
      <div className="relative flex min-h-[170px] flex-col justify-end p-4 text-hp-on-media">
        <h2 className="text-[26px] font-black leading-[1.05] [text-shadow:0_2px_10px_rgba(0,0,0,0.5)]">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-[12.5px] font-semibold opacity-90">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

/** "Good to know" — coloured tiles, the always-there part of the Trip tab. */
function PracticalTiles({
  showDrafts,
  seeImage,
  onOpenEssentials,
  onOpenQuickLook,
}: Pick<Props, "showDrafts" | "onOpenEssentials" | "onOpenQuickLook"> & { seeImage: string }) {
  const { language, t } = useI18n();
  const counts = sectionCounts(ESSENTIALS_CARDS, REGION, showDrafts);
  return (
    <section className="mt-6">
      <p className="hp-section-title mb-3">{t("Good to know")}</p>
      <div className="grid grid-cols-2 gap-2.5">
        {ESSENTIALS_SECTIONS.map((section) => {
          const Icon = SECTION_ICONS[section.id];
          const isSee = section.id === "see";
          const ready = isSee || counts[section.id] > 0;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => (isSee ? onOpenQuickLook() : onOpenEssentials(section.id))}
              className={`relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br p-3.5 text-left text-hp-on-media shadow-[0_10px_22px_-14px_rgba(23,20,17,0.6)] transition active:scale-[0.98] ${SECTION_GRADIENT[section.id]} ${isSee ? "col-span-2" : ""}`}
            >
              {isSee && (
                <>
                  <span className="absolute inset-0">
                    <ImageBox
                      src={seeImage}
                      alt=""
                      className="h-full w-full"
                      rounded="rounded-3xl"
                    />
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
                </>
              )}
              <span className="relative grid h-10 w-10 place-items-center rounded-2xl bg-white/20 backdrop-blur">
                <Icon size={20} />
              </span>
              <span className="relative">
                <span className="block text-[14px] font-black leading-tight">
                  {isSee ? t("Quick look at every place") : section.title[language]}
                </span>
                <span className="mt-0.5 block text-[11px] font-semibold opacity-85">
                  {ready
                    ? isSee
                      ? t("Places and routes in two lines each")
                      : t("{n} cards", { n: counts[section.id] })
                    : t("Coming soon")}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface Props {
  /** Team only: count unverified drafts on the practical-info tiles. */
  showDrafts: boolean;
  onOpenEssentials: (section: EssentialsSectionId) => void;
  onOpenQuickLook: () => void;
  places: Place[];
  routes: RouteItem[];
  onOpenPlace: (place: Place) => void;
  onOpenRoute: (route: RouteItem) => void;
}

type View = "plan" | "deck" | "routes";

// How far a card has to be dragged sideways to count as keep / skip.
const SWIPE_PX = 90;
// Planned hours after which the deck switches to the next emptiest day.
const AUTO_ADVANCE_HOURS = 6;

function DayPicker({
  days,
  value,
  onChange,
}: {
  days: number;
  value: number;
  onChange: (day: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
        const on = day === value;
        return (
          <button
            key={day}
            type="button"
            onClick={() => onChange(day)}
            aria-pressed={on}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition active:scale-[0.98] ${
              on
                ? "border-hp-sunset bg-hp-sunset text-hp-on-media"
                : "border-hp-ink/10 bg-hp-paper text-hp-ink/70"
            }`}
          >
            {t("Day {n}", { n: day })}
          </button>
        );
      })}
    </div>
  );
}

export function TripPlannerScreen({
  showDrafts,
  onOpenEssentials,
  onOpenQuickLook,
  places,
  routes,
  onOpenPlace,
  onOpenRoute,
}: Props) {
  const { language, t } = useI18n();
  const [plan, setPlan] = useTripPlan();
  const [view, setView] = useState<View>("plan");
  const [draftDays, setDraftDays] = useState(DEFAULT_DAYS);
  const [targetDay, setTargetDay] = useState(1);
  const [kept, setKept] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const origin = useNearOrigin();

  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const routeById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  const findPlace = useCallback((id: string) => placeById.get(id), [placeById]);
  const findRoute = useCallback((id: string) => routeById.get(id), [routeById]);
  // The liveliest place's photo is the cover; it changes as the area heats up.
  const heroUrl = useMemo(
    () => [...places].sort((a, b) => b.hotness - a.hotness).find((p) => p.imageUrl)?.imageUrl ?? "",
    [places],
  );

  const openDeck = () => {
    if (!plan) return;
    setTargetDay(suggestDay(plan, findPlace, findRoute));
    setKept(0);
    setView("deck");
  };

  const openRoutes = () => {
    if (!plan) return;
    setTargetDay(suggestDay(plan, findPlace, findRoute));
    setView("routes");
  };

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition active:scale-[0.98] ${
      on ? "border-hp-ink bg-hp-ink text-hp-paper" : "border-hp-ink/10 bg-hp-paper text-hp-ink/70"
    }`;

  // ── 1. No plan yet: "how many days?" ──
  if (!plan) {
    return (
      <div className="h-full overflow-y-auto overscroll-contain px-4 pb-32 pt-3">
        <TripHero
          imageUrl={heroUrl}
          title={t("Welcome to Ilia")}
          subtitle={t("Plan your days in a minute")}
        />
        <div className="hp-card-lift rounded-3xl border border-hp-ink/10 bg-hp-paper p-5 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-hp-sunset/12 text-hp-sunset">
            <CalendarDays size={22} />
          </div>
          <h3 className="text-[17px] font-black text-hp-ink">
            {t("How many days are you staying?")}
          </h3>
          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setDraftDays((d) => Math.max(MIN_DAYS, d - 1))}
              className="grid h-11 w-11 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
              aria-label={t("Fewer days")}
            >
              <Minus size={18} />
            </button>
            <span className="hp-num w-16 text-5xl font-black text-hp-ink">{draftDays}</span>
            <button
              type="button"
              onClick={() => setDraftDays((d) => Math.min(MAX_DAYS, d + 1))}
              className="grid h-11 w-11 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
              aria-label={t("More days")}
            >
              <Plus size={18} />
            </button>
          </div>
          <p className="mt-1 text-[12px] text-hp-muted">{draftDays === 1 ? t("day") : t("days")}</p>
          <button
            type="button"
            onClick={() => {
              setPlan(createPlan(draftDays));
              setView("plan");
            }}
            className="mt-5 h-12 w-full rounded-full bg-hp-sunset text-[15px] font-semibold text-white active:scale-[0.98]"
          >
            {t("Start planning")}
          </button>
          <p className="mt-3 text-[10.5px] leading-snug text-hp-muted">
            {t("Your trip is saved on this phone only.")}
          </p>
        </div>
        <PracticalTiles
          showDrafts={showDrafts}
          seeImage={heroUrl}
          onOpenEssentials={onOpenEssentials}
          onOpenQuickLook={onOpenQuickLook}
        />
      </div>
    );
  }

  // With a location (or a stay base) the deck starts from what is nearest.
  const deckBase = deck(plan, places);
  const deckNear = origin ? withDistance(deckBase, origin) : null;
  const deckPlaces = deckNear ? deckNear.map((row) => row.place) : deckBase;
  const planned = plannedDayCount(plan);

  // ── 2. Card deck: keep or skip, one place at a time ──
  if (view === "deck") {
    const top = deckPlaces[0];
    const keepTop = () => {
      if (!top) return;
      const next = addItem(plan, { kind: "place", id: top.id, day: targetDay });
      setPlan(next);
      setKept((k) => k + 1);
      // Once a day is reasonably full, move on to the emptiest day so the
      // deck keeps filling the whole trip without extra taps.
      if (dayHours(next, targetDay, findPlace, findRoute) >= AUTO_ADVANCE_HOURS) {
        setTargetDay(suggestDay(next, findPlace, findRoute));
      }
    };
    const skipTop = () => {
      if (!top) return;
      setPlan(skip(plan, top.id));
    };
    const onDragEnd = (_: unknown, info: PanInfo) => {
      if (info.offset.x > SWIPE_PX) keepTop();
      else if (info.offset.x < -SWIPE_PX) skipTop();
    };

    return (
      <div className="h-full overflow-y-auto overscroll-contain px-4 pb-32 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView("plan")}
            className="inline-flex items-center gap-1 text-[12px] font-bold text-hp-ink"
          >
            <ArrowLeft size={14} />
            {t("Back to my trip")}
          </button>
          <span className="hp-num text-[12px] font-bold text-hp-sunset">
            {t("Kept {n}", { n: kept })}
          </span>
        </div>

        <NearMeBar places={places} />

        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
          {t("Add to")}
        </p>
        <DayPicker days={plan.days} value={targetDay} onChange={setTargetDay} />
        <p className="mb-3 mt-1 text-[10.5px] text-hp-muted">
          {t("{h} of ~{max} hours planned that day", {
            h: dayHours(plan, targetDay, findPlace, findRoute),
            max: FULL_DAY_HOURS,
          })}
        </p>

        <div className="relative">
          <AnimatePresence mode="popLayout">
            {top ? (
              <motion.div
                key={top.id}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.7}
                onDragEnd={onDragEnd}
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                whileDrag={{ rotate: 3 }}
                className="relative h-[min(46dvh,400px)] w-full cursor-grab touch-pan-y overflow-hidden rounded-3xl shadow-[0_18px_36px_-18px_rgba(23,20,17,0.7)] active:cursor-grabbing"
              >
                <ImageBox
                  src={top.imageUrl}
                  alt={top.name}
                  className="absolute inset-0 h-full w-full"
                  rounded="rounded-3xl"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                {(() => {
                  const card = placeSummary(top, language);
                  return (
                    <button
                      type="button"
                      onClick={() => onOpenPlace(top)}
                      className="absolute inset-x-0 bottom-0 p-4 text-left text-hp-on-media"
                    >
                      <span className="block text-[22px] font-black leading-tight [text-shadow:0_2px_10px_rgba(0,0,0,0.5)]">
                        {card.title}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-[12.5px] leading-snug opacity-90">
                        {card.line}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {deckNear && (
                          <span className="rounded-full bg-hp-sea/90 px-2.5 py-1 text-[10.5px] font-bold">
                            {distanceLabel(deckNear[0].km, deckNear[0].minutes, language)}
                          </span>
                        )}
                        {card.facts.slice(0, deckNear ? 2 : 3).map((fact) => (
                          <span
                            key={fact.kind}
                            className="rounded-full bg-white/20 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur"
                          >
                            {fact.label}
                          </span>
                        ))}
                      </span>
                    </button>
                  );
                })()}
              </motion.div>
            ) : (
              <div className="rounded-3xl border border-dashed border-hp-ink/20 p-6 text-center">
                <p className="text-[14px] font-black text-hp-ink">
                  {plan.skipped.length > 0
                    ? t("You skipped {n} places.", { n: plan.skipped.length })
                    : t("You've seen every place. Nice!")}
                </p>
                {plan.skipped.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPlan(resetSkipped(plan))}
                    className="mt-3 rounded-full bg-hp-sunset px-4 py-2 text-[12.5px] font-bold text-hp-on-media"
                  >
                    {t("See them again")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setView("plan")}
                  className="mt-2 block w-full text-[12px] font-bold text-hp-ink/70"
                >
                  {t("Back to my trip")}
                </button>
              </div>
            )}
          </AnimatePresence>
        </div>

        {top && (
          <>
            <div className="mt-5 flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={skipTop}
                aria-label={t("Skip card")}
                className="grid h-14 w-14 place-items-center rounded-full border border-hp-ink/15 bg-hp-paper text-hp-ink shadow-md transition active:scale-90"
              >
                <X size={24} />
              </button>
              <button
                type="button"
                onClick={keepTop}
                aria-label={t("Keep for day {n}", { n: targetDay })}
                className="grid h-16 w-16 place-items-center rounded-full bg-hp-sunset text-hp-on-media shadow-[0_12px_24px_-8px_rgba(224,106,50,0.8)] transition active:scale-90"
              >
                <Heart size={28} fill="currentColor" />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] font-bold text-hp-ink">
              {t("Keep for day {n}", { n: targetDay })}
            </p>
            <p className="mt-2 text-center text-[10.5px] text-hp-muted">
              {t("Swipe right to keep, left to skip · {n} left", { n: deckPlaces.length })}
            </p>
          </>
        )}
      </div>
    );
  }

  // ── 3. Ready-made routes: drop a whole route into a day ──
  if (view === "routes") {
    return (
      <div className="h-full overflow-y-auto overscroll-contain px-4 pb-32 pt-3">
        <button
          type="button"
          onClick={() => setView("plan")}
          className="mb-3 inline-flex items-center gap-1 text-[12px] font-bold text-hp-ink"
        >
          <ArrowLeft size={14} />
          {t("Back to my trip")}
        </button>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
          {t("Add to")}
        </p>
        <DayPicker days={plan.days} value={targetDay} onChange={setTargetDay} />
        <div className="mt-3 flex flex-col gap-2">
          {routes.map((route) => {
            const inPlan = hasItem(plan, "route", route.id);
            return (
              <div key={route.id} className="space-y-1.5">
                <PhotoTile
                  tall={false}
                  imageUrl={route.imageUrl}
                  title={route.title}
                  meta={routeSummary(route, language)
                    .facts.map((f) => f.label)
                    .slice(0, 3)
                    .join(" · ")}
                  onOpen={() => onOpenRoute(route)}
                />
                <button
                  type="button"
                  onClick={() => {
                    setPlan(addItem(plan, { kind: "route", id: route.id, day: targetDay }));
                    setView("plan");
                  }}
                  className={`w-full rounded-full py-2 text-[12px] font-bold ${
                    inPlan ? "border border-hp-ink/15 text-hp-ink" : "bg-hp-ink text-hp-paper"
                  }`}
                >
                  {inPlan
                    ? t("Move to day {n}", { n: targetDay })
                    : t("Add to day {n}", { n: targetDay })}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 4. The plan: one card per day ──
  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pb-32 pt-3">
      <TripHero
        imageUrl={heroUrl}
        title={t("My trip")}
        subtitle={t("{n} days · {m} stops", { n: plan.days, m: plan.items.length })}
      >
        {/* Progress — the "game" part: fill every day. */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-bold">
            <span>{t("{done} of {total} days planned", { done: planned, total: plan.days })}</span>
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPlan(setDays(plan, plan.days - 1))}
                className="grid h-6 w-6 place-items-center rounded-full bg-white/25 backdrop-blur"
                aria-label={t("Fewer days")}
              >
                <Minus size={12} />
              </button>
              <button
                type="button"
                onClick={() => setPlan(setDays(plan, plan.days + 1))}
                className="grid h-6 w-6 place-items-center rounded-full bg-white/25 backdrop-blur"
                aria-label={t("More days")}
              >
                <Plus size={12} />
              </button>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/30">
            <motion.div
              className="h-full rounded-full bg-hp-sunset"
              initial={false}
              animate={{ width: `${(planned / plan.days) * 100}%` }}
            />
          </div>
          {planned === plan.days && (
            <p className="mt-1.5 text-[11.5px] font-black">{t("All set!")}</p>
          )}
        </div>
      </TripHero>

      <div className="mb-5 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={openDeck}
          className="flex min-h-[96px] flex-col items-start justify-between rounded-3xl bg-gradient-to-br from-hp-sunset to-amber-500 p-3.5 text-left text-hp-on-media shadow-[0_12px_24px_-14px_rgba(224,106,50,0.9)] transition active:scale-[0.98]"
        >
          <Layers size={22} />
          <span>
            <span className="block text-[14px] font-black">{t("Pick with cards")}</span>
            <span className="block text-[10.5px] font-semibold opacity-90">
              {t("Keep or skip, one by one")}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={openRoutes}
          className="flex min-h-[96px] flex-col items-start justify-between rounded-3xl bg-gradient-to-br from-hp-sea to-hp-deep p-3.5 text-left text-hp-on-media shadow-[0_12px_24px_-14px_rgba(14,58,91,0.9)] transition active:scale-[0.98]"
        >
          <RouteIcon size={22} />
          <span>
            <span className="block text-[14px] font-black">{t("Ready-made routes")}</span>
            <span className="block text-[10.5px] font-semibold opacity-90">
              {t("A whole day, done for you")}
            </span>
          </span>
        </button>
      </div>

      <div className="hp-stagger flex flex-col gap-3">
        {Array.from({ length: plan.days }, (_, i) => i + 1).map((day) => {
          const items = dayItems(plan, day);
          const hours = dayHours(plan, day, findPlace, findRoute);
          const full = hours > FULL_DAY_HOURS;
          return (
            <section
              key={day}
              className="hp-card-lift rounded-3xl border border-hp-ink/10 bg-hp-paper p-3.5"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[14px] font-black text-hp-ink">
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-[12px] text-hp-on-media ${dayColor(day)}`}
                  >
                    {day}
                  </span>
                  {t("Day {n}", { n: day })}
                </h3>
                {items.length > 0 && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10.5px] font-bold ${full ? "text-hp-sunset" : "text-hp-muted"}`}
                  >
                    {full && <AlertTriangle size={11} />}
                    {full
                      ? t("~{h} h — a lot for one day", { h: hours })
                      : t("~{h} h", { h: hours })}
                  </span>
                )}
              </div>
              {items.length === 0 ? (
                <p className="text-[12px] text-hp-muted">
                  {t("Nothing yet — add a card or a route.")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {items.map((item) => {
                    const place = item.kind === "place" ? findPlace(item.id) : undefined;
                    const route = item.kind === "route" ? findRoute(item.id) : undefined;
                    if (!place && !route) return null;
                    const title = place
                      ? language === "GR"
                        ? place.greekName || place.name
                        : place.name
                      : route!.title;
                    return (
                      <li
                        key={`${item.kind}:${item.id}`}
                        className="flex items-center gap-2 rounded-xl bg-hp-ink/5 p-1.5 pr-2"
                      >
                        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg">
                          <ImageBox
                            src={place?.imageUrl ?? route?.imageUrl ?? ""}
                            alt=""
                            className="h-full w-full"
                            rounded="rounded-lg"
                          />
                          {item.kind === "route" && (
                            <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-hp-sunset text-hp-on-media">
                              <RouteIcon size={9} />
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => (place ? onOpenPlace(place) : onOpenRoute(route!))}
                          className="min-w-0 flex-1 truncate text-left text-[12.5px] font-bold text-hp-ink"
                        >
                          {title}
                        </button>
                        <span className="hp-num shrink-0 text-[10.5px] text-hp-muted">
                          {t("~{h} h", { h: itemHours(item, findPlace, findRoute) })}
                        </span>
                        {/* A small visible pill with the native picker laid
                            invisibly on top: the app keeps form controls at
                            16px so iOS does not zoom, which made a bare
                            <select> far too big for this row. */}
                        <span className="relative inline-flex shrink-0 items-center gap-0.5 rounded-full border border-hp-ink/15 bg-hp-paper px-2 py-0.5 text-[10.5px] font-bold text-hp-ink">
                          <CalendarDays size={11} />
                          {item.day}
                          <select
                            value={item.day}
                            onChange={(e) =>
                              setPlan(moveItem(plan, item.kind, item.id, Number(e.target.value)))
                            }
                            aria-label={t("Move to another day")}
                            className="absolute inset-0 cursor-pointer opacity-0"
                          >
                            {Array.from({ length: plan.days }, (_, j) => j + 1).map((d) => (
                              <option key={d} value={d}>
                                {t("Day {n}", { n: d })}
                              </option>
                            ))}
                          </select>
                        </span>
                        <button
                          type="button"
                          onClick={() => setPlan(removeItem(plan, item.kind, item.id))}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-hp-muted"
                          aria-label={t("Remove from trip")}
                        >
                          <X size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <PracticalTiles
        showDrafts={showDrafts}
        seeImage={heroUrl}
        onOpenEssentials={onOpenEssentials}
        onOpenQuickLook={onOpenQuickLook}
      />

      <div className="mt-6 text-center">
        {confirmReset ? (
          <div className="inline-flex items-center gap-2">
            <span className="text-[12px] text-hp-ink">{t("Delete this trip?")}</span>
            <button
              type="button"
              onClick={() => {
                setPlan(null);
                setConfirmReset(false);
              }}
              className={chip(true)}
            >
              {t("Yes, start over")}
            </button>
            <button type="button" onClick={() => setConfirmReset(false)} className={chip(false)}>
              {t("Cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-1 text-[11.5px] font-bold text-hp-muted"
          >
            <RotateCcw size={12} />
            {t("Start a new trip")}
          </button>
        )}
        <p className="mt-2 text-[10.5px] text-hp-muted">
          {t("Your trip is saved on this phone only.")}
        </p>
      </div>
    </div>
  );
}

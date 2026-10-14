import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
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
  createPlan,
  dayHours,
  dayItems,
  deck,
  hasItem,
  itemHours,
  loadPlan,
  moveItem,
  plannedDayCount,
  removeItem,
  savePlan,
  setDays,
  skip,
  suggestDay,
  type TripPlan,
} from "@/lib/hp/trip-plan";
import {
  ESSENTIALS_CARDS,
  ESSENTIALS_SECTIONS,
  sectionCounts,
  type EssentialsSectionId,
} from "@/lib/hp/essentials";
import { SECTION_ICONS } from "./essentials-icons";
import { SummaryCardButton } from "./QuickLookScreen";

// Region is fixed until a second one exists (docs/TOURIST_STAY_PACK.md).
const REGION = "ilia";

/** "Practical info" — the always-there part of the Trip tab. */
function PracticalTiles({
  showDrafts,
  onOpenEssentials,
  onOpenQuickLook,
}: Pick<Props, "showDrafts" | "onOpenEssentials" | "onOpenQuickLook">) {
  const { language, t } = useI18n();
  const counts = sectionCounts(ESSENTIALS_CARDS, REGION, showDrafts);
  return (
    <section className="mt-6">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-hp-muted">
        {t("Good to know")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {ESSENTIALS_SECTIONS.map((section) => {
          const Icon = SECTION_ICONS[section.id];
          const isSee = section.id === "see";
          const ready = isSee || counts[section.id] > 0;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => (isSee ? onOpenQuickLook() : onOpenEssentials(section.id))}
              className="hp-card-lift flex flex-col items-start gap-1 rounded-2xl border border-hp-ink/10 bg-hp-paper p-3 text-left transition active:scale-[0.99]"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-hp-sunset/12 text-hp-sunset">
                <Icon size={15} />
              </span>
              <span className="text-[12.5px] font-black leading-tight text-hp-ink">
                {isSee ? t("Quick look at every place") : section.title[language]}
              </span>
              <span className="text-[10.5px] text-hp-muted">
                {ready
                  ? isSee
                    ? t("Places and routes in two lines each")
                    : t("{n} cards", { n: counts[section.id] })
                  : t("Coming soon")}
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
                ? "border-hp-sunset bg-hp-sunset text-hp-paper"
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
  const [plan, setPlan] = useState<TripPlan | null>(() =>
    typeof window === "undefined" ? null : loadPlan(),
  );
  const [view, setView] = useState<View>("plan");
  const [draftDays, setDraftDays] = useState(5);
  const [targetDay, setTargetDay] = useState(1);
  const [kept, setKept] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => savePlan(plan), [plan]);

  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const routeById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  const findPlace = useCallback((id: string) => placeById.get(id), [placeById]);
  const findRoute = useCallback((id: string) => routeById.get(id), [routeById]);

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
        <header className="mb-6">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-hp-muted">
            {t("Plan your stay")}
          </p>
          <h2 className="mt-1 text-3xl font-black leading-none text-hp-ink">{t("My trip")}</h2>
          <div className="mt-1.5 h-[1.5px] bg-hp-ink" />
        </header>
        <div className="hp-card-lift rounded-3xl border border-hp-ink/10 bg-hp-paper p-5 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-hp-sunset text-hp-paper">
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
            className="mt-5 w-full rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper"
          >
            {t("Start planning")}
          </button>
          <p className="mt-3 text-[10.5px] leading-snug text-hp-muted">
            {t("Your trip is saved on this phone only.")}
          </p>
        </div>
        <PracticalTiles
          showDrafts={showDrafts}
          onOpenEssentials={onOpenEssentials}
          onOpenQuickLook={onOpenQuickLook}
        />
      </div>
    );
  }

  const deckPlaces = deck(plan, places);
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

        <div className="relative min-h-[220px]">
          <AnimatePresence mode="popLayout">
            {top ? (
              <motion.div
                key={top.id}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.7}
                onDragEnd={onDragEnd}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileDrag={{ rotate: 2 }}
                className="cursor-grab touch-pan-y active:cursor-grabbing"
              >
                <SummaryCardButton
                  card={placeSummary(top, language)}
                  onOpen={() => onOpenPlace(top)}
                />
              </motion.div>
            ) : (
              <div className="rounded-2xl border border-dashed border-hp-ink/20 p-6 text-center text-[12.5px] text-hp-muted">
                {t("You've seen every place. Nice!")}
              </div>
            )}
          </AnimatePresence>
        </div>

        {top && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={skipTop}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-hp-ink/15 py-3 text-[13px] font-bold text-hp-ink"
              >
                <X size={15} />
                {t("Skip card")}
              </button>
              <button
                type="button"
                onClick={keepTop}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper"
              >
                <Check size={15} />
                {t("Keep for day {n}", { n: targetDay })}
              </button>
            </div>
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
                <SummaryCardButton
                  card={routeSummary(route, language)}
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
      <header className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-hp-muted">
          {t("Plan your stay")}
        </p>
        <div className="mt-1 flex items-end justify-between">
          <h2 className="text-3xl font-black leading-none text-hp-ink">{t("My trip")}</h2>
          <div className="flex items-center gap-1.5 pb-0.5">
            <button
              type="button"
              onClick={() => setPlan(setDays(plan, plan.days - 1))}
              className="grid h-7 w-7 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
              aria-label={t("Fewer days")}
            >
              <Minus size={13} />
            </button>
            <span className="hp-num text-[13px] font-bold text-hp-ink">
              {t("{n} days", { n: plan.days })}
            </span>
            <button
              type="button"
              onClick={() => setPlan(setDays(plan, plan.days + 1))}
              className="grid h-7 w-7 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
              aria-label={t("More days")}
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
        <div className="mt-1.5 h-[1.5px] bg-hp-ink" />
      </header>

      {/* Progress — the "game" part: fill every day. */}
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-[11px] font-bold">
          <span className="text-hp-ink">
            {t("{done} of {total} days planned", { done: planned, total: plan.days })}
          </span>
          {planned === plan.days && <span className="text-hp-olive">{t("All set!")}</span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-hp-ink/10">
          <motion.div
            className="h-full rounded-full bg-hp-sunset"
            initial={false}
            animate={{ width: `${(planned / plan.days) * 100}%` }}
          />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={openDeck}
          className="hp-card-lift flex flex-col items-start gap-1 rounded-2xl border border-hp-sunset/25 bg-hp-sunset/10 p-3 text-left"
        >
          <Layers size={18} className="text-hp-sunset" />
          <span className="text-[13px] font-black text-hp-ink">{t("Pick with cards")}</span>
          <span className="text-[10.5px] text-hp-muted">{t("Keep or skip, one by one")}</span>
        </button>
        <button
          type="button"
          onClick={openRoutes}
          className="hp-card-lift flex flex-col items-start gap-1 rounded-2xl border border-hp-ink/10 bg-hp-paper p-3 text-left"
        >
          <RouteIcon size={18} className="text-hp-deep" />
          <span className="text-[13px] font-black text-hp-ink">{t("Ready-made routes")}</span>
          <span className="text-[10.5px] text-hp-muted">{t("A whole day, done for you")}</span>
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
              className="hp-card-lift rounded-2xl border border-hp-ink/10 bg-hp-paper p-3.5"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[14px] font-black text-hp-ink">{t("Day {n}", { n: day })}</h3>
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
                        className="flex items-center gap-2 rounded-xl bg-hp-ink/5 px-2.5 py-2"
                      >
                        {item.kind === "route" && (
                          <RouteIcon size={13} className="shrink-0 text-hp-sunset" />
                        )}
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

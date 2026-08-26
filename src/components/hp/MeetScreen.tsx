import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarHeart,
  Dumbbell,
  Music2,
  Plus,
  Sparkles,
  Sun,
  Users,
  Utensils,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { Place } from "@/lib/hp-model";
import {
  MEET_CATEGORIES,
  type MeetCategory,
  type MeetEvent,
  type RsvpStatus,
} from "@/lib/hp/meet-types";
import { EventCard } from "./EventCard";
import { useLang } from "@/lib/hp/language-context";
import { MEET_CATEGORY_LABELS, MEET_SCREEN_STRINGS, mineChipLabel } from "@/lib/hp/meet-strings";

type Filter = "all" | "mine" | MeetCategory;

const CATEGORY_ICONS: Record<MeetCategory, LucideIcon> = {
  panigyri: CalendarHeart,
  beach: Waves,
  music: Music2,
  sunset: Sun,
  sport: Dumbbell,
  cleanup: Sparkles,
  food: Utensils,
  social: Users,
};

interface Props {
  events: MeetEvent[];
  rsvp: Record<string, RsvpStatus>;
  findPlace: (id: string) => Place | undefined;
  onToggleRsvp: (event: MeetEvent, next: RsvpStatus) => void;
  onOpenPlace: (placeId: string) => void;
  onCreate: () => void;
}

export function MeetScreen({
  events,
  rsvp,
  findPlace,
  onToggleRsvp,
  onOpenPlace,
  onCreate,
}: Props) {
  const { lang } = useLang();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const now = Date.now();
    return events
      .filter((e) => +new Date(e.happensAt) >= now - 60 * 60 * 1000) // hide long-past
      .filter((e) => {
        if (filter === "all") return true;
        if (filter === "mine") return rsvp[e.id] === "going" || rsvp[e.id] === "maybe";
        return e.category === filter;
      })
      .sort((a, b) => +new Date(a.happensAt) - +new Date(b.happensAt));
  }, [events, filter, rsvp]);

  const mineCount = events.filter((e) => rsvp[e.id]).length;

  const chips: { id: Filter; label: string; Icon?: LucideIcon }[] = [
    { id: "all", label: MEET_SCREEN_STRINGS.all[lang] },
    { id: "mine", label: mineChipLabel(lang, mineCount) },
    ...MEET_CATEGORIES.map((c) => ({
      id: c as Filter,
      label: MEET_CATEGORY_LABELS[c][lang],
      Icon: CATEGORY_ICONS[c],
    })),
  ];

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto overscroll-contain px-4 pb-32 pt-3">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-hp-sunset/15 text-hp-sunset">
            <CalendarHeart size={18} />
          </span>
          <div>
            <h2 className="text-2xl font-black leading-none text-hp-ink">
              {MEET_SCREEN_STRINGS.title[lang]}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-hp-muted">{MEET_SCREEN_STRINGS.subtitle[lang]}</p>
          </div>
        </div>

        {/* Filter chips */}
        <div className="hp-no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4">
          {chips.map((c) => {
            const active = filter === c.id;
            const Icon = c.Icon;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilter(c.id)}
                aria-pressed={active}
                className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition active:scale-95 ${
                  active
                    ? "bg-hp-ink text-hp-paper"
                    : "border border-hp-ink/10 bg-hp-paper text-hp-ink/70"
                }`}
              >
                {Icon ? <Icon size={12} strokeWidth={2.6} /> : null}
                {c.label}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-hp-ink/15 bg-hp-paper/60 p-8 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-hp-sunset/10 text-hp-sunset">
              <Sparkles size={20} />
            </div>
            <h3 className="text-[15px] font-bold text-hp-ink">
              {filter === "mine" ? MEET_SCREEN_STRINGS.emptyMineTitle[lang] : MEET_SCREEN_STRINGS.emptyAllTitle[lang]}
            </h3>
            <p className="mx-auto mt-1 max-w-[16rem] text-[12px] text-hp-muted">
              {filter === "mine" ? MEET_SCREEN_STRINGS.emptyMineHelper[lang] : MEET_SCREEN_STRINGS.emptyAllHelper[lang]}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <AnimatePresence initial={false}>
              {filtered.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  placeName={findPlace(event.placeId)?.name ?? "Ilia"}
                  status={rsvp[event.id] ?? null}
                  onToggle={onToggleRsvp}
                  onOpenPlace={onOpenPlace}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Host FAB */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        initial={{ opacity: 0, scale: 0.86, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={onCreate}
        className="absolute right-4 bottom-3 z-40 inline-flex items-center gap-1.5 rounded-full bg-hp-sunset px-4 py-3 text-hp-paper shadow-[0_12px_28px_rgba(224,106,50,0.45)]"
        aria-label={MEET_SCREEN_STRINGS.hostAGathering[lang]}
      >
        <Plus size={18} strokeWidth={2.6} />
        <span className="text-[13px] font-black">{MEET_SCREEN_STRINGS.host[lang]}</span>
      </motion.button>
    </div>
  );
}

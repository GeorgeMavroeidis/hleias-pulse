import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Drama, Music2, PartyPopper, Plus, Sparkles, Ticket, type LucideIcon } from "lucide-react";
import {
  CULTURAL_EVENTS_STRINGS,
  CULTURAL_EVENT_TYPES,
  CULTURAL_EVENT_TYPE_META,
  tr,
  isEventPast,
  type CulturalEvent,
  type CulturalEventType,
  type Lang,
} from "@/lib/hp/cultural-events-types";
import { CulturalEventCard } from "./CulturalEventCard";

type Filter = "upcoming" | "past" | CulturalEventType;

const TYPE_ICONS: Record<CulturalEventType, LucideIcon> = {
  theater: Drama,
  concert: Music2,
  festival: PartyPopper,
  other: Sparkles,
};

interface Props {
  events: CulturalEvent[];
  lang: Lang;
  onOpenDetail: (event: CulturalEvent) => void;
  canCreate: boolean;
  onCreate: () => void;
}

export function CulturalEventsScreen({ events, lang, onOpenDetail, canCreate, onCreate }: Props) {
  const [filter, setFilter] = useState<Filter>("upcoming");
  const s = CULTURAL_EVENTS_STRINGS;

  const filtered = useMemo(() => {
    return events
      .filter((e) => {
        if (filter === "upcoming") return !isEventPast(e);
        if (filter === "past") return isEventPast(e);
        return e.eventType === filter;
      })
      .sort((a, b) =>
        filter === "past"
          ? +new Date(b.eventDate) - +new Date(a.eventDate)
          : +new Date(a.eventDate) - +new Date(b.eventDate),
      );
  }, [events, filter]);

  const chips: { id: Filter; label: string; Icon?: LucideIcon }[] = [
    { id: "upcoming", label: tr(lang, s.upcoming) },
    { id: "past", label: tr(lang, s.past) },
    ...CULTURAL_EVENT_TYPES.map((type) => ({
      id: type as Filter,
      label: tr(lang, CULTURAL_EVENT_TYPE_META[type].label),
      Icon: TYPE_ICONS[type],
    })),
  ];

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto overscroll-contain px-4 pb-32 pt-3">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-hp-sunset/15 text-hp-sunset">
            <Ticket size={18} />
          </span>
          <div>
            <h2 className="text-2xl font-black leading-none text-hp-ink">
              {tr(lang, s.screenTitle)}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-hp-muted">{tr(lang, s.screenSubtitle)}</p>
          </div>
        </div>

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
            <h3 className="text-[15px] font-bold text-hp-ink">{tr(lang, s.emptyTitle)}</h3>
            <p className="mx-auto mt-1 max-w-[16rem] text-[12px] text-hp-muted">
              {tr(lang, s.emptyBody)}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <AnimatePresence initial={false}>
              {filtered.map((event) => (
                <CulturalEventCard
                  key={event.id}
                  event={event}
                  lang={lang}
                  onOpenDetail={onOpenDetail}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {canCreate && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          initial={{ opacity: 0, scale: 0.86, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          onClick={onCreate}
          className="absolute right-4 bottom-3 z-40 inline-flex items-center gap-1.5 rounded-full bg-hp-sunset px-4 py-3 text-hp-paper shadow-[0_12px_28px_rgba(224,106,50,0.45)]"
          aria-label={tr(lang, s.addEventAria)}
        >
          <Plus size={18} strokeWidth={2.6} />
          <span className="text-[13px] font-black">{tr(lang, s.addEvent)}</span>
        </motion.button>
      )}
    </div>
  );
}

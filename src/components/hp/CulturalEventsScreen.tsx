import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Drama, Music2, PartyPopper, Plus, Sparkles, type LucideIcon } from "lucide-react";
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
import { useModeration } from "./use-moderation";

type Filter = "upcoming" | "past" | CulturalEventType;

const TYPE_ICONS: Record<CulturalEventType, LucideIcon> = {
  theater: Drama,
  concert: Music2,
  festival: PartyPopper,
  other: Sparkles,
};

interface Props {
  nowMs?: number;
  events: CulturalEvent[];
  lang: Lang;
  onOpenDetail: (event: CulturalEvent) => void;
  canCreate: boolean;
  onCreate: () => void;
}

export function CulturalEventsScreen({
  events,
  lang,
  onOpenDetail,
  canCreate,
  onCreate,
  nowMs = Date.now(),
}: Props) {
  const [filter, setFilter] = useState<Filter>("upcoming");
  const moderation = useModeration();
  const s = CULTURAL_EVENTS_STRINGS;

  const filtered = useMemo(() => {
    return events
      .filter((e) => {
        // Blocked organisers are filtered server-side; muted ones are hidden here.
        if (moderation.isHidden(e.userId)) return false;
        if (filter === "upcoming") return !isEventPast(e, nowMs);
        if (filter === "past") return isEventPast(e, nowMs);
        return e.eventType === filter;
      })
      .sort((a, b) =>
        filter === "past"
          ? +new Date(b.eventDate) - +new Date(a.eventDate)
          : +new Date(a.eventDate) - +new Date(b.eventDate),
      );
  }, [events, filter, moderation, nowMs]);

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
      <div className="h-full overflow-y-auto overscroll-contain px-4 pb-32 pt-4">
        <div className="hp-pill-row mb-5">
          {chips.map((c) => {
            const Icon = c.Icon;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilter(c.id)}
                aria-pressed={filter === c.id}
                className="hp-pill"
              >
                {Icon ? <Icon size={14} strokeWidth={2.2} aria-hidden="true" /> : null}
                {c.label}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="fd-empty">
            <span className="fd-empty__icon" aria-hidden="true">
              <Sparkles size={22} strokeWidth={1.9} />
            </span>
            <strong>{tr(lang, s.emptyTitle)}</strong>
            <p>{tr(lang, s.emptyBody)}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <AnimatePresence initial={false}>
              {filtered.map((event) => (
                <CulturalEventCard
                  nowMs={nowMs}
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

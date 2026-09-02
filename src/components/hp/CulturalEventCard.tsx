import { motion } from "framer-motion";
import { format, isToday, isTomorrow } from "date-fns";
import {
  BadgeCheck,
  Clock,
  Drama,
  ExternalLink,
  MapPin,
  Music2,
  PartyPopper,
  Sparkles,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import {
  CULTURAL_EVENTS_STRINGS,
  CULTURAL_EVENT_TYPE_META,
  tr,
  isEventPast,
  type CulturalEvent,
  type CulturalEventType,
  type Lang,
} from "@/lib/hp/cultural-events-types";
import { ImageBox } from "./ImageBox";

const TYPE_ICONS: Record<CulturalEventType, LucideIcon> = {
  theater: Drama,
  concert: Music2,
  festival: PartyPopper,
  other: Sparkles,
};

interface Props {
  event: CulturalEvent;
  lang: Lang;
  onOpenDetail: (event: CulturalEvent) => void;
}

function formatWhen(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const time = format(d, "HH:mm");
  if (isToday(d)) return `${tr(lang, CULTURAL_EVENTS_STRINGS.today)} · ${time}`;
  if (isTomorrow(d)) return `${tr(lang, CULTURAL_EVENTS_STRINGS.tomorrow)} · ${time}`;
  return `${format(d, "EEE d MMM yyyy")} · ${time}`;
}

export function CulturalEventCard({ event, lang, onOpenDetail }: Props) {
  const meta = CULTURAL_EVENT_TYPE_META[event.eventType];
  const TypeIcon = TYPE_ICONS[event.eventType];
  const hasTicketUrl = Boolean(event.ticketUrl);
  const past = isEventPast(event);
  const title = lang === "EN" ? event.title : event.greekTitle;
  const description =
    lang === "EN" ? (event.descriptionEn ?? event.descriptionEl) : event.descriptionEl;
  const s = CULTURAL_EVENTS_STRINGS;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className={`overflow-hidden rounded-3xl border border-hp-ink/10 bg-hp-paper text-left shadow-[0_8px_22px_rgba(23,20,17,0.07)] transition active:scale-[0.99] ${
        past ? "opacity-70 grayscale-[0.3]" : ""
      }`}
      onClick={() => onOpenDetail(event)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpenDetail(event);
      }}
      aria-label={`${tr(lang, s.openCard)} ${title}`}
    >
      <div className="relative block w-full text-left">
        <div className="relative h-36 w-full">
          <ImageBox
            src={event.posterUrl}
            alt={title}
            className="h-full w-full"
            rounded="rounded-none"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/12 to-transparent" />
        </div>
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide text-hp-paper shadow"
            style={{ background: meta.tone }}
          >
            <TypeIcon size={10} strokeWidth={2.6} /> {tr(lang, meta.label)}
          </span>
          {past && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-hp-ink/70 px-1.5 py-1 text-[9px] font-black uppercase tracking-wide text-hp-paper shadow">
              {tr(lang, s.completed)}
            </span>
          )}
        </div>
        <div className="absolute bottom-2 left-3 right-3 text-hp-paper">
          <h3 className="text-[16px] font-black leading-tight drop-shadow-sm">{title}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] font-bold text-hp-paper/85">
            <MapPin size={10} /> {event.venueName} · {event.area}
          </div>
        </div>
      </div>

      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          {event.isOfficial ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-hp-sea/15 px-2 py-1 text-[10.5px] font-bold text-hp-deep">
              <BadgeCheck size={12} /> {tr(lang, s.officialEvent)} · {event.organizerName}
            </span>
          ) : (
            <span className="text-[11px] font-bold text-hp-muted">{event.organizerName}</span>
          )}
          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-hp-deep">
            <Clock size={11} /> {formatWhen(event.eventDate, lang)}
          </span>
        </div>

        <p className="mt-2 line-clamp-2 text-[12.5px] text-hp-ink/80">{description}</p>

        <div className="mt-2.5">
          {hasTicketUrl ? (
            <a
              href={event.ticketUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-1.5 rounded-full bg-hp-ink py-2.5 text-[12.5px] font-black text-hp-paper transition active:scale-[0.97]"
            >
              <Ticket size={14} /> {tr(lang, s.buyTickets)} <ExternalLink size={12} />
            </a>
          ) : (
            <button
              type="button"
              disabled
              onClick={(e) => e.stopPropagation()}
              className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-full border-2 border-hp-ink/10 py-2.5 text-[12.5px] font-black text-hp-muted"
            >
              {tr(lang, s.comingSoon)}
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}

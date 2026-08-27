import { useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format, isToday, isTomorrow } from "date-fns";
import {
  BadgeCheck,
  Clock,
  Drama,
  ExternalLink,
  Heart,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Music2,
  PartyPopper,
  Send,
  Sparkles,
  Ticket,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Comment } from "@/lib/hp-model";
import {
  CULTURAL_EVENTS_STRINGS,
  CULTURAL_EVENT_TYPE_META,
  tr,
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

function formatWhen(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const time = format(d, "HH:mm");
  if (isToday(d)) return `${tr(lang, CULTURAL_EVENTS_STRINGS.today)} · ${time}`;
  if (isTomorrow(d)) return `${tr(lang, CULTURAL_EVENTS_STRINGS.tomorrow)} · ${time}`;
  return `${format(d, "EEE d MMM yyyy")} · ${time}`;
}

interface Props {
  event: CulturalEvent | null;
  lang: Lang;
  onClose: () => void;
  onOpenMap: (placeId: string) => void;
  onLike: () => void;
  liked: boolean;
  likeCount: number;
  comments: Comment[];
  onComment: (text: string) => void;
}

export function CulturalEventDetailModal({
  event,
  lang,
  onClose,
  onOpenMap,
  onLike,
  liked,
  likeCount,
  comments,
  onComment,
}: Props) {
  const [text, setText] = useState("");
  const s = CULTURAL_EVENTS_STRINGS;

  return (
    <AnimatePresence>
      {event &&
        (() => {
          const meta = CULTURAL_EVENT_TYPE_META[event.eventType];
          const TypeIcon = TYPE_ICONS[event.eventType];
          const title = lang === "EN" ? event.title : event.greekTitle;
          const description =
            lang === "EN" ? (event.descriptionEn ?? event.descriptionEl) : event.descriptionEl;
          const hasTicketUrl = Boolean(event.ticketUrl);

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[80] overflow-hidden"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/65"
                onClick={onClose}
                aria-label={tr(lang, s.close)}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 240 }}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="hp-fullscreen-modal absolute inset-x-0 bottom-0 flex w-full max-w-full flex-col overflow-hidden bg-hp-paper"
              >
                <div className="relative">
                  <ImageBox
                    src={event.posterUrl}
                    alt={title}
                    className="h-64 w-full"
                    rounded="rounded-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent" />
                  <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-hp-paper/95 text-hp-ink"
                    aria-label={tr(lang, s.close)}
                  >
                    <X size={16} />
                  </button>
                  <div className="absolute left-3 top-3 flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide text-hp-paper shadow"
                      style={{ background: meta.tone }}
                    >
                      <TypeIcon size={10} strokeWidth={2.6} /> {tr(lang, meta.label)}
                    </span>
                    {event.isPastEvent && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-hp-ink/70 px-1.5 py-1 text-[9px] font-black uppercase tracking-wide text-hp-paper shadow">
                        {tr(lang, s.completed)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-3">
                  <h2 className="text-[19px] font-black leading-tight text-hp-ink">{title}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-hp-ink/70">
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} /> {event.venueName} · {event.area}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} /> {formatWhen(event.eventDate, lang)}
                    </span>
                  </div>

                  {event.isOfficial ? (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-hp-sea/15 px-2 py-1 text-[10.5px] font-bold text-hp-deep">
                      <BadgeCheck size={12} /> {tr(lang, s.officialEvent)} · {event.organizerName}
                    </span>
                  ) : (
                    <div className="mt-2 text-[11px] font-bold text-hp-muted">
                      {event.organizerName}
                    </div>
                  )}

                  <p className="mt-3 text-[14px] leading-snug text-hp-ink">{description}</p>

                  <div className="mt-3 flex items-center gap-3 text-[12px] text-hp-ink/70">
                    <button
                      type="button"
                      onClick={onLike}
                      className={`inline-flex items-center gap-1 ${liked ? "text-hp-sunset" : ""}`}
                      aria-label={liked ? tr(lang, s.unlike) : tr(lang, s.like)}
                    >
                      <Heart size={16} fill={liked ? "currentColor" : "none"} /> {likeCount}
                    </button>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle size={16} /> {comments.length}
                    </span>
                  </div>

                  <div className="mt-4 border-t border-hp-ink/10 pt-3">
                    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-hp-muted">
                      {tr(lang, s.comments)}
                    </h4>
                    <div className="flex flex-col gap-2">
                      {comments.map((c, i) => (
                        <div key={i} className="rounded-2xl bg-hp-ink/5 px-3 py-2 text-[12px]">
                          <span className="font-bold text-hp-ink">{c.author}</span>{" "}
                          <span className="text-hp-ink/80">{c.text}</span>
                        </div>
                      ))}
                      {comments.length === 0 && (
                        <div className="text-[12px] text-hp-muted">{tr(lang, s.firstComment)}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="absolute inset-x-0 bottom-0 border-t border-hp-ink/10 bg-hp-paper/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
                  <div className="mb-2 flex items-center gap-2 rounded-full border border-hp-ink/10 bg-white/70 px-3 py-2">
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      name={`cultural-event-comment-${event.id}`}
                      aria-label={tr(lang, s.quickComment)}
                      autoComplete="off"
                      placeholder={tr(lang, s.quickComment)}
                      className="w-full bg-transparent text-[12px] outline-none placeholder:text-hp-muted"
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter" && text.trim()) {
                          onComment(text.trim());
                          setText("");
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (text.trim()) {
                          onComment(text.trim());
                          setText("");
                        }
                      }}
                      className="grid h-7 w-7 place-items-center rounded-full bg-hp-ink text-hp-paper disabled:opacity-40"
                      disabled={!text.trim()}
                      aria-label={tr(lang, s.postComment)}
                    >
                      <Send size={12} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {hasTicketUrl ? (
                      <a
                        href={event.ticketUrl ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-hp-ink py-2.5 text-[12px] font-bold text-hp-paper"
                      >
                        <Ticket size={13} /> {tr(lang, s.buyTickets)} <ExternalLink size={12} />
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-full border-2 border-hp-ink/10 py-2.5 text-[12px] font-bold text-hp-muted"
                      >
                        {tr(lang, s.comingSoon)}
                      </button>
                    )}
                    {event.placeId && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenMap(event.placeId as string);
                        }}
                        className="grid h-10 w-10 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
                        aria-label={tr(lang, s.openOnMap)}
                      >
                        <MapIcon size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
    </AnimatePresence>
  );
}

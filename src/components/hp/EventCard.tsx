import { motion } from "framer-motion";
import { format, isToday, isTomorrow } from "date-fns";
import {
  CalendarHeart,
  Check,
  Clock,
  Dumbbell,
  Flame,
  MapPin,
  Music2,
  Sparkles,
  Sun,
  Users,
  Utensils,
  Waves,
  type LucideIcon,
} from "lucide-react";
import {
  MEET_CATEGORY_META,
  type MeetCategory,
  type MeetEvent,
  type RsvpStatus,
} from "@/lib/hp/meet-types";
import { ImageBox } from "./ImageBox";
import { ContentMenu } from "./ContentMenu";
import { useI18n, type AppLanguage } from "@/lib/i18n";

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
  event: MeetEvent;
  placeName: string;
  status: RsvpStatus | null;
  onToggle: (event: MeetEvent, next: RsvpStatus) => void;
  onOpenPlace: (placeId: string) => void;
}

function formatWhen(iso: string, language: AppLanguage): string {
  const d = new Date(iso);
  const time = format(d, "HH:mm");
  if (isToday(d)) return `${language === "GR" ? "Σήμερα" : "Today"} · ${time}`;
  if (isTomorrow(d)) return `${language === "GR" ? "Αύριο" : "Tomorrow"} · ${time}`;
  return `${new Intl.DateTimeFormat(language === "GR" ? "el-GR" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d)} · ${time}`;
}

export function EventCard({ event, placeName, status, onToggle, onOpenPlace }: Props) {
  const { language, t } = useI18n();
  const meta = MEET_CATEGORY_META[event.category];
  const CategoryIcon = CATEGORY_ICONS[event.category];
  const goingDisplay = event.going;
  const isGoing = status === "going";
  const isMaybe = status === "maybe";
  const capacityPct = event.capacity ? Math.min(1, goingDisplay / event.capacity) : null;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-3xl border border-hp-ink/10 bg-hp-paper shadow-[0_8px_22px_rgba(23,20,17,0.07)]"
    >
      <button
        type="button"
        onClick={() => onOpenPlace(event.placeId)}
        className="relative block w-full text-left"
        aria-label={
          language === "GR" ? `Άνοιγμα ${placeName} στον χάρτη` : `Open ${placeName} on the map`
        }
      >
        <div className="relative h-32 w-full">
          <ImageBox
            src={event.coverUrl}
            alt={event.title}
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
            <CategoryIcon size={10} strokeWidth={2.6} /> {t(meta.label)}
          </span>
          {event.hot && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-hp-sunset px-1.5 py-1 text-[9px] font-black uppercase tracking-wide text-hp-paper shadow">
              <Flame size={9} /> Hot
            </span>
          )}
        </div>
        <div className="absolute bottom-2 left-3 right-3 text-hp-paper">
          <h3 className="text-[16px] font-black leading-tight drop-shadow-sm">{event.title}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] font-bold text-hp-paper/85">
            <MapPin size={10} /> {placeName}
          </div>
        </div>
      </button>

      <div className="px-3 py-2.5">
        {/* Host + time row */}
        <div className="flex items-center gap-2">
          <img
            src={event.hostAvatar}
            alt={event.hostName}
            className="h-6 w-6 rounded-full border border-hp-ink/10 object-cover"
            loading="lazy"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11.5px] font-bold text-hp-ink">
              {event.hostName}{" "}
              <span className="font-semibold text-hp-muted">· {event.hostType.toLowerCase()}</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-hp-deep">
            <Clock size={11} /> {formatWhen(event.happensAt, language)}
          </span>
          <ContentMenu
            className="-my-1 -mr-1"
            target={{
              type: "meet_event",
              id: event.id,
              authorUserId: event.userId,
              authorName: event.hostName,
              authorAvatarUrl: event.hostAvatar,
              summary: event.title,
            }}
          />
        </div>

        {/* Social proof */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex -space-x-2">
            {event.attendeeAvatars.slice(0, 4).map((a, i) => (
              <img
                key={i}
                src={a}
                alt=""
                loading="lazy"
                className="h-5 w-5 rounded-full border-2 border-hp-paper object-cover"
              />
            ))}
          </div>
          <span className="text-[11px] font-bold text-hp-ink/80">
            {language === "GR" ? `${goingDisplay} συμμετέχουν` : `${goingDisplay} going`}
            {event.maybe > 0
              ? language === "GR"
                ? ` · ${event.maybe} ίσως`
                : ` · ${event.maybe} maybe`
              : ""}
          </span>
          {event.capacity && (
            <span className="ml-auto text-[10px] font-bold text-hp-muted">
              {event.capacity - goingDisplay} {language === "GR" ? "θέσεις" : "spots"}
            </span>
          )}
        </div>

        {capacityPct !== null && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-hp-ink/10">
            <div
              className={`h-full rounded-full ${capacityPct > 0.85 ? "bg-hp-sunset" : "bg-hp-olive"}`}
              style={{ width: `${Math.round(capacityPct * 100)}%` }}
            />
          </div>
        )}

        {/* RSVP actions */}
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggle(event, "going")}
            aria-pressed={isGoing}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-[12.5px] font-black transition active:scale-[0.97] ${
              isGoing
                ? "bg-hp-ink text-hp-paper"
                : "border-2 border-hp-ink text-hp-ink hover:bg-hp-ink/5"
            }`}
          >
            {isGoing ? <Check size={14} /> : null}
            {language === "GR"
              ? isGoing
                ? "Θα πάω"
                : "Συμμετέχω"
              : isGoing
                ? "I'm going"
                : "I'm in"}
          </button>
          <button
            type="button"
            onClick={() => onToggle(event, "maybe")}
            aria-pressed={isMaybe}
            className={`rounded-full px-3.5 py-2.5 text-[12px] font-bold transition active:scale-95 ${
              isMaybe ? "bg-hp-purple/15 text-hp-purple" : "border border-hp-ink/12 text-hp-ink/70"
            }`}
          >
            {language === "GR" ? "Ίσως" : "Maybe"}
          </button>
        </div>
      </div>
    </motion.article>
  );
}

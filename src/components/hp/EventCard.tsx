import { motion } from "framer-motion";
import {
  CalendarHeart,
  Check,
  Clock,
  Dumbbell,
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
import { isPublishedContent, meetPhase, observationLabel } from "@/lib/hp/surface-freshness";
import { formatMeetWhen, formatMeetDateTime } from "@/lib/hp/meet-time";
import { ImageBox } from "./ImageBox";
import { ContentMenu } from "./ContentMenu";
import { useI18n } from "@/lib/i18n";
import { AUTHOR_ROLE_LABEL, roleKey } from "./pulse-shared";

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
  previewMode?: boolean;
  nowMs?: number;
}

export function EventCard({
  event,
  placeName,
  status,
  onToggle,
  onOpenPlace,
  previewMode = false,
  nowMs = Date.now(),
}: Props) {
  const { language, t } = useI18n();
  const phase = meetPhase(event, nowMs);
  const canRsvp = isPublishedContent(event) && (phase === "upcoming" || phase === "inProgress");
  const announcement = observationLabel(event.createdAt, nowMs, language);
  const phaseLabel = {
    upcoming: "Upcoming",
    inProgress: "In progress",
    ended: "Ended",
    unknown: "Time unknown",
  }[phase];
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
    >
      <button
        type="button"
        onClick={() => onOpenPlace(event.placeId)}
        className="relative block w-full overflow-hidden rounded-[22px] text-left shadow-[var(--hp-shadow-card)]"
        aria-label={
          language === "GR" ? `Άνοιγμα ${placeName} στον χάρτη` : `Open ${placeName} on the map`
        }
      >
        <ImageBox
          src={event.coverUrl}
          alt={event.title}
          className="aspect-[16/10] w-full"
          rounded="rounded-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/25" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-black/35 px-2.5 text-[12px] font-semibold text-white backdrop-blur-md">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: meta.tone }}
              aria-hidden="true"
            />
            <CategoryIcon size={13} strokeWidth={2.2} aria-hidden="true" />
            {t(meta.label)}
          </span>
          <span
            className={`inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-semibold backdrop-blur-md ${
              phase === "inProgress" ? "bg-[var(--hp-live)] text-white" : "bg-black/35 text-white"
            }`}
          >
            {t(phaseLabel)}
          </span>
        </div>
        <div className="absolute bottom-3.5 left-4 right-4 text-hp-on-media">
          <p
            title={phase === "unknown" ? undefined : formatMeetDateTime(event.happensAt, language)}
            className="flex items-center gap-1 text-[13px] font-semibold text-white/90"
          >
            <Clock size={13} strokeWidth={2.2} aria-hidden="true" />
            {phase === "unknown"
              ? t("Time unknown")
              : formatMeetWhen(event.happensAt, language, nowMs)}
          </p>
          <h3 className="mt-1 text-[21px] font-bold leading-[1.12] tracking-[-0.025em]">
            {event.title}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-[13px] font-medium text-white/85">
            <MapPin size={13} strokeWidth={2.2} aria-hidden="true" /> {placeName}
          </p>
        </div>
      </button>

      <div className="px-1 pt-3">
        {/* Host row */}
        <div className="flex items-center gap-2.5">
          <img
            src={event.hostAvatar}
            alt=""
            className="h-7 w-7 rounded-full object-cover shadow-[0_0_0_0.5px_var(--hp-border)]"
            loading="lazy"
          />
          <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-hp-ink">
            {event.hostName}{" "}
            <span className="font-medium text-hp-muted">
              · {t(AUTHOR_ROLE_LABEL[roleKey(event.hostType)] ?? "Local")}
            </span>
          </div>
          <span title={announcement.exact} className="shrink-0 text-[12px] text-hp-muted">
            {announcement.relative}
          </span>
          {!previewMode && (
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
          )}
        </div>
        {!isPublishedContent(event) && (
          <p className="mt-1 text-xs text-hp-muted">{t("Awaiting publication")}</p>
        )}

        {/* RSVP counts are separate from announcement freshness. */}
        <div className="mt-2.5 flex items-center gap-2 text-[13px]">
          <span className="font-semibold text-hp-ink">
            {language === "GR"
              ? `${goingDisplay} δηλώσεις συμμετοχής`
              : `${goingDisplay} going RSVPs`}
            {event.maybe > 0 ? (
              <span className="font-medium text-hp-muted">
                {language === "GR" ? ` · ${event.maybe} ίσως` : ` · ${event.maybe} maybe`}
              </span>
            ) : null}
          </span>
          {event.capacity && (
            <span className="ml-auto text-[12.5px] font-medium text-hp-muted">
              {event.capacity - goingDisplay} {language === "GR" ? "θέσεις" : "spots"}
            </span>
          )}
        </div>

        {capacityPct !== null && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-hp-fill">
            <div
              className={`h-full rounded-full ${capacityPct > 0.85 ? "bg-hp-sunset" : "bg-hp-olive"}`}
              style={{ width: `${Math.round(capacityPct * 100)}%` }}
            />
          </div>
        )}

        {/* RSVP actions */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={!canRsvp}
            onClick={() => onToggle(event, "going")}
            aria-pressed={isGoing}
            className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[14.5px] font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-hp-fill disabled:text-hp-muted disabled:shadow-none ${
              isGoing
                ? "bg-hp-olive/15 text-hp-olive"
                : "bg-hp-sunset text-white shadow-[0_8px_20px_-10px_color-mix(in_srgb,var(--hp-sunset)_80%,transparent)]"
            }`}
          >
            {isGoing ? <Check size={16} strokeWidth={2.4} aria-hidden="true" /> : null}
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
            disabled={!canRsvp}
            onClick={() => onToggle(event, "maybe")}
            aria-pressed={isMaybe}
            className={`h-11 rounded-full px-5 text-[14.5px] font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:text-hp-muted ${
              isMaybe ? "bg-hp-purple/15 text-hp-purple" : "bg-hp-fill text-hp-ink"
            }`}
          >
            {language === "GR" ? "Ίσως" : "Maybe"}
          </button>
        </div>
      </div>
    </motion.article>
  );
}

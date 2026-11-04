import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import type { Place, StoryItem } from "@/lib/hp-model";
import type { MeetEvent } from "@/lib/hp/meet-types";
import type { PlacePulseMetric } from "@/lib/hp/pulse-activity";
import {
  fullParkingReport,
  isTonightMeet,
  observationLabel,
  upcomingMeetForPlace,
} from "@/lib/hp/surface-freshness";
import { ImageBox } from "./ImageBox";
import { useI18n } from "@/lib/i18n";

interface Props {
  place: Place;
  metric?: PlacePulseMetric;
  events: MeetEvent[];
  stories: StoryItem[];
  nowMs: number;
  onOpen: (place: Place) => void;
  onGoing: (event: MeetEvent) => void;
  previewMode?: boolean;
}

export function TrendingHero({
  place,
  metric,
  events,
  stories,
  nowMs,
  onOpen,
  onGoing,
  previewMode = false,
}: Props) {
  const { t, language } = useI18n();
  const event = upcomingMeetForPlace(events, place.id, nowMs);
  const tonight = event && isTonightMeet(event, nowMs) && (metric?.evidenceWeight ?? 0) > 0;
  const observed = observationLabel(metric?.lastSignalAt, nowMs, language);
  const parking = fullParkingReport(stories, place.id, nowMs);
  const counts = [
    [metric?.postCount ?? 0, "recent posts"],
    [metric?.commentCount ?? 0, "recent comments"],
    [metric?.storyCount ?? 0, "recent stories"],
    [metric?.eventCount ?? 0, "recent announcements"],
  ] as const;
  const activityLine = counts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${t(label)}`)
    .join(" · ");
  const displayName = language === "GR" && place.greekName ? place.greekName : place.name;
  // Say only what is known: no "no recent reports" line, no "unknown time".
  const hasFooter = Boolean(activityLine || event || metric?.lastSignalAt);
  const label = t(
    tonight
      ? "Tonight's plan"
      : (metric?.evidenceWeight ?? 0) > 0
        ? "Recent activity"
        : "Explore this place",
  );
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mb-7 overflow-hidden rounded-[22px] bg-hp-paper shadow-[var(--hp-shadow-card)]"
    >
      <button
        type="button"
        onClick={() => onOpen(place)}
        aria-label={t("Open {place}", { place: place.name })}
        className="relative block aspect-[4/3] w-full text-left"
      >
        <ImageBox
          src={place.imageUrl}
          alt={place.name}
          className="h-full w-full"
          rounded="rounded-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/20" />
        <span className="absolute left-3 top-3 inline-flex h-7 items-center rounded-full bg-black/35 px-3 text-[12px] font-semibold text-white backdrop-blur-md">
          {label}
        </span>
        {parking && (
          <span
            title={observationLabel(parking.createdAt, nowMs, language).exact}
            className="absolute right-3 top-3 inline-flex h-7 items-center rounded-full bg-black/35 px-3 text-[12px] font-semibold text-white backdrop-blur-md"
          >
            {t("Parking reported full")}
          </span>
        )}
        <div className="absolute bottom-4 left-4 right-4 text-hp-on-media">
          <span className="flex items-center gap-1 text-[13px] font-medium text-white/85">
            <MapPin size={13} strokeWidth={2.2} aria-hidden="true" />
            {place.area}
          </span>
          <h3 className="mt-1 text-[28px] font-bold leading-[1.05] tracking-[-0.03em]">
            {displayName}
          </h3>
          {language === "EN" && place.short && (
            <span className="mt-1 line-clamp-2 text-[14px] leading-snug text-white/85">
              {place.short}
            </span>
          )}
          {!hasFooter && (
            <span className="mt-3 inline-flex h-9 items-center rounded-full bg-white px-4 text-[13.5px] font-semibold text-[#0d0d0f]">
              {t("View place details")}
            </span>
          )}
        </div>
      </button>
      {hasFooter && (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            {activityLine && (
              <p className="truncate text-[13px] font-semibold text-hp-ink">{activityLine}</p>
            )}
            {metric?.lastSignalAt && (
              <p title={observed.exact} className="truncate text-[12px] text-hp-muted">
                {observed.relative}
              </p>
            )}
            {event && <p className="truncate text-[12.5px] text-hp-muted">{event.title}</p>}
          </div>
          <button
            type="button"
            onClick={() => (event && !previewMode ? onGoing(event) : onOpen(place))}
            className="inline-flex h-10 shrink-0 items-center rounded-full bg-hp-ink px-4 text-[13.5px] font-semibold text-hp-bg active:scale-95"
            aria-label={
              event && !previewMode
                ? t("I'm going to {event}", { event: event.title })
                : t("View place details")
            }
          >
            {t(event && !previewMode ? "I'm going" : "View place details")}
          </button>
        </div>
      )}
    </motion.article>
  );
}

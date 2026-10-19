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
  const activityLine =
    counts
      .filter(([count]) => count > 0)
      .map(([count, label]) => `${count} ${t(label)}`)
      .join(" · ") || t("No recent reports");
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 overflow-hidden rounded-3xl border border-hp-ink/10 bg-hp-paper shadow-lg"
    >
      <button
        type="button"
        onClick={() => onOpen(place)}
        aria-label={t("Open {place}", { place: place.name })}
        className="relative block h-52 w-full text-left"
      >
        <ImageBox
          src={place.imageUrl}
          alt={place.name}
          className="h-full w-full"
          rounded="rounded-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-hp-paper px-3 py-1 text-[11px] font-bold text-hp-ink">
          {t(
            tonight
              ? "Tonight's plan"
              : (metric?.evidenceWeight ?? 0) > 0
                ? "Recent activity"
                : "Explore this place",
          )}
        </span>
        {parking && (
          <span
            title={observationLabel(parking.createdAt, nowMs, language).exact}
            className="absolute right-3 top-3 rounded-full bg-hp-paper px-3 py-1 text-[11px] font-bold text-hp-ink"
          >
            {t("Parking reported full")}
          </span>
        )}
        <div className="absolute bottom-3 left-4 right-4 text-hp-on-media">
          <p className="flex items-center gap-1 text-xs">
            <MapPin size={12} />
            {place.area}
          </p>
          <h3 className="text-[22px] font-black">{place.name}</h3>
          <p className="line-clamp-1 text-xs">{place.short}</p>
          <p className="mt-2 text-xs">{activityLine}</p>
        </div>
      </button>
      <div className="flex flex-wrap items-center gap-2 px-3 py-3">
        <span title={observed.exact} className="text-[11px] text-hp-muted">
          {observed.relative}
        </span>
        <button
          type="button"
          onClick={() => (event && !previewMode ? onGoing(event) : onOpen(place))}
          className="ml-auto rounded-full bg-hp-ink px-3 py-2 text-xs font-bold text-hp-paper"
          aria-label={
            event && !previewMode
              ? t("I'm going to {event}", { event: event.title })
              : t("View place details")
          }
        >
          {t(event && !previewMode ? "I'm going" : "View place details")}
        </button>
        {event && <span className="w-full text-xs text-hp-muted">{event.title}</span>}
      </div>
    </motion.article>
  );
}

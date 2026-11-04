import { useEffect, useMemo, useRef, useState } from "react";
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
  MEET_CATEGORY_META,
  type MeetCategory,
  type MeetEvent,
  type RsvpStatus,
} from "@/lib/hp/meet-types";
import { meetPhase } from "@/lib/hp/surface-freshness";
import { EventCard } from "./EventCard";
import { ImageBox } from "./ImageBox";
import { formatMeetDateTime, formatMeetWhen } from "@/lib/hp/meet-time";
import { useModeration } from "./use-moderation";
import { useI18n } from "@/lib/i18n";

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
  focusEventId?: string | null;
  events: MeetEvent[];
  rsvp: Record<string, RsvpStatus>;
  findPlace: (id: string) => Place | undefined;
  onToggleRsvp: (event: MeetEvent, next: RsvpStatus) => void;
  onOpenPlace: (placeId: string) => void;
  onCreate: () => void;
  previewMode?: boolean;
  nowMs?: number;
}

export function MeetScreen({
  focusEventId,
  events,
  rsvp,
  findPlace,
  onToggleRsvp,
  onOpenPlace,
  onCreate,
  previewMode = false,
  nowMs = Date.now(),
}: Props) {
  const { t } = useI18n();
  const moderation = useModeration();
  const [filter, setFilter] = useState<Filter>("all");
  const focusedEventRef = useRef<HTMLDivElement>(null);
  const focusedIdRef = useRef<string | null>(null);
  useEffect(() => {
    focusedIdRef.current = null;
    if (focusEventId) setFilter("all");
  }, [focusEventId]);

  const filtered = useMemo(() => {
    return (
      events
        // Blocked hosts are filtered server-side; muted ones are hidden here.
        .filter((e) => !moderation.isHidden(e.userId))
        .filter((e) => {
          if (filter === "all") return true;
          if (filter === "mine") return rsvp[e.id] === "going" || rsvp[e.id] === "maybe";
          return e.category === filter;
        })
        .sort(
          (a, b) =>
            Number(meetPhase(a, nowMs) === "ended") - Number(meetPhase(b, nowMs) === "ended") ||
            +new Date(a.happensAt) - +new Date(b.happensAt),
        )
    );
  }, [events, filter, moderation, rsvp, nowMs]);

  useEffect(() => {
    if (!focusEventId || filter !== "all" || focusedIdRef.current === focusEventId) return;
    if (!focusedEventRef.current) return;
    const frame = requestAnimationFrame(() => {
      const target = focusedEventRef.current;
      if (!target || target.dataset.discoveryEvent !== focusEventId) return;
      target.scrollIntoView({ block: "center", behavior: "instant" });
      target.focus({ preventScroll: true });
      focusedIdRef.current = focusEventId;
    });
    return () => cancelAnimationFrame(frame);
  }, [focusEventId, filter, filtered]);

  const mineCount = events.filter((e) => rsvp[e.id]).length;
  // Finished gatherings stay visible (they are the community's history), but as a
  // quiet "Earlier" list under what is still ahead, never as cards you can't use.
  const upcoming = filtered.filter((e) => meetPhase(e, nowMs) !== "ended");
  const earlier = filtered.filter((e) => meetPhase(e, nowMs) === "ended");

  const chips: { id: Filter; label: string; Icon?: LucideIcon }[] = [
    { id: "all", label: t("All") },
    { id: "mine", label: mineCount > 0 ? `${t("Mine")} · ${mineCount}` : t("Mine") },
    ...MEET_CATEGORIES.map((c) => ({
      id: c as Filter,
      label: t(MEET_CATEGORY_META[c].label),
      Icon: CATEGORY_ICONS[c],
    })),
  ];

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto overscroll-contain px-4 pb-32 pt-4">
        {/* Filter chips */}
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

        {upcoming.length === 0 && (
          <div className="fd-empty">
            <span className="fd-empty__icon" aria-hidden="true">
              <Sparkles size={22} strokeWidth={1.9} />
            </span>
            <strong>
              {t(
                filter === "mine"
                  ? "Nothing planned yet"
                  : filter === "all"
                    ? "Nothing coming up yet"
                    : "No gatherings here",
              )}
            </strong>
            <p>
              {filter === "mine" || filter === "all"
                ? t("RSVP to something, or host your own — a swim, a coffee, a panigyri.")
                : t("Be the first to host something in this vibe.")}
            </p>
            {!previewMode && (
              <div className="fd-empty__actions">
                <button type="button" className="fd-button fd-button--primary" onClick={onCreate}>
                  <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
                  {t("Host a gathering")}
                </button>
              </div>
            )}
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="flex flex-col gap-6">
            <AnimatePresence initial={false}>
              {upcoming.map((event) => (
                <div
                  key={event.id}
                  ref={event.id === focusEventId ? focusedEventRef : undefined}
                  tabIndex={event.id === focusEventId ? -1 : undefined}
                  data-discovery-event={event.id}
                  className={
                    event.id === focusEventId
                      ? "rounded-[22px] focus:outline-2 focus:outline-hp-sunset"
                      : undefined
                  }
                >
                  <EventCard
                    event={event}
                    placeName={findPlace(event.placeId)?.name ?? "Ilia"}
                    status={rsvp[event.id] ?? null}
                    onToggle={onToggleRsvp}
                    onOpenPlace={onOpenPlace}
                    previewMode={previewMode}
                    nowMs={nowMs}
                  />
                </div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {earlier.length > 0 && (
          <section className="mt-9">
            <h3 className="hp-section-title mb-2">
              {t("Earlier")}
              <small>{earlier.length}</small>
            </h3>
            <ul className="divide-y divide-[var(--hp-border)]">
              {earlier.map((event) => (
                <li key={event.id}>
                  <div
                    ref={event.id === focusEventId ? focusedEventRef : undefined}
                    tabIndex={event.id === focusEventId ? -1 : undefined}
                    data-discovery-event={event.id}
                  >
                    <PastEventRow
                      event={event}
                      placeName={findPlace(event.placeId)?.name ?? "Ilia"}
                      onOpenPlace={onOpenPlace}
                      nowMs={nowMs}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Host FAB — the empty state carries its own button, so only one shows. */}
      {!previewMode && upcoming.length > 0 && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          initial={{ opacity: 0, scale: 0.86, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          onClick={onCreate}
          className="absolute right-4 bottom-4 z-40 inline-flex h-12 items-center gap-1.5 rounded-full bg-hp-sunset pl-4 pr-5 text-white shadow-[0_10px_24px_-6px_color-mix(in_srgb,var(--hp-sunset)_60%,transparent)]"
          aria-label={t("Host a gathering")}
        >
          <Plus size={19} strokeWidth={2.4} aria-hidden="true" />
          <span className="text-[15px] font-semibold">{t("Host")}</span>
        </motion.button>
      )}
    </div>
  );
}

/** A finished gathering: one quiet row — when, where, how many went. */
function PastEventRow({
  event,
  placeName,
  onOpenPlace,
  nowMs,
}: {
  event: MeetEvent;
  placeName: string;
  onOpenPlace: (placeId: string) => void;
  nowMs: number;
}) {
  const { language, t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => onOpenPlace(event.placeId)}
      className="flex w-full items-center gap-3 py-3 text-left active:opacity-70"
      aria-label={t("Open {place}", { place: placeName })}
    >
      <ImageBox
        src={event.coverUrl}
        alt=""
        className="h-14 w-14 shrink-0 overflow-hidden rounded-xl"
        rounded="rounded-xl"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-hp-ink">{event.title}</span>
        <span
          className="block truncate text-[13px] text-hp-muted"
          title={formatMeetDateTime(event.happensAt, language)}
        >
          {placeName} · {formatMeetWhen(event.happensAt, language, nowMs)}
        </span>
      </span>
      <span className="shrink-0 text-right text-[12.5px] font-medium text-hp-muted">
        {t("{n} went", { n: event.going })}
      </span>
    </button>
  );
}

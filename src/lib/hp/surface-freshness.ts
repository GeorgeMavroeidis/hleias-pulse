import { formatDistanceStrict } from "date-fns";
import { el, enUS } from "date-fns/locale";
import type { Post, StoryItem } from "../hp-model";
import type { MeetEvent } from "./meet-types";
import { evaluateFreshness, storyObservedAt, timestampMs, type EvidenceTime } from "./freshness";

export const OBSERVATION_TIME_ZONE = "Europe/Athens";
export function isPublishedContent(item: { moderationStatus?: string | null }) {
  // Bootstrap rows were already restricted to published by the server. New write
  // acknowledgements carry an explicit status and cannot borrow that guarantee.
  return item.moderationStatus == null || item.moderationStatus === "published";
}

export function contentVisibleToViewer(
  item: { moderationStatus?: string | null; userId?: string | null },
  viewerUserId: string | null,
) {
  return (
    isPublishedContent(item) ||
    Boolean(viewerUserId && item.userId === viewerUserId && item.moderationStatus === "pending")
  );
}

export function observationLabel(observedAt: EvidenceTime, nowMs: number, language: "GR" | "EN") {
  const freshness = evaluateFreshness({ observedAt, nowMs });
  if (freshness.observedAtMs === null) {
    return {
      relative: language === "GR" ? "Άγνωστος χρόνος παρατήρησης" : "Observation time unknown",
      exact: undefined,
    };
  }
  const age = formatDistanceStrict(Math.min(freshness.observedAtMs, nowMs), nowMs, {
    addSuffix: true,
    locale: language === "GR" ? el : enUS,
  });
  const exact = new Intl.DateTimeFormat(language === "GR" ? "el-GR" : "en-GB", {
    timeZone: OBSERVATION_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(freshness.observedAtMs);
  return {
    relative: language === "GR" ? `Αναφέρθηκε ${age}` : `Reported ${age}`,
    exact: `${exact} · ${OBSERVATION_TIME_ZONE}`,
  };
}

export type MeetPhase = "upcoming" | "inProgress" | "ended" | "unknown";
export function meetPhase(
  event: Pick<MeetEvent, "happensAt" | "durationMin">,
  nowMs: number,
): MeetPhase {
  const start = timestampMs(event.happensAt);
  if (
    start === null ||
    !Number.isFinite(event.durationMin) ||
    event.durationMin <= 0 ||
    !Number.isFinite(nowMs)
  )
    return "unknown";
  if (nowMs < start) return "upcoming";
  return nowMs < start + event.durationMin * 60_000 ? "inProgress" : "ended";
}

function athensDayAndHour(instant: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: OBSERVATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (kind: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === kind)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function isTonightMeet(event: MeetEvent, nowMs: number) {
  const start = timestampMs(event.happensAt);
  if (start === null || !isPublishedContent(event) || meetPhase(event, nowMs) !== "upcoming")
    return false;
  const scheduled = athensDayAndHour(start);
  return scheduled.day === athensDayAndHour(nowMs).day && scheduled.hour >= 18;
}

export function upcomingMeetForPlace(events: MeetEvent[], placeId: string, nowMs: number) {
  return (
    events
      .filter(
        (event) =>
          event.placeId === placeId &&
          isPublishedContent(event) &&
          meetPhase(event, nowMs) === "upcoming",
      )
      .sort((a, b) => Date.parse(a.happensAt) - Date.parse(b.happensAt))[0] ?? null
  );
}

export function postQualifiesTonight(post: Post, events: MeetEvent[], nowMs: number) {
  return (
    isPublishedContent(post) &&
    evaluateFreshness({ observedAt: post.createdAt, nowMs }).isRecent &&
    events.some((event) => event.placeId === post.placeId && isTonightMeet(event, nowMs))
  );
}

/** Visibility and present-tense report claims have intentionally separate clocks. */
export function storyIsVisible(
  story: Pick<StoryItem, "createdAt" | "expiresAfterHours">,
  nowMs: number,
) {
  const created = timestampMs(story.createdAt);
  if (created === null) return false;
  const freshness = evaluateFreshness({
    observedAt: created,
    expiresAt: created + (story.expiresAfterHours ?? 24) * 60 * 60_000,
    nowMs,
  });
  return freshness.state !== "unknown" && freshness.state !== "expired";
}

export function storyHasCurrentReport(story: StoryItem, nowMs: number) {
  return (
    isPublishedContent(story) &&
    storyIsVisible(story, nowMs) &&
    evaluateFreshness({ observedAt: storyObservedAt(story), nowMs }).isCurrent
  );
}

export function fullParkingReport(stories: StoryItem[], placeId: string, nowMs: number) {
  const latest = stories
    .filter(
      (story) =>
        story.placeId === placeId && story.report?.parking && storyHasCurrentReport(story, nowMs),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return latest?.report?.parking === "full" ? latest : null;
}

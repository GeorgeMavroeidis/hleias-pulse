import type { Place, StoryItem } from "../hp-model";

/**
 * Place Stories — grouping and display helpers for Supabase-backed story rows.
 */

export type StoryKind = StoryItem["kind"];
export type StoryAuthorType = StoryItem["authorType"];

export type StoryTone = "sea" | "olive" | "purple" | "sunset" | "muted";

export interface StoryReport {
  crowd?: "low" | "medium" | "high";
  parking?: "easy" | "tight" | "full";
  condition?: string[];
}

export interface PlaceStory {
  id: string;
  placeId: string;
  mediaUrl: string;
  kind: StoryKind;
  authorName: string;
  authorType: StoryAuthorType;
  authorAvatarUrl: string;
  caption: string;
  minutesAgo: number;
  expiresAfterHours?: number | null;
  report?: StoryReport;
  userId?: string | null;
  profileId?: string | null;
  createdAt?: string;
}

export interface PlaceStoryGroup {
  placeId: string;
  placeName: string;
  area: string;
  stories: PlaceStory[];
  tone: StoryTone;
  hasUnseen: boolean;
  live: boolean;
  latestMinutesAgo: number;
  count: number;
}

export const STORY_KIND_LABEL: Record<StoryKind, string> = {
  photo: "Photo",
  report: "Live report",
  beach_status: "Beach status",
  business_status: "Open now",
  editor_note: "Editor tip",
  event: "Tonight",
  route_tease: "Route",
};

export const STORY_AUTHOR_LABEL: Record<StoryAuthorType, string> = {
  LOCAL: "Local",
  TOURIST: "Tourist",
  BUSINESS: "Business",
  EDITOR: "Editor",
  GUIDE: "Guide",
};

export const STORY_AUTHOR_COLOR: Record<StoryAuthorType, string> = {
  LOCAL: "#667A3D",
  TOURIST: "#0E3A5B",
  BUSINESS: "#E06A32",
  EDITOR: "#7A4DD8",
  GUIDE: "#7A4DD8",
};

export function storyDurationMs(kind: StoryKind): number {
  switch (kind) {
    case "photo":
      return 6000;
    case "event":
    case "route_tease":
      return 7000;
    case "editor_note":
      return 8000;
    case "report":
    case "beach_status":
    case "business_status":
      return 9000;
    default:
      return 7000;
  }
}

export function storyToneForPlace(place: Place, stories: PlaceStory[]): StoryTone {
  if (place.type === "beach" || place.type === "sunset") return "sea";
  if (place.type === "nature") return "olive";
  if (
    place.type === "night" ||
    stories.some((story) => story.kind === "event" || story.kind === "business_status")
  ) {
    return "purple";
  }
  if (stories.some((story) => story.kind === "report")) return "sunset";
  return "sunset";
}

export interface ToneStyle {
  gradient: string;
  accent: string;
  label: string;
}

const TONE_STYLES: Record<Exclude<StoryTone, "muted">, ToneStyle> = {
  sea: {
    gradient: "linear-gradient(135deg, #7fc8de 0%, #0e3a5b 100%)",
    accent: "#0e3a5b",
    label: "beach · coast",
  },
  olive: {
    gradient: "linear-gradient(135deg, #8a9d52 0%, #4a5724 100%)",
    accent: "#667a3d",
    label: "nature · local",
  },
  purple: {
    gradient: "linear-gradient(135deg, #9b6fe6 0%, #241b3d 100%)",
    accent: "#7a4dd8",
    label: "night · event",
  },
  sunset: {
    gradient: "linear-gradient(135deg, #f0a85f 0%, #c2410c 100%)",
    accent: "#e06a32",
    label: "new reports",
  },
};

export const MUTED_TONE: ToneStyle = {
  gradient: "linear-gradient(135deg, rgba(124,116,104,0.55) 0%, rgba(124,116,104,0.25) 100%)",
  accent: "#7c7468",
  label: "seen",
};

export function toneStyle(tone: StoryTone): ToneStyle {
  return tone === "muted" ? MUTED_TONE : TONE_STYLES[tone];
}

export function formatStoryTime(minutesAgo: number): string {
  if (minutesAgo < 1) return "just now";
  if (minutesAgo < 60) return `${Math.round(minutesAgo)} min ago`;
  const hours = minutesAgo / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return "today";
}

function minutesSince(iso: string): number {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function latestMinutesAgo(stories: PlaceStory[]): number {
  return stories.reduce((min, story) => Math.min(min, story.minutesAgo), Number.POSITIVE_INFINITY);
}

function mapServerStory(story: StoryItem): PlaceStory {
  return {
    id: story.id,
    placeId: story.placeId,
    mediaUrl: story.mediaUrl,
    kind: story.kind,
    authorName: story.authorName,
    authorType: story.authorType,
    authorAvatarUrl: story.authorAvatarUrl,
    caption: story.caption,
    minutesAgo: minutesSince(story.createdAt),
    expiresAfterHours: story.expiresAfterHours,
    report: story.report,
    userId: story.userId,
    profileId: story.profileId,
    createdAt: story.createdAt,
  };
}

export function buildPlaceStoryGroups(
  places: Place[],
  seen: ReadonlySet<string>,
  serverStories: StoryItem[],
): PlaceStoryGroup[] {
  const byId = new Map(places.map((place) => [place.id, place]));
  const bucket = new Map<string, PlaceStory[]>();

  for (const serverStory of serverStories) {
    const place = byId.get(serverStory.placeId);
    if (!place) continue;

    const story = mapServerStory(serverStory);
    const list = bucket.get(story.placeId) ?? [];
    list.push(story);
    bucket.set(story.placeId, list);
  }

  const groups: PlaceStoryGroup[] = [];
  for (const [placeId, stories] of bucket) {
    const place = byId.get(placeId);
    if (!place) continue;

    const ordered = [...stories].sort((a, b) => a.minutesAgo - b.minutesAgo);
    const hasUnseen = ordered.some((story) => !seen.has(story.id));
    groups.push({
      placeId,
      placeName: place.name,
      area: place.area,
      stories: ordered,
      tone: storyToneForPlace(place, ordered),
      hasUnseen,
      live: place.hotness >= 8 && hasUnseen,
      latestMinutesAgo: latestMinutesAgo(ordered),
      count: ordered.length,
    });
  }

  groups.sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
    if (a.latestMinutesAgo !== b.latestMinutesAgo) return a.latestMinutesAgo - b.latestMinutesAgo;
    const placeA = byId.get(a.placeId);
    const placeB = byId.get(b.placeId);
    return (placeB?.hotness ?? 0) - (placeA?.hotness ?? 0);
  });

  return groups;
}

export function findStoryGroup(
  groups: PlaceStoryGroup[],
  placeId: string,
): PlaceStoryGroup | undefined {
  return groups.find((group) => group.placeId === placeId);
}

export function findStoryGroupIndex(groups: PlaceStoryGroup[], placeId: string): number {
  return groups.findIndex((group) => group.placeId === placeId);
}

export function storyPlaceIdSet(groups: PlaceStoryGroup[]): Set<string> {
  return new Set(groups.map((group) => group.placeId));
}

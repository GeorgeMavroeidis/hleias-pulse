import type { Place } from "../hp-model";

/**
 * Meet / Events domain types.
 *
 * RSVP-able gathering model for Supabase-backed Meet events.
 */

export type MeetCategory =
  | "panigyri"
  | "beach"
  | "music"
  | "sunset"
  | "sport"
  | "cleanup"
  | "food"
  | "social";

export type RsvpStatus = "going" | "maybe";

export interface MeetEvent {
  id: string;
  title: string;
  placeId: string;
  /** Lat/lng mirror of the host place, so events can be plotted on the map. */
  lat: number;
  lng: number;
  hostName: string;
  hostAvatar: string;
  hostType: "LOCAL" | "GUIDE" | "BUSINESS" | "TOURIST";
  /** ISO timestamp. */
  happensAt: string;
  durationMin: number;
  category: MeetCategory;
  vibe: string;
  /** "Free" | "€5" | "€€" … */
  price: string;
  capacity?: number;
  description: string;
  coverUrl: string;
  tags: string[];
  /** Total going count from Supabase, including database-seeded and user RSVPs. */
  going: number;
  maybe: number;
  hot: boolean;
  /** First few attendee avatars for the card preview strip. */
  attendeeAvatars: string[];
  userId?: string | null;
  profileId?: string | null;
}

export interface CreateMeetInput {
  title: string;
  placeId: string;
  happensAt: string;
  category: MeetCategory;
  vibe: string;
  price: string;
  capacity?: number;
  description: string;
  tags: string[];
}

export const MEET_CATEGORY_META: Record<
  MeetCategory,
  { label: string; short: string; tone: string }
> = {
  panigyri: { label: "Panigyri", short: "PAN", tone: "var(--hp-purple)" },
  beach: { label: "Beach", short: "SEA", tone: "var(--hp-sea)" },
  music: { label: "Live music", short: "LIVE", tone: "var(--hp-purple)" },
  sunset: { label: "Sunset", short: "SUN", tone: "var(--hp-sunset)" },
  sport: { label: "Sport", short: "MOVE", tone: "var(--hp-olive)" },
  cleanup: { label: "Cleanup", short: "CARE", tone: "var(--hp-olive)" },
  food: { label: "Food", short: "EAT", tone: "var(--hp-sunset)" },
  social: { label: "Hangout", short: "MEET", tone: "var(--hp-deep)" },
};

export const MEET_CATEGORIES = Object.keys(MEET_CATEGORY_META) as MeetCategory[];

export function categoryForPlace(place: Place): MeetCategory {
  if (place.type === "beach") return "beach";
  if (place.type === "sunset") return "sunset";
  if (place.type === "night") return "music";
  if (place.type === "food" || place.type === "local") return "food";
  if (place.type === "village") return "panigyri";
  if (place.type === "nature") return "social";
  return "social";
}

import type { Place, Post } from "../hp-model";
import type { MeetEvent } from "./meet-types";

/**
 * Derived activity helpers. Source rows come from Supabase; these helpers only
 * shape lightweight display summaries for the existing UI.
 */

export interface ActivityTick {
  id: string;
  who: string;
  avatar: string;
  verb: "posted" | "is going" | "dropped a tip" | "went live" | "added a spot";
  at: string; // place name
  placeId: string;
  minutesAgo: number;
}

/** Derive a live activity ticker from Supabase posts and Meet events. */
export function buildActivityTicks(
  posts: Post[],
  places: Map<string, Place>,
  events: MeetEvent[],
): ActivityTick[] {
  const placeName = (id: string) => places.get(id)?.name ?? "Ilia";
  const fromPosts: ActivityTick[] = posts.slice(0, 8).map((p, i) => ({
    id: `tick-post-${p.id}`,
    who:
      p.authorId === "you"
        ? "You"
        : p.authorId
            .replace(/-/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .slice(0, 14),
    avatar: `https://i.pravatar.cc/60?img=${(i % 60) + 1}`,
    verb: p.kind === "tip" ? "dropped a tip" : "posted",
    at: placeName(p.placeId),
    placeId: p.placeId,
    minutesAgo: (i + 1) * 3,
  }));
  const fromEvents: ActivityTick[] = events.slice(0, 4).map((e, i) => ({
    id: `tick-event-${e.id}`,
    who: e.hostName.split(" ")[0],
    avatar: e.hostAvatar,
    verb: "is going",
    at: e.title.split("—")[0].trim().slice(0, 22),
    placeId: e.placeId,
    minutesAgo: 8 + i * 5,
  }));
  return [...fromPosts, ...fromEvents].sort((a, b) => a.minutesAgo - b.minutesAgo);
}

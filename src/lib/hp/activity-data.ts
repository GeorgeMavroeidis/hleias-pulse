import type { Author, Place, Post, StoryItem } from "../hp-model";
import type { MeetEvent } from "./meet-types";
import { initialsAvatarDataUri } from "./avatar";
import { evaluateFreshness, storyObservedAt } from "./freshness";
import { isPublishedContent } from "./surface-freshness";

export interface ActivityTick {
  id: string;
  who: string;
  avatar: string;
  verb: "posted" | "dropped a tip" | "announced a gathering" | "shared a story";
  at: string;
  placeId: string;
  minutesAgo: number;
  observedAt: string;
}

/** Only dated, current publications may appear in the Live ticker. */
export function buildActivityTicks(
  posts: Post[],
  places: Map<string, Place>,
  events: MeetEvent[],
  options: { nowMs: number; findAuthor?: (post: Post) => Author; stories?: StoryItem[] },
): ActivityTick[] {
  const ticks: ActivityTick[] = [];
  const add = (
    id: string,
    who: string,
    avatar: string,
    verb: ActivityTick["verb"],
    placeId: string,
    observedAt: string | null | undefined,
  ) => {
    const age = evaluateFreshness({ observedAt, nowMs: options.nowMs });
    const place = places.get(placeId);
    if (!age.isCurrent || !observedAt || !place) return;
    ticks.push({
      id,
      who,
      avatar: avatar || initialsAvatarDataUri(who),
      verb,
      at: place.name,
      placeId,
      minutesAgo: Math.floor((age.ageMs ?? 0) / 60_000),
      observedAt,
    });
  };
  posts.filter(isPublishedContent).forEach((post) => {
    const author = options.findAuthor?.(post);
    add(
      `post-${post.id}`,
      author?.name ?? "Community member",
      author?.avatarUrl ?? "",
      post.kind === "tip" ? "dropped a tip" : "posted",
      post.placeId,
      post.createdAt,
    );
  });
  events
    .filter(isPublishedContent)
    .forEach((event) =>
      add(
        `meet-${event.id}`,
        event.hostName,
        event.hostAvatar,
        "announced a gathering",
        event.placeId,
        event.createdAt,
      ),
    );
  options.stories
    ?.filter(isPublishedContent)
    .forEach((story) =>
      add(
        `story-${story.id}`,
        story.authorName,
        story.authorAvatarUrl,
        "shared a story",
        story.placeId,
        storyObservedAt(story),
      ),
    );
  return ticks.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)).slice(0, 12);
}

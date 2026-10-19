import type { PulseData } from "@/lib/hp-api";
import type { Author, Comment, Place, Post, StoryItem } from "@/lib/hp-model";
import { initialsAvatarDataUri } from "@/lib/hp/avatar";
import {
  deriveAreaIntelligenceSnapshot,
  type AreaIntelligenceSnapshot,
} from "@/lib/hp/area-intelligence";
import { buildPulseActivitySnapshot, type PulseActivitySnapshot } from "@/lib/hp/pulse-activity";
import type { MeetEvent } from "@/lib/hp/meet-types";

export const TRAFFIC_SCENES = [
  { id: "quiet", label: "Quiet", description: "Only the three base places are visible." },
  { id: "arriving", label: "Arriving", description: "A first post, story, and Meet appear." },
  { id: "hot", label: "Hot", description: "Conversation and gatherings build." },
  { id: "live", label: "Live", description: "The place and area reach their busiest point." },
  { id: "later", label: "Three hours later", description: "Signals age while content remains." },
] as const;
export type TrafficScene = (typeof TRAFFIC_SCENES)[number]["id"];

export type TrafficPreviewSnapshot = {
  data: PulseData;
  activitySnapshot: PulseActivitySnapshot;
  areaIntelligence: AreaIntelligenceSnapshot;
  focusPlaceId: string;
  focusAreaId: string;
};

export const TRAFFIC_FOCUS_PLACE_ID = "kourouta-beach";
export const TRAFFIC_FOCUS_AREA_ID = "kourouta";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Coordinates and photos mirror the existing places in scripts/hp-seed-data.ts.
// Keeping this small fixture local avoids importing the full seed dataset into
// the app or querying Supabase for a development preview.
const PREVIEW_PLACES: Place[] = [
  {
    id: TRAFFIC_FOCUS_PLACE_ID,
    name: "Kourouta Beach",
    greekName: "Παραλία Κουρούτας",
    type: "beach",
    area: "Kourouta",
    x: 21,
    y: 29,
    lat: 37.7694054,
    lng: 21.2938768,
    pulse: 4,
    mood: "beach all day, party later",
    crowd: "low",
    budget: "€",
    bestTime: "18:00 onwards",
    tags: ["beach", "party", "bars", "after"],
    short: "The obvious beach-party magnet. Come for sea, stay when the lights turn on.",
    imageUrl: "/story-feature/kourouta-online-story.jpg",
    hotness: 4,
    commentCount: 0,
    recentPostCount: 0,
    status: "quiet",
    avatars: [],
  },
  {
    id: "pyrgos-centre",
    name: "Pyrgos Centre",
    greekName: "Κέντρο Πύργου",
    type: "local",
    area: "Pyrgos",
    x: 38,
    y: 39,
    lat: 37.6721814,
    lng: 21.4439156,
    pulse: 3,
    mood: "local city movement",
    crowd: "low",
    budget: "€",
    bestTime: "evening",
    tags: ["city", "coffee", "local", "cheap"],
    short: "Not a postcard. More like where the actual local week happens.",
    imageUrl: new URL("../../../story-feature/seed-pyrgos-centre-story.jpg", import.meta.url).href,
    hotness: 3,
    commentCount: 0,
    recentPostCount: 0,
    status: "quiet",
    avatars: [],
  },
  {
    id: "ancient-olympia",
    name: "Ancient Olympia",
    greekName: "Αρχαία Ολυμπία",
    type: "culture",
    area: "Olympia",
    x: 63,
    y: 48,
    lat: 37.6441431,
    lng: 21.6252773,
    pulse: 3,
    mood: "historic but still iconic",
    crowd: "low",
    budget: "€€",
    bestTime: "late afternoon",
    tags: ["culture", "unesco", "walk", "history"],
    short: "Ancient ruins, golden light, and a surprisingly good late-afternoon wander.",
    imageUrl: "/story-feature/ancient-olympia-online-story.jpg",
    hotness: 3,
    commentCount: 0,
    recentPostCount: 0,
    status: "quiet",
    avatars: [],
  },
];

const AUTHOR_SEEDS = [
  { id: "preview-eleni", name: "Eleni Demo", type: "LOCAL" },
  { id: "preview-nikos", name: "Nikos Demo", type: "GUIDE" },
  { id: "preview-iris", name: "Iris Demo", type: "TOURIST" },
  { id: "preview-alex", name: "Alex Demo", type: "LOCAL" },
] as const satisfies ReadonlyArray<Pick<Author, "id" | "name" | "type">>;

const POST_COPY = [
  "The shore is calm and the first umbrellas are opening.",
  "Easy parking by the north entrance right now.",
  "The water is clear today. Bring a mask for a quick swim.",
  "Coffee by the promenade before the afternoon rush.",
  "A few friends are heading down for sunset. Anyone joining?",
  "The light on the beach is getting really good.",
  "Small waves, warm sand, and plenty of room near the dunes.",
  "Tip: the quieter stretch is a short walk past the main bars.",
  "The sunset group is gathering by the boardwalk.",
  "Music is starting along the promenade.",
  "A table opened up for anyone arriving late.",
  "The beach feels lively now, with more people arriving.",
  "We are still here and the view after dark is lovely.",
] as const;

const COMMENT_COPY = [
  "Thanks for the update!",
  "I am on my way.",
  "That sounds lovely.",
  "The north entrance worked for me too.",
  "See you there!",
  "The water looks great.",
  "Saving this tip.",
  "A perfect evening for it.",
] as const;

const MEET_SEEDS = [
  { title: "Kourouta sunset walk", category: "sunset", hostIndex: 0, offsetHours: 2.5 },
  { title: "Beach volleyball catch-up", category: "beach", hostIndex: 1, offsetHours: 3 },
  { title: "Music by the promenade", category: "music", hostIndex: 3, offsetHours: 4 },
] as const satisfies ReadonlyArray<{
  title: string;
  category: MeetEvent["category"];
  hostIndex: number;
  offsetHours: number;
}>;

const SCENE_COUNTS: Record<
  TrafficScene,
  {
    posts: number;
    meets: number;
    stories: number;
    postComments: number;
    placeComments: number;
    ageMs: number;
  }
> = {
  quiet: { posts: 0, meets: 0, stories: 0, postComments: 0, placeComments: 0, ageMs: 0 },
  arriving: { posts: 1, meets: 1, stories: 1, postComments: 1, placeComments: 1, ageMs: 0 },
  hot: { posts: 8, meets: 2, stories: 3, postComments: 5, placeComments: 2, ageMs: 0 },
  live: { posts: 13, meets: 3, stories: 4, postComments: 8, placeComments: 3, ageMs: 0 },
  later: {
    posts: 13,
    meets: 3,
    stories: 4,
    postComments: 8,
    placeComments: 3,
    ageMs: 3 * HOUR + 10 * MINUTE,
  },
};

function authors(): Author[] {
  return AUTHOR_SEEDS.map(({ id, name, type }) => ({
    id,
    name,
    type,
    avatarUrl: initialsAvatarDataUri(name),
  }));
}

function makeComment(index: number, createdAt: string, people: Author[]): Comment {
  const author = people[(index + 1) % people.length];
  return {
    author: author.name,
    text: COMMENT_COPY[index % COMMENT_COPY.length],
    createdAt,
    userId: author.id,
    postingIdentity: author.type,
  };
}

/** A fresh, entirely in-memory dataset for one point on the preview timeline. */
export function buildTrafficPreviewScene(
  scene: TrafficScene,
  now: Date | number = Date.now(),
): TrafficPreviewSnapshot {
  const observedAt = now instanceof Date ? now.getTime() : now;
  const counts = SCENE_COUNTS[scene];
  const people = authors();
  const places = PREVIEW_PLACES.map((place) => ({
    ...place,
    tags: [...place.tags],
    avatars: [...place.avatars],
  }));
  const focusPlace = places[0];
  focusPlace.avatars = people
    .slice(0, Math.min(counts.posts, people.length))
    .map((author) => author.avatarUrl);
  const createdAt = (minutesAgo: number) =>
    new Date(observedAt - counts.ageMs - minutesAgo * MINUTE).toISOString();

  const posts: Post[] = POST_COPY.slice(0, counts.posts).map((copy, index) => {
    const author = people[index % people.length];
    return {
      id: `preview-post-${index + 1}`,
      authorId: author.id,
      placeId: focusPlace.id,
      kind: index % 5 === 1 ? "tip" : index % 5 === 2 ? "photo" : "spot",
      time: scene === "later" ? "3h ago" : `${4 + index * 2}m ago`,
      createdAt: createdAt(4 + index * 2),
      text: copy,
      tags: index % 2 === 0 ? ["Kourouta", "beach"] : ["local tip", "Kourouta"],
      likes: index < 3 ? 3 + index * 2 : index % 3,
      imageUrl: index % 5 === 2 ? focusPlace.imageUrl : "",
      comments:
        index < counts.postComments ? [makeComment(index, createdAt(2 + index), people)] : [],
      userId: author.id,
      postingIdentity: author.type,
    };
  });

  const meetEvents: MeetEvent[] = MEET_SEEDS.slice(0, counts.meets).map((seed, index) => {
    const host = people[seed.hostIndex];
    return {
      id: `preview-meet-${index + 1}`,
      title: seed.title,
      placeId: focusPlace.id,
      lat: focusPlace.lat,
      lng: focusPlace.lng,
      hostName: host.name,
      hostAvatar: host.avatarUrl,
      hostType: host.type as MeetEvent["hostType"],
      happensAt: new Date(observedAt - counts.ageMs + seed.offsetHours * HOUR).toISOString(),
      createdAt: createdAt(3 + index * 2),
      durationMin: 90,
      category: seed.category,
      vibe: "Friendly and open to everyone",
      price: "Free",
      capacity: 20,
      description: "A simulated gathering for the local traffic preview.",
      coverUrl: focusPlace.imageUrl,
      tags: ["Kourouta", "demo"],
      going: 2 + index * 3,
      maybe: index + 1,
      hot: index > 0,
      attendeeAvatars: [people[(seed.hostIndex + 1) % people.length].avatarUrl],
      userId: host.id,
    };
  });

  const stories: StoryItem[] = Array.from({ length: counts.stories }, (_, index) => {
    const author = people[(index + 2) % people.length];
    return {
      id: `preview-story-${index + 1}`,
      label: index % 2 === 0 ? "Beach right now" : "Kourouta update",
      placeId: focusPlace.id,
      userId: author.id,
      kind: index % 2 === 0 ? "photo" : "report",
      authorName: author.name,
      authorType: author.type as StoryItem["authorType"],
      authorAvatarUrl: author.avatarUrl,
      mediaUrl: focusPlace.imageUrl,
      caption: index % 2 === 0 ? "A simulated beach moment." : "A simulated local update.",
      expiresAfterHours: 6,
      report: index % 2 === 0 ? undefined : { crowd: "medium", parking: "easy" },
      createdAt: createdAt(5 + index * 4),
    };
  });

  const placeComments = Array.from({ length: counts.placeComments }, (_, index) =>
    makeComment(index + 3, createdAt(1 + index * 2), people),
  );

  const data: PulseData = {
    authors: people,
    profiles: [],
    places,
    posts,
    events: [],
    meetEvents,
    culturalEvents: [],
    routes: [],
    stories,
    vibeChips: [],
    claimedPlaceIds: [],
    dealPlaceIds: [],
    deals: [],
    placeComments: placeComments.length ? { [focusPlace.id]: placeComments } : {},
    routeComments: {},
    culturalEventComments: {},
    source: "preview",
  };

  return {
    data,
    activitySnapshot: buildPulseActivitySnapshot(data),
    areaIntelligence: deriveAreaIntelligenceSnapshot(data, observedAt),
    focusPlaceId: TRAFFIC_FOCUS_PLACE_ID,
    focusAreaId: TRAFFIC_FOCUS_AREA_ID,
  };
}

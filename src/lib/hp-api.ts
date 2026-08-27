import {
  type Author,
  type Comment,
  type EventItem,
  type Place,
  type Post,
  type RouteItem,
  type StoryItem,
} from "./hp-model";
import type { CreateMeetInput, MeetEvent, RsvpStatus } from "./hp/meet-types";
import type { StreakState } from "./hp/meet-store";
import { supabase } from "./supabase/client";
import type { Database } from "./supabase/database.types";

type TableRow<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Row"];

type AuthorRow = Pick<TableRow<"authors">, "id" | "name" | "type" | "avatar_url">;
type CommentRow = Pick<
  TableRow<"comments">,
  | "author_name"
  | "text"
  | "place_id"
  | "post_id"
  | "route_id"
  | "user_id"
  | "profile_id"
  | "posting_identity"
  | "author_kind"
>;
type EventRow = Pick<
  TableRow<"events">,
  "id" | "title" | "place_id" | "display_time" | "price" | "vibe" | "tags"
>;
type PlaceRow = Pick<
  TableRow<"places">,
  | "id"
  | "name"
  | "greek_name"
  | "type"
  | "area"
  | "x"
  | "y"
  | "lat"
  | "lng"
  | "pulse"
  | "mood"
  | "crowd"
  | "budget"
  | "best_time"
  | "tags"
  | "short"
  | "image_url"
  | "hotness"
  | "comment_count"
  | "recent_post_count"
  | "status"
  | "user_id"
  | "profile_id"
  | "created_by_identity"
  | "moderation_status"
>;
type PlaceAvatarRow = Pick<TableRow<"place_avatars">, "place_id" | "position" | "avatar_url">;
type PostRow = Pick<
  TableRow<"posts">,
  | "id"
  | "author_id"
  | "author_kind"
  | "user_id"
  | "profile_id"
  | "posting_identity"
  | "place_id"
  | "kind"
  | "display_time"
  | "text"
  | "tags"
  | "likes_count"
  | "image_url"
>;
type RouteRow = Pick<
  TableRow<"routes">,
  | "id"
  | "title"
  | "author_id"
  | "lede"
  | "duration"
  | "budget"
  | "tags"
  | "image_url"
  | "comment_count"
  | "saves_count"
>;
type RouteStopRow = Pick<
  TableRow<"route_stops">,
  "route_id" | "position" | "display_time" | "place_id" | "title" | "body"
>;
type LiveStoryRow = Pick<
  TableRow<"stories">,
  | "id"
  | "label"
  | "place_id"
  | "user_id"
  | "profile_id"
  | "kind"
  | "author_name"
  | "author_type"
  | "author_avatar_url"
  | "media_url"
  | "caption"
  | "expires_after_hours"
  | "crowd"
  | "parking"
  | "condition"
  | "created_at"
>;
type MeetEventRow = Pick<
  TableRow<"meet_events">,
  | "id"
  | "place_id"
  | "user_id"
  | "profile_id"
  | "title"
  | "host_name"
  | "host_avatar_url"
  | "host_type"
  | "starts_at"
  | "duration_min"
  | "category"
  | "vibe"
  | "price"
  | "capacity"
  | "description"
  | "cover_url"
  | "tags"
  | "going_count"
  | "maybe_count"
  | "hot"
  | "attendee_avatar_urls"
>;
type VibeChipRow = Pick<TableRow<"vibe_chips">, "label">;
type SavedItemRow = Pick<
  TableRow<"saved_items">,
  "target_type" | "place_id" | "post_id" | "route_id"
>;
type PostLikeRow = Pick<TableRow<"post_likes">, "post_id">;
type EventRsvpRow = Pick<TableRow<"event_rsvps">, "event_id" | "status">;
type StoryViewRow = Pick<TableRow<"story_views">, "story_id">;
type ActivityDayRow = Pick<TableRow<"user_activity_days">, "activity_day">;
type ProfileRow = Pick<
  TableRow<"profiles">,
  | "id"
  | "handle"
  | "display_name"
  | "avatar_url"
  | "avatar_path"
  | "default_identity"
  | "home_area"
  | "profile_completed_at"
>;

interface PulseBootstrapPayload {
  authors: AuthorRow[];
  profiles: ProfileRow[];
  places: PlaceRow[];
  place_avatars: PlaceAvatarRow[];
  posts: PostRow[];
  comments: CommentRow[];
  events: EventRow[];
  meet_events: MeetEventRow[];
  routes: RouteRow[];
  route_stops: RouteStopRow[];
  stories: LiveStoryRow[];
  vibe_chips: VibeChipRow[];
}

const COMMENT_RETURN_COLUMNS =
  "author_name,text,place_id,post_id,route_id,user_id,profile_id,posting_identity,author_kind";
const PLACE_RETURN_COLUMNS =
  "id,name,greek_name,type,area,x,y,lat,lng,pulse,mood,crowd,budget,best_time,tags,short,image_url,hotness,comment_count,recent_post_count,status,user_id,profile_id,created_by_identity,moderation_status";
const POST_RETURN_COLUMNS =
  "id,author_id,author_kind,user_id,profile_id,posting_identity,place_id,kind,display_time,text,tags,likes_count,image_url";
const STORY_RETURN_COLUMNS =
  "id,label,place_id,user_id,profile_id,kind,author_name,author_type,author_avatar_url,media_url,caption,expires_after_hours,crowd,parking,condition,created_at";
const MEET_EVENT_RETURN_COLUMNS =
  "id,place_id,user_id,profile_id,title,host_name,host_avatar_url,host_type,starts_at,duration_min,category,vibe,price,capacity,description,cover_url,tags,going_count,maybe_count,hot,attendee_avatar_urls";

type SavedTarget =
  | { type: "place"; id: string }
  | { type: "post"; id: string }
  | { type: "route"; id: string };

type CommentTarget = SavedTarget;

export interface PulseData {
  authors: Author[];
  profiles: PulseProfileSummary[];
  places: Place[];
  posts: Post[];
  events: EventItem[];
  meetEvents: MeetEvent[];
  routes: RouteItem[];
  stories: StoryItem[];
  vibeChips: string[];
  placeComments: Record<string, Comment[]>;
  routeComments: Record<string, Comment[]>;
  source: "supabase";
}

export interface PulseProfileSummary {
  id: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  avatarPath: string | null;
  defaultIdentity: Author["type"];
  homeArea: string | null;
  profileCompletedAt: string | null;
}

export interface PulseUserState {
  savedPlaceIds: string[];
  savedPosts: Record<string, boolean>;
  savedRoutes: Record<string, boolean>;
  likedPosts: Record<string, boolean>;
  rsvpMap: Record<string, RsvpStatus>;
  seenStoryIds: string[];
  streak: StreakState;
}

export interface CreatePulsePostInput {
  text: string;
  place: Place;
  vibes: string[];
  identity?: Author["type"];
  profileId?: string | null;
  authorName?: string;
}

export interface CreatePulsePlaceInput {
  name: string;
  greekName?: string;
  type: Place["type"];
  area: string;
  lat: number;
  lng: number;
  short: string;
  imageUrl: string;
  tags: string[];
  mood?: string;
  crowd: string;
  budget: string;
  bestTime: string;
  profileId?: string | null;
  identity?: Author["type"];
  authorAvatarUrl?: string | null;
}

export interface CreatePulseStoryInput {
  place: Place;
  caption: string;
  kind: StoryItem["kind"];
  profileId?: string | null;
  authorName: string;
  authorType: StoryItem["authorType"];
  authorAvatarUrl: string;
  visibilityHours?: number;
  crowd?: "low" | "medium" | "high";
  parking?: "easy" | "tight" | "full";
  condition?: string[];
}

export interface CreatePulseMeetEventInput extends CreateMeetInput {
  place: Place;
  profileId?: string | null;
  hostName: string;
  hostAvatarUrl: string;
  hostType: MeetEvent["hostType"];
}

export const emptyPulseData: PulseData = {
  authors: [],
  profiles: [],
  places: [],
  posts: [],
  events: [],
  meetEvents: [],
  routes: [],
  stories: [],
  vibeChips: [],
  placeComments: {},
  routeComments: {},
  source: "supabase",
};

let pulseDataRequest: Promise<PulseData> | null = null;

function assertSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured in the static app build.");
  }
  return supabase;
}

// crypto.randomUUID() only exists in secure contexts (HTTPS/localhost) and
// on newer browser engines, so it can be missing when testing over plain
// HTTP (e.g. a LAN IP) or on an older WebView. Fall back to
// crypto.getRandomValues (unrestricted) and finally Math.random.
function randomIdSuffix(length = 8): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
  }
  return Math.random()
    .toString(36)
    .slice(2, 2 + length)
    .padEnd(length, "0");
}

async function ensurePulseUserId() {
  const client = assertSupabase();
  const sessionResult = await client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  if (sessionResult.data.session?.user.id) return sessionResult.data.session.user.id;

  const signInResult = await client.auth.signInAnonymously();
  if (signInResult.error) throw signInResult.error;
  const userId = signInResult.data.user?.id;
  if (!userId) throw new Error("Anonymous sign-in did not return a user.");
  return userId;
}

function groupBy<T>(items: T[], keyFor: (item: T, index: number) => string | null) {
  return items.reduce<Record<string, T[]>>((groups, item, index) => {
    const key = keyFor(item, index);
    if (!key) return groups;
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, {});
}

function authorType(value: string | null | undefined): Author["type"] {
  const normalized = (value ?? "LOCAL").toUpperCase();
  if (
    normalized === "LOCAL EDITOR" ||
    normalized === "LOCAL" ||
    normalized === "TOURIST" ||
    normalized === "GUIDE" ||
    normalized === "BUSINESS" ||
    normalized === "EVENT" ||
    normalized === "EDITOR"
  ) {
    return normalized;
  }
  return "LOCAL";
}

function storyKind(value: string | null | undefined): StoryItem["kind"] {
  const normalized = (value ?? "photo").toLowerCase();
  if (
    normalized === "photo" ||
    normalized === "report" ||
    normalized === "beach_status" ||
    normalized === "business_status" ||
    normalized === "editor_note" ||
    normalized === "event" ||
    normalized === "route_tease"
  ) {
    return normalized;
  }
  return "photo";
}

function storyAuthorType(value: string | null | undefined): StoryItem["authorType"] {
  const normalized = (value ?? "LOCAL").toUpperCase();
  if (
    normalized === "LOCAL" ||
    normalized === "TOURIST" ||
    normalized === "BUSINESS" ||
    normalized === "EDITOR" ||
    normalized === "GUIDE"
  ) {
    return normalized;
  }
  return "LOCAL";
}

function meetCategory(value: string | null | undefined): MeetEvent["category"] {
  const normalized = (value ?? "social").toLowerCase();
  if (
    normalized === "panigyri" ||
    normalized === "beach" ||
    normalized === "music" ||
    normalized === "sunset" ||
    normalized === "sport" ||
    normalized === "cleanup" ||
    normalized === "food" ||
    normalized === "social"
  ) {
    return normalized;
  }
  return "social";
}

function meetHostType(value: string | null | undefined): MeetEvent["hostType"] {
  const normalized = (value ?? "LOCAL").toUpperCase();
  if (
    normalized === "LOCAL" ||
    normalized === "GUIDE" ||
    normalized === "BUSINESS" ||
    normalized === "TOURIST"
  ) {
    return normalized;
  }
  return "LOCAL";
}

function mapComment(row: CommentRow): Comment {
  return {
    author: row.author_name,
    text: row.text,
    userId: row.user_id,
    profileId: row.profile_id,
    postingIdentity: authorType(row.posting_identity),
    authorKind: row.author_kind,
  };
}

function mapAuthor(row: AuthorRow): Author {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Author["type"],
    avatarUrl: row.avatar_url,
  };
}

function mapProfile(row: ProfileRow): PulseProfileSummary {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    avatarPath: row.avatar_path,
    defaultIdentity: authorType(row.default_identity),
    homeArea: row.home_area,
    profileCompletedAt: row.profile_completed_at,
  };
}

function mapPlace(row: PlaceRow, avatarsByPlace: Record<string, PlaceAvatarRow[]>): Place {
  return {
    id: row.id,
    name: row.name,
    greekName: row.greek_name,
    type: row.type as Place["type"],
    area: row.area,
    x: row.x,
    y: row.y,
    lat: row.lat,
    lng: row.lng,
    pulse: row.pulse,
    mood: row.mood,
    crowd: row.crowd,
    budget: row.budget,
    bestTime: row.best_time,
    tags: row.tags,
    short: row.short,
    imageUrl: row.image_url,
    hotness: row.hotness,
    commentCount: row.comment_count,
    recentPostCount: row.recent_post_count,
    status: row.status as Place["status"],
    avatars: (avatarsByPlace[row.id] ?? []).map((avatar) => avatar.avatar_url),
    userId: row.user_id,
    profileId: row.profile_id,
    createdByIdentity: authorType(row.created_by_identity),
    moderationStatus: row.moderation_status,
  };
}

function mapPost(row: PostRow, commentsByPost: Record<string, Comment[]>): Post {
  return {
    id: row.id,
    authorId: row.author_id,
    placeId: row.place_id,
    kind: row.kind as Post["kind"],
    time: row.display_time,
    text: row.text,
    tags: row.tags,
    likes: row.likes_count,
    imageUrl: row.image_url,
    comments: commentsByPost[row.id] ?? [],
    userId: row.user_id,
    profileId: row.profile_id,
    postingIdentity: authorType(row.posting_identity),
    authorKind: row.author_kind,
  };
}

function mapEvent(row: EventRow): EventItem {
  return {
    id: row.id,
    title: row.title,
    placeId: row.place_id,
    time: row.display_time,
    price: row.price,
    vibe: row.vibe,
    tags: row.tags,
  };
}

function mapStory(row: LiveStoryRow): StoryItem {
  type StoryReport = NonNullable<StoryItem["report"]>;
  const crowd: StoryReport["crowd"] =
    row.crowd === "low" || row.crowd === "medium" || row.crowd === "high" ? row.crowd : undefined;
  const parking: StoryReport["parking"] =
    row.parking === "easy" || row.parking === "tight" || row.parking === "full"
      ? row.parking
      : undefined;
  const report: StoryItem["report"] =
    crowd || parking || row.condition.length > 0
      ? {
          crowd,
          parking,
          condition: row.condition,
        }
      : undefined;

  return {
    id: row.id,
    label: row.label,
    placeId: row.place_id,
    userId: row.user_id,
    profileId: row.profile_id,
    kind: storyKind(row.kind),
    authorName: row.author_name,
    authorType: storyAuthorType(row.author_type),
    authorAvatarUrl: row.author_avatar_url,
    mediaUrl: row.media_url,
    caption: row.caption,
    expiresAfterHours: row.expires_after_hours,
    report,
    createdAt: row.created_at,
  };
}

function mapMeetEvent(row: MeetEventRow, place?: Place): MeetEvent {
  return {
    id: row.id,
    title: row.title,
    placeId: row.place_id,
    lat: place?.lat ?? 0,
    lng: place?.lng ?? 0,
    hostName: row.host_name,
    hostAvatar: row.host_avatar_url,
    hostType: meetHostType(row.host_type),
    happensAt: row.starts_at,
    durationMin: row.duration_min,
    category: meetCategory(row.category),
    vibe: row.vibe,
    price: row.price,
    capacity: row.capacity ?? undefined,
    description: row.description,
    coverUrl: row.cover_url || place?.imageUrl || "",
    tags: row.tags,
    going: row.going_count,
    maybe: row.maybe_count,
    hot: row.hot,
    attendeeAvatars: row.attendee_avatar_urls,
    userId: row.user_id,
    profileId: row.profile_id,
  };
}

function mapRoute(row: RouteRow, stopsByRoute: Record<string, RouteStopRow[]>): RouteItem {
  return {
    id: row.id,
    title: row.title,
    authorId: row.author_id,
    lede: row.lede,
    duration: row.duration,
    budget: row.budget,
    stops: (stopsByRoute[row.id] ?? []).map((stop) => ({
      time: stop.display_time,
      placeId: stop.place_id,
      title: stop.title,
      body: stop.body,
    })),
    tags: row.tags,
    imageUrl: row.image_url,
    commentCount: row.comment_count,
    saves: row.saves_count,
  };
}

function commentTargetColumn(target: CommentTarget) {
  if (target.type === "place") return "place_id" as const;
  if (target.type === "post") return "post_id" as const;
  return "route_id" as const;
}

function targetColumnValues(target: CommentTarget) {
  return {
    place_id: target.type === "place" ? target.id : null,
    post_id: target.type === "post" ? target.id : null,
    route_id: target.type === "route" ? target.id : null,
  };
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 46) || "place"
  );
}

function statusFromPulse(pulse: number): Place["status"] {
  if (pulse >= 9) return "busy";
  if (pulse >= 7) return "popular";
  if (pulse >= 4) return "active";
  return "quiet";
}

function mapPointFromLatLng(lat: number, lng: number) {
  const latMin = 36.35;
  const latMax = 39.15;
  const lngMin = 19.9;
  const lngMax = 23.25;
  const x = ((lng - lngMin) / (lngMax - lngMin)) * 100;
  const y = ((latMax - lat) / (latMax - latMin)) * 100;
  return {
    x: Math.max(0, Math.min(100, Math.round(x))),
    y: Math.max(0, Math.min(100, Math.round(y))),
  };
}

async function fetchPulseData(): Promise<PulseData> {
  const client = assertSupabase();
  const result = await client.rpc("get_pulse_bootstrap");
  if (result.error) throw result.error;

  const data = (result.data ?? {
    authors: [],
    profiles: [],
    places: [],
    place_avatars: [],
    posts: [],
    comments: [],
    events: [],
    meet_events: [],
    routes: [],
    route_stops: [],
    stories: [],
    vibe_chips: [],
  }) as unknown as PulseBootstrapPayload;

  const commentRows = data.comments ?? [];
  const comments = commentRows.map(mapComment);
  const commentsByPost = groupBy(comments, (_, index) => commentRows[index]?.post_id ?? null);
  const commentsByPlace = groupBy(comments, (_, index) => commentRows[index]?.place_id ?? null);
  const commentsByRoute = groupBy(comments, (_, index) => commentRows[index]?.route_id ?? null);
  const avatarsByPlace = groupBy(data.place_avatars ?? [], (avatar) => avatar.place_id);
  const stopsByRoute = groupBy(data.route_stops ?? [], (stop) => stop.route_id);

  const places = (data.places ?? []).map((place) => mapPlace(place, avatarsByPlace));
  const placeById = new Map(places.map((place) => [place.id, place]));

  const pulseData: PulseData = {
    authors: (data.authors ?? []).map(mapAuthor),
    profiles: (data.profiles ?? []).map(mapProfile),
    places,
    posts: (data.posts ?? []).map((post) => mapPost(post, commentsByPost)),
    events: (data.events ?? []).map(mapEvent),
    meetEvents: (data.meet_events ?? []).map((event) =>
      mapMeetEvent(event, placeById.get(event.place_id)),
    ),
    routes: (data.routes ?? []).map((route) => mapRoute(route, stopsByRoute)),
    stories: (data.stories ?? []).map(mapStory),
    vibeChips: (data.vibe_chips ?? []).map((chip) => chip.label),
    placeComments: commentsByPlace,
    routeComments: commentsByRoute,
    source: "supabase",
  };

  return pulseData;
}

export async function loadPulseData(): Promise<PulseData> {
  if (!pulseDataRequest) {
    pulseDataRequest = fetchPulseData().finally(() => {
      pulseDataRequest = null;
    });
  }

  return pulseDataRequest;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return dayKey(date);
}

function computeStreak(days: string[]): StreakState {
  const uniqueDays = new Set(days);
  const today = dayKey(new Date());
  const start = uniqueDays.has(today) ? today : shiftDay(today, -1);
  let cursor = start;
  let count = 0;

  while (uniqueDays.has(cursor)) {
    count += 1;
    cursor = shiftDay(cursor, -1);
  }

  return {
    count,
    lastContributionDay: count > 0 ? start : "",
    freezeAvailable: true,
  };
}

function emptyPulseUserState(): PulseUserState {
  return {
    savedPlaceIds: [],
    savedPosts: {},
    savedRoutes: {},
    likedPosts: {},
    rsvpMap: {},
    seenStoryIds: [],
    streak: { count: 0, lastContributionDay: "", freezeAvailable: true },
  };
}

export async function loadPulseUserState(): Promise<PulseUserState> {
  const client = assertSupabase();
  const sessionResult = await client.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const userId = sessionResult.data.session?.user.id;
  if (!userId) return emptyPulseUserState();

  const [savedResult, likesResult, rsvpsResult, storyViewsResult, activityDaysResult] =
    await Promise.all([
      client
        .from("saved_items")
        .select("target_type,place_id,post_id,route_id")
        .eq("user_id", userId),
      client.from("post_likes").select("post_id").eq("user_id", userId),
      client.from("event_rsvps").select("event_id,status").eq("user_id", userId),
      client.from("story_views").select("story_id").eq("user_id", userId),
      client
        .from("user_activity_days")
        .select("activity_day")
        .eq("user_id", userId)
        .order("activity_day", { ascending: false })
        .limit(30),
    ]);

  if (savedResult.error) throw savedResult.error;
  if (likesResult.error) throw likesResult.error;
  if (rsvpsResult.error) throw rsvpsResult.error;
  if (storyViewsResult.error) throw storyViewsResult.error;
  if (activityDaysResult.error) throw activityDaysResult.error;

  const activityDays =
    (activityDaysResult.data as ActivityDayRow[] | null)?.map((item) => item.activity_day) ?? [];

  return {
    savedPlaceIds:
      (savedResult.data as SavedItemRow[] | null)
        ?.filter((item) => item.target_type === "place" && item.place_id)
        .map((item) => item.place_id as string) ?? [],
    savedPosts:
      (savedResult.data as SavedItemRow[] | null)
        ?.filter((item) => item.target_type === "post" && item.post_id)
        .reduce<
          Record<string, boolean>
        >((items, item) => ({ ...items, [item.post_id as string]: true }), {}) ?? {},
    savedRoutes:
      (savedResult.data as SavedItemRow[] | null)
        ?.filter((item) => item.target_type === "route" && item.route_id)
        .reduce<
          Record<string, boolean>
        >((items, item) => ({ ...items, [item.route_id as string]: true }), {}) ?? {},
    likedPosts:
      (likesResult.data as PostLikeRow[] | null)?.reduce<Record<string, boolean>>(
        (items, item) => ({ ...items, [item.post_id]: true }),
        {},
      ) ?? {},
    rsvpMap:
      (rsvpsResult.data as EventRsvpRow[] | null)?.reduce<Record<string, RsvpStatus>>(
        (items, item) => ({ ...items, [item.event_id]: item.status as RsvpStatus }),
        {},
      ) ?? {},
    seenStoryIds:
      (storyViewsResult.data as StoryViewRow[] | null)?.map((item) => item.story_id) ?? [],
    streak: computeStreak(activityDays),
  };
}

export async function createPulsePost(input: CreatePulsePostInput): Promise<Post> {
  const client = assertSupabase();
  const userId = await ensurePulseUserId();
  const identity = authorType(input.identity);
  const identityTag = identity.toLowerCase();
  const tags = Array.from(
    new Set([
      identityTag,
      ...(input.vibes.length > 0 ? input.vibes.map((vibe) => vibe.toLowerCase()) : ["local"]),
    ]),
  );
  const id = `user-post-${Date.now()}-${randomIdSuffix()}`;

  const result = await client
    .from("posts")
    .insert({
      id,
      author_id: "you",
      place_id: input.place.id,
      kind: "spot",
      display_time: "just now",
      text: input.text,
      tags,
      likes_count: 0,
      image_url: input.place.imageUrl,
      user_id: userId,
      profile_id: input.profileId ?? null,
      posting_identity: identity,
      author_kind: "user",
      moderation_status: "pending",
      sort_order: -Date.now(),
    })
    .select(POST_RETURN_COLUMNS)
    .single();

  if (result.error) throw result.error;
  return mapPost(result.data, {});
}

export async function createPulsePlace(input: CreatePulsePlaceInput): Promise<Place> {
  const client = assertSupabase();
  const userId = await ensurePulseUserId();
  const identity = authorType(input.identity);
  const id = `user-place-${slug(input.name)}-${Date.now().toString(36)}`;
  const pulse = 4;
  const { x, y } = mapPointFromLatLng(input.lat, input.lng);

  const result = await client
    .from("places")
    .insert({
      id,
      name: input.name,
      greek_name: input.greekName?.trim() || input.name,
      type: input.type,
      area: input.area,
      x,
      y,
      lat: input.lat,
      lng: input.lng,
      pulse,
      mood: input.mood?.trim() || input.short,
      crowd: input.crowd,
      budget: input.budget,
      best_time: input.bestTime,
      tags: input.tags,
      short: input.short,
      image_url: input.imageUrl,
      hotness: pulse,
      comment_count: 0,
      recent_post_count: 0,
      status: statusFromPulse(pulse),
      user_id: userId,
      profile_id: input.profileId ?? null,
      created_by_identity: identity,
      moderation_status: "pending",
      sort_order: -Math.floor(Date.now() / 1000),
    })
    .select(PLACE_RETURN_COLUMNS)
    .single();

  if (result.error) throw result.error;

  const avatar = {
    place_id: result.data.id,
    position: 0,
    avatar_url: input.authorAvatarUrl || "https://i.pravatar.cc/120?img=22",
  };
  const avatarResult = await client.from("place_avatars").insert(avatar);
  const avatarsByPlace = avatarResult.error ? {} : { [result.data.id]: [avatar] };

  if (avatarResult.error) {
    console.warn("Could not attach place avatar.", avatarResult.error);
  }

  return mapPlace(result.data, avatarsByPlace);
}

export async function createPulseStory(input: CreatePulseStoryInput): Promise<StoryItem> {
  const client = assertSupabase();
  const userId = await ensurePulseUserId();
  const id = `user-story-${Date.now().toString(36)}-${randomIdSuffix()}`;

  const result = await client
    .from("stories")
    .insert({
      id,
      label: input.place.name,
      place_id: input.place.id,
      position: Math.floor(Date.now() / 1000),
      user_id: userId,
      profile_id: input.profileId ?? null,
      kind: storyKind(input.kind),
      author_name: input.authorName,
      author_type: storyAuthorType(input.authorType),
      author_avatar_url: input.authorAvatarUrl,
      media_url: input.place.imageUrl,
      caption: input.caption.trim() || "Just posted from this place.",
      expires_after_hours: input.visibilityHours ?? 24,
      crowd: input.crowd ?? null,
      parking: input.parking ?? null,
      condition: input.condition ?? [],
      moderation_status: "pending",
    })
    .select(STORY_RETURN_COLUMNS)
    .single();

  if (result.error) throw result.error;
  return mapStory(result.data);
}

export async function setPulseMeetRsvp(
  eventId: string,
  status: RsvpStatus | null,
  options: { profileId?: string | null } = {},
) {
  const client = assertSupabase();
  const userId = await ensurePulseUserId();

  if (!status) {
    const result = await client
      .from("event_rsvps")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", userId);
    if (result.error) throw result.error;
    return;
  }

  const result = await client.from("event_rsvps").upsert(
    {
      event_id: eventId,
      user_id: userId,
      profile_id: options.profileId ?? null,
      status,
    },
    { onConflict: "event_id,user_id" },
  );

  if (result.error) throw result.error;
}

export async function createPulseMeetEvent(input: CreatePulseMeetEventInput): Promise<MeetEvent> {
  const client = assertSupabase();
  const userId = await ensurePulseUserId();
  const id = `user-meet-${Date.now().toString(36)}-${randomIdSuffix()}`;

  const result = await client
    .from("meet_events")
    .insert({
      id,
      place_id: input.place.id,
      user_id: userId,
      profile_id: input.profileId ?? null,
      title: input.title.trim(),
      host_name: input.hostName,
      host_avatar_url: input.hostAvatarUrl,
      host_type: meetHostType(input.hostType),
      starts_at: input.happensAt,
      duration_min: 120,
      category: meetCategory(input.category),
      vibe: input.vibe,
      price: input.price,
      capacity: input.capacity ?? null,
      description: input.description.trim(),
      cover_url: input.place.imageUrl,
      tags: Array.from(new Set([input.place.area, input.category, ...input.tags])).slice(0, 5),
      seed_going_count: 0,
      seed_maybe_count: 0,
      going_count: 0,
      maybe_count: 0,
      hot: false,
      attendee_avatar_urls: [input.hostAvatarUrl],
      moderation_status: "pending",
    })
    .select(MEET_EVENT_RETURN_COLUMNS)
    .single();

  if (result.error) throw result.error;
  await setPulseMeetRsvp(result.data.id, "going", { profileId: input.profileId });

  const updatedResult = await client
    .from("meet_events")
    .select(MEET_EVENT_RETURN_COLUMNS)
    .eq("id", result.data.id)
    .single();
  if (updatedResult.error) throw updatedResult.error;

  return mapMeetEvent(updatedResult.data, input.place);
}

export async function markPulseStoriesSeen(storyIds: string[]) {
  const uniqueStoryIds = Array.from(new Set(storyIds)).filter(Boolean);
  if (uniqueStoryIds.length === 0) return;

  const client = assertSupabase();
  const userId = await ensurePulseUserId();
  const result = await client.from("story_views").upsert(
    uniqueStoryIds.map((storyId) => ({
      story_id: storyId,
      user_id: userId,
      seen_at: new Date().toISOString(),
    })),
    { onConflict: "story_id,user_id" },
  );

  if (result.error) throw result.error;
}

export async function recordPulseActivityDay(): Promise<StreakState> {
  const client = assertSupabase();
  const userId = await ensurePulseUserId();
  const today = dayKey(new Date());

  const upsertResult = await client
    .from("user_activity_days")
    .upsert({ user_id: userId, activity_day: today }, { onConflict: "user_id,activity_day" });
  if (upsertResult.error) throw upsertResult.error;

  const daysResult = await client
    .from("user_activity_days")
    .select("activity_day")
    .eq("user_id", userId)
    .order("activity_day", { ascending: false })
    .limit(30);
  if (daysResult.error) throw daysResult.error;

  const days = (daysResult.data as ActivityDayRow[] | null)?.map((item) => item.activity_day) ?? [];
  return computeStreak(days);
}

export async function addPulseComment(
  target: CommentTarget,
  text: string,
  options: {
    profileId?: string | null;
    authorName?: string;
    identity?: Author["type"];
  } = {},
): Promise<Comment> {
  const client = assertSupabase();
  const userId = await ensurePulseUserId();
  const identity = authorType(options.identity);

  const result = await client
    .from("comments")
    .insert({
      target_type: target.type,
      ...targetColumnValues(target),
      author_id: "you",
      author_name: options.authorName?.trim() || "You",
      user_id: userId,
      profile_id: options.profileId ?? null,
      posting_identity: identity,
      author_kind: "user",
      text,
      moderation_status: "pending",
      sort_order: Date.now(),
    })
    .select(COMMENT_RETURN_COLUMNS)
    .single();

  if (result.error) throw result.error;
  return mapComment(result.data);
}

export async function setSavedItem(target: SavedTarget, saved: boolean) {
  const client = assertSupabase();
  const userId = await ensurePulseUserId();
  const column = commentTargetColumn(target);

  if (!saved) {
    const result = await client
      .from("saved_items")
      .delete()
      .eq("user_id", userId)
      .eq("target_type", target.type)
      .eq(column, target.id);
    if (result.error) throw result.error;
    return;
  }

  const result = await client.from("saved_items").insert({
    user_id: userId,
    target_type: target.type,
    ...targetColumnValues(target),
  });

  if (result.error && result.error.code !== "23505") throw result.error;
}

export async function setPostLike(postId: string, liked: boolean) {
  const client = assertSupabase();
  const userId = await ensurePulseUserId();

  if (!liked) {
    const result = await client
      .from("post_likes")
      .delete()
      .eq("user_id", userId)
      .eq("post_id", postId);
    if (result.error) throw result.error;
    return;
  }

  const result = await client.from("post_likes").insert({
    user_id: userId,
    post_id: postId,
  });

  if (result.error && result.error.code !== "23505") throw result.error;
}

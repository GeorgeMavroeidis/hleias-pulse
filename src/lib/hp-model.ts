export type PlaceType =
  | "beach"
  | "culture"
  | "nature"
  | "food"
  | "local"
  | "village"
  | "night"
  | "sunset";

export type PlaceStatus = "quiet" | "active" | "popular" | "busy";

export interface Author {
  id: string;
  name: string;
  type: "LOCAL EDITOR" | "LOCAL" | "TOURIST" | "GUIDE" | "BUSINESS" | "EVENT" | "EDITOR";
  avatarUrl: string;
}

export interface Comment {
  author: string;
  text: string;
  createdAt?: string | null;
  userId?: string | null;
  profileId?: string | null;
  postingIdentity?: Author["type"];
  authorKind?: string;
}

export interface Place {
  id: string;
  name: string;
  greekName: string;
  type: PlaceType;
  area: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
  pulse: number;
  mood: string;
  crowd: string;
  budget: string;
  bestTime: string;
  tags: string[];
  short: string;
  imageUrl: string;
  hotness: number;
  commentCount: number;
  recentPostCount: number;
  status: PlaceStatus;
  avatars: string[];
  userId?: string | null;
  profileId?: string | null;
  createdByIdentity?: Author["type"];
  moderationStatus?: string;
}

export interface Post {
  id: string;
  authorId: string;
  placeId: string;
  kind: "spot" | "tip" | "event" | "photo";
  time: string;
  createdAt?: string | null;
  text: string;
  tags: string[];
  likes: number;
  imageUrl: string;
  comments: Comment[];
  userId?: string | null;
  profileId?: string | null;
  postingIdentity?: Author["type"];
  authorKind?: string;
}

export interface EventItem {
  id: string;
  title: string;
  placeId: string;
  time: string;
  createdAt?: string | null;
  price: string;
  vibe: string;
  tags: string[];
}

export interface RouteStop {
  time: string;
  placeId: string;
  title: string;
  body: string;
}

export interface RouteItem {
  id: string;
  title: string;
  authorId: string;
  lede: string;
  duration: string;
  budget: string;
  stops: RouteStop[];
  tags: string[];
  imageUrl: string;
  commentCount: number;
  saves: number;
}

export interface StoryItem {
  id: string;
  label: string;
  placeId: string;
  userId?: string | null;
  profileId?: string | null;
  kind:
    | "photo"
    | "report"
    | "beach_status"
    | "business_status"
    | "editor_note"
    | "event"
    | "route_tease";
  authorName: string;
  authorType: "LOCAL" | "TOURIST" | "BUSINESS" | "EDITOR" | "GUIDE";
  authorAvatarUrl: string;
  mediaUrl: string;
  caption: string;
  expiresAfterHours?: number | null;
  report?: {
    crowd?: "low" | "medium" | "high";
    parking?: "easy" | "tight" | "full";
    condition?: string[];
  };
  createdAt: string;
}

export const typeColor: Record<PlaceType, string> = {
  beach: "#7FC8DE",
  culture: "#0E3A5B",
  nature: "#667A3D",
  food: "#E06A32",
  local: "#E06A32",
  village: "#7A4DD8",
  night: "#7A4DD8",
  sunset: "#E06A32",
};

export const authorTypeColor: Record<Author["type"], string> = {
  "LOCAL EDITOR": "#7A4DD8",
  LOCAL: "#667A3D",
  TOURIST: "#0E3A5B",
  GUIDE: "#7A4DD8",
  BUSINESS: "#E06A32",
  EVENT: "#E06A32",
  EDITOR: "#7A4DD8",
};

export const fallbackAuthor: Author = {
  id: "unknown",
  name: "Local",
  type: "LOCAL",
  avatarUrl: "https://i.pravatar.cc/120?img=22",
};

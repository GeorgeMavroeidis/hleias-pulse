import {
  Map as MapIcon,
  Radio,
  Route as RouteIcon,
  CalendarHeart,
  MessageCircle,
  MapPin,
  Camera,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { type Author, type Place, type Post } from "@/lib/hp-model";
import { type PulseProfileSummary } from "@/lib/hp-api";
import { type PulseAccountProfile, type PulseAccountState } from "@/lib/hp-auth";
import { type PlaceStory } from "@/lib/hp/place-stories";
import { type AreaState, type SignalQuality } from "@/lib/hp/area-intelligence";
import { type DiscoveryLens } from "@/lib/hp/discovery";
import { readMarkerMotionPreference, type MarkerMotion } from "@/lib/hp/marker-motion";

export type Tab = "map" | "pulse" | "routes" | "meet" | "saved" | "deals";
export type NavTab = Exclude<Tab, "saved" | "deals">;
export type MeetSubTab = "community" | "events";
export type ComposerMode = "post" | "place" | "story" | "event" | "question";
export type { MarkerMotion } from "@/lib/hp/marker-motion";
export type CreateStoryInput = {
  placeId: string;
  caption: string;
  kind: PlaceStory["kind"];
  crowd?: "low" | "medium" | "high";
  parking?: "easy" | "tight" | "full";
  condition?: string[];
  visibilityHours?: number;
};
export type PostingIdentity = Extract<Author["type"], "LOCAL" | "TOURIST" | "GUIDE">;

export const AREA_STATE_LABEL: Record<AreaState, string> = {
  calm: "Calm",
  rising: "Rising",
  active: "Active",
  hot: "Hot",
  cooling: "Cooling",
};

export const SIGNAL_QUALITY_LABEL: Record<SignalQuality, string> = {
  confirmed: "Confirmed",
  stable: "Stable",
  fading: "Fading",
  uncertain: "Uncertain",
};

export const POSTING_IDENTITIES: { id: PostingIdentity; label: string; helper: string }[] = [
  { id: "LOCAL", label: "Local", helper: "I know the area" },
  { id: "TOURIST", label: "Tourist", helper: "I am visiting" },
  { id: "GUIDE", label: "Guide", helper: "I can recommend" },
];
export const COMPOSER_MODE_ICONS: Record<ComposerMode, LucideIcon> = {
  post: MessageCircle,
  place: MapPin,
  story: Camera,
  event: CalendarHeart,
  question: HelpCircle,
};
export const ROUTE_FILTERS = ["All", "Beach", "Nature", "Culture", "No car", "Free"] as const;
export type RouteFilter = (typeof ROUTE_FILTERS)[number];

export const DISCOVERY_LENS_LABEL: Record<DiscoveryLens, string> = {
  chill: "Chill",
  social: "Social",
  music: "Music",
  beach: "Beach",
  food: "Food",
};

export const TAB_ITEMS: { id: NavTab; label: string; Icon: LucideIcon }[] = [
  { id: "map", label: "Map", Icon: MapIcon },
  { id: "pulse", label: "Pulse", Icon: Radio },
  { id: "routes", label: "Routes", Icon: RouteIcon },
  { id: "meet", label: "Meet", Icon: CalendarHeart },
];
export { HP_EASE_OUT, HP_EASE_STANDARD, HP_TRANSITION } from "@/lib/hp/motion";
export const MARKER_MOTION_OPTIONS: { id: MarkerMotion; label: string; description: string }[] = [
  { id: "pulse", label: "Pulse", description: "Restrained rings for recent community activity." },
  { id: "calm", label: "Calm", description: "The same Pulse identity, with slower motion." },
];

export function initialMarkerMotion(): MarkerMotion {
  try {
    return readMarkerMotionPreference(
      typeof window === "undefined" ? undefined : window.localStorage,
    );
  } catch {
    return "pulse";
  }
}
export type ShareTarget = {
  type: "app" | "place" | "post" | "route" | "story";
  id?: string;
  placeId?: string;
  label: string;
  text?: string;
};

export const openStreetMapUrl = ({ lat, lng }: Pick<Place, "lat" | "lng">) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
export const isTab = (value: string | null): value is Tab =>
  value === "map" ||
  value === "pulse" ||
  value === "routes" ||
  value === "meet" ||
  value === "saved" ||
  value === "deals";

export const truncateShareText = (text: string) =>
  text.length > 150 ? `${text.slice(0, 147).trim()}...` : text;

export const shareUrlFor = (target: ShareTarget) => {
  if (typeof window === "undefined") return "/";
  const url = new URL("/", window.location.origin);
  if (target.type === "story") {
    if (target.placeId) url.searchParams.set("place", target.placeId);
    if (target.id) url.searchParams.set("story", target.id);
  } else if (target.type !== "app" && target.id) {
    url.searchParams.set(target.type, target.id);
  }
  return url.toString();
};

export async function sharePulseTarget(
  target: ShareTarget,
): Promise<"shared" | "copied" | "cancelled"> {
  const url = shareUrlFor(target);
  const title = `${target.label} | ΗΛΕΙΑ PULSE`;
  const text = target.text ?? `Open ${target.label} on ΗΛΕΙΑ PULSE.`;

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(`${target.label} · ΗΛΕΙΑ PULSE\n${url}`);
    return "copied";
  }

  throw new Error("No share method available.");
}

export function matchesPlaceVibe(place: Place, activeVibe: string | null) {
  if (!activeVibe) return true;
  const vibe = activeVibe.toLowerCase();
  const dict: Record<string, (place: Place) => boolean> = {
    απόψε: (place) =>
      place.tags.some((tag) =>
        ["after", "night", "sunset", "party", "drinks", "bars"].includes(tag),
      ),
    beach: (place) => place.type === "beach",
    music: (place) =>
      place.status === "busy" || place.tags.includes("dj") || place.tags.includes("music"),
    πανηγύρι: (place) => place.tags.includes("local") || place.type === "village",
    cheap: (place) => place.budget === "free" || place.budget === "€",
    χωριό: (place) => place.type === "village",
    nature: (place) => place.type === "nature",
    after: (place) => place.tags.includes("after") || place.type === "night",
    sunset: (place) => place.type === "sunset" || place.tags.includes("sunset"),
    "no car": (place) =>
      place.tags.includes("near-port") || place.tags.includes("port") || place.area === "Katakolo",
    locals: (place) => place.type === "local" || place.tags.includes("local"),
  };
  return (dict[vibe] ?? (() => true))(place);
}

export function matchesPlaceQuery(place: Place, query: string) {
  if (!query.trim()) return true;
  const normalizedQuery = query.toLowerCase();
  return [place.name, place.greekName, place.area, ...place.tags]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function identityFromPostTags(post: Post): PostingIdentity | null {
  if (post.tags.includes("guide")) return "GUIDE";
  if (post.tags.includes("tourist")) return "TOURIST";
  if (post.tags.includes("local")) return "LOCAL";
  return null;
}

export function profileSummaryFromAccount(profile: PulseAccountProfile): PulseProfileSummary {
  return {
    id: profile.id,
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    avatarPath: profile.avatarPath,
    defaultIdentity: profile.defaultIdentity,
    homeArea: profile.homeArea,
    profileCompletedAt: profile.profileCompletedAt,
  };
}

export function displayAuthorForPost(
  post: Post,
  author: Author,
  profilesById?: Map<string, PulseProfileSummary>,
): Author {
  const profile = post.profileId ? profilesById?.get(post.profileId) : null;
  if (profile) {
    return {
      id: profile.id,
      name: profile.displayName?.trim() || profile.handle || author.name,
      type: post.postingIdentity ?? profile.defaultIdentity,
      avatarUrl: profile.avatarUrl || author.avatarUrl,
    };
  }

  const identity = identityFromPostTags(post);
  return identity || post.postingIdentity
    ? { ...author, type: post.postingIdentity ?? identity ?? author.type }
    : author;
}

export function readyProfile(account: PulseAccountState) {
  return account.status === "ready" ? account.profile : null;
}

export function composerIdentity(account: PulseAccountState): PostingIdentity {
  const identity = readyProfile(account)?.defaultIdentity;
  if (identity === "TOURIST" || identity === "GUIDE") return identity;
  return "LOCAL";
}

/* ============== Toast ============== */

export const DISCOVERY_PLACE_IDS = [
  // Kyllini
  "kyllini-beach",
  "kyllini-harbor",
  "kyllini-old-beach",
  // Chlemoutsi & Arkoudi
  "chlemoutsi",
  "chlemoutsi-sea-view",
  "loutra-kyllinis",
  "arkoudi-beach",
  // Pineios plain
  "vartholomio",
  "gastouni",
  // Foloi forest
  "foloi-forest",
  "foloi-deep",
  // Nemouta
  "nemouta-waterfalls",
  "nemouta-village",
  // Andritsaina
  "andritsaina",
  "andritsaina-streets",
  // Bassae
  "bassae-temple",
  "bassae-inside",
];

export const DISCOVERY_MILESTONE = 5;

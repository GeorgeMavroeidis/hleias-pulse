import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Map as MapIcon,
  Radio,
  Route as RouteIcon,
  Bookmark,
  CalendarHeart,
  Plus,
  X,
  Heart,
  MessageCircle,
  Share2,
  Clock,
  Wallet,
  MapPin,
  ImagePlus,
  Send,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  Ticket,
  Check,
  Store,
  Phone,
  Globe,
  Users,
  UtensilsCrossed,
  BadgeCheck,
  Gift,
  Camera,
  Info,
  ListChecks,
  ChevronRight,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import {
  typeColor,
  authorTypeColor,
  fallbackAuthor,
  type Author,
  type Place,
  type Post,
  type Comment,
  type RouteItem,
} from "@/lib/hp-model";
import {
  addPulseComment,
  applyToBecomeOrganizer,
  applyToBecomeBusiness,
  claimPlace,
  createPulsePlace,
  createPulsePost,
  createPulseMeetEvent,
  createPulseCulturalEvent,
  createPulseStory,
  emptyPulseData,
  getMyBusinessStatus,
  getMyCulturalEvents,
  getMyDealStats,
  getMyOrganizerStatus,
  getMyPlaceClaims,
  getPlaceBusinessProfile,
  issueDealCode,
  redeemDealCode,
  setPlaceDeal,
  updatePlaceBusinessProfile,
  updatePulseCulturalEvent,
  uploadBusinessPhoto,
  loadPulseData,
  loadPulseUserState,
  markPulseStoriesSeen,
  recordPulseActivityDay,
  setCulturalEventLike,
  setPostLike,
  setPulseMeetRsvp,
  setSavedItem,
  setVisited,
  type CreatePulsePlaceInput,
  type PulseData,
  type PulseProfileSummary,
} from "@/lib/hp-api";
import {
  clearPasswordRecoveryUrl,
  getCurrentPulseAccount,
  hasPasswordRecoveryUrl,
  profileAvatarUrl,
  profileDisplayName,
  savePulseLanguage,
  signOutPulseAccount,
  subscribeToPulseAuth,
  type PulseAccountProfile,
  type PulseAccountState,
} from "@/lib/hp-auth";
import { useI18n } from "@/lib/i18n";
import { getAdminRole, type AdminRole } from "@/lib/admin-api";
import { ImageBox } from "./ImageBox";
import {
  areaTier,
  buildAreaClusters,
  getMapAreaIdForPlace,
  SocialMap,
  type MapAreaCluster,
} from "./SocialMap";
import { MapAreaInsights, AREA_TIER_META } from "./MapAreaInsights";
import { PlaceStoryRail } from "./PlaceStoryRail";
import { PlaceStoryViewer } from "./PlaceStoryViewer";
import {
  buildPlaceStoryGroups,
  storyPlaceIdSet,
  toneStyle,
  type PlaceStory,
  type PlaceStoryGroup,
} from "@/lib/hp/place-stories";
import { LiveTicker } from "./LiveTicker";
import { TrendingHero } from "./TrendingHero";
import { MeetScreen } from "./MeetScreen";
import { CulturalEventsScreen } from "./CulturalEventsScreen";
import { DealsScreen } from "./DealsScreen";
import { OrganizerEventComposer } from "./OrganizerEventComposer";
import { OrganizerEventsSheet } from "./OrganizerEventsSheet";
import { BusinessPlacesSheet } from "./BusinessPlacesSheet";
import { DealCodeModal } from "./DealCodeModal";
import type {
  BusinessStatus,
  DealCode,
  DealRedemptionStats,
  PlaceBusinessProfile,
  PlaceBusinessProfileFields,
  PlaceClaim,
} from "@/lib/hp/business-types";
import { CulturalEventDetailModal } from "./CulturalEventDetailModal";
import { OnboardingGate } from "./OnboardingGate";
import { AccountBubble, AccountSheet, AuthSheet, PasswordRecoverySheet } from "./AuthAccountSheets";
import { IdentitySegments, SectionHeader, fieldClass } from "./blend-ui";
import { buildActivityTicks } from "@/lib/hp/activity-data";
import { buildPulseActivitySnapshot, type PulseActivitySnapshot } from "@/lib/hp/pulse-activity";
import { type StreakState } from "@/lib/hp/meet-store";
import {
  MEET_CATEGORIES,
  MEET_CATEGORY_META,
  type CreateMeetInput,
  type MeetCategory,
  type MeetEvent,
  type RsvpStatus,
} from "@/lib/hp/meet-types";
import {
  DEFAULT_ORGANIZER_BIO,
  type CreateCulturalEventInput,
  type CulturalEvent,
  type OrganizerStatus,
} from "@/lib/hp/cultural-events-types";

type Tab = "map" | "pulse" | "routes" | "meet" | "saved" | "deals";
type NavTab = Exclude<Tab, "saved" | "deals">;
type MeetSubTab = "community" | "events";
type ComposerMode = "post" | "place" | "story" | "event";
type CreateStoryInput = {
  placeId: string;
  caption: string;
  kind: PlaceStory["kind"];
  crowd?: "low" | "medium" | "high";
  parking?: "easy" | "tight" | "full";
  condition?: string[];
  visibilityHours?: number;
};
type PostingIdentity = Extract<Author["type"], "LOCAL" | "TOURIST" | "GUIDE">;

const POSTING_IDENTITIES: { id: PostingIdentity; label: string; helper: string }[] = [
  { id: "LOCAL", label: "Local", helper: "I know the area" },
  { id: "TOURIST", label: "Tourist", helper: "I am visiting" },
  { id: "GUIDE", label: "Guide", helper: "I can recommend" },
];
const COMPOSER_MODE_ICONS: Record<ComposerMode, LucideIcon> = {
  post: MessageCircle,
  place: MapPin,
  story: Camera,
  event: CalendarHeart,
};
const ROUTE_FILTERS = ["All", "Beach", "Nature", "Culture", "No car", "Free"] as const;
type RouteFilter = (typeof ROUTE_FILTERS)[number];

const TAB_ITEMS: { id: NavTab; label: string; Icon: LucideIcon }[] = [
  { id: "map", label: "Map", Icon: MapIcon },
  { id: "pulse", label: "Pulse", Icon: Radio },
  { id: "routes", label: "Routes", Icon: RouteIcon },
  { id: "meet", label: "Meet", Icon: CalendarHeart },
];
type ShareTarget = {
  type: "app" | "place" | "post" | "route" | "story";
  id?: string;
  placeId?: string;
  label: string;
  text?: string;
};
type MapViewSnapshot = {
  areaId: string | null;
  placeId: string | null;
};

const openStreetMapUrl = ({ lat, lng }: Pick<Place, "lat" | "lng">) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
const isTab = (value: string | null): value is Tab =>
  value === "map" ||
  value === "pulse" ||
  value === "routes" ||
  value === "meet" ||
  value === "saved" ||
  value === "deals";

const truncateShareText = (text: string) =>
  text.length > 150 ? `${text.slice(0, 147).trim()}...` : text;

const shareUrlFor = (target: ShareTarget) => {
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

async function sharePulseTarget(target: ShareTarget): Promise<"shared" | "copied" | "cancelled"> {
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

function matchesPlaceVibe(place: Place, activeVibe: string | null) {
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

function matchesPlaceQuery(place: Place, query: string) {
  if (!query.trim()) return true;
  const normalizedQuery = query.toLowerCase();
  return [place.name, place.greekName, place.area, ...place.tags]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function identityFromPostTags(post: Post): PostingIdentity | null {
  if (post.tags.includes("guide")) return "GUIDE";
  if (post.tags.includes("tourist")) return "TOURIST";
  if (post.tags.includes("local")) return "LOCAL";
  return null;
}

function profileSummaryFromAccount(profile: PulseAccountProfile): PulseProfileSummary {
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

function displayAuthorForPost(
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

function readyProfile(account: PulseAccountState) {
  return account.status === "ready" ? account.profile : null;
}

function composerIdentity(account: PulseAccountState): PostingIdentity {
  const identity = readyProfile(account)?.defaultIdentity;
  if (identity === "TOURIST" || identity === "GUIDE") return identity;
  return "LOCAL";
}

/* ============== Toast ============== */
function Toast({ msg }: { msg: string | null }) {
  return (
    <AnimatePresence>
      {msg && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute bottom-24 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-hp-ink px-4 py-2 text-xs font-semibold text-hp-paper shadow-xl"
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ============== TopBar ============== */
interface TopBarProps {
  query: string;
  setQuery: (query: string) => void;
  onToggleLanguage: () => void;
  showSearch: boolean;
  setShowSearch: Dispatch<SetStateAction<boolean>>;
  account: PulseAccountState;
  onOpenAccount: () => void;
  onOpenAuth: () => void;
  onOpenDeals: () => void;
}

function TopBar({
  query,
  setQuery,
  onToggleLanguage,
  showSearch,
  setShowSearch,
  account,
  onOpenAccount,
  onOpenAuth,
  onOpenDeals,
}: TopBarProps) {
  const { language, t } = useI18n();
  return (
    <div className="relative z-30 border-b border-hp-ink/10 bg-hp-paper/95 backdrop-blur">
      <div className="flex items-center justify-between px-4 pt-2.5">
        <div className="flex items-center gap-2.5" aria-label="ΗΛΕΙΑ PULSE">
          <img
            src="/brand/ilia-pulse-logo.png"
            alt=""
            width={38}
            height={38}
            aria-hidden="true"
            className="h-10 w-10 rounded-xl bg-hp-paper object-contain"
          />
          <div className="hp-brand leading-[0.85]">
            <div className="text-[14px] font-black tracking-[0.04em] text-hp-ink">ΗΛΕΙΑ</div>
            <div className="text-[14px] font-black tracking-[0.18em] text-hp-sunset">PULSE</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenDeals}
            className="hp-deals-pill inline-flex items-center gap-1 rounded-full border border-hp-sunset/30 bg-hp-sunset/10 px-2.5 py-1.5 text-[11px] font-bold text-hp-sunset"
            aria-label={t("Open deals")}
          >
            <Gift size={13} strokeWidth={2.6} />
            {t("Deals")}
          </button>
          <button
            type="button"
            onClick={() => setShowSearch((s) => !s)}
            className="grid h-9 w-9 place-items-center rounded-full border border-hp-ink/10 bg-hp-paper text-hp-ink/70"
            aria-label={t(showSearch ? "Close search" : "Open search")}
            aria-expanded={showSearch}
          >
            <Search size={16} />
          </button>
          <button
            type="button"
            onClick={onToggleLanguage}
            className="rounded-full border border-hp-ink/10 px-2.5 py-1.5 text-[11px] font-bold tracking-wider text-hp-ink/80"
            aria-label={t("Toggle language")}
          >
            {language === "GR" ? "GR / en" : "gr / EN"}
          </button>
          <AccountBubble account={account} onOpenAccount={onOpenAccount} onOpenAuth={onOpenAuth} />
        </div>
      </div>
      <div className="px-4 pb-1.5 pt-0.5">
        <p className="text-[12px] text-hp-muted">{t("Local spots, routes, and tips.")}</p>
      </div>
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden px-4"
          >
            <div className="mb-2 flex items-center gap-2 rounded-full border border-hp-ink/10 bg-white/70 px-3 py-2">
              <Search size={14} className="text-hp-muted" />
              <input
                name="hp-search"
                aria-label={t("Search ΗΛΕΙΑ PULSE")}
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  language === "GR"
                    ? "παραλία, πανηγύρι, ηλιοβασίλεμα…"
                    : "beach, panigyri, sunset…"
                }
                className="w-full bg-transparent text-sm outline-none placeholder:text-hp-muted"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============== Vibe chips ============== */
function VibeChips({
  chips,
  active,
  setActive,
}: {
  chips: string[];
  active: string | null;
  setActive: (v: string | null) => void;
}) {
  return (
    <div className="hp-no-scrollbar flex gap-2 overflow-x-auto border-b border-hp-ink/10 bg-hp-paper px-4 py-2">
      {chips.map((c) => {
        const on = active === c;
        return (
          <motion.button
            key={c}
            type="button"
            onClick={() => setActive(on ? null : c)}
            aria-pressed={on}
            whileTap={{ scale: 0.94 }}
            animate={{ scale: on ? 1.03 : 1 }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              on
                ? "bg-hp-ink text-hp-paper shadow-sm"
                : "border border-hp-ink/10 bg-hp-paper text-hp-ink/70"
            }`}
          >
            {c}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ============== Map Bottom Sheet (snap states) ============== */
type SheetDragHandlers = {
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

function MapBottomSheet({
  cluster,
  selectedPlace,
  events,
  storyGroups,
  onOpenStory,
  height,
  peek,
  half,
  full,
  onSetSnap,
  onOpenDetails,
  onSavePlace,
  onSharePlace,
  savedPlaceIds,
  claimedPlaceIds,
  dealPlaceIds,
}: {
  cluster: MapAreaCluster | null;
  selectedPlace: Place | null;
  events: PulseData["events"];
  storyGroups: PlaceStoryGroup[];
  onOpenStory: (placeId: string) => void;
  height: number;
  peek: number;
  half: number;
  full: number;
  onSetSnap: (h: number) => void;
  onOpenDetails: (p: Place) => void;
  onSavePlace: (id: string) => void;
  onSharePlace: (place: Place) => void;
  savedPlaceIds: string[];
  claimedPlaceIds: string[];
  dealPlaceIds: string[];
}) {
  const { t } = useI18n();
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const isSelectedCollapsed = Boolean(cluster) && height <= peek + 8;
  const isExpanded = Boolean(cluster) && height >= full - 24;
  const dragState = useRef<{
    pointerId: number;
    startHeight: number;
    startY: number;
    lastY: number;
    lastAt: number;
    velocityY: number;
  } | null>(null);

  const clampSheetHeight = (value: number) =>
    cluster ? Math.min(full, Math.max(peek, value)) : peek;

  const snapSheet = (currentHeight: number, velocityY: number) => {
    const height = clampSheetHeight(currentHeight);
    const snapPoints = cluster ? [peek, half, full] : [peek];
    const closestSnap = snapPoints.reduce((closest, point) =>
      Math.abs(point - height) < Math.abs(closest - height) ? point : closest,
    );

    if (Math.abs(closestSnap - height) <= 24) {
      onSetSnap(closestSnap);
      return;
    }

    if (!cluster) {
      onSetSnap(peek);
      return;
    }

    if (Math.abs(velocityY) < 180) {
      onSetSnap(height);
      return;
    }

    let snap = peek;
    if (height > (half + full) / 2 || velocityY < -500) snap = full;
    else if (height > (peek + half) / 2 || velocityY < -200) snap = half;
    onSetSnap(snap);
  };

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    dragState.current = {
      pointerId: event.pointerId,
      startHeight: height,
      startY: event.clientY,
      lastY: event.clientY,
      lastAt: event.timeStamp,
      velocityY: 0,
    };
    setIsDraggingSheet(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail for synthetic or already-cancelled pointer streams.
    }
    event.preventDefault();
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const elapsed = Math.max(event.timeStamp - state.lastAt, 16);
    state.velocityY = ((event.clientY - state.lastY) / elapsed) * 1000;
    state.lastY = event.clientY;
    state.lastAt = event.timeStamp;

    onSetSnap(clampSheetHeight(state.startHeight - (event.clientY - state.startY)));
    event.preventDefault();
  };

  const finishHandleDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const currentHeight = clampSheetHeight(state.startHeight - (event.clientY - state.startY));
    const velocityY = state.velocityY;
    dragState.current = null;
    setIsDraggingSheet(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The drag has already ended; keeping the last computed height is fine.
    }
    snapSheet(currentHeight, velocityY);
  };

  const sheetDragHandlers: SheetDragHandlers = {
    onPointerCancel: finishHandleDrag,
    onPointerDown: onHandlePointerDown,
    onPointerMove: onHandlePointerMove,
    onPointerUp: finishHandleDrag,
  };

  return (
    // Plain element + CSS height transition rather than framer's animate — a
    // framer height animation here gets dropped when another motion element
    // (the Explore areas panel) unmounts in the same commit, leaving the sheet
    // stuck collapsed after picking an area from that panel.
    <div
      style={{
        height,
        transition: isDraggingSheet
          ? "none"
          : "height 0.42s cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      className="hp-map-sheet absolute inset-x-0 bottom-0 z-30 flex min-h-0 flex-col overscroll-contain rounded-t-3xl border-t border-hp-ink/10 bg-hp-paper/98 shadow-[0_-12px_40px_rgba(23,20,17,0.18)] backdrop-blur"
    >
      {/* Drag handle */}
      <div
        {...sheetDragHandlers}
        className="touch-none select-none cursor-grab pt-2 pb-1 active:cursor-grabbing"
      >
        <div className="mx-auto h-1.5 w-12 rounded-full bg-hp-ink/15" />
        {cluster && !isSelectedCollapsed && (
          <div className="flex justify-center gap-2 pt-2">
            {[
              { h: peek, label: "collapsed" },
              { h: half, label: "preview" },
              { h: full, label: "full" },
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => onSetSnap(s.h)}
                aria-label={t("Set sheet to {position}", { position: t(s.label) })}
                className={`h-1 w-6 rounded-full transition ${Math.abs(height - s.h) < 4 ? "bg-hp-ink" : "bg-hp-ink/15"}`}
              />
            ))}
          </div>
        )}
      </div>

      {!isSelectedCollapsed && (
        <div
          className={`min-h-0 px-4 pt-0 ${cluster ? "pb-5" : "pb-3"} ${
            cluster
              ? `flex flex-1 overscroll-contain ${isExpanded ? "overflow-y-auto" : "overflow-hidden"}`
              : "overflow-y-auto overscroll-contain"
          }`}
        >
          {cluster ? (
            <AreaSheetContent
              cluster={cluster}
              selectedPlace={selectedPlace}
              events={events}
              expanded={isExpanded}
              savedPlaceIds={savedPlaceIds}
              claimedPlaceIds={claimedPlaceIds}
              dealPlaceIds={dealPlaceIds}
              storyGroups={storyGroups}
              onViewArea={() => onSetSnap(full)}
              onOpenStory={onOpenStory}
              onSavePlace={onSavePlace}
              onSharePlace={onSharePlace}
              onOpenDetails={onOpenDetails}
            />
          ) : (
            <TonightPulseContent />
          )}
        </div>
      )}
    </div>
  );
}

function TonightPulseContent() {
  const { t } = useI18n();
  return (
    <div>
      <div>
        <div className="mb-2">
          <h3 className="text-[16px] font-black text-hp-ink">{t("Tonight's pulse")}</h3>
        </div>
        <p className="text-[12px] text-hp-muted">{t("Tap a bubble to see what's happening.")}</p>
      </div>
    </div>
  );
}

// Place type -> category chip label (English source key; Greek via i18n).
const CATEGORY_LABEL: Record<Place["type"], string> = {
  beach: "Beach",
  culture: "Culture",
  nature: "Nature",
  food: "Food",
  local: "Town",
  village: "Village",
  night: "Nightlife",
  sunset: "Sunset",
};

function AreaSheetContent({
  cluster,
  selectedPlace,
  events,
  expanded,
  savedPlaceIds,
  claimedPlaceIds,
  dealPlaceIds,
  storyGroups,
  onViewArea,
  onOpenStory,
  onSavePlace,
  onSharePlace,
  onOpenDetails,
}: {
  cluster: MapAreaCluster;
  selectedPlace: Place | null;
  events: PulseData["events"];
  expanded: boolean;
  savedPlaceIds: string[];
  claimedPlaceIds: string[];
  dealPlaceIds: string[];
  storyGroups: PlaceStoryGroup[];
  onViewArea: () => void;
  onOpenStory: (placeId: string) => void;
  onSavePlace: (id: string) => void;
  onSharePlace: (place: Place) => void;
  onOpenDetails: (p: Place) => void;
}) {
  const { language, t } = useI18n();
  const placeIds = new Set(cluster.places.map((place) => place.id));
  const isPlaceSheet = Boolean(selectedPlace && placeIds.has(selectedPlace.id));
  const areaStoryGroups = storyGroups.filter((group) => placeIds.has(group.placeId));

  if (!isPlaceSheet) {
    // One unified area card for every entry point (map bubble, the on-map chip
    // rail, and the Explore areas panel all land here). Compact first glance;
    // "View area" expands the same sheet to the full detail (places + stories).
    const tier = areaTier(cluster);
    const meta = AREA_TIER_META[tier];
    const TierIcon = meta.Icon;
    const signals = cluster.postCount + cluster.eventCount;
    const categories = [...new Set(cluster.places.map((place) => place.type))];

    return (
      <motion.div
        key={`area-${cluster.id}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={expanded ? "w-full" : "flex h-full min-h-0 w-full flex-col"}
      >
        <div className="flex gap-3">
          <ImageBox
            src={cluster.leadPlace.imageUrl}
            alt=""
            className="h-16 w-16 shrink-0"
            rounded="rounded-2xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-[16px] font-black text-hp-ink">{cluster.name}</h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${meta.badge}`}
              >
                <TierIcon size={10} />
                {t(meta.label)}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-hp-ink/75">{t(meta.blurb)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-hp-ink/60">
              <span className="inline-flex items-center gap-0.5">
                <Radio size={11} />
                {t("{count} signals", { count: signals })}
              </span>
              <span aria-hidden="true">·</span>
              <span>{t("{count} places", { count: cluster.places.length })}</span>
            </div>
          </div>
        </div>

        {categories.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {categories.slice(0, 4).map((category) => (
              <span
                key={category}
                className="rounded-full bg-hp-ink/5 px-2 py-1 text-[10px] font-bold text-hp-ink/65"
              >
                {t(CATEGORY_LABEL[category])}
              </span>
            ))}
            {categories.length > 4 && (
              <span className="rounded-full bg-hp-ink/5 px-2 py-1 text-[10px] font-bold text-hp-ink/65">
                +{categories.length - 4}
              </span>
            )}
          </div>
        )}

        {!expanded ? (
          <button
            type="button"
            onClick={onViewArea}
            className="mt-auto flex items-center justify-center gap-1.5 rounded-full bg-hp-ink py-2.5 text-[13px] font-black text-hp-paper transition active:scale-[0.99]"
          >
            {t("View area")}
            <ArrowRight size={14} />
          </button>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                {t("Places in this area")}
              </div>
              <div className="flex flex-col gap-1.5">
                {cluster.places.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => onOpenDetails(place)}
                    className="flex items-center gap-2.5 rounded-xl border border-hp-ink/10 bg-white/50 p-2 text-left transition active:bg-hp-ink/[0.03]"
                  >
                    <ImageBox
                      src={place.imageUrl}
                      alt=""
                      className="h-9 w-9 shrink-0"
                      rounded="rounded-lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-black text-hp-ink">
                        {place.name}
                      </span>
                      <span className="block truncate text-[10px] text-hp-muted">
                        {place.recentPostCount}{" "}
                        {language === "GR" ? "δημοσιεύσεις" : "posts"}
                      </span>
                    </span>
                    {(savedPlaceIds.includes(place.id) ||
                      claimedPlaceIds.includes(place.id) ||
                      dealPlaceIds.includes(place.id)) && (
                      <span className="flex shrink-0 items-center gap-1 text-hp-sunset">
                        {savedPlaceIds.includes(place.id) && <Bookmark size={12} />}
                        {claimedPlaceIds.includes(place.id) && <BadgeCheck size={12} />}
                        {dealPlaceIds.includes(place.id) && <Gift size={12} />}
                      </span>
                    )}
                    <ChevronRight size={14} className="shrink-0 text-hp-ink/30" />
                  </button>
                ))}
              </div>
            </div>

            {areaStoryGroups.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                    {language === "GR"
                      ? `Stories από ${cluster.name}`
                      : `Stories from ${cluster.name}`}
                  </span>
                  <span className="text-[10px] font-semibold text-hp-muted">
                    {areaStoryGroups.length}
                  </span>
                </div>
                <div className="hp-no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {areaStoryGroups.map((group) => {
                    const tone = toneStyle(group.hasUnseen ? group.tone : "muted");
                    return (
                      <button
                        key={group.placeId}
                        type="button"
                        onClick={() => onOpenStory(group.placeId)}
                        aria-label={
                          language === "GR"
                            ? `Άνοιγμα stories για ${group.placeName}`
                            : `Open stories for ${group.placeName}`
                        }
                        className="flex w-14 shrink-0 flex-col items-center gap-1"
                      >
                        <div
                          className="rounded-full p-[2px]"
                          style={{ background: tone.gradient }}
                        >
                          <ImageBox
                            src={group.stories[0].mediaUrl}
                            alt={group.placeName}
                            className="h-12 w-12"
                            rounded="rounded-full"
                          />
                        </div>
                        <span className="block w-full truncate text-center text-[9px] font-bold text-hp-ink/80">
                          {group.placeName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  const focusPlace = selectedPlace;
  if (!focusPlace) return null;

  const saved = savedPlaceIds.includes(focusPlace.id);
  const placeEvents = events.filter((event) => event.placeId === focusPlace.id);

  return (
    <motion.div
      key={`place-${focusPlace.id}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={expanded ? "w-full" : "flex h-full min-h-0 w-full flex-col"}
    >
      <div className="flex gap-3">
        <ImageBox
          src={focusPlace.imageUrl}
          alt={focusPlace.name}
          className="h-16 w-16 shrink-0"
          rounded="rounded-2xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-bold text-hp-ink/70">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: typeColor[focusPlace.type] }}
            />
            <span>
              {focusPlace.type} · {focusPlace.bestTime}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <h3 className="text-[16px] font-black text-hp-ink">{focusPlace.name}</h3>
            {claimedPlaceIds.includes(focusPlace.id) && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-hp-sunset/12 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-hp-sunset"
                title={t("Verified business")}
              >
                <BadgeCheck size={10} />
                {t("Business")}
              </span>
            )}
            {dealPlaceIds.includes(focusPlace.id) && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-hp-sunset/12 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-hp-sunset"
                title={t("This place has an app deal")}
              >
                🎁 {t("Deal")}
              </span>
            )}
          </div>
          <p className="text-[11px] text-hp-muted">
            {focusPlace.greekName} · {focusPlace.area}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-hp-ink/70">
            <span className="inline-flex items-center gap-0.5">
              <Radio size={11} />
              {focusPlace.recentPostCount} {language === "GR" ? "δημοσιεύσεις" : "posts"}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <Clock size={11} />
              {placeEvents.length} {language === "GR" ? "εκδηλώσεις" : "events"}
            </span>
          </div>
        </div>
      </div>

      <p
        className={`mt-3 text-[13px] leading-snug text-hp-ink/80 ${expanded ? "" : "line-clamp-2"}`}
      >
        {focusPlace.short}
      </p>

      {expanded && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {focusPlace.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-hp-ink/5 px-2 py-1 text-[10px] font-bold text-hp-ink/65"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className={`${expanded ? "mt-2" : "mt-auto pt-2"} flex items-center gap-2`}>
        <button
          type="button"
          onClick={() => onSavePlace(focusPlace.id)}
          className={`flex-1 whitespace-nowrap rounded-full border py-2 text-[12px] font-bold ${saved ? "border-hp-sunset bg-hp-sunset/10 text-hp-sunset" : "border-hp-ink/15 text-hp-ink"}`}
        >
          <Bookmark size={13} className="mr-1 inline" /> {t(saved ? "Saved" : "Save")}
        </button>
        <button
          type="button"
          onClick={() => onOpenDetails(focusPlace)}
          className="flex-1 whitespace-nowrap rounded-full bg-hp-ink py-2 text-[12px] font-bold text-hp-paper"
        >
          {language === "GR" ? "Λεπτομέρειες" : "Details"}
        </button>
        <a
          href={openStreetMapUrl(focusPlace)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("Open {place} in OpenStreetMap", { place: focusPlace.name })}
          className="grid h-9 w-9 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
        >
          <ExternalLink size={13} />
        </a>
        <button
          type="button"
          onClick={() => onSharePlace(focusPlace)}
          aria-label={t("Share {place}", { place: focusPlace.name })}
          className="grid h-9 w-9 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
        >
          <Share2 size={13} />
        </button>
      </div>
    </motion.div>
  );
}

/* ============== Pulse Feed ============== */
function PulseFeed({
  posts,
  storyGroups,
  activityTicks,
  trendingPlace,
  onOpenStory,
  likes,
  postLikes,
  toggleLike,
  savedPosts,
  toggleSavePost,
  commentsByPost,
  onOpenPost,
  onOpenMap,
  onShare,
  onTrendingGoing,
  findPlace,
  findAuthor,
  findPostAuthor,
}: {
  posts: Post[];
  storyGroups: PlaceStoryGroup[];
  activityTicks: ReturnType<typeof buildActivityTicks>;
  trendingPlace: Place | null;
  onOpenStory: (placeId: string) => void;
  likes: Record<string, boolean>;
  postLikes: Record<string, number>;
  toggleLike: (id: string) => void;
  savedPosts: Record<string, boolean>;
  toggleSavePost: (id: string) => void;
  commentsByPost: Record<string, Comment[]>;
  onOpenPost: (p: Post) => void;
  onOpenMap: (id: string) => void;
  onShare: (post: Post) => void;
  onTrendingGoing: (place: Place) => void;
  findPlace: (id: string) => Place | undefined;
  findAuthor: (id: string) => Author;
  findPostAuthor: (post: Post) => Author;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("Now");
  const filters = ["Now", "Tonight", "Weekend", "Local tips"];
  const visiblePosts = posts.filter((post) => {
    const place = findPlace(post.placeId);
    const author = findPostAuthor(post);
    if (!place) return false;
    if (filter === "Now") {
      return (
        place.status === "busy" ||
        place.status === "popular" ||
        post.kind === "event" ||
        post.time.toLowerCase().includes("now") ||
        post.tags.some((tag) => ["live", "now", "packed", "busy"].includes(tag))
      );
    }
    if (filter === "Tonight") {
      return (
        post.time.toLowerCase().includes("tonight") ||
        post.tags.some((tag) => ["after", "night", "dj", "sunset"].includes(tag))
      );
    }
    if (filter === "Weekend") {
      return place.tags.some((tag) => ["beach", "roadtrip", "village", "nature"].includes(tag));
    }
    if (filter === "Local tips") {
      return (
        author.type.includes("LOCAL") ||
        author.type === "GUIDE" ||
        post.kind === "tip" ||
        post.tags.includes("local")
      );
    }
    return true;
  });
  return (
    <div className="px-4 pb-28 pt-3">
      <LiveTicker ticks={activityTicks} onOpenPlace={onOpenMap} />
      <PlaceStoryRail groups={storyGroups} onOpen={onOpenStory} />

      {/* Filter tabs */}
      <div className="hp-no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold ${filter === f ? "bg-hp-ink text-hp-paper" : "border border-hp-ink/10 text-hp-ink/70"}`}
          >
            {t(f)}
          </button>
        ))}
      </div>

      {trendingPlace && (
        <TrendingHero
          place={trendingPlace}
          index={0}
          onOpen={(place) => onOpenMap(place.id)}
          onGoing={onTrendingGoing}
        />
      )}

      <div className="flex flex-col gap-3">
        {visiblePosts.length === 0 && (
          <div className="rounded-3xl border border-dashed border-hp-ink/15 bg-white/45 px-5 py-10 text-center text-[13px] text-hp-muted">
            {t("No posts match this filter yet.")}
          </div>
        )}
        {visiblePosts.map((post) => {
          const p = findPlace(post.placeId);
          const a = findPostAuthor(post);
          if (!p) return null;
          const liked = likes[post.id];
          const lc = (postLikes[post.id] ?? post.likes) + (liked ? 1 : 0);
          const sv = savedPosts[post.id];
          const commentCount = post.comments.length + (commentsByPost[post.id]?.length ?? 0);
          return (
            <motion.article
              key={post.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-3xl border border-hp-ink/10 bg-hp-paper"
            >
              {/* Author row */}
              <div className="flex items-center gap-2 px-3.5 pt-3">
                <img
                  src={a.avatarUrl}
                  alt={a.name}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full border border-hp-ink/10 object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold text-hp-ink">{a.name}</span>
                    <span
                      className="rounded-sm px-1 py-[1px] text-[8px] font-bold uppercase tracking-wider text-hp-paper"
                      style={{ background: authorTypeColor[a.type] }}
                    >
                      {a.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-hp-muted">
                    <MapPin size={9} /> {p.name} · {post.time}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSavePost(post.id)}
                  className={`p-1 ${sv ? "text-hp-sunset" : "text-hp-ink/40"}`}
                  aria-label={t(sv ? "Unsave post" : "Save post")}
                >
                  <Bookmark size={16} fill={sv ? "currentColor" : "none"} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => onOpenPost(post)}
                className="mt-2 block w-full text-left"
                aria-label={`Open post about ${p.name}`}
              >
                <ImageBox
                  src={post.imageUrl}
                  alt={`${p.name} post`}
                  className="h-48 w-full"
                  rounded="rounded-none"
                />
              </button>

              <div className="px-3.5 pb-3 pt-2">
                <button
                  type="button"
                  onClick={() => onOpenPost(post)}
                  className="block w-full select-none text-left"
                  aria-label={`Open post details for ${p.name}`}
                >
                  <p className="text-[13px] leading-snug text-hp-ink">{post.text}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {post.tags.map((t) => (
                      <span key={t} className="text-[11px] font-semibold text-hp-deep/80">
                        #{t}
                      </span>
                    ))}
                  </div>
                </button>
                <div className="mt-2.5 flex items-center gap-3 text-[12px] text-hp-ink/70">
                  <button
                    type="button"
                    onClick={() => toggleLike(post.id)}
                    className={`inline-flex items-center gap-1 ${liked ? "text-hp-sunset" : ""}`}
                    aria-label={t(liked ? "Unlike post" : "Like post")}
                  >
                    <Heart size={15} fill={liked ? "currentColor" : "none"} /> {lc}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPost(post)}
                    className="inline-flex items-center gap-1"
                    aria-label={t("Open comments")}
                  >
                    <MessageCircle size={15} /> {commentCount}
                  </button>
                  <button
                    type="button"
                    onClick={() => onShare(post)}
                    aria-label={t("Share post")}
                    className="inline-flex items-center"
                  >
                    <Share2 size={15} className="text-hp-ink/50" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenMap(p.id)}
                    className="ml-auto inline-flex items-center gap-1 rounded-full border border-hp-ink/10 px-2.5 py-1 text-[11px] font-semibold"
                  >
                    <MapIcon size={12} /> {t("open on map")}
                  </button>
                </div>
              </div>
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}

/* ============== "Must-see today" deck (Tourist orientation, Routes tab) ============== */
// TEMP stopgap until a real `places.featured` flag exists (phase 2). Hotness
// ranking alone buries Ancient Olympia — the region's headline site — at rank ~9
// behind a wall of beaches, so it is pinned to the front of the "Must-see today"
// deck by hand. REPLACE this list with a `places.featured` column set from the
// admin panel once phase 2 is built; this is not meant to be permanent
// architecture. See HANDOFF.md > Known Limitations.
const TEMP_FEATURED_PLACE_IDS = ["ancient-olympia"];

// Shown only to Tourist identities, at the top of the Routes tab. Places only —
// route recommendations are already covered by the Routes tab's own "What we
// recommend" (curated) section, so this deck deliberately does not repeat them.
function MustSeeTodayDeck({
  places,
  onOpenPlace,
}: {
  places: Place[];
  onOpenPlace: (place: Place) => void;
}) {
  const { language, t } = useI18n();

  // "Must-see today": TEMP_FEATURED_PLACE_IDS pinned to the front (in list order),
  // then the remaining slots up to 6 filled by the normal ranking — lively spots
  // (status popular/busy), strongest hotness first, skipping anything already
  // pinned so it never shows twice. Falls back to a plain hotness ranking of all
  // places only if fewer than 6 are flagged live.
  // TODO(phase 2): drop TEMP_FEATURED_PLACE_IDS once `places.featured` exists and
  // source the pinned set from that column instead.
  const mustSee = useMemo(() => {
    const DECK_SIZE = 6;
    const pinned = TEMP_FEATURED_PLACE_IDS.map((id) =>
      places.find((place) => place.id === id),
    ).filter((place): place is Place => Boolean(place));
    const pinnedIds = new Set(pinned.map((place) => place.id));

    const live = places.filter((place) => place.status === "popular" || place.status === "busy");
    const pool = live.length >= DECK_SIZE ? live : places;
    const ranked = [...pool]
      .filter((place) => !pinnedIds.has(place.id))
      .sort((a, b) => b.hotness - a.hotness);

    return [...pinned, ...ranked].slice(0, DECK_SIZE);
  }, [places]);

  if (mustSee.length === 0) return null;

  return (
    <section className="mb-6 flex flex-col gap-3">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
          {language === "GR" ? `${mustSee.length} επιλογές` : `${mustSee.length} picks`}
        </div>
        <h3 className="text-[17px] font-black text-hp-ink">{t("Must-see today")}</h3>
        <p className="text-[12px] text-hp-muted">
          {t("A quick first look for visitors — the spots to begin with.")}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {mustSee.map((place) => (
          <button
            key={place.id}
            type="button"
            onClick={() => onOpenPlace(place)}
            aria-label={t("Open {place}", { place: place.name })}
            className="overflow-hidden rounded-2xl border border-hp-ink/10 bg-hp-paper text-left"
          >
            <ImageBox
              src={place.imageUrl}
              alt={place.name}
              className="h-28 w-full"
              rounded="rounded-none"
            />
            <div className="p-2">
              <div
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: typeColor[place.type] }}
              >
                {place.type}
              </div>
              <div className="line-clamp-1 text-[12px] font-bold text-hp-ink">{place.name}</div>
              <div className="text-[10px] text-hp-muted">{place.area}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ============== "Έχεις πάει;" — Local exploration card (Pulse feed) ============== */
// The north-west peninsula (Kyllini, Chlemoutsi/Arkoudi, Loutra) and mountain
// Ilia (Foloi, Nemouta, Andritsaina, Bassae) hold far fewer spots than the
// Amaliada–Pyrgos–Olympia / coastal core. This is the union of those
// underrepresented SocialMap clusters — the set we nudge Locals to go cover.
// Hand-maintained here (same spirit as TEMP_FEATURED_PLACE_IDS); if a real
// region field lands on `places` later, derive this from it instead.
const DISCOVERY_PLACE_IDS = [
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

// v1 milestone: a single fixed nudge, no badges / no persisted achievements.
// Only fires as a toast when the user *crosses* it during a session.
const DISCOVERY_MILESTONE = 5;

// Local-only, top of the Pulse feed. "Covered" = the user has at least one own
// post at that place (posts-as-visited proxy — no check-in table in v1).
function LocalDiscoveryCard({
  places,
  coveredIds,
  onOpenPlace,
  onMilestone,
}: {
  places: Place[];
  coveredIds: string[];
  onOpenPlace: (place: Place) => void;
  onMilestone: () => void;
}) {
  const { t } = useI18n();
  const total = DISCOVERY_PLACE_IDS.length;
  const covered = coveredIds.length;

  const uncoveredPlaces = useMemo(() => {
    const coveredSet = new Set(coveredIds);
    return DISCOVERY_PLACE_IDS.filter((id) => !coveredSet.has(id))
      .map((id) => places.find((place) => place.id === id))
      .filter((place): place is Place => Boolean(place));
  }, [coveredIds, places]);

  // Celebrate crossing the milestone within the session — never on mount if the
  // user is already past it, and never more than once.
  const startedBelowMilestone = useRef(covered < DISCOVERY_MILESTONE);
  const celebrated = useRef(false);
  useEffect(() => {
    if (covered >= DISCOVERY_MILESTONE && startedBelowMilestone.current && !celebrated.current) {
      celebrated.current = true;
      onMilestone();
    }
  }, [covered, onMilestone]);

  if (places.length === 0) return null;

  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <section className="mb-1 flex flex-col gap-3 border-b border-hp-ink/10 pb-4">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
          {t("{covered}/{total} places", { covered, total })}
        </div>
        <h3 className="text-[17px] font-black text-hp-ink">{t("Have you been?")}</h3>
        <p className="text-[12px] text-hp-muted">
          {t("Discover north-west and mountain Ilia — the corners with the fewest spots.")}
        </p>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-hp-ink/10"
        role="progressbar"
        aria-valuenow={covered}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={t("Discovery progress")}
      >
        <div
          className="h-full rounded-full bg-hp-sunset transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {uncoveredPlaces.length > 0 ? (
        <div className="hp-no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
          {uncoveredPlaces.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => onOpenPlace(place)}
              aria-label={t("Open {place}", { place: place.name })}
              className="w-36 shrink-0 overflow-hidden rounded-2xl border border-hp-ink/10 bg-hp-paper text-left"
            >
              <ImageBox
                src={place.imageUrl}
                alt={place.name}
                className="h-24 w-full"
                rounded="rounded-none"
              />
              <div className="p-2">
                <div
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: typeColor[place.type] }}
                >
                  {place.type}
                </div>
                <div className="line-clamp-1 text-[12px] font-bold text-hp-ink">{place.name}</div>
                <div className="line-clamp-1 text-[10px] text-hp-muted">{place.area}</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-hp-ink/15 bg-hp-paper/60 px-4 py-3 text-center text-[12px] font-semibold text-hp-ink">
          {t("You've been everywhere on this list. Respect.")}
        </p>
      )}
    </section>
  );
}

/* ============== Routes Screen ============== */
function routeMatchesQuery(route: RouteItem, author: Author, query: string) {
  if (!query.trim()) return true;
  const normalizedQuery = query.toLowerCase();
  return [
    route.title,
    route.lede,
    route.duration,
    route.budget,
    author.name,
    author.type,
    ...route.tags,
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function routeMatchesFilter(route: RouteItem, filter: RouteFilter) {
  if (filter === "All") return true;
  if (filter === "Beach")
    return route.tags.some((tag) => ["beach", "party", "sunset"].includes(tag));
  if (filter === "Nature")
    return route.tags.some((tag) => ["nature", "shade", "village"].includes(tag));
  if (filter === "Culture")
    return route.tags.some((tag) => ["culture", "roadtrip", "views"].includes(tag));
  if (filter === "No car") return route.tags.includes("no car") || route.tags.includes("walk");
  return route.budget.toLowerCase() === "free" || route.tags.includes("free");
}

function RouteCard({
  route,
  author,
  saved,
  commentCount,
  onOpenRoute,
}: {
  route: RouteItem;
  author: Author;
  saved: boolean;
  commentCount: number;
  onOpenRoute: (route: RouteItem) => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onOpenRoute(route)}
      aria-label={`Read route ${route.title}`}
      className="overflow-hidden rounded-3xl border border-hp-ink/10 bg-hp-paper text-left"
    >
      <div className="relative">
        <ImageBox
          src={route.imageUrl}
          alt={route.title}
          className="h-48 w-full"
          rounded="rounded-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-2 left-3 right-3 text-hp-paper">
          <div className="mb-1 flex gap-1.5">
            {route.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur"
              >
                {tag}
              </span>
            ))}
          </div>
          <h3 className="text-xl font-black leading-tight">{route.title}</h3>
        </div>
      </div>
      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <img
            src={author.avatarUrl}
            alt={author.name}
            width={28}
            height={28}
            className="h-7 w-7 rounded-full border border-hp-ink/10 object-cover"
            loading="lazy"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold text-hp-ink">{author.name}</div>
            <div
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: authorTypeColor[author.type] }}
            >
              {author.type}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-hp-ink/85">{route.lede}</p>
        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-hp-muted">
          <span className="inline-flex items-center gap-1">
            <Clock size={11} />
            {route.duration}
          </span>
          <span className="inline-flex items-center gap-1">
            <Wallet size={11} />
            {route.budget}
          </span>
          <span>{route.stops.length} stops</span>
          <span className="ml-auto inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5">
              <MessageCircle size={11} />
              {commentCount}
            </span>
            <span className={`inline-flex items-center gap-0.5 ${saved ? "text-hp-sunset" : ""}`}>
              <Bookmark size={11} />
              {route.saves + (saved ? 1 : 0)}
            </span>
          </span>
        </div>
        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-hp-ink px-4 py-2 text-[12px] font-bold text-hp-paper">
          Read route
        </div>
      </div>
    </motion.button>
  );
}

function RouteSection({
  title,
  eyebrow,
  routes,
  savedRoutes,
  routeComments,
  findAuthor,
  onOpenRoute,
}: {
  title: string;
  eyebrow: string;
  routes: RouteItem[];
  savedRoutes: Record<string, boolean>;
  routeComments: Record<string, Comment[]>;
  findAuthor: (id: string) => Author;
  onOpenRoute: (route: RouteItem) => void;
}) {
  if (routes.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
          {eyebrow}
        </div>
        <h3 className="text-[17px] font-black text-hp-ink">{title}</h3>
      </div>
      {routes.map((route) => {
        const author = findAuthor(route.authorId);
        const saved = savedRoutes[route.id];
        const commentCount = route.commentCount + (routeComments[route.id]?.length ?? 0);
        return (
          <RouteCard
            key={route.id}
            route={route}
            author={author}
            saved={!!saved}
            commentCount={commentCount}
            onOpenRoute={onOpenRoute}
          />
        );
      })}
    </section>
  );
}

function RoutesScreen({
  routes,
  onOpenRoute,
  savedRoutes,
  routeComments,
  findAuthor,
  showMustSee,
  places,
  onOpenPlace,
}: {
  routes: RouteItem[];
  onOpenRoute: (r: RouteItem) => void;
  savedRoutes: Record<string, boolean>;
  routeComments: Record<string, Comment[]>;
  findAuthor: (id: string) => Author;
  showMustSee: boolean;
  places: Place[];
  onOpenPlace: (place: Place) => void;
}) {
  const { language, t } = useI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RouteFilter>("All");
  const visibleRoutes = useMemo(
    () =>
      routes.filter((route) => {
        const author = findAuthor(route.authorId);
        return routeMatchesQuery(route, author, query) && routeMatchesFilter(route, filter);
      }),
    [filter, findAuthor, query, routes],
  );
  const recommendedRoutes = visibleRoutes.filter((route) =>
    findAuthor(route.authorId).type.includes("EDITOR"),
  );
  const localRoutes = visibleRoutes.filter(
    (route) => !findAuthor(route.authorId).type.includes("EDITOR"),
  );

  return (
    <div className="px-4 pb-28 pt-3">
      <h2 className="mb-1 text-2xl font-black text-hp-ink">{t("Routes")}</h2>
      <p className="mb-4 text-[12px] text-hp-muted">
        {t("Curated local routes with practical stops.")}
      </p>
      {showMustSee && <MustSeeTodayDeck places={places} onOpenPlace={onOpenPlace} />}
      <div className="mb-3 rounded-2xl border border-hp-ink/10 bg-white/60 p-2.5">
        <div className="flex items-center gap-2 rounded-full border border-hp-ink/10 bg-hp-paper px-3 py-2">
          <Search size={13} className="text-hp-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            name="route-search"
            aria-label={t("Search routes")}
            autoComplete="off"
            placeholder={t("Search routes, budget, area...")}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-hp-muted"
          />
        </div>
        <div className="hp-no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1">
          {ROUTE_FILTERS.map((option) => {
            const active = filter === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                aria-pressed={active}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${
                  active
                    ? "bg-hp-ink text-hp-paper"
                    : "border border-hp-ink/10 bg-hp-paper text-hp-ink/70"
                }`}
              >
                {t(option)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <RouteSection
          title={language === "GR" ? "Οι προτάσεις μας" : "What we recommend"}
          eyebrow={
            language === "GR"
              ? `${recommendedRoutes.length} επιλεγμένες`
              : `${recommendedRoutes.length} curated`
          }
          routes={recommendedRoutes}
          savedRoutes={savedRoutes}
          routeComments={routeComments}
          findAuthor={findAuthor}
          onOpenRoute={onOpenRoute}
        />
        <RouteSection
          title={language === "GR" ? "Προτείνουν οι ντόπιοι" : "Locals recommend"}
          eyebrow={
            language === "GR"
              ? `${localRoutes.length} από την κοινότητα`
              : `${localRoutes.length} community`
          }
          routes={localRoutes}
          savedRoutes={savedRoutes}
          routeComments={routeComments}
          findAuthor={findAuthor}
          onOpenRoute={onOpenRoute}
        />
        {visibleRoutes.length === 0 && (
          <div className="rounded-3xl border border-dashed border-hp-ink/15 bg-hp-paper/60 p-8 text-center">
            <h3 className="text-[15px] font-bold text-hp-ink">{t("No routes match")}</h3>
            <p className="mt-1 text-[12px] text-hp-muted">
              {t("Try another filter or search term.")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveRouteGuide({
  route,
  stopIndex,
  findPlace,
  onOpenStop,
  onNext,
  onClose,
}: {
  route: RouteItem;
  stopIndex: number;
  findPlace: (id: string) => Place | undefined;
  onOpenStop: (placeId: string, index: number) => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { language, t } = useI18n();
  const stop = route.stops[stopIndex] ?? route.stops[0];
  const place = stop ? findPlace(stop.placeId) : null;
  const total = route.stops.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute left-4 right-4 top-[6.75rem] z-30 rounded-2xl border border-hp-ink/10 bg-hp-paper/96 p-3 shadow-[0_12px_32px_rgba(23,20,17,0.16)] backdrop-blur"
    >
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-hp-sunset text-[13px] font-black text-hp-paper">
          {stopIndex + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase text-hp-muted">
            {language === "GR" ? "Ενεργή διαδρομή · στάση" : "Active route · stop"} {stopIndex + 1}/
            {total}
          </div>
          <h3 className="truncate text-[14px] font-black leading-tight text-hp-ink">
            {place?.name ?? stop?.title ?? route.title}
          </h3>
          <p className="line-clamp-2 text-[11.5px] leading-snug text-hp-muted">
            {stop?.body ?? route.lede}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hp-ink/5 text-hp-ink"
          aria-label={t("Close")}
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        {stop && (
          <button
            type="button"
            onClick={() => onOpenStop(stop.placeId, stopIndex)}
            className="flex-1 rounded-full border border-hp-ink/15 px-3 py-2 text-[11.5px] font-bold text-hp-ink"
          >
            {language === "GR" ? "Κέντρο στη στάση" : "Center stop"}
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-full bg-hp-ink px-3 py-2 text-[11.5px] font-bold text-hp-paper"
        >
          {language === "GR"
            ? stopIndex >= total - 1
              ? "Από την αρχή"
              : "Επόμενη στάση"
            : stopIndex >= total - 1
              ? "Restart"
              : "Next stop"}
        </button>
      </div>
    </motion.div>
  );
}

/* ============== Saved ============== */
function SavedScreen({
  savedPlaceIds,
  savedPostIds,
  savedRouteIds,
  places,
  posts,
  routes,
  onOpenPlace,
  onOpenPost,
  onOpenRoute,
  onUnsavePlace,
  onUnsavePost,
  onUnsaveRoute,
  findPlace,
  findAuthor,
  findPostAuthor,
}: {
  savedPlaceIds: string[];
  savedPostIds: string[];
  savedRouteIds: string[];
  places: Place[];
  posts: Post[];
  routes: RouteItem[];
  onOpenPlace: (p: Place) => void;
  onOpenPost: (p: Post) => void;
  onOpenRoute: (r: RouteItem) => void;
  onUnsavePlace: (id: string) => void;
  onUnsavePost: (id: string) => void;
  onUnsaveRoute: (id: string) => void;
  findPlace: (id: string) => Place | undefined;
  findAuthor: (id: string) => Author;
  findPostAuthor: (post: Post) => Author;
}) {
  const { language, t } = useI18n();
  const savedPlaces = places.filter((p) => savedPlaceIds.includes(p.id));
  const savedPostsList = posts.filter((p) => savedPostIds.includes(p.id));
  const savedRoutesList = routes.filter((r) => savedRouteIds.includes(r.id));
  const total = savedPlaces.length + savedPostsList.length + savedRoutesList.length;
  return (
    <div className="px-4 pb-28 pt-3">
      <h2 className="mb-1 text-2xl font-black text-hp-ink">{t("Saved")}</h2>
      <p className="mb-4 text-[12px] text-hp-muted">{t("Your private little list.")}</p>
      {total === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-hp-ink/15 bg-hp-paper/60 p-8 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-hp-sunset/10 text-hp-sunset">
            <Bookmark size={20} />
          </div>
          <h3 className="text-[15px] font-bold text-hp-ink">{t("Nothing saved yet")}</h3>
          <p className="mt-1 text-[12px] text-hp-muted">
            {t("Save places, posts, and routes to find them here.")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {savedPlaces.length > 0 && (
            <SavedSection title="Places">
              <div className="grid grid-cols-2 gap-3">
                {savedPlaces.map((p) => (
                  <div
                    key={p.id}
                    className="overflow-hidden rounded-2xl border border-hp-ink/10 bg-hp-paper"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenPlace(p)}
                      className="block w-full text-left"
                      aria-label={t("Open saved place {place}", { place: p.name })}
                    >
                      <ImageBox
                        src={p.imageUrl}
                        alt={p.name}
                        className="h-28 w-full"
                        rounded="rounded-none"
                      />
                      <div className="p-2">
                        <div
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: typeColor[p.type] }}
                        >
                          {p.type}
                        </div>
                        <div className="line-clamp-1 text-[12px] font-bold text-hp-ink">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-hp-muted">{p.area}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onUnsavePlace(p.id)}
                      className="mx-2 mb-2 rounded-full border border-hp-ink/10 px-2 py-1 text-[10px] font-bold text-hp-ink/70"
                    >
                      {t("Unsave")}
                    </button>
                  </div>
                ))}
              </div>
            </SavedSection>
          )}

          {savedPostsList.length > 0 && (
            <SavedSection title="Posts">
              <div className="flex flex-col gap-2">
                {savedPostsList.map((post) => {
                  const place = findPlace(post.placeId);
                  const author = findPostAuthor(post);
                  if (!place) return null;
                  return (
                    <div
                      key={post.id}
                      className="flex gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-2"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenPost(post)}
                        className="flex min-w-0 flex-1 gap-3 text-left"
                        aria-label={t("Open saved post at {place}", { place: place.name })}
                      >
                        <ImageBox
                          src={post.imageUrl}
                          alt={`${place.name} post`}
                          className="h-16 w-16 shrink-0"
                          rounded="rounded-xl"
                        />
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                            {author.name} · {place.name}
                          </div>
                          <div className="line-clamp-2 text-[12px] font-semibold text-hp-ink">
                            {post.text}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onUnsavePost(post.id)}
                        className="self-start rounded-full border border-hp-ink/10 px-2 py-1 text-[10px] font-bold text-hp-ink/70"
                      >
                        {t("Unsave")}
                      </button>
                    </div>
                  );
                })}
              </div>
            </SavedSection>
          )}

          {savedRoutesList.length > 0 && (
            <SavedSection title="Routes">
              <div className="flex flex-col gap-2">
                {savedRoutesList.map((route) => (
                  <div
                    key={route.id}
                    className="flex gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-2"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenRoute(route)}
                      className="flex min-w-0 flex-1 gap-3 text-left"
                      aria-label={t("Open saved route {route}", { route: route.title })}
                    >
                      <ImageBox
                        src={route.imageUrl}
                        alt={route.title}
                        className="h-16 w-16 shrink-0"
                        rounded="rounded-xl"
                      />
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                          {route.duration} · {route.budget}
                        </div>
                        <div className="line-clamp-1 text-[12px] font-bold text-hp-ink">
                          {route.title}
                        </div>
                        <div className="line-clamp-1 text-[11px] text-hp-muted">{route.lede}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onUnsaveRoute(route.id)}
                      className="self-start rounded-full border border-hp-ink/10 px-2 py-1 text-[10px] font-bold text-hp-ink/70"
                    >
                      {t("Unsave")}
                    </button>
                  </div>
                ))}
              </div>
            </SavedSection>
          )}
        </div>
      )}
    </div>
  );
}

function SavedSection({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-hp-muted">
        {t(title)}
      </h3>
      {children}
    </section>
  );
}

/* ============== Place Detail Modal ============== */
function PlaceDetailModal({
  place,
  events,
  onClose,
  onSave,
  saved,
  visited,
  onToggleVisited,
  posts,
  onOpenMap,
  onShare,
  comments,
  onComment,
  findAuthor,
  findPostAuthor,
  storyGroups,
  onOpenStory,
  businessProfile,
  showClaimCta,
  onClaimPlace,
  onGetDealCode,
  gettingDealCode,
}: {
  place: Place | null;
  events: PulseData["events"];
  onClose: () => void;
  onSave: (id: string) => void;
  saved: boolean;
  visited: boolean;
  onToggleVisited: (id: string) => void;
  posts: Post[];
  onOpenMap: (id: string) => void;
  onShare: (place: Place) => void;
  comments: Comment[];
  onComment: (id: string, text: string) => void;
  findAuthor: (id: string) => Author;
  findPostAuthor: (post: Post) => Author;
  storyGroups: PlaceStoryGroup[];
  onOpenStory: (placeId: string) => void;
  businessProfile: PlaceBusinessProfile | null;
  showClaimCta: boolean;
  onClaimPlace: () => void;
  onGetDealCode: () => void;
  gettingDealCode: boolean;
}) {
  const [commentText, setCommentText] = useState("");
  const { language, t } = useI18n();
  const eventCount = place ? events.filter((event) => event.placeId === place.id).length : 0;
  const noteCount = place ? place.commentCount + comments.length : 0;
  const hasBusinessDetail = Boolean(
    businessProfile &&
    ((businessProfile.dealActive && businessProfile.dealText) ||
      businessProfile.hoursText ||
      businessProfile.phone ||
      businessProfile.websiteUrl ||
      businessProfile.menuUrl ||
      businessProfile.photos.length > 0),
  );
  const placeStories = place
    ? (storyGroups.find((group) => group.placeId === place.id)?.stories ?? [])
    : [];

  return (
    <AnimatePresence>
      {place && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[70] overflow-hidden"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
            aria-label={t("Close")}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            role="dialog"
            aria-modal="true"
            aria-label={`${place.name} details`}
            className="hp-place-detail-sheet absolute inset-x-0 bottom-0 max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-paper"
          >
            <div className="relative">
              <ImageBox
                src={place.imageUrl}
                alt={place.name}
                className="h-64 w-full"
                rounded="rounded-none"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent" />
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-hp-paper/95 text-hp-ink"
                aria-label={t("Close")}
              >
                <X size={16} />
              </button>
              <div className="absolute bottom-3 left-4 right-4 text-hp-paper">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: typeColor[place.type] }}
                >
                  {place.type}
                </span>
                <h2 className="mt-2 text-2xl font-black">{place.name}</h2>
                <p className="text-[12px] opacity-85">
                  {place.greekName} · {place.area}
                </p>
                {businessProfile && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-hp-paper/95 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-hp-sunset">
                    <BadgeCheck size={12} />
                    {businessProfile.businessName
                      ? t("Managed by {name}", { name: businessProfile.businessName })
                      : t("Verified business")}
                  </span>
                )}
              </div>
            </div>
            {placeStories.length > 0 && (
              <div className="border-b border-hp-ink/10 px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                    Place stories · {placeStories.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenStory(place.id)}
                    className="text-[10px] font-bold text-hp-sunset"
                  >
                    Play all
                  </button>
                </div>
                <div className="hp-no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
                  {placeStories.map((story) => (
                    <button
                      key={story.id}
                      type="button"
                      onClick={() => onOpenStory(place.id)}
                      aria-label={t("Open stories from {place}", { place: place.name })}
                      className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-xl border border-hp-ink/10"
                    >
                      <ImageBox
                        src={story.mediaUrl}
                        alt=""
                        className="h-full w-full"
                        rounded="rounded-xl"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="p-4 pb-32">
              <p className="text-[14px] leading-snug text-hp-ink">{place.short}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {place.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-hp-ink/5 px-2 py-0.5 text-[11px] text-hp-ink/70"
                  >
                    #{t}
                  </span>
                ))}
              </div>
              <PlaceStats
                postsToday={place.recentPostCount}
                eventsTonight={eventCount}
                notes={noteCount}
                crowd={place.crowd}
                budget={place.budget}
                bestTime={place.bestTime}
                mood={place.mood}
              />

              {hasBusinessDetail && <div className="hp-pd-rule" />}

              {businessProfile?.dealActive && businessProfile.dealText && (
                <div className="hp-card-lift mt-4 rounded-2xl border border-hp-sunset/20 bg-hp-sunset/10 p-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-hp-sunset text-hp-paper">
                      <Gift size={12} strokeWidth={2.4} />
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-hp-sunset">
                      {t("App deal")}
                    </span>
                  </div>
                  <p className="mt-2 text-[14px] font-bold leading-snug text-hp-ink">
                    {businessProfile.dealText}
                  </p>
                  <button
                    type="button"
                    onClick={onGetDealCode}
                    disabled={gettingDealCode}
                    className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-hp-sunset py-2.5 text-[12px] font-bold text-hp-paper shadow-[0_10px_24px_-12px_rgba(224,106,50,0.7)] transition active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
                  >
                    <Ticket size={13} strokeWidth={2.4} />
                    {gettingDealCode ? t("Working...") : t("Get code")}
                  </button>
                </div>
              )}

              {businessProfile &&
                (businessProfile.hoursText ||
                  businessProfile.phone ||
                  businessProfile.websiteUrl ||
                  businessProfile.menuUrl ||
                  businessProfile.photos.length > 0) && (
                  <div className="mt-4 rounded-2xl border border-hp-sunset/25 bg-hp-sunset/5 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-sunset">
                      <Store size={12} /> {t("Business info")}
                    </div>
                    {businessProfile.hoursText && (
                      <div className="mt-2 flex items-start gap-2 text-[12.5px] text-hp-ink">
                        <Clock size={13} className="mt-0.5 shrink-0 text-hp-muted" />
                        <span className="whitespace-pre-line">{businessProfile.hoursText}</span>
                      </div>
                    )}
                    {businessProfile.phone && (
                      <a
                        href={`tel:${businessProfile.phone}`}
                        className="mt-2 flex items-center gap-2 text-[12.5px] font-semibold text-hp-ink"
                      >
                        <Phone size={13} className="shrink-0 text-hp-muted" />
                        {businessProfile.phone}
                      </a>
                    )}
                    {businessProfile.websiteUrl && (
                      <a
                        href={businessProfile.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-2 text-[12.5px] font-semibold text-hp-sunset"
                      >
                        <Globe size={13} className="shrink-0" />
                        {t("Website")}
                      </a>
                    )}
                    {businessProfile.menuUrl && (
                      <a
                        href={businessProfile.menuUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-2 text-[12.5px] font-semibold text-hp-sunset"
                      >
                        <UtensilsCrossed size={13} className="shrink-0" />
                        {t("See menu")}
                      </a>
                    )}
                    {businessProfile.photos.length > 0 && (
                      <div className="hp-no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
                        {businessProfile.photos.map((url) => (
                          <ImageBox
                            key={url}
                            src={url}
                            alt=""
                            className="h-24 w-32 shrink-0"
                            rounded="rounded-xl"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

              {showClaimCta && (
                <button
                  type="button"
                  onClick={onClaimPlace}
                  className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-hp-ink/20 bg-hp-paper p-3 text-left transition active:scale-[0.99]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-hp-ink/5 text-hp-ink">
                    <Store size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-black text-hp-ink">
                      {t("Is this your business?")}
                    </span>
                    <span className="block text-[11px] text-hp-muted">
                      {t("Claim it to add hours, a menu, and photos.")}
                    </span>
                  </span>
                </button>
              )}

              <div className="mt-5">
                <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-hp-muted">
                  Recent posts
                </h3>
                <div className="flex flex-col gap-2">
                  {posts.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-hp-ink/10 p-4 text-center text-[12px] text-hp-muted">
                      No recent posts here yet. Be first.
                    </div>
                  )}
                  {posts.map((p) => {
                    const a = findPostAuthor(p);
                    return (
                      <div
                        key={p.id}
                        className="rounded-2xl border border-hp-ink/10 bg-hp-paper p-3"
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={a.avatarUrl}
                            alt=""
                            width={24}
                            height={24}
                            className="h-6 w-6 rounded-full object-cover"
                            loading="lazy"
                          />
                          <span className="text-[12px] font-bold text-hp-ink">{a.name}</span>
                          <span
                            className="rounded-sm px-1 py-[1px] text-[8px] font-bold uppercase tracking-wider text-hp-paper"
                            style={{ background: authorTypeColor[a.type] }}
                          >
                            {a.type}
                          </span>
                          <span className="ml-auto text-[10px] text-hp-muted">{p.time}</span>
                        </div>
                        <p className="mt-1 text-[13px] text-hp-ink">{p.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-hp-ink/10 bg-white/60 p-3">
                <label
                  htmlFor={`place-detail-comment-${place.id}`}
                  className="text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                >
                  {language === "GR" ? "Γρήγορο σχόλιο" : "Quick comment"}
                </label>
                <div className="mt-2 flex items-center gap-2 rounded-full border border-hp-ink/10 bg-hp-paper px-3 py-2">
                  <input
                    id={`place-detail-comment-${place.id}`}
                    name={`place-detail-comment-${place.id}`}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    autoComplete="off"
                    placeholder={t("Add a local note…")}
                    className="w-full bg-transparent text-[12px] outline-none placeholder:text-hp-muted"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && commentText.trim()) {
                        onComment(place.id, commentText.trim());
                        setCommentText("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (commentText.trim()) {
                        onComment(place.id, commentText.trim());
                        setCommentText("");
                      }
                    }}
                    className="grid h-7 w-7 place-items-center rounded-full bg-hp-ink text-hp-paper disabled:opacity-40"
                    disabled={!commentText.trim()}
                    aria-label={`Post comment on ${place.name}`}
                  >
                    <Send size={12} />
                  </button>
                </div>
                {comments.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {comments.slice(-3).map((c, i) => (
                      <div key={i} className="rounded-2xl bg-hp-ink/5 px-3 py-2 text-[12px]">
                        <span className="font-bold text-hp-ink">{c.author}</span>{" "}
                        <span className="text-hp-ink/80">{c.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="sticky bottom-0 flex flex-col gap-2 border-t border-hp-ink/10 bg-hp-paper/95 p-3 backdrop-blur">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onSave(place.id)}
                  className={`flex-1 rounded-full border py-3 text-[12px] font-bold ${saved ? "border-hp-sunset bg-hp-sunset/10 text-hp-sunset" : "border-hp-ink/15 text-hp-ink"}`}
                >
                  <Bookmark size={13} className="mr-1 inline" /> {saved ? "Saved" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleVisited(place.id)}
                  aria-pressed={visited}
                  className={`flex-1 rounded-full border py-3 text-[12px] font-bold ${visited ? "border-hp-sunset bg-hp-sunset/10 text-hp-sunset" : "border-hp-ink/15 text-hp-ink"}`}
                >
                  <Check size={13} strokeWidth={visited ? 3 : 2.4} className="mr-1 inline" />{" "}
                  {t("I've been here")}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMap(place.id);
                  }}
                  className="flex-1 rounded-full bg-hp-ink py-3 text-[12px] font-bold text-hp-paper"
                >
                  Map
                </button>
                <a
                  href={openStreetMapUrl(place)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("Open {place} in OpenStreetMap", { place: place.name })}
                  className="grid h-12 w-12 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
                >
                  <ExternalLink size={14} />
                </a>
                <button
                  type="button"
                  onClick={() => onShare(place)}
                  className="grid h-12 w-12 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
                  aria-label={t("Share {place}", { place: place.name })}
                >
                  <Share2 size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
// Typography-led place stats: an activity byline (only non-zero counts, joined
// with "·") over a no-box descriptor row, then a single "Best for" line. No
// tiles, no colour -- ink for the values, muted for everything else.
function PlaceStats({
  postsToday,
  eventsTonight,
  notes,
  crowd,
  budget,
  bestTime,
  mood,
}: {
  postsToday: number;
  eventsTonight: number;
  notes: number;
  crowd: string;
  budget: string;
  bestTime: string;
  mood: string;
}) {
  const { t } = useI18n();

  const clauses: ReactNode[] = [];
  if (postsToday > 0) {
    clauses.push(
      <span key="posts">
        <MessageCircle strokeWidth={2.2} />
        <b>{postsToday}</b> {t("posts today")}
      </span>,
    );
  }
  if (eventsTonight > 0) {
    clauses.push(
      <span key="events">
        <CalendarHeart strokeWidth={2.2} />
        <b>{eventsTonight}</b> {t("events tonight")}
      </span>,
    );
  }
  if (notes > 0) {
    clauses.push(
      <span key="notes">
        <ListChecks strokeWidth={2.2} />
        <b>{notes}</b> {t("local notes")}
      </span>,
    );
  }

  const descriptors: { key: string; icon: ReactNode; label: string; value: string }[] = [];
  if (crowd.trim()) {
    descriptors.push({
      key: "crowd",
      icon: <Users strokeWidth={2.2} />,
      label: t("Crowd"),
      value: t(crowd.trim()),
    });
  }
  if (budget.trim()) {
    descriptors.push({
      key: "budget",
      icon: <Wallet strokeWidth={2.2} />,
      label: t("Budget"),
      value: /^free$/i.test(budget.trim()) ? t("Free") : budget.trim(),
    });
  }
  if (bestTime.trim()) {
    descriptors.push({
      key: "bestTime",
      icon: <Clock strokeWidth={2.2} />,
      label: t("Best time"),
      value: bestTime.trim(),
    });
  }

  const moodText = mood.trim();
  const hasStats = clauses.length > 0 || descriptors.length > 0;
  if (!hasStats && !moodText) return null;

  return (
    <>
      {hasStats && (
        <div className="hp-pd-stats">
          <p className="hp-pd-byline">
            {clauses.length > 0
              ? clauses.flatMap((node, i) =>
                  i === 0
                    ? [node]
                    : [
                        <span key={`sep-${i}`} className="hp-pd-sep">
                          ·
                        </span>,
                        node,
                      ],
                )
              : t("Quiet here right now")}
          </p>
          {descriptors.length > 0 && (
            <div className="hp-pd-desc">
              {descriptors.map((d) => (
                <span key={d.key}>
                  {d.icon}
                  {d.label} <b>{d.value}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {moodText && (
        <div className="hp-pd-bestfor">
          <i>{t("Best for")}</i>
          <span>{moodText}</span>
        </div>
      )}
    </>
  );
}

/* ============== Post Detail Modal ============== */
function PostDetailModal({
  post,
  onClose,
  onOpenMap,
  onLike,
  liked,
  likeCount,
  comments,
  onComment,
  saved,
  onSave,
  onShare,
  findPlace,
  findAuthor,
  findPostAuthor,
}: {
  post: Post | null;
  onClose: () => void;
  onOpenMap: (id: string) => void;
  onLike: () => void;
  liked: boolean;
  likeCount: number;
  comments: Comment[];
  onComment: (t: string) => void;
  saved: boolean;
  onSave: () => void;
  onShare: (post: Post) => void;
  findPlace: (id: string) => Place | undefined;
  findAuthor: (id: string) => Author;
  findPostAuthor: (post: Post) => Author;
}) {
  const [text, setText] = useState("");
  const { language, t } = useI18n();
  return (
    <AnimatePresence>
      {post &&
        (() => {
          const p = findPlace(post.placeId);
          const a = findPostAuthor(post);
          if (!p) return null;
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[80] overflow-hidden"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/65"
                onClick={onClose}
                aria-label={t("Close")}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 240 }}
                role="dialog"
                aria-modal="true"
                aria-label={`Post at ${p.name}`}
                className="hp-fullscreen-modal absolute inset-x-0 bottom-0 flex w-full max-w-full flex-col overflow-hidden bg-hp-paper"
              >
                <div className="relative">
                  <ImageBox
                    src={post.imageUrl}
                    alt={`${p.name} post`}
                    className="h-72 w-full"
                    rounded="rounded-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent" />
                  <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-hp-paper/95 text-hp-ink"
                    aria-label={t("Close")}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-3">
                  <div className="flex items-center gap-2">
                    <img
                      src={a.avatarUrl}
                      alt={a.name}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full border border-hp-ink/10 object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-hp-ink">{a.name}</span>
                        <span
                          className="rounded-sm px-1 py-[1px] text-[8px] font-bold uppercase tracking-wider text-hp-paper"
                          style={{ background: authorTypeColor[a.type] }}
                        >
                          {a.type}
                        </span>
                      </div>
                      <div className="text-[10px] text-hp-muted">
                        <MapPin size={9} className="mr-0.5 inline" />
                        {p.name} · {post.time}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-[14px] leading-snug text-hp-ink">{post.text}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {post.tags.map((t) => (
                      <span key={t} className="text-[11px] font-semibold text-hp-deep/80">
                        #{t}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-[12px] text-hp-ink/70">
                    <button
                      type="button"
                      onClick={onLike}
                      className={`inline-flex items-center gap-1 ${liked ? "text-hp-sunset" : ""}`}
                      aria-label={t(liked ? "Unlike post" : "Like post")}
                    >
                      <Heart size={16} fill={liked ? "currentColor" : "none"} /> {likeCount}
                    </button>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle size={16} /> {comments.length}
                    </span>
                  </div>
                  <div className="mt-4 border-t border-hp-ink/10 pt-3">
                    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-hp-muted">
                      {t("Comments")}
                    </h4>
                    <div className="flex flex-col gap-2">
                      {comments.map((c, i) => (
                        <div key={i} className="rounded-2xl bg-hp-ink/5 px-3 py-2 text-[12px]">
                          <span className="font-bold text-hp-ink">{c.author}</span>{" "}
                          <span className="text-hp-ink/80">{c.text}</span>
                        </div>
                      ))}
                      {comments.length === 0 && (
                        <div className="text-[12px] text-hp-muted">
                          {language === "GR"
                            ? "Γίνε ο πρώτος που σχολιάζει."
                            : "Be the first to comment."}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 border-t border-hp-ink/10 bg-hp-paper/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
                  <div className="mb-2 flex items-center gap-2 rounded-full border border-hp-ink/10 bg-white/70 px-3 py-2">
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      name={`post-comment-${post.id}`}
                      aria-label={t("Quick comment on post")}
                      autoComplete="off"
                      placeholder={t("Quick comment…")}
                      className="w-full bg-transparent text-[12px] outline-none placeholder:text-hp-muted"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && text.trim()) {
                          onComment(text.trim());
                          setText("");
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (text.trim()) {
                          onComment(text.trim());
                          setText("");
                        }
                      }}
                      className="grid h-7 w-7 place-items-center rounded-full bg-hp-ink text-hp-paper disabled:opacity-40"
                      disabled={!text.trim()}
                      aria-label={t("Post comment")}
                    >
                      <Send size={12} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenMap(p.id);
                      }}
                      className="flex-1 rounded-full bg-hp-ink py-2.5 text-[12px] font-bold text-hp-paper"
                    >
                      <MapIcon size={13} className="mr-1 inline" /> Open on map
                    </button>
                    <a
                      href={openStreetMapUrl(p)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("Open {place} in OpenStreetMap", { place: p.name })}
                      className="grid h-10 w-10 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
                    >
                      <ExternalLink size={14} />
                    </a>
                    <button
                      type="button"
                      onClick={onSave}
                      className={`grid h-10 w-10 place-items-center rounded-full border border-hp-ink/15 ${saved ? "text-hp-sunset" : "text-hp-ink"}`}
                      aria-label={t(saved ? "Unsave post" : "Save post")}
                    >
                      <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onShare(post)}
                      className="grid h-10 w-10 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
                      aria-label={t("Share post")}
                    >
                      <Share2 size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
    </AnimatePresence>
  );
}

/* ============== Route Article Modal ============== */
function RouteArticleModal({
  route,
  onClose,
  onOpenMap,
  onMapRoute,
  saved,
  comments,
  onSave,
  onShare,
  onComment,
  findPlace,
  findAuthor,
}: {
  route: RouteItem | null;
  onClose: () => void;
  onOpenMap: (id: string) => void;
  onMapRoute: (route: RouteItem) => void;
  saved: boolean;
  comments: Comment[];
  onSave: () => void;
  onShare: () => void;
  onComment: (text: string) => void;
  findPlace: (id: string) => Place | undefined;
  findAuthor: (id: string) => Author;
}) {
  const [text, setText] = useState("");
  const { language, t } = useI18n();
  return (
    <AnimatePresence>
      {route &&
        (() => {
          const a = findAuthor(route.authorId);
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[80] overflow-hidden"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/65"
                onClick={onClose}
                aria-label={t("Close")}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 240 }}
                role="dialog"
                aria-modal="true"
                aria-label={`Route: ${route.title}`}
                className="hp-fullscreen-modal absolute inset-x-0 bottom-0 flex w-full max-w-full flex-col overflow-hidden bg-hp-paper"
              >
                <div className="relative">
                  <ImageBox
                    src={route.imageUrl}
                    alt={route.title}
                    className="h-72 w-full"
                    rounded="rounded-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
                  <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-hp-paper/95 text-hp-ink"
                    aria-label={t("Close")}
                  >
                    <X size={16} />
                  </button>
                  <div className="absolute bottom-3 left-4 right-4 text-hp-paper">
                    <div className="mb-1 flex gap-1.5">
                      {route.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-white/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <h2 className="text-2xl font-black leading-tight">{route.title}</h2>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-4">
                  <div className="flex items-center gap-2">
                    <img
                      src={a.avatarUrl}
                      alt={a.name}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full border border-hp-ink/10 object-cover"
                      loading="lazy"
                    />
                    <div>
                      <div className="text-[13px] font-bold text-hp-ink">{a.name}</div>
                      <div
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: authorTypeColor[a.type] }}
                      >
                        {a.type}
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-3 text-[11px] text-hp-muted">
                      <span className="inline-flex items-center gap-0.5">
                        <Clock size={11} />
                        {route.duration}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <Wallet size={11} />
                        {route.budget}
                      </span>
                    </div>
                  </div>
                  <p className="mt-4 text-[15px] leading-relaxed text-hp-ink">{route.lede}</p>

                  <h3 className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wider text-hp-muted">
                    Timeline
                  </h3>
                  <ol className="relative space-y-3 border-l-2 border-hp-ink/10 pl-4">
                    {route.stops.map((s, i) => {
                      const p = findPlace(s.placeId);
                      return (
                        <li key={i} className="relative">
                          <span className="absolute -left-[22px] top-1 grid h-4 w-4 place-items-center rounded-full bg-hp-sunset text-[8px] font-bold text-hp-paper">
                            {i + 1}
                          </span>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-hp-sunset">
                            {s.time}
                          </div>
                          <div className="text-[14px] font-bold text-hp-ink">
                            {p?.name ?? s.title}
                          </div>
                          <div className="text-[12px] text-hp-muted">{s.title}</div>
                          <p className="mt-1 text-[13px] leading-snug text-hp-ink/90">{s.body}</p>
                          {p && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onOpenMap(p.id);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-hp-ink/15 px-3 py-1 text-[11px] font-semibold text-hp-ink"
                              >
                                <MapIcon size={11} /> Open on map
                              </button>
                              <a
                                href={openStreetMapUrl(p)}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={t("Open {place} in OpenStreetMap", { place: p.name })}
                                className="inline-grid h-7 w-7 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
                              >
                                <ExternalLink size={11} />
                              </a>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  <div className="mt-6 flex items-center gap-3 text-[12px] text-hp-ink/70">
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle size={14} />
                      {route.commentCount + comments.length}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${saved ? "text-hp-sunset" : ""}`}
                    >
                      <Bookmark size={14} />
                      {route.saves + (saved ? 1 : 0)}
                    </span>
                  </div>
                  <div className="mt-4 border-t border-hp-ink/10 pt-3">
                    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-hp-muted">
                      {t("Comments")}
                    </h4>
                    <div className="flex flex-col gap-2">
                      {comments.map((c, i) => (
                        <div key={i} className="rounded-2xl bg-hp-ink/5 px-3 py-2 text-[12px]">
                          <span className="font-bold text-hp-ink">{c.author}</span>{" "}
                          <span className="text-hp-ink/80">{c.text}</span>
                        </div>
                      ))}
                      {comments.length === 0 && (
                        <div className="text-[12px] text-hp-muted">
                          {language === "GR"
                            ? "Δεν υπάρχουν σχόλια ακόμη."
                            : "No route comments yet."}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2 rounded-full border border-hp-ink/10 bg-white/70 px-3 py-2">
                      <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        name={`route-comment-${route.id}`}
                        aria-label={t("Quick comment on route")}
                        autoComplete="off"
                        placeholder={
                          language === "GR"
                            ? "Πρόσθεσε σημείωση για τη διαδρομή…"
                            : "Add a route note…"
                        }
                        className="w-full bg-transparent text-[12px] outline-none placeholder:text-hp-muted"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && text.trim()) {
                            onComment(text.trim());
                            setText("");
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (text.trim()) {
                            onComment(text.trim());
                            setText("");
                          }
                        }}
                        className="grid h-7 w-7 place-items-center rounded-full bg-hp-ink text-hp-paper disabled:opacity-40"
                        disabled={!text.trim()}
                        aria-label={t("Post route comment")}
                      >
                        <Send size={12} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 flex gap-2 border-t border-hp-ink/10 bg-hp-paper/95 p-3 backdrop-blur">
                  <button
                    type="button"
                    onClick={() => onMapRoute(route)}
                    className="flex-1 rounded-full bg-hp-ink py-3 text-[12px] font-bold text-hp-paper"
                  >
                    <MapIcon size={13} className="mr-1 inline" /> Map route
                  </button>
                  <button
                    type="button"
                    onClick={onSave}
                    className={`flex-1 rounded-full border border-hp-ink/15 py-3 text-[12px] font-bold ${saved ? "bg-hp-sunset/10 text-hp-sunset" : "text-hp-ink"}`}
                  >
                    <Bookmark
                      size={13}
                      className="mr-1 inline"
                      fill={saved ? "currentColor" : "none"}
                    />{" "}
                    {saved ? "Saved" : "Save route"}
                  </button>
                  <button
                    type="button"
                    onClick={onShare}
                    className="grid h-11 w-11 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
                    aria-label={t("Share route")}
                  >
                    <Share2 size={15} />
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
    </AnimatePresence>
  );
}

const placeTypeOptions: Place["type"][] = [
  "beach",
  "culture",
  "nature",
  "food",
  "local",
  "village",
  "night",
  "sunset",
];

// English i18n keys for the place-type <option>s in the create composer.
const PLACE_TYPE_LABEL_KEYS: Record<Place["type"], string> = {
  beach: "Beach",
  culture: "Culture",
  nature: "Nature",
  food: "Food",
  local: "Local spot",
  village: "Village",
  night: "Night",
  sunset: "Sunset",
};

const STORY_CONDITION_OPTIONS = ["clean", "windy", "busy", "quiet", "event"] as const;

function defaultMeetDateTime() {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toISOString().slice(0, 16);
}

function tagList(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function SearchablePlacePicker({
  places,
  value,
  onChange,
  query,
  setQuery,
}: {
  places: Place[];
  value: string;
  onChange: (id: string) => void;
  query: string;
  setQuery: (query: string) => void;
}) {
  const { language } = useI18n();
  const selected = places.find((place) => place.id === value) ?? places[0];
  const results = useMemo(() => {
    const matches = query.trim()
      ? places.filter((place) => matchesPlaceQuery(place, query))
      : places;
    return matches.slice(0, 7);
  }, [places, query]);

  if (!selected) return null;

  return (
    <div className="rounded-2xl border border-hp-ink/10 bg-white/60 p-2.5">
      <div className="mb-2 flex items-center gap-2 rounded-full border border-hp-ink/10 bg-hp-paper px-3 py-2">
        <Search size={13} className="text-hp-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          name="create-post-place-search"
          aria-label={language === "GR" ? "Αναζήτηση τοποθεσίας" : "Search post location"}
          autoComplete="off"
          placeholder={
            language === "GR"
              ? "Αναζήτησε τοποθεσία, περιοχή ή tag…"
              : "Search location, area, tag..."
          }
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-hp-muted"
        />
      </div>
      <div className="mb-2 rounded-xl bg-hp-ink/5 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
          {language === "GR" ? "Επιλεγμένο" : "Selected"}
        </div>
        <div className="truncate text-[13px] font-bold text-hp-ink">
          {selected.name} <span className="font-semibold text-hp-muted">· {selected.area}</span>
        </div>
      </div>
      <div
        className="grid max-h-56 gap-1 overflow-y-auto pr-1"
        role="listbox"
        aria-label={language === "GR" ? "Τοποθεσίες" : "Locations"}
      >
        {results.map((placeOption) => {
          const selectedOption = placeOption.id === selected.id;
          return (
            <button
              key={placeOption.id}
              type="button"
              role="option"
              aria-selected={selectedOption}
              onClick={() => {
                onChange(placeOption.id);
                setQuery("");
              }}
              className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition ${
                selectedOption ? "bg-hp-ink text-hp-paper" : "bg-hp-paper/75 text-hp-ink"
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: typeColor[placeOption.type] }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-bold">{placeOption.name}</span>
                <span
                  className={`block truncate text-[10px] ${
                    selectedOption ? "text-hp-paper/65" : "text-hp-muted"
                  }`}
                >
                  {placeOption.area} · {placeOption.type}
                </span>
              </span>
              <span
                className={`text-[10px] font-bold ${
                  selectedOption ? "text-hp-paper/75" : "text-hp-muted"
                }`}
              >
                {placeOption.recentPostCount}
              </span>
            </button>
          );
        })}
        {results.length === 0 && (
          <div className="rounded-xl border border-dashed border-hp-ink/15 px-3 py-4 text-center text-[12px] text-hp-muted">
            {language === "GR" ? "Δεν βρέθηκε τοποθεσία." : "No location matches that search."}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============== Create Modal ============== */
function CreateComposerModal({
  open,
  initialMode = "post",
  prefillPlace,
  places,
  vibeChips,
  account,
  onClose,
  onRequireAccount,
  onPost,
  onPlace,
  onStory,
  onEvent,
}: {
  open: boolean;
  initialMode?: ComposerMode;
  prefillPlace?: { lat: number; lng: number } | null;
  places: Place[];
  vibeChips: string[];
  account: PulseAccountState;
  onClose: () => void;
  onRequireAccount: () => void;
  onPost: (payload: {
    text: string;
    placeId: string;
    vibes: string[];
    identity: PostingIdentity;
  }) => Promise<void>;
  onPlace: (payload: CreatePulsePlaceInput) => Promise<void>;
  onStory: (payload: CreateStoryInput) => Promise<void>;
  onEvent: (payload: CreateMeetInput) => Promise<void>;
}) {
  const { language, t } = useI18n();
  const [mode, setMode] = useState<ComposerMode>("post");
  const [text, setText] = useState("");
  const [place, setPlace] = useState(places[0]?.id ?? "");
  const [placeQuery, setPlaceQuery] = useState("");
  const [identity, setIdentity] = useState<PostingIdentity>("LOCAL");
  const [vibes, setVibes] = useState<string[]>([]);
  const [placeName, setPlaceName] = useState("");
  const [placeArea, setPlaceArea] = useState("");
  const [placeType, setPlaceType] = useState<Place["type"]>("local");
  const [placeLat, setPlaceLat] = useState("");
  const [placeLng, setPlaceLng] = useState("");
  const [placeImageUrl, setPlaceImageUrl] = useState("");
  const [placeShort, setPlaceShort] = useState("");
  const [placeTags, setPlaceTags] = useState("");
  const [placeCrowd, setPlaceCrowd] = useState("low");
  const [placeBudget, setPlaceBudget] = useState("€");
  const [placeBestTime, setPlaceBestTime] = useState("today");
  const [storyCaption, setStoryCaption] = useState("");
  const [storyKind, setStoryKind] = useState<"photo" | "report">("photo");
  const [storyCrowd, setStoryCrowd] = useState<"low" | "medium" | "high">("medium");
  const [storyParking, setStoryParking] = useState<"easy" | "tight" | "full">("easy");
  const [storyCondition, setStoryCondition] = useState<string[]>([]);
  const [storyVisibility, setStoryVisibility] = useState<number | undefined>(6);
  const [eventTitle, setEventTitle] = useState("");
  const [eventWhen, setEventWhen] = useState(defaultMeetDateTime);
  const [eventCategory, setEventCategory] = useState<MeetCategory>("social");
  const [eventVibe, setEventVibe] = useState("Friendly");
  const [eventPrice, setEventPrice] = useState("Free");
  const [eventCapacity, setEventCapacity] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventTags, setEventTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedPlace = places.find((p) => p.id === place) ?? places[0];
  const profile = readyProfile(account);
  const accountCanContribute = Boolean(profile);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setIdentity(composerIdentity(account));
    setError(null);
    if (prefillPlace) {
      setPlaceLat(String(Number(prefillPlace.lat.toFixed(6))));
      setPlaceLng(String(Number(prefillPlace.lng.toFixed(6))));
    }
  }, [account, initialMode, open, prefillPlace]);

  useEffect(() => {
    if (places.length > 0 && !places.some((p) => p.id === place)) {
      setPlace(places[0].id);
    }
  }, [place, places]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSaving(false);
      setStoryCaption("");
      setStoryKind("photo");
      setStoryCrowd("medium");
      setStoryParking("easy");
      setStoryCondition([]);
      setStoryVisibility(6);
      setEventWhen(defaultMeetDateTime());
    }
  }, [open]);

  const requireComposerAccount = () => {
    if (accountCanContribute) return true;
    onRequireAccount();
    setError(
      account.status === "needsProfile"
        ? language === "GR"
          ? "Ολοκλήρωσε το προφίλ σου πριν δημοσιεύσεις."
          : "Complete your profile before posting."
        : language === "GR"
          ? "Συνδέσου πριν δημοσιεύσεις."
          : "Sign in before posting.",
    );
    return false;
  };

  const handlePostSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireComposerAccount()) return;
    if (!text.trim() || !place) return;
    setSaving(true);
    setError(null);
    try {
      await onPost({ text: text.trim(), placeId: place, vibes, identity });
      setText("");
      setVibes([]);
      setPlaceQuery("");
    } catch (submitError) {
      console.warn("Could not create post.", submitError);
      setError(
        language === "GR"
          ? "Δεν ήταν δυνατή η αποθήκευση. Δοκίμασε ξανά."
          : "Could not save post. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePlaceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireComposerAccount()) return;
    const lat = Number(placeLat);
    const lng = Number(placeLng);
    if (!placeName.trim() || !placeArea.trim() || !placeShort.trim() || !placeImageUrl.trim()) {
      setError(
        language === "GR"
          ? "Συμπλήρωσε όνομα, περιοχή, περιγραφή και URL φωτογραφίας."
          : "Fill the place name, area, description, and photo URL.",
      );
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError(
        language === "GR"
          ? "Χρησιμοποίησε έγκυρο γεωγραφικό πλάτος και μήκος."
          : "Use valid latitude and longitude.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onPlace({
        name: placeName.trim(),
        type: placeType,
        area: placeArea.trim(),
        lat,
        lng,
        short: placeShort.trim(),
        imageUrl: placeImageUrl.trim(),
        tags: tagList(placeTags),
        crowd: placeCrowd,
        budget: placeBudget,
        bestTime: placeBestTime.trim() || "today",
      });
      setPlaceName("");
      setPlaceArea("");
      setPlaceType("local");
      setPlaceLat("");
      setPlaceLng("");
      setPlaceImageUrl("");
      setPlaceShort("");
      setPlaceTags("");
      setPlaceCrowd("low");
      setPlaceBudget("€");
      setPlaceBestTime("today");
    } catch (submitError) {
      console.warn("Could not create place.", submitError);
      setError(
        language === "GR"
          ? "Δεν ήταν δυνατή η αποθήκευση του σημείου."
          : "Could not save place. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStorySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireComposerAccount()) return;
    if (!place || !storyCaption.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onStory({
        placeId: place,
        caption: storyCaption,
        kind: storyKind,
        crowd: storyKind === "report" ? storyCrowd : undefined,
        parking: storyKind === "report" ? storyParking : undefined,
        condition: storyKind === "report" ? storyCondition : undefined,
        visibilityHours: storyVisibility,
      });
      setStoryCaption("");
      setStoryCondition([]);
    } catch (submitError) {
      const pgError = submitError as {
        message?: string;
        code?: string;
        details?: string;
        hint?: string;
      };
      console.error("Could not create story.", {
        message: pgError?.message,
        code: pgError?.code,
        details: pgError?.details,
        hint: pgError?.hint,
        raw: submitError,
      });
      setError(
        language === "GR"
          ? "Δεν ήταν δυνατή η αποθήκευση του story."
          : "Could not save story. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEventSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireComposerAccount()) return;
    const happensAt = new Date(eventWhen);
    const capacity = eventCapacity.trim() ? Number(eventCapacity) : undefined;
    if (!eventTitle.trim() || !eventDescription.trim() || !place) {
      setError(
        language === "GR"
          ? "Πρόσθεσε τίτλο, σημείο και σύντομη περιγραφή."
          : "Add a title, place, and short description.",
      );
      return;
    }
    if (!Number.isFinite(happensAt.getTime())) {
      setError(
        language === "GR" ? "Επίλεξε έγκυρη ημερομηνία και ώρα." : "Choose a valid date and time.",
      );
      return;
    }
    if (capacity !== undefined && (!Number.isFinite(capacity) || capacity < 2)) {
      setError(
        language === "GR"
          ? "Η χωρητικότητα πρέπει να είναι κενή ή τουλάχιστον 2."
          : "Capacity must be empty or at least 2.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onEvent({
        title: eventTitle.trim(),
        placeId: place,
        happensAt: happensAt.toISOString(),
        category: eventCategory,
        vibe: eventVibe.trim() || MEET_CATEGORY_META[eventCategory].label,
        price: eventPrice.trim() || "Free",
        capacity,
        description: eventDescription.trim(),
        tags: tagList(eventTags),
      });
      setEventTitle("");
      setEventWhen(defaultMeetDateTime());
      setEventCategory("social");
      setEventVibe("Friendly");
      setEventPrice("Free");
      setEventCapacity("");
      setEventDescription("");
      setEventTags("");
    } catch (submitError) {
      console.warn("Could not create event.", submitError);
      setError("Could not host this gathering. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!selectedPlace) return null;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[85] overflow-hidden"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
            aria-label={t("Close")}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            role="dialog"
            aria-modal="true"
            aria-label={
              language === "GR" ? "Δημιουργία περιεχομένου" : "Create local post or place"
            }
            className="hp-composer-sheet absolute inset-x-0 bottom-0 max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-paper p-4"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hp-ink/15" />
            <div className="mb-4 flex items-center justify-between border-b border-hp-ink/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[9px] bg-hp-sunset text-hp-paper">
                  <Plus size={14} strokeWidth={2.6} />
                </span>
                <h3 className="text-xl font-black text-hp-ink">{t("Add to ΗΛΕΙΑ PULSE")}</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-hp-ink/5 text-hp-ink"
                aria-label={t("Close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-4 gap-1 rounded-full border border-hp-ink/10 bg-white/50 p-1">
              {(["post", "place", "story", "event"] as ComposerMode[]).map((option) => {
                const ModeIcon = COMPOSER_MODE_ICONS[option];
                return (
                  <button
                    key={option}
                    type="button"
                    data-testid={`composer-mode-${option}`}
                    onClick={() => {
                      setMode(option);
                      setError(null);
                    }}
                    aria-pressed={mode === option}
                    className={`flex flex-col items-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-bold capitalize transition ${
                      mode === option ? "bg-hp-ink text-hp-paper" : "text-hp-ink/65"
                    }`}
                  >
                    <ModeIcon size={14} strokeWidth={2.2} />
                    {t(option[0].toUpperCase() + option.slice(1))}
                  </button>
                );
              })}
            </div>

            <div className="hp-card-lift mb-4 flex items-center gap-2.5 rounded-2xl border border-hp-ink/10 bg-hp-paper px-3 py-2.5">
              {profile ? (
                <>
                  {profileAvatarUrl(profile) ? (
                    <img
                      src={profileAvatarUrl(profile) ?? ""}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full border border-hp-ink/10 object-cover"
                    />
                  ) : (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hp-ink text-[10px] font-black text-hp-paper">
                      {profileDisplayName(profile).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-black text-hp-ink">
                      {t("Posting as {name}", { name: profileDisplayName(profile) })}
                    </span>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                      {t("Profile identity will be stored with this contribution")}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hp-sunset/10 text-hp-sunset">
                    <LockKeyhole size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-black text-hp-ink">
                      {t("Sign in to post")}
                    </span>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                      {t("Saves can be private, public posts need a profile")}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={onRequireAccount}
                    className="shrink-0 rounded-full bg-hp-ink px-3 py-1.5 text-[11px] font-bold text-hp-paper"
                  >
                    {t("Sign in")}
                  </button>
                </>
              )}
            </div>

            {mode === "post" ? (
              <form
                data-testid="composer-post-form"
                onSubmit={handlePostSubmit}
                className="hp-stagger space-y-3"
              >
                <div className="hp-card-lift relative h-40 overflow-hidden rounded-2xl border border-hp-ink/10 bg-white/50">
                  <ImageBox
                    src={selectedPlace.imageUrl}
                    alt={selectedPlace.name}
                    className="h-full w-full"
                    rounded="rounded-2xl"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent" />
                  <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-bold text-hp-paper backdrop-blur">
                    <ImagePlus size={12} />
                    {t("Using {place} image", { place: selectedPlace.name })}
                  </span>
                </div>
                <label htmlFor="create-post-text" className="sr-only">
                  Post text
                </label>
                <textarea
                  id="create-post-text"
                  name="create-post-text"
                  data-testid="composer-post-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoComplete="off"
                  placeholder={t("What's happening at this place?…")}
                  className={`${fieldClass()} resize-none`}
                  rows={3}
                />
                <div>
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                    {t("Posting as")}
                  </div>
                  <IdentitySegments
                    options={POSTING_IDENTITIES}
                    value={identity}
                    onChange={setIdentity}
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                    {t("Location")}
                  </div>
                  <input
                    type="hidden"
                    id="create-post-place"
                    name="create-post-place"
                    data-testid="composer-post-place"
                    value={place}
                    readOnly
                  />
                  <SearchablePlacePicker
                    places={places}
                    value={place}
                    onChange={setPlace}
                    query={placeQuery}
                    setQuery={setPlaceQuery}
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                    {t("Vibe")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {vibeChips.map((v) => {
                      const on = vibes.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setVibes((arr) => (on ? arr.filter((x) => x !== v) : [...arr, v]))
                          }
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                            on
                              ? "bg-hp-ink text-hp-paper"
                              : "border border-hp-ink/10 text-hp-ink/70"
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {error && <p className="text-[12px] font-semibold text-hp-sunset">{error}</p>}
                <button
                  type="submit"
                  data-testid="composer-post-submit"
                  disabled={!text.trim() || saving}
                  className="w-full rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper shadow-[0_10px_24px_-12px_rgba(224,106,50,0.7)] transition active:scale-[0.99] disabled:opacity-45 disabled:shadow-none"
                >
                  {saving ? t("Saving…") : t("Post")}
                </button>
              </form>
            ) : mode === "place" ? (
              <form
                data-testid="composer-place-form"
                onSubmit={handlePlaceSubmit}
                className="hp-stagger space-y-4"
              >
                <section>
                  <SectionHeader icon={Info} label={t("Basics")} tone="deep" />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label
                        htmlFor="create-place-name"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Place name")}
                      </label>
                      <input
                        id="create-place-name"
                        name="create-place-name"
                        data-testid="composer-place-name"
                        value={placeName}
                        onChange={(e) => setPlaceName(e.target.value)}
                        autoComplete="off"
                        className={fieldClass()}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="create-place-area"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Area")}
                      </label>
                      <input
                        id="create-place-area"
                        name="create-place-area"
                        data-testid="composer-place-area"
                        value={placeArea}
                        onChange={(e) => setPlaceArea(e.target.value)}
                        autoComplete="off"
                        className={fieldClass()}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="create-place-type"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Type")}
                      </label>
                      <select
                        id="create-place-type"
                        name="create-place-type"
                        data-testid="composer-place-type"
                        value={placeType}
                        onChange={(e) => setPlaceType(e.target.value as Place["type"])}
                        className={fieldClass()}
                      >
                        {placeTypeOptions.map((type) => (
                          <option key={type} value={type}>
                            {t(PLACE_TYPE_LABEL_KEYS[type])}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                <section>
                  <SectionHeader icon={MapPin} label={t("Place on the map")} tone="sea" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="create-place-lat"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Lat")}
                      </label>
                      <input
                        id="create-place-lat"
                        name="create-place-lat"
                        data-testid="composer-place-lat"
                        type="number"
                        inputMode="decimal"
                        step="0.000001"
                        value={placeLat}
                        onChange={(e) => setPlaceLat(e.target.value)}
                        className={fieldClass()}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="create-place-lng"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Lng")}
                      </label>
                      <input
                        id="create-place-lng"
                        name="create-place-lng"
                        data-testid="composer-place-lng"
                        type="number"
                        inputMode="decimal"
                        step="0.000001"
                        value={placeLng}
                        onChange={(e) => setPlaceLng(e.target.value)}
                        className={fieldClass()}
                      />
                    </div>
                    <div className="col-span-2">
                      <label
                        htmlFor="create-place-image"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Photo URL")}
                      </label>
                      <input
                        id="create-place-image"
                        name="create-place-image"
                        data-testid="composer-place-image"
                        type="url"
                        value={placeImageUrl}
                        onChange={(e) => setPlaceImageUrl(e.target.value)}
                        className={fieldClass()}
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <SectionHeader icon={ListChecks} label={t("Details")} tone="olive" />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label htmlFor="create-place-short" className="sr-only">
                        {t("Description")}
                      </label>
                      <textarea
                        id="create-place-short"
                        name="create-place-short"
                        data-testid="composer-place-short"
                        value={placeShort}
                        onChange={(e) => setPlaceShort(e.target.value)}
                        placeholder={t("What should locals know?…")}
                        className={`${fieldClass()} resize-none`}
                        rows={3}
                      />
                    </div>
                    <div className="col-span-2">
                      <label
                        htmlFor="create-place-tags"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Tags")}
                      </label>
                      <input
                        id="create-place-tags"
                        name="create-place-tags"
                        data-testid="composer-place-tags"
                        value={placeTags}
                        onChange={(e) => setPlaceTags(e.target.value)}
                        placeholder={t("beach, quiet, sunset")}
                        className={fieldClass()}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="create-place-crowd"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Crowd")}
                      </label>
                      <select
                        id="create-place-crowd"
                        name="create-place-crowd"
                        data-testid="composer-place-crowd"
                        value={placeCrowd}
                        onChange={(e) => setPlaceCrowd(e.target.value)}
                        className={fieldClass()}
                      >
                        <option value="low">{t("low")}</option>
                        <option value="medium">{t("medium")}</option>
                        <option value="high">{t("high")}</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="create-place-budget"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Budget")}
                      </label>
                      <select
                        id="create-place-budget"
                        name="create-place-budget"
                        data-testid="composer-place-budget"
                        value={placeBudget}
                        onChange={(e) => setPlaceBudget(e.target.value)}
                        className={fieldClass()}
                      >
                        <option value="free">{t("Free")}</option>
                        <option value="€">€</option>
                        <option value="€€">€€</option>
                        <option value="€€€">€€€</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label
                        htmlFor="create-place-best-time"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Best time")}
                      </label>
                      <input
                        id="create-place-best-time"
                        name="create-place-best-time"
                        data-testid="composer-place-best-time"
                        value={placeBestTime}
                        onChange={(e) => setPlaceBestTime(e.target.value)}
                        className={fieldClass()}
                      />
                    </div>
                  </div>
                </section>

                {error && <p className="text-[12px] font-semibold text-hp-sunset">{error}</p>}
                <button
                  type="submit"
                  data-testid="composer-place-submit"
                  disabled={saving}
                  className="w-full rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper shadow-[0_10px_24px_-12px_rgba(224,106,50,0.7)] transition active:scale-[0.99] disabled:opacity-45 disabled:shadow-none"
                >
                  {saving ? t("Saving…") : t("Save place")}
                </button>
              </form>
            ) : mode === "story" ? (
              <form
                data-testid="composer-story-form"
                onSubmit={handleStorySubmit}
                className="hp-stagger space-y-4"
              >
                <section>
                  <SectionHeader icon={Camera} label={t("Photo & caption")} tone="sunset" />
                  <div className="hp-card-lift relative h-40 overflow-hidden rounded-2xl border border-hp-ink/10 bg-white/50">
                    <ImageBox
                      src={selectedPlace.imageUrl}
                      alt={selectedPlace.name}
                      className="h-full w-full"
                      rounded="rounded-2xl"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent" />
                    <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-bold text-hp-paper backdrop-blur">
                      <ImagePlus size={12} />
                      {t("Story photo · using {place} image", { place: selectedPlace.name })}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-hp-muted">
                    {t(
                      "Shows full-screen, 9:16. Swap in your own photo later — this previews with the place image.",
                    )}
                  </p>

                  <label htmlFor="create-story-caption" className="sr-only">
                    {t("Story caption")}
                  </label>
                  <textarea
                    id="create-story-caption"
                    name="create-story-caption"
                    data-testid="composer-story-caption"
                    value={storyCaption}
                    onChange={(e) => setStoryCaption(e.target.value)}
                    autoComplete="off"
                    placeholder={t("What's happening here right now?…")}
                    className={`${fieldClass()} mt-3 resize-none`}
                    rows={3}
                  />
                </section>

                <section>
                  <SectionHeader icon={Info} label={t("Type")} tone="deep" />
                  <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-hp-ink/10 bg-white/50 p-1.5">
                    {(["photo", "report"] as const).map((option) => {
                      const active = storyKind === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          data-testid={`composer-story-kind-${option}`}
                          onClick={() => setStoryKind(option)}
                          aria-pressed={active}
                          className={`rounded-xl px-2 py-2 text-[12px] font-bold transition ${
                            active ? "bg-hp-ink text-hp-paper" : "text-hp-ink/70"
                          }`}
                        >
                          {option === "report" ? t("Live report") : t("Photo")}
                        </button>
                      );
                    })}
                  </div>

                  {storyKind === "report" && (
                    <div className="mt-2 rounded-2xl border border-hp-ink/10 bg-white/50 p-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                            {t("Crowd")}
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {(["low", "medium", "high"] as const).map((c) => (
                              <button
                                key={c}
                                type="button"
                                aria-pressed={storyCrowd === c}
                                onClick={() => setStoryCrowd(c)}
                                className={`rounded-lg px-1 py-1.5 text-[10px] font-bold capitalize ${
                                  storyCrowd === c
                                    ? "bg-hp-ink text-hp-paper"
                                    : "bg-hp-paper text-hp-ink/65"
                                }`}
                              >
                                {t(c)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                            {t("Parking")}
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {(["easy", "tight", "full"] as const).map((p) => (
                              <button
                                key={p}
                                type="button"
                                aria-pressed={storyParking === p}
                                onClick={() => setStoryParking(p)}
                                className={`rounded-lg px-1 py-1.5 text-[10px] font-bold capitalize ${
                                  storyParking === p
                                    ? "bg-hp-ink text-hp-paper"
                                    : "bg-hp-paper text-hp-ink/65"
                                }`}
                              >
                                {t(p)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                          {t("Condition")}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {STORY_CONDITION_OPTIONS.map((cond) => {
                            const on = storyCondition.includes(cond);
                            return (
                              <button
                                key={cond}
                                type="button"
                                aria-pressed={on}
                                onClick={() =>
                                  setStoryCondition((arr) =>
                                    on ? arr.filter((x) => x !== cond) : [...arr, cond],
                                  )
                                }
                                className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${
                                  on
                                    ? "bg-hp-ink text-hp-paper"
                                    : "border border-hp-ink/10 text-hp-ink/70"
                                }`}
                              >
                                {t(cond[0].toUpperCase() + cond.slice(1))}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                <section>
                  <SectionHeader icon={Clock} label={t("Visibility & place")} tone="olive" />
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                        {t("Visible for")}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-hp-ink/10 bg-white/50 p-1.5">
                        {(
                          [
                            { h: 6, label: "6h" },
                            { h: 24, label: "24h" },
                            { h: undefined, label: t("Keep tip") },
                          ] as const
                        ).map((opt) => {
                          const active = storyVisibility === opt.h;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setStoryVisibility(opt.h)}
                              className={`rounded-xl px-2 py-2 text-[11px] font-bold transition ${
                                active ? "bg-hp-ink text-hp-paper" : "text-hp-ink/70"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                        {t("Location")}
                      </div>
                      <SearchablePlacePicker
                        places={places}
                        value={place}
                        onChange={setPlace}
                        query={placeQuery}
                        setQuery={setPlaceQuery}
                      />
                    </div>
                  </div>
                </section>

                {error && <p className="text-[12px] font-semibold text-hp-sunset">{error}</p>}
                <button
                  type="submit"
                  data-testid="composer-story-submit"
                  disabled={!storyCaption.trim()}
                  className="w-full rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper shadow-[0_10px_24px_-12px_rgba(224,106,50,0.7)] transition active:scale-[0.99] disabled:opacity-45 disabled:shadow-none"
                >
                  {t("Post story")}
                </button>
              </form>
            ) : (
              <form
                data-testid="composer-event-form"
                onSubmit={handleEventSubmit}
                className="hp-stagger space-y-4"
              >
                <section>
                  <SectionHeader icon={Store} label={t("What & where")} tone="sunset" />
                  <div className="hp-card-lift relative h-36 overflow-hidden rounded-2xl border border-hp-ink/10 bg-white/50">
                    <ImageBox
                      src={selectedPlace.imageUrl}
                      alt={selectedPlace.name}
                      className="h-full w-full"
                      rounded="rounded-2xl"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 text-hp-paper">
                      <div className="text-[10px] font-bold uppercase">{t("Hosting at")}</div>
                      <div className="text-[15px] font-black leading-tight">
                        {selectedPlace.name}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label
                        htmlFor="create-event-title"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Gathering title")}
                      </label>
                      <input
                        id="create-event-title"
                        name="create-event-title"
                        value={eventTitle}
                        onChange={(e) => setEventTitle(e.target.value)}
                        autoComplete="off"
                        placeholder={t("Sunset swim, coffee tips, live music...")}
                        className={fieldClass()}
                      />
                    </div>
                    <div className="col-span-2">
                      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                        {t("Location")}
                      </div>
                      <SearchablePlacePicker
                        places={places}
                        value={place}
                        onChange={setPlace}
                        query={placeQuery}
                        setQuery={setPlaceQuery}
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <SectionHeader icon={Clock} label={t("When & kind")} tone="deep" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="create-event-when"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("When")}
                      </label>
                      <input
                        id="create-event-when"
                        name="create-event-when"
                        type="datetime-local"
                        value={eventWhen}
                        onChange={(e) => setEventWhen(e.target.value)}
                        className={`${fieldClass()} text-[12px]`}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="create-event-category"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Type")}
                      </label>
                      <select
                        id="create-event-category"
                        name="create-event-category"
                        value={eventCategory}
                        onChange={(e) => setEventCategory(e.target.value as MeetCategory)}
                        className={`${fieldClass()} text-[12px]`}
                      >
                        {MEET_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {t(MEET_CATEGORY_META[category].label)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label
                        htmlFor="create-event-vibe"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Vibe")}
                      </label>
                      <input
                        id="create-event-vibe"
                        name="create-event-vibe"
                        value={eventVibe}
                        onChange={(e) => setEventVibe(e.target.value)}
                        className={fieldClass()}
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <SectionHeader icon={ListChecks} label={t("Details")} tone="olive" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="create-event-price"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Price")}
                      </label>
                      <input
                        id="create-event-price"
                        name="create-event-price"
                        value={eventPrice}
                        onChange={(e) => setEventPrice(e.target.value)}
                        className={fieldClass()}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="create-event-capacity"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Capacity")}
                      </label>
                      <input
                        id="create-event-capacity"
                        name="create-event-capacity"
                        type="number"
                        inputMode="numeric"
                        min={2}
                        value={eventCapacity}
                        onChange={(e) => setEventCapacity(e.target.value)}
                        placeholder={t("Optional")}
                        className={fieldClass()}
                      />
                    </div>
                    <div className="col-span-2">
                      <label
                        htmlFor="create-event-tags"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Tags")}
                      </label>
                      <input
                        id="create-event-tags"
                        name="create-event-tags"
                        value={eventTags}
                        onChange={(e) => setEventTags(e.target.value)}
                        placeholder={t("sunset, local, free")}
                        className={fieldClass()}
                      />
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="create-event-description" className="sr-only">
                        {t("Gathering description")}
                      </label>
                      <textarea
                        id="create-event-description"
                        name="create-event-description"
                        value={eventDescription}
                        onChange={(e) => setEventDescription(e.target.value)}
                        placeholder={t("What should people know before they join?")}
                        className={`${fieldClass()} resize-none`}
                        rows={3}
                      />
                    </div>
                  </div>
                </section>

                {error && <p className="text-[12px] font-semibold text-hp-sunset">{error}</p>}
                <button
                  type="submit"
                  data-testid="composer-event-submit"
                  disabled={!eventTitle.trim() || !eventDescription.trim() || saving}
                  className="w-full rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper shadow-[0_10px_24px_-12px_rgba(224,106,50,0.7)] transition active:scale-[0.99] disabled:opacity-45 disabled:shadow-none"
                >
                  {saving ? t("Hosting…") : t("Host gathering")}
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ============== Bottom Nav ============== */
function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: NavTab) => void }) {
  const { t } = useI18n();
  return (
    <div className="relative z-50 shrink-0 border-t border-hp-ink/10 bg-hp-paper px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_28px_rgba(23,20,17,0.08)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-7 h-7 bg-gradient-to-t from-hp-paper to-transparent"
      />
      <div className="grid grid-cols-4">
        {TAB_ITEMS.map(({ id, label, Icon }) => {
          const on = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (!on) setTab(id);
              }}
              aria-current={on ? "page" : undefined}
              className="flex flex-col items-center gap-0.5 rounded-2xl py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hp-sunset focus-visible:ring-offset-2 focus-visible:ring-offset-hp-paper"
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 520, damping: 36, mass: 0.55 }}
                className={`grid h-9 w-9 place-items-center rounded-full transition-colors duration-150 ${
                  on ? "bg-hp-ink text-hp-paper" : "text-hp-ink/60"
                }`}
              >
                <Icon size={16} />
              </motion.span>
              <span className={`text-[10px] font-bold ${on ? "text-hp-ink" : "text-hp-ink/50"}`}>
                {t(label)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============== Main App ============== */
export function PulseApp() {
  const { language, setLanguage, t } = useI18n();
  const [pulseData, setPulseData] = useState<PulseData>(emptyPulseData);
  const [activitySnapshot, setActivitySnapshot] = useState<PulseActivitySnapshot>({});
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<Tab>("map");
  const [meetSubTab, setMeetSubTab] = useState<MeetSubTab>("community");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [mapBackStack, setMapBackStack] = useState<MapViewSnapshot[]>([]);
  const [openPlace, setOpenPlace] = useState<Place | null>(null);
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [openRoute, setOpenRoute] = useState<RouteItem | null>(null);
  const [activeVibe, setActiveVibe] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [visitedPlaceIds, setVisitedPlaceIds] = useState<string[]>([]);
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [postLikes, setPostLikes] = useState<Record<string, number>>({});
  const [culturalEventLikes, setCulturalEventLikes] = useState<Record<string, boolean>>({});
  const [culturalEventLikeCounts, setCulturalEventLikeCounts] = useState<Record<string, number>>(
    {},
  );
  const [culturalEventComments, setCulturalEventComments] = useState<Record<string, Comment[]>>({});
  const [openCulturalEvent, setOpenCulturalEvent] = useState<CulturalEvent | null>(null);
  const [savedPosts, setSavedPosts] = useState<Record<string, boolean>>({});
  const [savedRoutes, setSavedRoutes] = useState<Record<string, boolean>>({});
  const [rsvpMap, setRsvpMap] = useState<Record<string, RsvpStatus>>({});
  const [streak, setStreak] = useState<StreakState>({
    count: 0,
    lastContributionDay: "",
    freezeAvailable: true,
  });
  const [placeComments, setPlaceComments] = useState<Record<string, Comment[]>>({});
  const [postComments, setPostComments] = useState<Record<string, Comment[]>>({});
  const [routeComments, setRouteComments] = useState<Record<string, Comment[]>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("post");
  const [composerPin, setComposerPin] = useState<{ lat: number; lng: number } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(false);
  const [account, setAccount] = useState<PulseAccountState>({ status: "loading" });
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [organizerStatus, setOrganizerStatus] = useState<OrganizerStatus | null>(null);
  const [organizerComposerOpen, setOrganizerComposerOpen] = useState(false);
  const [myCulturalEvents, setMyCulturalEvents] = useState<CulturalEvent[]>([]);
  const [myEventsOpen, setMyEventsOpen] = useState(false);
  const [editingCulturalEvent, setEditingCulturalEvent] = useState<CulturalEvent | null>(null);
  const [businessStatus, setBusinessStatus] = useState<BusinessStatus | null>(null);
  const [myPlaceClaims, setMyPlaceClaims] = useState<PlaceClaim[]>([]);
  const [businessPlacesOpen, setBusinessPlacesOpen] = useState(false);
  const [openPlaceBusinessProfile, setOpenPlaceBusinessProfile] =
    useState<PlaceBusinessProfile | null>(null);
  const [myDealStats, setMyDealStats] = useState<DealRedemptionStats[]>([]);
  const [dealCodeModal, setDealCodeModal] = useState<DealCode | null>(null);
  const [issuingDealCode, setIssuingDealCode] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [activeRouteStopIndex, setActiveRouteStopIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const initialShareHandled = useRef(false);
  const lastActivityRefreshAtRef = useRef(0);
  const activityRefreshInFlightRef = useRef(false);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [storyViewer, setStoryViewer] = useState<{ placeId: string; storyId?: string } | null>(
    null,
  );

  const places = pulseData.places;
  const posts = pulseData.posts;
  const events = pulseData.events;
  const deals = pulseData.deals;
  const culturalEvents = pulseData.culturalEvents;
  const routes = pulseData.routes;
  const stories = pulseData.stories;
  const vibeChips = pulseData.vibeChips;

  const placeById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);
  const authorById = useMemo(
    () => new Map(pulseData.authors.map((author) => [author.id, author])),
    [pulseData.authors],
  );
  const profilesById = useMemo(() => {
    const map = new Map(pulseData.profiles.map((profile) => [profile.id, profile]));
    const profile =
      account.status === "ready" || account.status === "needsProfile" ? account.profile : null;
    if (profile) map.set(profile.id, profileSummaryFromAccount(profile));
    return map;
  }, [account, pulseData.profiles]);
  const routeById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);

  const placeStoryGroups = useMemo(
    () => buildPlaceStoryGroups(places, seen, stories),
    [places, seen, stories],
  );
  const storyPlaceIds = useMemo(() => storyPlaceIdSet(placeStoryGroups), [placeStoryGroups]);

  useEffect(() => {
    if (!storyViewer) return;
    const activeGroup = placeStoryGroups.find((group) => group.placeId === storyViewer.placeId);
    if (!activeGroup) {
      setStoryViewer(null);
      return;
    }
    if (
      storyViewer.storyId &&
      !activeGroup.stories.some((story) => story.id === storyViewer.storyId)
    ) {
      setStoryViewer({ placeId: storyViewer.placeId });
    }
  }, [placeStoryGroups, storyViewer]);

  const findPlace = (id: string) => placeById.get(id);
  const findAuthor = (id: string) => authorById.get(id) ?? pulseData.authors[0] ?? fallbackAuthor;
  const findPostAuthor = (post: Post) =>
    displayAuthorForPost(post, findAuthor(post.authorId), profilesById);
  const accountStorageUserId =
    account.status === "ready" ||
    account.status === "needsProfile" ||
    account.status === "anonymous"
      ? account.userId
      : null;
  const accountProfileId = account.status === "ready" ? account.profile.id : null;

  // sheet snap
  const mapBodyRef = useRef<HTMLDivElement>(null);
  const [mapAreaH, setMapAreaH] = useState(560);
  useEffect(() => {
    if (tab !== "map") return;
    const el = mapBodyRef.current;
    if (!el) return;
    const updateMapAreaHeight = () => {
      const nextHeight = el.getBoundingClientRect().height;
      if (nextHeight > 120) setMapAreaH(nextHeight);
    };
    const ro = new ResizeObserver(updateMapAreaHeight);
    ro.observe(el);
    updateMapAreaHeight();
    const frame = window.requestAnimationFrame(updateMapAreaHeight);
    return () => {
      window.cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [tab]);
  const safeMapAreaH = mapAreaH > 120 ? mapAreaH : 560;
  const full = Math.round(safeMapAreaH * 0.85);
  const idlePeek = 92;
  const selectedPeek = 44;
  const areaPreview = Math.min(full, Math.min(268, Math.max(244, Math.round(safeMapAreaH * 0.33))));
  const placePreview = Math.min(
    full,
    Math.min(228, Math.max(210, Math.round(safeMapAreaH * 0.28))),
  );
  const hasMapFocus = Boolean(selectedAreaId);
  const peek = hasMapFocus ? selectedPeek : idlePeek;
  const half = hasMapFocus ? (selectedPlace ? placePreview : areaPreview) : idlePeek;
  const [sheetH, setSheetH] = useState(peek);
  useEffect(() => {
    if (sheetH < peek) setSheetH(peek);
  }, [peek, sheetH]);
  useEffect(() => {
    if (!hasMapFocus) {
      setSheetH(idlePeek);
    }
  }, [hasMapFocus, idlePeek]);
  // Whenever an area (no specific place) becomes the focus, open the sheet to
  // its preview height. Edge-triggered and only bumps up, so it never fights a
  // drag — it just guarantees the area card is visible no matter which entry
  // point set the selection (map bubble, on-map chip, or the Explore panel).
  const areaFocusRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = areaFocusRef.current;
    areaFocusRef.current = selectedAreaId;
    if (
      selectedAreaId &&
      selectedAreaId !== previous &&
      !selectedPlace &&
      sheetH < areaPreview
    ) {
      setSheetH(areaPreview);
    }
  }, [selectedAreaId, selectedPlace, areaPreview, sheetH]);

  const sameMapSnapshot = (a: MapViewSnapshot, b: MapViewSnapshot) =>
    a.areaId === b.areaId && a.placeId === b.placeId;

  const currentMapSnapshot = (): MapViewSnapshot => ({
    areaId: selectedAreaId,
    placeId: selectedPlace?.id ?? null,
  });

  const rememberMapSnapshot = (next: MapViewSnapshot) => {
    const current = currentMapSnapshot();
    if (sameMapSnapshot(current, next)) return;

    setMapBackStack((stack) => {
      const last = stack[stack.length - 1];
      if (last && sameMapSnapshot(last, current)) return stack;
      return [...stack, current].slice(-12);
    });
  };

  const applyMapSnapshot = (snapshot: MapViewSnapshot) => {
    const place = snapshot.placeId ? (findPlace(snapshot.placeId) ?? null) : null;
    const areaId = place ? getMapAreaIdForPlace(place) : snapshot.areaId;
    setSelectedAreaId(areaId);
    setSelectedPlace(place);
    setSheetH(place ? placePreview : areaId ? areaPreview : idlePeek);
  };

  const clearMapView = () => {
    setMapBackStack([]);
    setSelectedAreaId(null);
    setSelectedPlace(null);
    setSheetH(idlePeek);
  };

  const goBackMapView = () => {
    const previous = mapBackStack[mapBackStack.length - 1];
    if (!previous) return;

    setMapBackStack((stack) => stack.slice(0, -1));
    applyMapSnapshot(previous);
  };

  const selectAreaPreview = (cluster: MapAreaCluster) => {
    const next = { areaId: cluster.id, placeId: null };
    rememberMapSnapshot(next);
    setSelectedAreaId(cluster.id);
    setSelectedPlace(null);
    setSheetH(areaPreview);
  };

  const selectPlacePreview = (place: Place, remember = true) => {
    const areaId = getMapAreaIdForPlace(place);
    if (remember) rememberMapSnapshot({ areaId, placeId: place.id });
    setSelectedAreaId(areaId);
    setSelectedPlace(place);
    setSheetH(placePreview);
  };

  const selectMapPlacePreview = (place: Place, cluster: MapAreaCluster) => {
    rememberMapSnapshot({ areaId: cluster.id, placeId: place.id });
    setSelectedAreaId(cluster.id);
    setSelectedPlace(place);
    setSheetH(placePreview);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const markSeen = useCallback((ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
    if (uniqueIds.length === 0) return;

    setSeen((current) => {
      let changed = false;
      const next = new Set(current);
      for (const id of uniqueIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : current;
    });

    void markPulseStoriesSeen(uniqueIds).catch((error) => {
      console.warn("Could not persist seen stories.", error);
    });
  }, []);

  const markContribution = () => {
    void recordPulseActivityDay()
      .then(setStreak)
      .catch((error) => {
        console.warn("Could not persist contribution streak.", error);
      });
  };

  // Only verified organizers have any cultural events to own; everyone else gets
  // an empty list without a round-trip.
  const loadMyCulturalEvents = async (status: OrganizerStatus | null) => {
    if (status?.verificationStatus !== "verified") {
      setMyCulturalEvents([]);
      return;
    }
    setMyCulturalEvents(await getMyCulturalEvents().catch(() => [] as CulturalEvent[]));
  };

  // Business status + claims, mirroring the organizer pattern. Claims are only
  // readable (RLS) once the business is verified, so skip the round-trip
  // otherwise.
  const loadMyBusinessState = async () => {
    const status = await getMyBusinessStatus().catch(() => null);
    setBusinessStatus(status);
    if (status?.verificationStatus === "verified") {
      const [claims, stats] = await Promise.all([
        getMyPlaceClaims().catch(() => [] as PlaceClaim[]),
        getMyDealStats().catch(() => [] as DealRedemptionStats[]),
      ]);
      setMyPlaceClaims(claims);
      setMyDealStats(stats);
    } else {
      setMyPlaceClaims([]);
      setMyDealStats([]);
    }
    return status;
  };

  const refreshAccount = useCallback(async () => {
    try {
      const nextAccount = await getCurrentPulseAccount();
      setAccount(nextAccount);
      if (
        (nextAccount.status === "ready" || nextAccount.status === "needsProfile") &&
        nextAccount.preferences?.language
      ) {
        setLanguage(nextAccount.preferences.language);
      }
      if (nextAccount.status === "ready") {
        const nextAdminRole = await getAdminRole().catch(() => null);
        setAdminRole(nextAdminRole);
      } else {
        setAdminRole(null);
      }
      if (nextAccount.status === "ready" || nextAccount.status === "needsProfile") {
        const nextOrganizerStatus = await getMyOrganizerStatus().catch(() => null);
        setOrganizerStatus(nextOrganizerStatus);
        await loadMyCulturalEvents(nextOrganizerStatus);
        await loadMyBusinessState();
      } else {
        setOrganizerStatus(null);
        setMyCulturalEvents([]);
        setBusinessStatus(null);
        setMyPlaceClaims([]);
        setMyDealStats([]);
      }
      const profile =
        nextAccount.status === "ready" || nextAccount.status === "needsProfile"
          ? nextAccount.profile
          : null;
      if (profile) {
        const summary = profileSummaryFromAccount(profile);
        setPulseData((data) => ({
          ...data,
          profiles: [summary, ...data.profiles.filter((item) => item.id !== summary.id)],
        }));
      }
      return nextAccount;
    } catch (error) {
      console.warn("Could not load account state.", error);
      const fallback: PulseAccountState = { status: "signedOut" };
      setAccount(fallback);
      setAdminRole(null);
      setOrganizerStatus(null);
      setMyCulturalEvents([]);
      setBusinessStatus(null);
      setMyPlaceClaims([]);
      setMyDealStats([]);
      return fallback;
    }
  }, [setLanguage]);

  const toggleAppLanguage = () => {
    const next = language === "GR" ? "EN" : "GR";
    setLanguage(next);
    if (account.status === "ready" || account.status === "needsProfile") {
      void savePulseLanguage(account.userId, next).catch((error) => {
        console.warn("Could not save language preference.", error);
      });
    }
  };

  const requireProfile = (action = "post") => {
    if (account.status === "ready") return true;
    if (account.status === "needsProfile") {
      setProfileOpen(true);
      showToast(t("Complete your profile first"));
      return false;
    }
    setAuthOpen(true);
    showToast(language === "GR" ? "Συνδέσου για να συνεχίσεις" : `Sign in to ${action}`);
    return false;
  };

  const shareItem = (target: ShareTarget) => {
    void sharePulseTarget(target)
      .then((result) => {
        if (result === "cancelled") return;
        showToast(t(result === "shared" ? "Share opened" : "Link copied"));
      })
      .catch((error) => {
        console.warn("Could not share item.", error);
        showToast(t("Could not share link"));
      });
  };

  const sharePlace = (place: Place) =>
    shareItem({
      type: "place",
      id: place.id,
      label: place.name,
      text: `${place.name} in ${place.area}. ${truncateShareText(place.short)}`,
    });

  const sharePost = (post: Post) => {
    const place = findPlace(post.placeId);
    shareItem({
      type: "post",
      id: post.id,
      label: `Post at ${place?.name ?? "Ilia"}`,
      text: truncateShareText(post.text),
    });
  };

  const shareRoute = (route: RouteItem) =>
    shareItem({
      type: "route",
      id: route.id,
      label: route.title,
      text: truncateShareText(route.lede),
    });
  const shareStory = (story: PlaceStory, group: PlaceStoryGroup) =>
    shareItem({
      type: "story",
      id: story.id,
      placeId: group.placeId,
      label: `${group.placeName} story`,
      text: truncateShareText(story.caption),
    });

  const refreshPulseData = useCallback(async () => {
    try {
      setDataStatus("loading");
      const data = await loadPulseData();
      setPulseData(data);
      setActivitySnapshot(buildPulseActivitySnapshot(data));
      lastActivityRefreshAtRef.current = Date.now();
      setPlaceComments(data.placeComments);
      setRouteComments(data.routeComments);
      setCulturalEventComments(data.culturalEventComments);
      setSelectedPlace((current) =>
        current ? (data.places.find((p) => p.id === current.id) ?? null) : null,
      );
      setOpenPlace((current) =>
        current ? (data.places.find((p) => p.id === current.id) ?? null) : null,
      );
      setOpenPost((current) =>
        current ? (data.posts.find((p) => p.id === current.id) ?? null) : null,
      );
      setOpenRoute((current) =>
        current ? (data.routes.find((r) => r.id === current.id) ?? null) : null,
      );
      setDataStatus("ready");
    } catch (error) {
      console.warn("Could not load Supabase pulse data.", error);
      setPulseData(emptyPulseData);
      setDataStatus("error");
    }
  }, []);

  useEffect(() => {
    void refreshPulseData();
  }, [refreshPulseData]);

  const refreshActivitySnapshot = useCallback(async () => {
    if (typeof document === "undefined" || document.hidden || activityRefreshInFlightRef.current) {
      return;
    }

    activityRefreshInFlightRef.current = true;
    try {
      const data = await loadPulseData();
      setActivitySnapshot(buildPulseActivitySnapshot(data));
      lastActivityRefreshAtRef.current = Date.now();
    } catch (error) {
      console.warn("Could not refresh the map activity snapshot.", error);
    } finally {
      activityRefreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const refreshIfStale = () => {
      if (document.hidden || Date.now() - lastActivityRefreshAtRef.current < 60_000) return;
      void refreshActivitySnapshot();
    };
    const interval = window.setInterval(refreshIfStale, 60_000);
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [refreshActivitySnapshot]);

  useEffect(() => {
    if (hasPasswordRecoveryUrl()) setPasswordRecoveryOpen(true);
  }, []);

  useEffect(() => {
    void refreshAccount();
    const unsubscribe = subscribeToPulseAuth((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setAuthOpen(false);
        setProfileOpen(false);
        setPasswordRecoveryOpen(true);
      }
      void refreshAccount();
    });

    return () => {
      unsubscribe();
    };
  }, [refreshAccount]);

  useEffect(() => {
    let ignore = false;

    async function loadUserState() {
      try {
        const state = await loadPulseUserState();
        if (ignore) return;
        setSavedIds(state.savedPlaceIds);
        setSavedPosts(state.savedPosts);
        setSavedRoutes(state.savedRoutes);
        setLikes(state.likedPosts);
        setCulturalEventLikes(state.likedCulturalEvents);
        setRsvpMap(state.rsvpMap);
        setSeen(new Set(state.seenStoryIds));
        setVisitedPlaceIds(state.visitedPlaceIds);
        setStreak(state.streak);
      } catch (error) {
        console.warn("Could not load Supabase user state.", error);
      }
    }

    void loadUserState();
    return () => {
      ignore = true;
    };
  }, [accountStorageUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seenOnboarding = window.localStorage.getItem("hp.onboarding.seen.v1");
    if (!seenOnboarding) setOnboardingOpen(true);
  }, []);

  const allPosts = useMemo(() => [...userPosts, ...posts], [posts, userPosts]);
  const savedPostIds = useMemo(
    () =>
      Object.entries(savedPosts)
        .filter(([, saved]) => saved)
        .map(([id]) => id),
    [savedPosts],
  );
  const savedRouteIds = useMemo(
    () =>
      Object.entries(savedRoutes)
        .filter(([, saved]) => saved)
        .map(([id]) => id),
    [savedRoutes],
  );
  const meetEvents = useMemo(
    () => [...pulseData.meetEvents].sort((a, b) => +new Date(a.happensAt) - +new Date(b.happensAt)),
    [pulseData.meetEvents],
  );
  const activityTicks = useMemo(
    () => buildActivityTicks(allPosts, placeById, meetEvents),
    [allPosts, meetEvents, placeById],
  );
  const activeRoute = useMemo(
    () => (activeRouteId ? (routeById.get(activeRouteId) ?? null) : null),
    [activeRouteId, routeById],
  );
  const activeRoutePath = useMemo(() => {
    if (!activeRoute) return null;
    const path = activeRoute.stops
      .map((stop) => {
        const place = placeById.get(stop.placeId);
        if (!place) return null;
        return { lat: place.lat, lng: place.lng, label: place.name };
      })
      .filter((stop): stop is { lat: number; lng: number; label: string } => Boolean(stop));
    return path.length >= 2 ? path : null;
  }, [activeRoute, placeById]);
  const profileStats = useMemo(() => {
    const ownedPosts = accountProfileId
      ? allPosts.filter((post) => post.profileId === accountProfileId)
      : [];

    return {
      posts: ownedPosts.length,
      tips: ownedPosts.filter((post) => post.kind === "tip").length,
      rsvps: account.status === "ready" ? Object.keys(rsvpMap).length : 0,
      routesSaved: account.status === "ready" ? savedRouteIds.length : 0,
    };
  }, [account.status, accountProfileId, allPosts, rsvpMap, savedRouteIds.length]);

  // Discovery progress now comes from the real user_place_visits check-ins
  // (phase 2), not the v1 posts-as-proxy.
  const discoveryExploredIds = useMemo(
    () => DISCOVERY_PLACE_IDS.filter((id) => visitedPlaceIds.includes(id)),
    [visitedPlaceIds],
  );

  useEffect(() => {
    if (initialShareHandled.current || dataStatus !== "ready" || typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    const placeId = params.get("place");
    const postId = params.get("post");
    const routeId = params.get("route");
    const storyId = params.get("story");
    const areaParam = params.get("area");

    if (!placeId && !postId && !routeId && !tabParam && !storyId && !areaParam) return;
    initialShareHandled.current = true;
    setCreateOpen(false);

    if (tabParam === "events") {
      // Legacy deep link from before Cultural Events moved under Meet.
      setTab("meet");
      setMeetSubTab("events");
    } else if (isTab(tabParam)) {
      setTab(tabParam);
    }

    if (storyId) {
      const storyPlaceId =
        placeId ??
        placeStoryGroups.find((group) => group.stories.some((story) => story.id === storyId))
          ?.placeId;
      if (storyPlaceId) {
        setTab("pulse");
        setStoryViewer({ placeId: storyPlaceId, storyId });
        return;
      }
    }

    if (areaParam) {
      setTab("map");
      setSelectedAreaId(areaParam);
      setSheetH(areaPreview);
      return;
    }

    if (postId) {
      const post = allPosts.find((item) => item.id === postId);
      if (post) {
        setTab("pulse");
        setOpenPost(post);
        setOpenPlace(null);
        setOpenRoute(null);
        const place = placeById.get(post.placeId);
        setSelectedPlace(place ?? null);
        if (place) {
          setSelectedAreaId(getMapAreaIdForPlace(place));
          setSheetH(placePreview);
        }
        return;
      }
    }

    if (routeId) {
      const route = routeById.get(routeId);
      if (route) {
        setTab("routes");
        setOpenRoute(route);
        setOpenPlace(null);
        setOpenPost(null);
        return;
      }
    }

    if (placeId) {
      const place = placeById.get(placeId);
      if (place) {
        setTab("map");
        setSelectedAreaId(getMapAreaIdForPlace(place));
        setSelectedPlace(place);
        setSheetH(placePreview);
        setOpenPlace(place);
        setOpenPost(null);
        setOpenRoute(null);
      }
    }
  }, [allPosts, areaPreview, dataStatus, placeById, placePreview, placeStoryGroups, routeById]);

  const toggleSave = (id: string) => {
    const wasSaved = savedIds.includes(id);
    const nextSaved = !wasSaved;
    setSavedIds((arr) => (wasSaved ? arr.filter((x) => x !== id) : [...arr, id]));
    showToast(t(wasSaved ? "Removed from saved" : "Saved"));
    void setSavedItem({ type: "place", id }, nextSaved).catch((error) => {
      console.warn("Could not persist place save.", error);
      setSavedIds((arr) => (wasSaved ? [...arr, id] : arr.filter((x) => x !== id)));
      showToast(t("Could not save"));
    });
  };
  const toggleVisited = (id: string) => {
    const wasVisited = visitedPlaceIds.includes(id);
    const nextVisited = !wasVisited;
    setVisitedPlaceIds((arr) => (wasVisited ? arr.filter((x) => x !== id) : [...arr, id]));
    showToast(t(wasVisited ? "Visit removed" : "Marked as visited"));
    void setVisited(id, nextVisited).catch((error) => {
      console.warn("Could not persist place visit.", error);
      setVisitedPlaceIds((arr) => (wasVisited ? [...arr, id] : arr.filter((x) => x !== id)));
      showToast(t("Could not save"));
    });
  };
  const toggleLike = (id: string) => {
    const nextLiked = !likes[id];
    setLikes((m) => ({ ...m, [id]: nextLiked }));
    setPostLikes((m) => ({ ...m, [id]: m[id] ?? allPosts.find((p) => p.id === id)?.likes ?? 0 }));
    void setPostLike(id, nextLiked).catch((error) => {
      console.warn("Could not persist post like.", error);
      setLikes((m) => ({ ...m, [id]: !nextLiked }));
      showToast(
        language === "GR" ? "Δεν ήταν δυνατή η αποθήκευση του like" : "Could not save like",
      );
    });
  };
  const addPlaceComment = (id: string, text: string) => {
    if (account.status !== "ready") {
      requireProfile("comment");
      return;
    }
    const authorName = profileDisplayName(account.profile);
    const optimisticComment: Comment = {
      author: authorName,
      text,
      userId: account.userId,
      profileId: account.profile.id,
      postingIdentity: account.profile.defaultIdentity,
      authorKind: "user",
    };
    setPlaceComments((m) => ({ ...m, [id]: [...(m[id] ?? []), optimisticComment] }));
    showToast(t("Comment posted"));
    void addPulseComment({ type: "place", id }, text, {
      profileId: account.profile.id,
      authorName,
      identity: account.profile.defaultIdentity,
    })
      .then((savedComment) => {
        setPlaceComments((m) => ({
          ...m,
          [id]: (m[id] ?? []).map((comment) =>
            comment === optimisticComment ? savedComment : comment,
          ),
        }));
      })
      .catch((error) => {
        console.warn("Could not persist place comment.", error);
        setPlaceComments((m) => ({
          ...m,
          [id]: (m[id] ?? []).filter((comment) => comment !== optimisticComment),
        }));
        showToast(t("Could not post comment"));
      });
  };
  const addPostComment = (id: string, text: string) => {
    if (account.status !== "ready") {
      requireProfile("comment");
      return;
    }
    const authorName = profileDisplayName(account.profile);
    const optimisticComment: Comment = {
      author: authorName,
      text,
      userId: account.userId,
      profileId: account.profile.id,
      postingIdentity: account.profile.defaultIdentity,
      authorKind: "user",
    };
    setPostComments((m) => ({ ...m, [id]: [...(m[id] ?? []), optimisticComment] }));
    showToast(t("Comment posted"));
    void addPulseComment({ type: "post", id }, text, {
      profileId: account.profile.id,
      authorName,
      identity: account.profile.defaultIdentity,
    })
      .then((savedComment) => {
        setPostComments((m) => ({
          ...m,
          [id]: (m[id] ?? []).map((comment) =>
            comment === optimisticComment ? savedComment : comment,
          ),
        }));
      })
      .catch((error) => {
        console.warn("Could not persist post comment.", error);
        setPostComments((m) => ({
          ...m,
          [id]: (m[id] ?? []).filter((comment) => comment !== optimisticComment),
        }));
        showToast(t("Could not post comment"));
      });
  };
  const toggleSavePost = (id: string) => {
    const wasSaved = !!savedPosts[id];
    const nextSaved = !wasSaved;
    setSavedPosts((m) => ({ ...m, [id]: nextSaved }));
    showToast(
      language === "GR"
        ? wasSaved
          ? "Η δημοσίευση αφαιρέθηκε"
          : "Η δημοσίευση αποθηκεύτηκε"
        : wasSaved
          ? "Removed post"
          : "Saved post",
    );
    void setSavedItem({ type: "post", id }, nextSaved).catch((error) => {
      console.warn("Could not persist post save.", error);
      setSavedPosts((m) => ({ ...m, [id]: wasSaved }));
      showToast(
        language === "GR" ? "Δεν ήταν δυνατή η αποθήκευση της δημοσίευσης" : "Could not save post",
      );
    });
  };
  const toggleSaveRoute = (id: string) => {
    const wasSaved = !!savedRoutes[id];
    const nextSaved = !wasSaved;
    setSavedRoutes((m) => ({ ...m, [id]: nextSaved }));
    showToast(
      language === "GR"
        ? wasSaved
          ? "Η διαδρομή αφαιρέθηκε"
          : "Η διαδρομή αποθηκεύτηκε"
        : wasSaved
          ? "Removed route"
          : "Saved route",
    );
    void setSavedItem({ type: "route", id }, nextSaved).catch((error) => {
      console.warn("Could not persist route save.", error);
      setSavedRoutes((m) => ({ ...m, [id]: wasSaved }));
      showToast(
        language === "GR" ? "Δεν ήταν δυνατή η αποθήκευση της διαδρομής" : "Could not save route",
      );
    });
  };
  const addRouteComment = (id: string, text: string) => {
    if (account.status !== "ready") {
      requireProfile("comment");
      return;
    }
    const authorName = profileDisplayName(account.profile);
    const optimisticComment: Comment = {
      author: authorName,
      text,
      userId: account.userId,
      profileId: account.profile.id,
      postingIdentity: account.profile.defaultIdentity,
      authorKind: "user",
    };
    setRouteComments((m) => ({ ...m, [id]: [...(m[id] ?? []), optimisticComment] }));
    showToast(t("Comment posted"));
    void addPulseComment({ type: "route", id }, text, {
      profileId: account.profile.id,
      authorName,
      identity: account.profile.defaultIdentity,
    })
      .then((savedComment) => {
        setRouteComments((m) => ({
          ...m,
          [id]: (m[id] ?? []).map((comment) =>
            comment === optimisticComment ? savedComment : comment,
          ),
        }));
      })
      .catch((error) => {
        console.warn("Could not persist route comment.", error);
        setRouteComments((m) => ({
          ...m,
          [id]: (m[id] ?? []).filter((comment) => comment !== optimisticComment),
        }));
        showToast(t("Could not post comment"));
      });
  };
  const addLocalPost = async ({
    text,
    placeId,
    vibes,
    identity,
  }: {
    text: string;
    placeId: string;
    vibes: string[];
    identity: PostingIdentity;
  }) => {
    if (account.status !== "ready") {
      requireProfile("post");
      throw new Error("Profile required.");
    }
    const place = findPlace(placeId);
    if (!place) throw new Error("Place not found.");
    const savedPost = await createPulsePost({
      text,
      place,
      vibes,
      identity,
      profileId: account.profile.id,
      authorName: profileDisplayName(account.profile),
    });
    setUserPosts((posts) => [savedPost, ...posts]);
    setCreateOpen(false);
    setComposerPin(null);
    setTab("pulse");
    markContribution();
    showToast(t("Post saved"));
  };
  const addLocalPlace = async (input: CreatePulsePlaceInput) => {
    if (account.status !== "ready") {
      requireProfile("add a place");
      throw new Error("Profile required.");
    }
    const place = await createPulsePlace({
      ...input,
      profileId: account.profile.id,
      identity: account.profile.defaultIdentity,
      authorAvatarUrl: profileAvatarUrl(account.profile),
    });
    setPulseData((data) => ({
      ...data,
      places: [place, ...data.places.filter((existing) => existing.id !== place.id)],
    }));
    setPlaceComments((comments) => ({ ...comments, [place.id]: comments[place.id] ?? [] }));
    setSelectedAreaId(getMapAreaIdForPlace(place));
    setSelectedPlace(place);
    setSheetH(placePreview);
    setOpenPlace(place);
    setCreateOpen(false);
    setComposerPin(null);
    setTab("map");
    markContribution();
    showToast(t("Place saved"));
  };
  const addLocalStory = async (input: CreateStoryInput) => {
    if (account.status !== "ready") {
      requireProfile("post a story");
      throw new Error("Profile required.");
    }
    const place = findPlace(input.placeId);
    if (!place) throw new Error("Place not found.");
    const avatarUrl = profileAvatarUrl(account.profile) ?? fallbackAuthor.avatarUrl;
    const story = await createPulseStory({
      place,
      caption: input.caption,
      kind: input.kind,
      profileId: account.profile.id,
      authorName: profileDisplayName(account.profile),
      authorType:
        account.profile.defaultIdentity === "BUSINESS"
          ? "BUSINESS"
          : account.profile.defaultIdentity === "TOURIST"
            ? "TOURIST"
            : account.profile.defaultIdentity === "GUIDE"
              ? "GUIDE"
              : "LOCAL",
      authorAvatarUrl: avatarUrl,
      visibilityHours: input.visibilityHours,
      crowd: input.crowd,
      parking: input.parking,
      condition: input.condition,
    });
    setPulseData((data) => ({
      ...data,
      stories: [story, ...data.stories.filter((existing) => existing.id !== story.id)],
    }));
    setCreateOpen(false);
    setComposerPin(null);
    setStoryViewer({ placeId: input.placeId, storyId: story.id });
    markContribution();
    showToast(t("Story added"));
  };

  const addMeetEvent = async (input: CreateMeetInput) => {
    if (account.status !== "ready") {
      requireProfile("host");
      throw new Error("Profile required.");
    }
    const place = findPlace(input.placeId);
    if (!place) throw new Error("Place not found.");
    const event = await createPulseMeetEvent({
      ...input,
      place,
      profileId: account.profile.id,
      hostName: profileDisplayName(account.profile),
      hostAvatarUrl: profileAvatarUrl(account.profile) ?? fallbackAuthor.avatarUrl,
      hostType:
        account.profile.defaultIdentity === "BUSINESS"
          ? "BUSINESS"
          : account.profile.defaultIdentity === "GUIDE"
            ? "GUIDE"
            : account.profile.defaultIdentity === "TOURIST"
              ? "TOURIST"
              : "LOCAL",
    });
    setPulseData((data) => ({
      ...data,
      meetEvents: [event, ...data.meetEvents.filter((item) => item.id !== event.id)],
    }));
    setRsvpMap((map) => ({ ...map, [event.id]: "going" }));
    markContribution();
    setCreateOpen(false);
    setComposerPin(null);
    setTab("meet");
    setMeetSubTab("community");
    showToast(t("Gathering hosted"));
  };

  const applyOrganizer = async () => {
    if (account.status !== "ready") {
      requireProfile("post");
      return;
    }
    const displayName = profileDisplayName(account.profile);
    const status = await applyToBecomeOrganizer(displayName, DEFAULT_ORGANIZER_BIO);
    setOrganizerStatus(status);
    showToast(t("Organizer application sent"));
  };

  const applyBusiness = async () => {
    if (account.status !== "ready") {
      requireProfile("post");
      return;
    }
    const displayName = profileDisplayName(account.profile);
    const status = await applyToBecomeBusiness(displayName);
    setBusinessStatus(status);
    showToast(t("Business request sent"));
  };

  // Claim a place from the BusinessPlacesSheet (the caller is already a verified
  // business). Errors (e.g. the place already has a live claim) surface as a
  // toast; the sheet also shows them inline.
  const handleClaimPlace = async (placeId: string) => {
    const claim = await claimPlace(placeId);
    setMyPlaceClaims((list) => [claim, ...list.filter((item) => item.id !== claim.id)]);
    showToast(t("Claim submitted for review"));
  };

  const handleSavePlaceProfile = async (
    claimId: string,
    fields: Partial<PlaceBusinessProfileFields>,
  ) => {
    const updated = await updatePlaceBusinessProfile(claimId, fields);
    setMyPlaceClaims((list) => list.map((item) => (item.id === claimId ? updated : item)));
    showToast(t("Changes saved"));
  };

  // Stage B2: set/toggle the single static deal on an approved claim. Goes
  // through set_place_deal (RPC), then patches local state so the badge (map
  // peek) and the open place detail reflect it without a bootstrap refetch.
  const handleSaveDeal = async (claimId: string, dealText: string | null, dealActive: boolean) => {
    await setPlaceDeal(claimId, dealText, dealActive);
    const claim = myPlaceClaims.find((item) => item.id === claimId);
    setMyPlaceClaims((list) =>
      list.map((item) => (item.id === claimId ? { ...item, dealText, dealActive } : item)),
    );
    if (claim) {
      const showsDeal = dealActive && !!dealText;
      setPulseData((data) => ({
        ...data,
        dealPlaceIds: showsDeal
          ? Array.from(new Set([...data.dealPlaceIds, claim.placeId]))
          : data.dealPlaceIds.filter((id) => id !== claim.placeId),
        deals: showsDeal
          ? [
              ...data.deals.filter((deal) => deal.placeId !== claim.placeId),
              {
                placeId: claim.placeId,
                dealText: dealText as string,
                businessName: businessStatus?.displayName ?? "",
              },
            ]
          : data.deals.filter((deal) => deal.placeId !== claim.placeId),
      }));
      if (openPlace?.id === claim.placeId) {
        setOpenPlaceBusinessProfile((prev) => (prev ? { ...prev, dealText, dealActive } : prev));
      }
    }
    showToast(t("Deal saved"));
  };

  // Stage B3: user taps "Get code" in the APP DEAL callout. Any session works
  // (issueDealCode calls ensurePulseUserId first). A repeat tap for the same
  // deal returns the existing live code.
  const handleGetDealCode = async () => {
    if (!openPlace || issuingDealCode) return;
    setIssuingDealCode(true);
    try {
      setDealCodeModal(await issueDealCode(openPlace.id));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("Could not get a code."));
    } finally {
      setIssuingDealCode(false);
    }
  };

  // Business side: redeem a code typed into "My places". Refreshes the counters
  // on success; the sheet surfaces the failure inline.
  const handleRedeemDealCode = async (code: string) => {
    await redeemDealCode(code);
    setMyDealStats(await getMyDealStats().catch(() => myDealStats));
    showToast(t("Code redeemed"));
  };

  // PlaceDetailModal "Is this your business?" entry. Routes the user to the
  // right next step depending on how far along they are.
  const claimFromPlaceDetail = () => {
    if (!openPlace) return;
    if (account.status !== "ready") {
      requireProfile("post");
      return;
    }
    if (businessStatus?.verificationStatus !== "verified") {
      setOpenPlace(null);
      setProfileOpen(true);
      showToast(
        businessStatus?.verificationStatus === "pending"
          ? t("Your request to register a business is pending approval.")
          : t("Register a business first"),
      );
      return;
    }
    const placeId = openPlace.id;
    void handleClaimPlace(placeId).catch((error) => {
      showToast(error instanceof Error ? error.message : t("Could not send the claim."));
    });
  };

  // Lazy-load the approved business enrichment for whichever place detail is
  // open -- only when the bootstrap flagged it as claimed, so unclaimed places
  // cost no request.
  useEffect(() => {
    const placeId = openPlace?.id;
    if (!placeId || !pulseData.claimedPlaceIds.includes(placeId)) {
      setOpenPlaceBusinessProfile(null);
      return;
    }
    let ignore = false;
    setOpenPlaceBusinessProfile(null);
    void getPlaceBusinessProfile(placeId)
      .then((profile) => {
        if (!ignore) setOpenPlaceBusinessProfile(profile);
      })
      .catch((error) => {
        console.warn("Could not load business profile.", error);
      });
    return () => {
      ignore = true;
    };
  }, [openPlace?.id, pulseData.claimedPlaceIds]);

  const addCulturalEvent = async (input: CreateCulturalEventInput) => {
    if (organizerStatus?.verificationStatus !== "verified") {
      throw new Error("Only verified organizers can submit cultural events.");
    }
    const event = await createPulseCulturalEvent({
      ...input,
      organizerId: organizerStatus.id,
      organizerName: organizerStatus.displayName,
    });
    setPulseData((data) => ({
      ...data,
      culturalEvents: [event, ...data.culturalEvents.filter((item) => item.id !== event.id)],
    }));
    setMyCulturalEvents((list) => [event, ...list.filter((item) => item.id !== event.id)]);
    markContribution();
    showToast(t("Event submitted for review"));
  };

  // Edit an own pending cultural event. RLS rejects the update unless the row
  // stays 'pending', so a published event's Edit button is never shown.
  const editCulturalEvent = async (id: string, input: CreateCulturalEventInput) => {
    const updated = await updatePulseCulturalEvent(id, input);
    setMyCulturalEvents((list) => list.map((item) => (item.id === id ? updated : item)));
    setPulseData((data) => ({
      ...data,
      culturalEvents: data.culturalEvents.map((item) => (item.id === id ? updated : item)),
    }));
    setEditingCulturalEvent(null);
    markContribution();
    showToast(t("Changes saved"));
  };

  const toggleCulturalEventLike = (id: string) => {
    if (account.status !== "ready") {
      requireProfile("like");
      return;
    }
    const nextLiked = !culturalEventLikes[id];
    setCulturalEventLikes((m) => ({ ...m, [id]: nextLiked }));
    setCulturalEventLikeCounts((m) => ({
      ...m,
      [id]: m[id] ?? culturalEvents.find((e) => e.id === id)?.likesCount ?? 0,
    }));
    void setCulturalEventLike(id, nextLiked).catch((error) => {
      console.warn("Could not persist cultural event like.", error);
      setCulturalEventLikes((m) => ({ ...m, [id]: !nextLiked }));
      showToast(t("Could not save"));
    });
  };

  const addCulturalEventComment = (id: string, text: string) => {
    if (account.status !== "ready") {
      requireProfile("comment");
      return;
    }
    const authorName = profileDisplayName(account.profile);
    const optimisticComment: Comment = {
      author: authorName,
      text,
      userId: account.userId,
      profileId: account.profile.id,
      postingIdentity: account.profile.defaultIdentity,
      authorKind: "user",
    };
    setCulturalEventComments((m) => ({ ...m, [id]: [...(m[id] ?? []), optimisticComment] }));
    showToast(t("Comment posted"));
    void addPulseComment({ type: "cultural_event", id }, text, {
      profileId: account.profile.id,
      authorName,
      identity: account.profile.defaultIdentity,
    })
      .then((savedComment) => {
        setCulturalEventComments((m) => ({
          ...m,
          [id]: (m[id] ?? []).map((comment) =>
            comment === optimisticComment ? savedComment : comment,
          ),
        }));
      })
      .catch((error) => {
        console.warn("Could not persist cultural event comment.", error);
        setCulturalEventComments((m) => ({
          ...m,
          [id]: (m[id] ?? []).filter((comment) => comment !== optimisticComment),
        }));
        showToast(t("Could not post comment"));
      });
  };

  const toggleMeetRsvp = (event: MeetEvent, next: RsvpStatus) => {
    if (account.status !== "ready") {
      requireProfile("RSVP");
      return;
    }

    const previous = rsvpMap[event.id] ?? null;
    const clearing = previous === next;
    setRsvpMap((map) => {
      const copy = { ...map };
      if (clearing) delete copy[event.id];
      else copy[event.id] = next;
      return copy;
    });
    if (!clearing) markContribution();
    showToast(t(clearing ? "RSVP removed" : next === "going" ? "You are in" : "Marked maybe"));

    setPulseData((data) => ({
      ...data,
      meetEvents: data.meetEvents.map((item) => {
        if (item.id !== event.id) return item;
        const goingDelta =
          (previous === "going" ? -1 : 0) + (!clearing && next === "going" ? 1 : 0);
        const maybeDelta =
          (previous === "maybe" ? -1 : 0) + (!clearing && next === "maybe" ? 1 : 0);
        return {
          ...item,
          going: Math.max(0, item.going + goingDelta),
          maybe: Math.max(0, item.maybe + maybeDelta),
        };
      }),
    }));

    const persist = setPulseMeetRsvp(event.id, clearing ? null : next, {
      profileId: account.profile.id,
    });
    void persist.catch((error) => {
      console.warn("Could not persist RSVP.", error);
      setRsvpMap((map) => {
        const copy = { ...map };
        if (previous) copy[event.id] = previous;
        else delete copy[event.id];
        return copy;
      });
      setPulseData((data) => ({
        ...data,
        meetEvents: data.meetEvents.map((item) => (item.id === event.id ? event : item)),
      }));
      showToast(t("Could not save RSVP"));
    });
  };

  const markTrendingGoing = (place: Place) => {
    const event = meetEvents.find((item) => item.placeId === place.id);
    if (!event) {
      showToast(t("No gathering there yet"));
      setTab("meet");
      setMeetSubTab("community");
      return;
    }
    toggleMeetRsvp(event, "going");
    setTab("meet");
    setMeetSubTab("community");
  };

  const openComposer = (mode: ComposerMode, pin: { lat: number; lng: number } | null = null) => {
    setComposerMode(mode);
    setComposerPin(pin);
    setCreateOpen(true);
  };

  const startRouteOnMap = (route: RouteItem) => {
    setActiveRouteId(route.id);
    setActiveRouteStopIndex(0);
    setOpenRoute(null);
    setOpenPlace(null);
    setOpenPost(null);
    setTab("map");
    const firstPlace = findPlace(route.stops[0]?.placeId ?? "");
    if (firstPlace) selectPlacePreview(firstPlace, false);
    showToast(t("Route opened on map"));
  };

  const centerRouteStop = (placeId: string, index: number) => {
    const place = findPlace(placeId);
    if (!place) return;
    setActiveRouteStopIndex(index);
    setTab("map");
    selectPlacePreview(place, false);
  };

  const nextRouteStop = () => {
    if (!activeRoute || activeRoute.stops.length === 0) return;
    const nextIndex =
      activeRouteStopIndex >= activeRoute.stops.length - 1 ? 0 : activeRouteStopIndex + 1;
    centerRouteStop(activeRoute.stops[nextIndex].placeId, nextIndex);
  };

  const closeOnboarding = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("hp.onboarding.seen.v1", "1");
    }
    setOnboardingOpen(false);
  };

  const requestLocationFromOnboarding = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      showToast(t("Location is not available"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => showToast(t("Location enabled")),
      () => showToast(t("Location skipped")),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8000 },
    );
  };

  const placeFilter = (place: Place) =>
    matchesPlaceVibe(place, activeVibe) && matchesPlaceQuery(place, query);

  const filteredPlaces = useMemo(
    () =>
      places.filter(
        (place) => matchesPlaceVibe(place, activeVibe) && matchesPlaceQuery(place, query),
      ),
    [activeVibe, places, query],
  );
  const trendingPlace = useMemo(() => {
    const [first] = [...filteredPlaces].sort((a, b) => b.hotness - a.hotness);
    return first ?? null;
  }, [filteredPlaces]);
  const mapClusters = useMemo(
    () => buildAreaClusters(filteredPlaces, events, activitySnapshot),
    [activitySnapshot, events, filteredPlaces],
  );
  const selectedCluster = selectedAreaId
    ? (mapClusters.find((cluster) => cluster.id === selectedAreaId) ?? null)
    : null;

  useEffect(() => {
    if (!selectedAreaId) return;
    if (mapClusters.some((cluster) => cluster.id === selectedAreaId)) return;
    setMapBackStack([]);
    setSelectedAreaId(null);
    setSelectedPlace(null);
    setSheetH(idlePeek);
  }, [idlePeek, mapClusters, selectedAreaId]);

  const filteredPosts = allPosts.filter((post) => {
    const place = findPlace(post.placeId);
    return place ? placeFilter(place) : false;
  });

  const jumpToMap = (id: string) => {
    const place = findPlace(id);
    if (!place) return;
    setTab("map");
    selectPlacePreview(place);
  };

  const sel = selectedPlace;
  const modalOpen = Boolean(
    openPlace ||
    openPost ||
    openRoute ||
    createOpen ||
    storyViewer ||
    profileOpen ||
    authOpen ||
    onboardingOpen,
  );
  const renderActiveTab = () => {
    if (tab === "map") {
      return (
        <div ref={mapBodyRef} className="relative h-full w-full">
          <SocialMap
            clusters={mapClusters}
            events={events}
            activitySnapshot={activitySnapshot}
            selectedAreaId={selectedAreaId}
            selectedPlaceId={sel?.id ?? null}
            activeFilterLabel={activeVibe}
            storyPlaceIds={storyPlaceIds}
            onSelectArea={selectAreaPreview}
            onSelectPlace={selectMapPlacePreview}
            onResetView={clearMapView}
            canGoBack={mapBackStack.length > 0}
            onBack={goBackMapView}
            areaFocusBottomPadding={areaPreview + 112}
            selectedBottomPadding={selectedCluster ? sheetH + 96 : 0}
            routePath={activeRoutePath}
            onMapLongPress={(lat, lng) => {
              openComposer("place", { lat, lng });
              showToast(t("Drop a new spot"));
            }}
          />
          <AnimatePresence>
            {activeRoute && (
              <ActiveRouteGuide
                route={activeRoute}
                stopIndex={activeRouteStopIndex}
                findPlace={findPlace}
                onOpenStop={centerRouteStop}
                onNext={nextRouteStop}
                onClose={() => setActiveRouteId(null)}
              />
            )}
          </AnimatePresence>
          <MapBottomSheet
            cluster={selectedCluster}
            selectedPlace={sel}
            events={events}
            storyGroups={placeStoryGroups}
            onOpenStory={(placeId) => setStoryViewer({ placeId })}
            height={sheetH}
            peek={peek}
            half={half}
            full={full}
            onSetSnap={setSheetH}
            onOpenDetails={(p) => setOpenPlace(p)}
            onSavePlace={toggleSave}
            onSharePlace={sharePlace}
            savedPlaceIds={savedIds}
            claimedPlaceIds={pulseData.claimedPlaceIds}
            dealPlaceIds={pulseData.dealPlaceIds}
          />
          <MapAreaInsights
            clusters={mapClusters}
            selectedCluster={selectedCluster}
            onSelectArea={selectAreaPreview}
            onDismiss={clearMapView}
          />
        </div>
      );
    }

    if (tab === "pulse") {
      return (
        <div className="relative h-full">
          <div className="h-full overflow-y-auto">
            {readyProfile(account)?.defaultIdentity === "LOCAL" && (
              <div className="px-4 pt-3">
                <LocalDiscoveryCard
                  places={places}
                  coveredIds={discoveryExploredIds}
                  onOpenPlace={setOpenPlace}
                  onMilestone={() => showToast(t("Five new places — you're really exploring now."))}
                />
              </div>
            )}
            <PulseFeed
              posts={filteredPosts}
              storyGroups={placeStoryGroups}
              activityTicks={activityTicks}
              trendingPlace={trendingPlace}
              onOpenStory={(placeId) => setStoryViewer({ placeId })}
              likes={likes}
              postLikes={postLikes}
              toggleLike={toggleLike}
              savedPosts={savedPosts}
              toggleSavePost={toggleSavePost}
              commentsByPost={postComments}
              onOpenPost={setOpenPost}
              onOpenMap={jumpToMap}
              onShare={sharePost}
              onTrendingGoing={markTrendingGoing}
              findPlace={findPlace}
              findAuthor={findAuthor}
              findPostAuthor={findPostAuthor}
            />
          </div>
          {places.length > 0 && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              initial={{ opacity: 0, scale: 0.86, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.86, y: 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.6 }}
              onClick={() => openComposer("post")}
              className="absolute right-4 bottom-3 z-40 grid h-12 w-12 place-items-center rounded-full bg-hp-sunset text-hp-paper shadow-[0_10px_24px_rgba(224,106,50,0.45)]"
              aria-label={t("Create local post")}
            >
              <Plus size={20} />
            </motion.button>
          )}
        </div>
      );
    }

    if (tab === "routes") {
      return (
        <div className="h-full overflow-y-auto">
          <RoutesScreen
            routes={routes}
            onOpenRoute={setOpenRoute}
            savedRoutes={savedRoutes}
            routeComments={routeComments}
            findAuthor={findAuthor}
            showMustSee={readyProfile(account)?.defaultIdentity === "TOURIST"}
            places={places}
            onOpenPlace={setOpenPlace}
          />
        </div>
      );
    }

    if (tab === "meet") {
      return (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 gap-1.5 px-4 pt-3">
            {(
              [
                { id: "community" as MeetSubTab, label: t("Community"), Icon: CalendarHeart },
                { id: "events" as MeetSubTab, label: t("Events"), Icon: Ticket },
              ] satisfies { id: MeetSubTab; label: string; Icon: LucideIcon }[]
            ).map(({ id, label, Icon }) => {
              const active = meetSubTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMeetSubTab(id)}
                  aria-pressed={active}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl border py-2 text-[12.5px] font-bold transition active:scale-[0.98] ${
                    active
                      ? "border-hp-ink bg-hp-ink text-hp-paper"
                      : "border-hp-ink/10 bg-hp-paper text-hp-ink/70"
                  }`}
                >
                  <Icon size={14} strokeWidth={2.6} />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1">
            {meetSubTab === "community" ? (
              <MeetScreen
                events={meetEvents}
                rsvp={rsvpMap}
                findPlace={findPlace}
                onToggleRsvp={toggleMeetRsvp}
                onOpenPlace={jumpToMap}
                onCreate={() => openComposer("event")}
              />
            ) : (
              <CulturalEventsScreen
                events={culturalEvents}
                lang={language}
                onOpenDetail={setOpenCulturalEvent}
                canCreate={organizerStatus?.verificationStatus === "verified"}
                onCreate={() => setOrganizerComposerOpen(true)}
              />
            )}
          </div>
        </div>
      );
    }

    if (tab === "deals") {
      return <DealsScreen deals={deals} places={places} onOpenPlace={setOpenPlace} />;
    }

    return (
      <div className="h-full overflow-y-auto">
        <SavedScreen
          savedPlaceIds={savedIds}
          savedPostIds={savedPostIds}
          savedRouteIds={savedRouteIds}
          places={places}
          posts={allPosts}
          routes={routes}
          onOpenPlace={setOpenPlace}
          onOpenPost={setOpenPost}
          onOpenRoute={setOpenRoute}
          onUnsavePlace={toggleSave}
          onUnsavePost={toggleSavePost}
          onUnsaveRoute={toggleSaveRoute}
          findPlace={findPlace}
          findAuthor={findAuthor}
          findPostAuthor={findPostAuthor}
        />
      </div>
    );
  };

  return (
    <div className="hp-app-shell relative mx-auto flex h-[100dvh] w-full max-w-[440px] flex-col overflow-hidden bg-hp-bg shadow-[0_30px_80px_rgba(23,20,17,0.15)] sm:my-6 sm:h-[860px] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[36px] sm:border sm:border-hp-ink/10">
      <div
        className="flex min-h-0 flex-1 flex-col"
        inert={modalOpen ? true : undefined}
        aria-hidden={modalOpen ? true : undefined}
      >
        <TopBar
          query={query}
          setQuery={setQuery}
          onToggleLanguage={toggleAppLanguage}
          showSearch={showSearch}
          setShowSearch={setShowSearch}
          account={account}
          onOpenAccount={() => setProfileOpen(true)}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenDeals={() => setTab("deals")}
        />
        <VibeChips chips={vibeChips} active={activeVibe} setActive={setActiveVibe} />

        <div className="relative isolate min-h-0 flex-1 overflow-hidden bg-hp-bg">
          {dataStatus !== "ready" && (
            <div
              role={dataStatus === "error" ? "alert" : "status"}
              aria-live="polite"
              className="absolute inset-x-4 top-4 z-[60] flex items-center justify-between gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper/95 p-3 text-[12px] font-semibold text-hp-ink shadow-lg backdrop-blur"
            >
              <span>
                {t(dataStatus === "loading" ? "Loading pulse data…" : "Could not load pulse data.")}
              </span>
              {dataStatus === "error" && (
                <button
                  type="button"
                  onClick={() => void refreshPulseData()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-hp-ink px-3 py-2 text-[11px] font-black text-hp-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hp-sunset"
                >
                  <RefreshCw size={13} />
                  {t("Try again")}
                </button>
              )}
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10, scale: 0.996, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, scale: 0.996, filter: "blur(2px)" }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 overflow-hidden bg-hp-bg"
              style={{
                backfaceVisibility: "hidden",
                contain: "layout paint style",
                transform: "translateZ(0)",
                willChange: "opacity, transform, filter",
              }}
            >
              {renderActiveTab()}
            </motion.div>
          </AnimatePresence>
        </div>

        <BottomNav tab={tab} setTab={setTab} />
      </div>

      <PlaceDetailModal
        place={openPlace}
        events={events}
        onClose={() => setOpenPlace(null)}
        onSave={toggleSave}
        saved={openPlace ? savedIds.includes(openPlace.id) : false}
        visited={openPlace ? visitedPlaceIds.includes(openPlace.id) : false}
        onToggleVisited={toggleVisited}
        posts={openPlace ? allPosts.filter((p) => p.placeId === openPlace.id) : []}
        onOpenMap={jumpToMap}
        onShare={sharePlace}
        comments={openPlace ? (placeComments[openPlace.id] ?? []) : []}
        onComment={addPlaceComment}
        findAuthor={findAuthor}
        findPostAuthor={findPostAuthor}
        storyGroups={placeStoryGroups}
        onOpenStory={(placeId) => setStoryViewer({ placeId })}
        businessProfile={openPlaceBusinessProfile}
        showClaimCta={
          !!openPlace &&
          !pulseData.claimedPlaceIds.includes(openPlace.id) &&
          !myPlaceClaims.some(
            (claim) => claim.placeId === openPlace.id && claim.status !== "rejected",
          )
        }
        onClaimPlace={claimFromPlaceDetail}
        onGetDealCode={handleGetDealCode}
        gettingDealCode={issuingDealCode}
      />
      <DealCodeModal code={dealCodeModal} onClose={() => setDealCodeModal(null)} />
      <PostDetailModal
        post={openPost}
        onClose={() => setOpenPost(null)}
        onOpenMap={jumpToMap}
        onLike={() => openPost && toggleLike(openPost.id)}
        liked={openPost ? !!likes[openPost.id] : false}
        likeCount={
          openPost ? (postLikes[openPost.id] ?? openPost.likes) + (likes[openPost.id] ? 1 : 0) : 0
        }
        comments={openPost ? [...openPost.comments, ...(postComments[openPost.id] ?? [])] : []}
        onComment={(t) => openPost && addPostComment(openPost.id, t)}
        saved={openPost ? !!savedPosts[openPost.id] : false}
        onSave={() => openPost && toggleSavePost(openPost.id)}
        onShare={sharePost}
        findPlace={findPlace}
        findAuthor={findAuthor}
        findPostAuthor={findPostAuthor}
      />
      <RouteArticleModal
        route={openRoute}
        onClose={() => setOpenRoute(null)}
        onOpenMap={jumpToMap}
        onMapRoute={startRouteOnMap}
        saved={openRoute ? !!savedRoutes[openRoute.id] : false}
        comments={openRoute ? (routeComments[openRoute.id] ?? []) : []}
        onSave={() => openRoute && toggleSaveRoute(openRoute.id)}
        onShare={() => openRoute && shareRoute(openRoute)}
        onComment={(text) => openRoute && addRouteComment(openRoute.id, text)}
        findPlace={findPlace}
        findAuthor={findAuthor}
      />
      <CreateComposerModal
        open={createOpen}
        initialMode={composerMode}
        prefillPlace={composerPin}
        places={places}
        vibeChips={vibeChips}
        account={account}
        onClose={() => {
          setCreateOpen(false);
          setComposerPin(null);
        }}
        onRequireAccount={() => {
          requireProfile("post");
        }}
        onPost={addLocalPost}
        onPlace={addLocalPlace}
        onStory={addLocalStory}
        onEvent={addMeetEvent}
      />

      <OrganizerEventComposer
        key={editingCulturalEvent?.id ?? "new"}
        open={organizerComposerOpen}
        lang={language}
        event={editingCulturalEvent}
        onClose={() => {
          setOrganizerComposerOpen(false);
          setEditingCulturalEvent(null);
        }}
        onSubmit={addCulturalEvent}
        onUpdate={editCulturalEvent}
      />

      <OrganizerEventsSheet
        open={myEventsOpen}
        lang={language}
        events={myCulturalEvents}
        onClose={() => setMyEventsOpen(false)}
        onEdit={(ev) => {
          setEditingCulturalEvent(ev);
          setMyEventsOpen(false);
          setOrganizerComposerOpen(true);
        }}
      />

      <BusinessPlacesSheet
        open={businessPlacesOpen}
        onClose={() => setBusinessPlacesOpen(false)}
        places={places}
        claims={myPlaceClaims}
        otherClaimedPlaceIds={pulseData.claimedPlaceIds}
        onClaim={handleClaimPlace}
        onSaveProfile={handleSavePlaceProfile}
        onUploadPhoto={uploadBusinessPhoto}
        onSaveDeal={handleSaveDeal}
        dealStats={myDealStats}
        onRedeemCode={handleRedeemDealCode}
      />

      <CulturalEventDetailModal
        event={openCulturalEvent}
        lang={language}
        onClose={() => setOpenCulturalEvent(null)}
        onOpenMap={jumpToMap}
        onLike={() => openCulturalEvent && toggleCulturalEventLike(openCulturalEvent.id)}
        liked={openCulturalEvent ? !!culturalEventLikes[openCulturalEvent.id] : false}
        likeCount={
          openCulturalEvent
            ? (culturalEventLikeCounts[openCulturalEvent.id] ?? openCulturalEvent.likesCount) +
              (culturalEventLikes[openCulturalEvent.id] ? 1 : 0)
            : 0
        }
        comments={openCulturalEvent ? (culturalEventComments[openCulturalEvent.id] ?? []) : []}
        onComment={(text) =>
          openCulturalEvent && addCulturalEventComment(openCulturalEvent.id, text)
        }
      />

      <AuthSheet
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={async () => {
          const nextAccount = await refreshAccount();
          if (nextAccount.status === "needsProfile") setProfileOpen(true);
        }}
      />

      <PasswordRecoverySheet
        open={passwordRecoveryOpen}
        onComplete={async () => {
          clearPasswordRecoveryUrl();
          setPasswordRecoveryOpen(false);
          await refreshAccount();
          showToast(t("Your password has been updated."));
        }}
        onCancel={async () => {
          await signOutPulseAccount().catch((error) => {
            console.warn("Could not close the password recovery session.", error);
          });
          clearPasswordRecoveryUrl();
          setPasswordRecoveryOpen(false);
          await refreshAccount();
          setAuthOpen(true);
        }}
      />

      <AccountSheet
        open={profileOpen}
        account={account}
        onClose={() => setProfileOpen(false)}
        stats={profileStats}
        saved={{
          placeCount: savedIds.length,
          postCount: savedPostIds.length,
          routeCount: savedRouteIds.length,
          onOpenSaved: () => {
            setProfileOpen(false);
            setTab("saved");
          },
        }}
        onSaved={async () => {
          await refreshAccount();
        }}
        onOpenAuth={() => setAuthOpen(true)}
        adminRole={adminRole}
        onOpenAdmin={() => {
          window.location.assign("/admin");
        }}
        organizerStatus={organizerStatus}
        organizerEventCount={myCulturalEvents.length}
        onApplyOrganizer={applyOrganizer}
        onOpenOrganizerComposer={() => {
          setProfileOpen(false);
          setEditingCulturalEvent(null);
          setOrganizerComposerOpen(true);
        }}
        onOpenOrganizerEvents={() => {
          setProfileOpen(false);
          setMyEventsOpen(true);
        }}
        businessStatus={businessStatus}
        businessPlaceCount={myPlaceClaims.filter((claim) => claim.status !== "rejected").length}
        onApplyBusiness={applyBusiness}
        onOpenBusinessPlaces={() => {
          setProfileOpen(false);
          setBusinessPlacesOpen(true);
        }}
      />

      <OnboardingGate
        open={onboardingOpen}
        vibeChips={vibeChips}
        onClose={closeOnboarding}
        onRequestLocation={requestLocationFromOnboarding}
      />

      {storyViewer && (
        <PlaceStoryViewer
          groups={placeStoryGroups}
          startPlaceId={storyViewer.placeId}
          startStoryId={storyViewer.storyId}
          markSeen={markSeen}
          onClose={() => setStoryViewer(null)}
          onOpenPlace={jumpToMap}
          onOpenPlaceDetails={(id) => {
            const place = findPlace(id);
            if (place) setOpenPlace(place);
          }}
          onShare={shareStory}
          onToggleSave={toggleSave}
          savedPlaceIds={savedIds}
        />
      )}

      <Toast msg={toast} />
    </div>
  );
}

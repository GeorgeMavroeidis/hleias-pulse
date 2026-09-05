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
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
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
  Palette,
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
  isAuthRequiredError,
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
  buildAreaClusters,
  getMapAreaIdForPlace,
  SocialMap,
  type MapAreaCluster,
  type MapDiscoveryViewport,
} from "./SocialMap";
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
import {
  deriveAreaIntelligenceSnapshot,
  type AreaState,
  type AreaIntelligenceSnapshot,
  type SignalQuality,
} from "@/lib/hp/area-intelligence";
import {
  DISCOVERY_LENSES,
  areaNeedsDiscoveryRecommendation,
  deriveDiscoverySnapshot,
  rankDiscoveryRecommendations,
  viewportNeedsDiscoveryRecommendation,
  type DiscoveryLens,
  type DiscoveryRecommendation,
  type DiscoverySnapshot,
} from "@/lib/hp/discovery";
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
import {
  type Tab,
  type NavTab,
  type MeetSubTab,
  type ComposerMode,
  type MarkerAnimationTheme,
  type CreateStoryInput,
  type PostingIdentity,
  AREA_STATE_LABEL,
  SIGNAL_QUALITY_LABEL,
  POSTING_IDENTITIES,
  COMPOSER_MODE_ICONS,
  ROUTE_FILTERS,
  type RouteFilter,
  DISCOVERY_LENS_LABEL,
  TAB_ITEMS,
  HP_TRANSITION,
  MARKER_ANIMATION_THEME_STORAGE_KEY,
  MARKER_ANIMATION_THEMES,
  initialMarkerAnimationTheme,
  type ShareTarget,
  type MapViewSnapshot,
  openStreetMapUrl,
  isTab,
  truncateShareText,
  matchesPlaceVibe,
  matchesPlaceQuery,
  profileSummaryFromAccount,
  displayAuthorForPost,
  sharePulseTarget,
  readyProfile,
  composerIdentity,
  DISCOVERY_PLACE_IDS,
} from "./pulse-shared";
import { Toast, TopBar, VibeChips, DiscoveryLensRail } from "./PulseTopBar";
import { MapBottomSheet, type DiscoverySuggestion } from "./MapBottomSheet";
import { PulseFeed, MustSeeTodayDeck, LocalDiscoveryCard } from "./PulseFeed";
import { RoutesScreen, ActiveRouteGuide } from "./RoutesScreen";
import { SavedScreen } from "./SavedScreen";
import { PlaceDetailModal } from "./PlaceDetailModal";
import { PostDetailModal } from "./PostDetailModal";
import { RouteArticleModal } from "./RouteArticleModal";
import { CreateComposerModal } from "./CreateComposerModal";
import { BottomNav } from "./BottomNav";

// Accounts are required for every write. Each gated action names itself so the
// toast tells the user what they were trying to do, in their own language.
const SIGN_IN_PROMPTS = {
  post: "Sign in to post",
  comment: "Sign in to comment",
  place: "Sign in to add a place",
  story: "Sign in to post a story",
  host: "Sign in to host a gathering",
  rsvp: "Sign in to RSVP",
  like: "Sign in to like",
  save: "Sign in to save",
  visit: "Sign in to mark a visit",
  dealCode: "Sign in to get a code",
} as const;

type SignInAction = keyof typeof SIGN_IN_PROMPTS;

export function PulseApp() {
  const { language, setLanguage, t } = useI18n();
  const [pulseData, setPulseData] = useState<PulseData>(emptyPulseData);
  const [activitySnapshot, setActivitySnapshot] = useState<PulseActivitySnapshot>({});
  const [areaIntelligence, setAreaIntelligence] = useState<AreaIntelligenceSnapshot>({});
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
  const [activeLens, setActiveLens] = useState<DiscoveryLens | null>(null);
  const [mapDiscoveryViewport, setMapDiscoveryViewport] = useState<MapDiscoveryViewport | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [markerAnimationTheme, setMarkerAnimationTheme] = useState<MarkerAnimationTheme>(
    initialMarkerAnimationTheme,
  );
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
  const validMapPlaceIdsRef = useRef<Set<string>>(new Set());
  const validMapAreaIdsRef = useRef<Set<string>>(new Set());
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
  const [idlePeek, setIdlePeek] = useState(72);
  const selectedPeek = 44;
  const compactMap = safeMapAreaH < 460;
  const areaPreview = Math.min(
    full,
    Math.min(276, Math.max(compactMap ? 200 : 248, Math.round(safeMapAreaH * 0.34))),
  );
  const placePreview = Math.min(
    full,
    Math.min(228, Math.max(compactMap ? 184 : 210, Math.round(safeMapAreaH * 0.28))),
  );
  const hasMapFocus = Boolean(selectedAreaId);
  const peek = hasMapFocus ? selectedPeek : idlePeek;
  const half = hasMapFocus ? (selectedPlace ? placePreview : areaPreview) : idlePeek;
  const [sheetH, setSheetH] = useState(peek);
  const previousSheetGeometryRef = useRef({ mapAreaH: safeMapAreaH, peek, half, full });
  useEffect(() => {
    const previous = previousSheetGeometryRef.current;
    setSheetH((currentHeight) => {
      if (!hasMapFocus) return idlePeek;
      if (previous.mapAreaH !== safeMapAreaH) {
        const previousSnaps = [
          { id: "peek", value: previous.peek },
          { id: "preview", value: previous.half },
          { id: "full", value: previous.full },
        ] as const;
        const nearest = previousSnaps.reduce((closest, candidate) =>
          Math.abs(candidate.value - currentHeight) < Math.abs(closest.value - currentHeight)
            ? candidate
            : closest,
        );
        const remapped = nearest.id === "peek" ? peek : nearest.id === "preview" ? half : full;
        return Math.min(full, Math.max(peek, remapped));
      }
      return Math.min(full, Math.max(peek, currentHeight));
    });
    previousSheetGeometryRef.current = { mapAreaH: safeMapAreaH, peek, half, full };
  }, [full, half, peek, safeMapAreaH, hasMapFocus, idlePeek]);
  useEffect(() => {
    if (!hasMapFocus) {
      setSheetH(idlePeek);
    }
  }, [hasMapFocus, idlePeek]);

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
    const validStack = mapBackStack.filter(
      (snapshot) =>
        (!snapshot.areaId || validMapAreaIdsRef.current.has(snapshot.areaId)) &&
        (!snapshot.placeId || validMapPlaceIdsRef.current.has(snapshot.placeId)),
    );
    const previous = validStack[validStack.length - 1];
    if (!previous) {
      clearMapView();
      return;
    }

    setMapBackStack(validStack.slice(0, -1));
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

  const refreshAccount = async () => {
    try {
      const nextAccount = await getCurrentPulseAccount();
      setAccount(nextAccount);
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
  };

  const setAppLanguage = (next: "GR" | "EN") => {
    if (next === language) return;
    setLanguage(next);
    if (account.status === "ready" || account.status === "needsProfile") {
      void savePulseLanguage(account.userId, next).catch((error) => {
        console.warn("Could not save language preference.", error);
      });
    }
  };

  const updateMarkerAnimationTheme = (next: MarkerAnimationTheme) => {
    setMarkerAnimationTheme(next);
    try {
      window.localStorage.setItem(MARKER_ANIMATION_THEME_STORAGE_KEY, next);
    } catch (error) {
      console.warn("Could not save marker animation preference.", error);
    }
  };

  useEffect(() => {
    setAppearanceOpen(false);
  }, [tab]);

  const requireProfile = (action: SignInAction = "post") => {
    if (account.status === "ready") return true;
    if (account.status === "needsProfile") {
      setProfileOpen(true);
      showToast(t("Complete your profile first"));
      return false;
    }
    setAuthOpen(true);
    showToast(t(SIGN_IN_PROMPTS[action]));
    return false;
  };

  // A session can expire between the up-front guard and the request landing.
  // Route that case back to the sign-in sheet rather than a misleading
  // "could not save".
  const handleWriteError = (error: unknown, fallbackMessage: string) => {
    if (isAuthRequiredError(error)) {
      setAuthOpen(true);
      showToast(t("Your session expired. Sign in again."));
      return;
    }
    showToast(fallbackMessage);
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
      setAreaIntelligence(deriveAreaIntelligenceSnapshot(data));
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

  useEffect(() => {
    if (hasPasswordRecoveryUrl()) setPasswordRecoveryOpen(true);
  }, []);

  const refreshActivitySnapshot = useCallback(async () => {
    if (typeof document === "undefined" || document.hidden || activityRefreshInFlightRef.current) {
      return;
    }

    activityRefreshInFlightRef.current = true;
    try {
      const data = await loadPulseData();
      setActivitySnapshot(buildPulseActivitySnapshot(data));
      setAreaIntelligence(deriveAreaIntelligenceSnapshot(data));
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
    let ignore = false;
    const loadAccount = async () => {
      const nextAccount = await getCurrentPulseAccount().catch((error) => {
        console.warn("Could not load account state.", error);
        return { status: "signedOut" } as PulseAccountState;
      });
      if (ignore) return;
      setAccount(nextAccount);
      if (
        (nextAccount.status === "ready" || nextAccount.status === "needsProfile") &&
        nextAccount.preferences?.language
      ) {
        setLanguage(nextAccount.preferences.language);
      }
      // Admin/organizer status drives the Admin workspace / Verified organizer
      // badges; fetch it here too, not only through refreshAccount() on save.
      if (nextAccount.status === "ready") {
        const nextAdminRole = await getAdminRole().catch(() => null);
        if (!ignore) setAdminRole(nextAdminRole);
      } else {
        setAdminRole(null);
      }
      if (nextAccount.status === "ready" || nextAccount.status === "needsProfile") {
        const nextOrganizerStatus = await getMyOrganizerStatus().catch(() => null);
        if (!ignore) setOrganizerStatus(nextOrganizerStatus);
        if (nextOrganizerStatus?.verificationStatus === "verified") {
          const myEvents = await getMyCulturalEvents().catch(() => [] as CulturalEvent[]);
          if (!ignore) setMyCulturalEvents(myEvents);
        } else if (!ignore) {
          setMyCulturalEvents([]);
        }
        const nextBusinessStatus = await getMyBusinessStatus().catch(() => null);
        if (!ignore) setBusinessStatus(nextBusinessStatus);
        if (nextBusinessStatus?.verificationStatus === "verified") {
          const [claims, stats] = await Promise.all([
            getMyPlaceClaims().catch(() => [] as PlaceClaim[]),
            getMyDealStats().catch(() => [] as DealRedemptionStats[]),
          ]);
          if (!ignore) {
            setMyPlaceClaims(claims);
            setMyDealStats(stats);
          }
        } else if (!ignore) {
          setMyPlaceClaims([]);
          setMyDealStats([]);
        }
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
    };

    void loadAccount();
    const unsubscribe = subscribeToPulseAuth((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setAuthOpen(false);
        setProfileOpen(false);
        setPasswordRecoveryOpen(true);
      }
      void loadAccount();
    });

    return () => {
      ignore = true;
      unsubscribe();
    };
  }, [setLanguage]);

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
  const discoverySnapshot = useMemo<DiscoverySnapshot>(
    () => deriveDiscoverySnapshot({ ...pulseData, posts: allPosts }),
    [allPosts, pulseData],
  );
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
    if (account.status !== "ready") {
      requireProfile("save");
      return;
    }
    const wasSaved = savedIds.includes(id);
    const nextSaved = !wasSaved;
    setSavedIds((arr) => (wasSaved ? arr.filter((x) => x !== id) : [...arr, id]));
    showToast(t(wasSaved ? "Removed from saved" : "Saved"));
    void setSavedItem({ type: "place", id }, nextSaved).catch((error) => {
      console.warn("Could not persist place save.", error);
      setSavedIds((arr) => (wasSaved ? [...arr, id] : arr.filter((x) => x !== id)));
      handleWriteError(error, t("Could not save"));
    });
  };
  const toggleVisited = (id: string) => {
    if (account.status !== "ready") {
      requireProfile("visit");
      return;
    }
    const wasVisited = visitedPlaceIds.includes(id);
    const nextVisited = !wasVisited;
    setVisitedPlaceIds((arr) => (wasVisited ? arr.filter((x) => x !== id) : [...arr, id]));
    showToast(t(wasVisited ? "Visit removed" : "Marked as visited"));
    void setVisited(id, nextVisited).catch((error) => {
      console.warn("Could not persist place visit.", error);
      setVisitedPlaceIds((arr) => (wasVisited ? [...arr, id] : arr.filter((x) => x !== id)));
      handleWriteError(error, t("Could not save"));
    });
  };
  const toggleLike = (id: string) => {
    if (account.status !== "ready") {
      requireProfile("like");
      return;
    }
    const nextLiked = !likes[id];
    setLikes((m) => ({ ...m, [id]: nextLiked }));
    setPostLikes((m) => ({ ...m, [id]: m[id] ?? allPosts.find((p) => p.id === id)?.likes ?? 0 }));
    void setPostLike(id, nextLiked).catch((error) => {
      console.warn("Could not persist post like.", error);
      setLikes((m) => ({ ...m, [id]: !nextLiked }));
      handleWriteError(
        error,
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
        handleWriteError(error, t("Could not post comment"));
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
        handleWriteError(error, t("Could not post comment"));
      });
  };
  const toggleSavePost = (id: string) => {
    if (account.status !== "ready") {
      requireProfile("save");
      return;
    }
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
      handleWriteError(
        error,
        language === "GR" ? "Δεν ήταν δυνατή η αποθήκευση της δημοσίευσης" : "Could not save post",
      );
    });
  };
  const toggleSaveRoute = (id: string) => {
    if (account.status !== "ready") {
      requireProfile("save");
      return;
    }
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
      handleWriteError(
        error,
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
        handleWriteError(error, t("Could not post comment"));
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
      requireProfile("place");
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
      requireProfile("story");
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

  // Stage B3: user taps "Get code" in the APP DEAL callout. A real account is
  // required. A repeat tap for the same deal returns the existing live code.
  const handleGetDealCode = async () => {
    if (!openPlace || issuingDealCode) return;
    if (account.status !== "ready") {
      requireProfile("dealCode");
      return;
    }
    setIssuingDealCode(true);
    try {
      setDealCodeModal(await issueDealCode(openPlace.id));
    } catch (error) {
      handleWriteError(error, error instanceof Error ? error.message : t("Could not get a code."));
    } finally {
      setIssuingDealCode(false);
    }
  };

  // Business side: redeem a code typed into "My places". Refreshes the counters
  // on success; the sheet surfaces the failure inline.
  const handleRedeemDealCode = async (code: string) => {
    if (account.status !== "ready") {
      requireProfile("post");
      return;
    }
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
      handleWriteError(error, t("Could not save"));
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
        handleWriteError(error, t("Could not post comment"));
      });
  };

  const toggleMeetRsvp = (event: MeetEvent, next: RsvpStatus) => {
    if (account.status !== "ready") {
      requireProfile("rsvp");
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
      handleWriteError(error, t("Could not save RSVP"));
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
  const mapPlaces = useMemo(
    () => places.filter((place) => matchesPlaceQuery(place, query)),
    [places, query],
  );
  const trendingPlace = useMemo(() => {
    const [first] = [...filteredPlaces].sort((a, b) => b.hotness - a.hotness);
    return first ?? null;
  }, [filteredPlaces]);
  const mapClusters = useMemo(
    () => buildAreaClusters(mapPlaces, events, activitySnapshot, areaIntelligence),
    [activitySnapshot, areaIntelligence, events, mapPlaces],
  );
  const mapPlaceIdSet = useMemo(() => new Set(mapPlaces.map((place) => place.id)), [mapPlaces]);
  const mapAreaIdSet = useMemo(
    () => new Set(mapClusters.map((cluster) => cluster.id)),
    [mapClusters],
  );
  validMapPlaceIdsRef.current = mapPlaceIdSet;
  validMapAreaIdsRef.current = mapAreaIdSet;
  const selectedCluster = selectedAreaId
    ? (mapClusters.find((cluster) => cluster.id === selectedAreaId) ?? null)
    : null;
  const selectedAreaNeedsRecommendation = Boolean(
    selectedCluster &&
    !selectedPlace &&
    areaNeedsDiscoveryRecommendation(
      selectedCluster.intelligence,
      discoverySnapshot.areas[selectedCluster.id],
      activeLens,
    ),
  );
  const viewportNeedsRecommendation = Boolean(
    !selectedCluster &&
    mapDiscoveryViewport &&
    viewportNeedsDiscoveryRecommendation(
      mapDiscoveryViewport.visibleAreaIds,
      activeLens,
      discoverySnapshot,
      areaIntelligence,
    ),
  );
  const showDiscoveryEmptyState =
    !query.trim() && (selectedAreaNeedsRecommendation || viewportNeedsRecommendation);
  const discoverySuggestion = useMemo<DiscoverySuggestion | null>(() => {
    if (!showDiscoveryEmptyState) return null;
    const origin = selectedCluster
      ? { lat: selectedCluster.lat, lng: selectedCluster.lng }
      : mapDiscoveryViewport?.center;
    if (!origin) return null;

    const visibleAreas = new Set(mapDiscoveryViewport?.visibleAreaIds ?? []);
    const candidateClusters = mapClusters.filter(
      (cluster) => selectedCluster || !visibleAreas.has(cluster.id),
    );
    const [recommendation] = rankDiscoveryRecommendations(
      candidateClusters.map((cluster) => ({
        areaId: cluster.id,
        lat: cluster.lat,
        lng: cluster.lng,
        intelligence: cluster.intelligence,
      })),
      origin,
      activeLens,
      discoverySnapshot,
      { excludeAreaId: selectedCluster?.id ?? null },
    );
    if (!recommendation) return null;
    const cluster = mapClusters.find((item) => item.id === recommendation.areaId);
    return cluster ? { recommendation, cluster } : null;
  }, [
    activeLens,
    discoverySnapshot,
    mapClusters,
    mapDiscoveryViewport,
    selectedCluster,
    showDiscoveryEmptyState,
  ]);
  const availableMapHeight = Math.max(0, safeMapAreaH - sheetH);
  const utilityRailHidden = availableMapHeight < 248;

  useEffect(() => {
    setMapBackStack((stack) => {
      const valid = stack.filter(
        (snapshot) =>
          (!snapshot.areaId || mapAreaIdSet.has(snapshot.areaId)) &&
          (!snapshot.placeId || mapPlaceIdSet.has(snapshot.placeId)),
      );
      return valid.length === stack.length ? stack : valid;
    });

    const selectedPlaceHidden = Boolean(selectedPlace && !mapPlaceIdSet.has(selectedPlace.id));
    const selectedAreaHidden = Boolean(selectedAreaId && !mapAreaIdSet.has(selectedAreaId));
    if (!selectedPlaceHidden && !selectedAreaHidden) return;

    setMapBackStack([]);
    setSelectedAreaId(null);
    setSelectedPlace(null);
    setSheetH(idlePeek);
  }, [idlePeek, mapAreaIdSet, mapPlaceIdSet, selectedAreaId, selectedPlace]);

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
    passwordRecoveryOpen ||
    onboardingOpen,
  );
  const renderActiveTab = () => {
    if (tab === "map") {
      return (
        <div
          ref={mapBodyRef}
          className="hp-map-stage relative h-full w-full"
          data-utility-rail-hidden={utilityRailHidden ? "true" : "false"}
        >
          <SocialMap
            clusters={mapClusters}
            events={events}
            activitySnapshot={activitySnapshot}
            selectedAreaId={selectedAreaId}
            selectedPlaceId={sel?.id ?? null}
            activeFilterLabel={activeLens ? t(DISCOVERY_LENS_LABEL[activeLens]) : null}
            activeLens={activeLens}
            discoverySnapshot={discoverySnapshot}
            onDiscoveryViewportChange={setMapDiscoveryViewport}
            storyPlaceIds={storyPlaceIds}
            onSelectArea={selectAreaPreview}
            onSelectPlace={selectMapPlacePreview}
            onResetView={clearMapView}
            onClearSelection={clearMapView}
            canGoBack={mapBackStack.length > 0}
            onBack={goBackMapView}
            bottomOverlayHeight={sheetH}
            availableMapHeight={availableMapHeight}
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
            onIdleHeightMeasured={setIdlePeek}
            onOpenDetails={(p) => setOpenPlace(p)}
            onSavePlace={toggleSave}
            onSharePlace={sharePlace}
            savedPlaceIds={savedIds}
            claimedPlaceIds={pulseData.claimedPlaceIds}
            dealPlaceIds={pulseData.dealPlaceIds}
            activeLens={activeLens}
            searchQuery={mapClusters.length === 0 ? query : ""}
            showDiscoveryEmptyState={showDiscoveryEmptyState}
            discoverySuggestion={discoverySuggestion}
            onOpenDiscoverySuggestion={selectAreaPreview}
            onClearLens={() => setActiveLens(null)}
            onClearSearch={() => setQuery("")}
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
    <MotionConfig reducedMotion="user">
      <div
        className="hp-app-shell relative mx-auto flex h-[100dvh] w-full max-w-[440px] flex-col overflow-hidden bg-hp-bg shadow-[0_30px_80px_rgba(23,20,17,0.15)] sm:my-6 sm:h-[860px] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[36px] sm:border sm:border-hp-ink/10"
        data-marker-animation-theme={markerAnimationTheme}
      >
        <div
          className="flex min-h-0 flex-1 flex-col"
          inert={modalOpen ? true : undefined}
          aria-hidden={modalOpen ? true : undefined}
        >
          <TopBar
            query={query}
            setQuery={setQuery}
            onSetLanguage={setAppLanguage}
            animationTheme={markerAnimationTheme}
            onSetAnimationTheme={updateMarkerAnimationTheme}
            appearanceOpen={appearanceOpen}
            setAppearanceOpen={setAppearanceOpen}
            showSearch={showSearch}
            setShowSearch={setShowSearch}
            account={account}
            onOpenAccount={() => setProfileOpen(true)}
            onOpenAuth={() => setAuthOpen(true)}
            onOpenDeals={() => setTab("deals")}
          />
          {tab === "map" ? (
            <DiscoveryLensRail active={activeLens} onChange={setActiveLens} />
          ) : (
            <VibeChips chips={vibeChips} active={activeVibe} setActive={setActiveVibe} />
          )}

          <div className="relative isolate min-h-0 flex-1 overflow-hidden bg-hp-bg">
            {dataStatus !== "ready" && (
              <div
                role={dataStatus === "error" ? "alert" : "status"}
                aria-live="polite"
                className="absolute inset-x-4 top-4 z-[60] flex items-center justify-between gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper/95 p-3 text-[12px] font-semibold text-hp-ink shadow-lg backdrop-blur"
              >
                <span>
                  {t(
                    dataStatus === "loading" ? "Loading pulse data…" : "Could not load pulse data.",
                  )}
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
    </MotionConfig>
  );
}

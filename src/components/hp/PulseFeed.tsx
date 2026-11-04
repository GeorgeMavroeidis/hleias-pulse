import { DISCOVERY_PLACE_IDS, DISCOVERY_MILESTONE } from "./pulse-shared";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import {
  Map as MapIcon,
  Bookmark,
  Heart,
  MessageCircle,
  Share2,
  MapPin,
  HelpCircle,
} from "lucide-react";
import {
  typeColor,
  authorTypeColor,
  type Author,
  type Place,
  type Post,
  type Comment,
} from "@/lib/hp-model";
import { useI18n } from "@/lib/i18n";
import { ImageBox } from "./ImageBox";
import { AddToTripButton } from "./AddToTripButton";
import { SocialMap } from "./SocialMap";
import { PlaceStoryRail } from "./PlaceStoryRail";
import { type PlaceStoryGroup } from "@/lib/hp/place-stories";
import { LiveTicker } from "./LiveTicker";
import { TrendingHero } from "./TrendingHero";
import { buildActivityTicks } from "@/lib/hp/activity-data";
import { ContentMenu } from "./ContentMenu";
import { useModeration } from "./use-moderation";
import type { MeetEvent } from "@/lib/hp/meet-types";
import type { StoryItem } from "@/lib/hp-model";
import type { PulseActivitySnapshot } from "@/lib/hp/pulse-activity";
import {
  isPublishedContent,
  observationLabel,
  postQualifiesTonight,
} from "@/lib/hp/surface-freshness";
import { displayPostTime, isRecentlyPosted } from "@/lib/hp/post-time";

export function PulseFeed({
  posts,
  storyGroups,
  activityTicks,
  trendingPlace,
  activitySnapshot = {},
  meetEvents = [],
  stories = [],
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
  previewMode = false,
  nowMs = Date.now(),
}: {
  posts: Post[];
  storyGroups: PlaceStoryGroup[];
  activityTicks: ReturnType<typeof buildActivityTicks>;
  trendingPlace: Place | null;
  activitySnapshot?: PulseActivitySnapshot;
  meetEvents?: MeetEvent[];
  stories?: StoryItem[];
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
  onTrendingGoing: (event: MeetEvent) => void;
  findPlace: (id: string) => Place | undefined;
  findAuthor: (id: string) => Author;
  findPostAuthor: (post: Post) => Author;
  /** Keep moderation and external sharing actions out of the local simulation. */
  previewMode?: boolean;
  nowMs?: number;
}) {
  const { t, language } = useI18n();
  const moderation = useModeration();
  const [filter, setFilter] = useState(previewMode ? "All" : "Now");
  const filters = previewMode
    ? ["All", "Now", "Tonight", "Weekend", "Local tips"]
    : ["Now", "Tonight", "Weekend", "Local tips"];
  const visiblePosts = posts.filter((post) => {
    const place = findPlace(post.placeId);
    const author = findPostAuthor(post);
    if (!place) return false;
    // Blocked authors are filtered server-side; muted ones are hidden here.
    if (moderation.isHidden(post.userId)) return false;
    if (filter === "Now") return isPublishedContent(post) && isRecentlyPosted(post, nowMs);
    if (filter === "Tonight") return postQualifiesTonight(post, meetEvents, nowMs);
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
      <LiveTicker nowMs={nowMs} ticks={activityTicks} onOpenPlace={onOpenMap} />
      <PlaceStoryRail groups={storyGroups} onOpen={onOpenStory} />

      {/* Filter tabs */}
      <div className="fd-tabs hp-no-scrollbar" role="group" aria-label={t("Filter posts")}>
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className="fd-tab"
          >
            {t(f)}
          </button>
        ))}
      </div>

      {trendingPlace && (
        <TrendingHero
          place={trendingPlace}
          metric={activitySnapshot[trendingPlace.id]}
          events={meetEvents}
          stories={stories}
          nowMs={nowMs}
          onOpen={(place) => onOpenMap(place.id)}
          onGoing={onTrendingGoing}
          previewMode={previewMode}
        />
      )}

      <div className="fd-stream">
        {visiblePosts.length === 0 && (
          <div className="fd-empty">
            <p>{t("No posts match this filter yet.")}</p>
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
          const placeName = language === "GR" && p.greekName ? p.greekName : p.name;
          return (
            <motion.article
              key={post.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="fd-post"
            >
              <header className="fd-post__head">
                <img
                  src={a.avatarUrl}
                  alt=""
                  width={38}
                  height={38}
                  className="fd-avatar"
                  data-role={a.type}
                  loading="lazy"
                />
                <div className="fd-post__who">
                  <p className="fd-post__name">
                    <span>{a.name}</span>
                    <span className="fd-role" data-role={a.type}>
                      {t(AUTHOR_ROLE_LABEL[a.type] ?? "Local")}
                    </span>
                  </p>
                  <button
                    type="button"
                    className="fd-post__place"
                    onClick={() => onOpenMap(p.id)}
                    aria-label={t("open on map")}
                  >
                    <MapPin size={12} strokeWidth={2.2} aria-hidden="true" />
                    <span>{placeName}</span>
                    <span aria-hidden="true">·</span>
                    <span title={observationLabel(post.createdAt, nowMs, language).exact}>
                      {displayPostTime(post, nowMs, language)}
                    </span>
                  </button>
                </div>
                {!previewMode && (
                  <ContentMenu
                    target={{
                      type: "post",
                      id: post.id,
                      authorUserId: post.userId,
                      authorName: a.name,
                      authorAvatarUrl: a.avatarUrl,
                      summary: post.text,
                    }}
                  />
                )}
              </header>

              <button
                type="button"
                onClick={() => onOpenPost(post)}
                className="fd-post__media"
                aria-label={`Open post about ${p.name}`}
              >
                <ImageBox
                  src={post.imageUrl}
                  alt={`${p.name} post`}
                  className="fd-post__img"
                  rounded="rounded-none"
                />
                {post.kind === "question" && (
                  <span className="fd-post__badge">
                    <HelpCircle size={13} strokeWidth={2.4} aria-hidden="true" /> {t("Question")}
                  </span>
                )}
              </button>

              <div className="fd-post__actions">
                <button
                  type="button"
                  onClick={() => toggleLike(post.id)}
                  className="fd-act"
                  data-on={liked ? "true" : "false"}
                  aria-label={t(liked ? "Unlike post" : "Like post")}
                >
                  <Heart size={22} strokeWidth={1.9} fill={liked ? "currentColor" : "none"} />
                  <span>{lc}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPost(post)}
                  className="fd-act"
                  aria-label={t("Open comments")}
                >
                  <MessageCircle size={22} strokeWidth={1.9} />
                  <span>
                    {post.kind === "question"
                      ? commentCount === 0
                        ? t("No answers yet")
                        : t(commentCount === 1 ? "{n} answer" : "{n} answers", {
                            n: commentCount,
                          })
                      : commentCount}
                  </span>
                </button>
                {!previewMode && (
                  <button
                    type="button"
                    onClick={() => onShare(post)}
                    aria-label={t("Share post")}
                    className="fd-act"
                  >
                    <Share2 size={21} strokeWidth={1.9} />
                  </button>
                )}
                <span className="fd-post__spacer" />
                {!previewMode && (
                  <AddToTripButton
                    kind="place"
                    id={p.id}
                    name={p.name}
                    compact
                    className="hp-add-to-trip--small"
                  />
                )}
                <button
                  type="button"
                  onClick={() => toggleSavePost(post.id)}
                  className="fd-act"
                  data-on={sv ? "true" : "false"}
                  aria-label={t(sv ? "Unsave post" : "Save post")}
                >
                  <Bookmark size={21} strokeWidth={1.9} fill={sv ? "currentColor" : "none"} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => onOpenPost(post)}
                className="fd-post__caption"
                aria-label={`Open post details for ${p.name}`}
              >
                <p>
                  <b>{a.name}</b> {post.text}
                </p>
                {post.tags.length > 0 && (
                  <span className="fd-post__tags">
                    {post.tags.map((tag) => `#${tag}`).join("  ")}
                  </span>
                )}
              </button>
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}

const AUTHOR_ROLE_LABEL: Record<string, string> = {
  LOCAL: "Local",
  TOURIST: "Visitor",
  GUIDE: "Guide",
  BUSINESS: "Business",
  EDITOR: "Editor",
};

/* ============== "Must-see today" deck (Tourist orientation, Routes tab) ============== */
// TEMP stopgap until a real `places.featured` flag exists (phase 2). Hotness
// ranking alone buries Ancient Olympia — the region's headline site — at rank ~9
// behind a wall of beaches, so it is pinned to the front of the "Must-see today"
// deck by hand. REPLACE this list with a `places.featured` column set from the
// admin panel once phase 2 is built; this is not meant to be permanent
// architecture. See HANDOFF.md > Known Limitations.
const TEMP_FEATURED_PLACE_IDS = ["ancient-olympia"];

// Shown to everyone at the top of the Routes tab. Places only —
// route recommendations are already covered by the Routes tab's own "What we
// recommend" (curated) section, so this deck deliberately does not repeat them.
export function MustSeeTodayDeck({
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

  // A row that glides without ever stopping, like a "our partners" strip: the list
  // is repeated and the row slides by exactly one repeat, so the loop has no seam.
  // Only the first copy is reachable by screen readers and keyboard. The motion
  // itself lives in CSS (.hp-marquee).
  const copies = mustSee.length < 2 ? 1 : Math.max(3, Math.ceil(18 / mustSee.length));

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
      <div className="hp-marquee">
        <div
          className="hp-marquee__track"
          style={
            {
              "--hp-marquee-copies": copies,
              "--hp-marquee-duration": `${mustSee.length * 7}s`,
            } as CSSProperties
          }
        >
          {Array.from({ length: copies }, (_, copy) => (
            <div key={copy} className="hp-marquee__group" aria-hidden={copy > 0 || undefined}>
              {mustSee.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  tabIndex={copy > 0 ? -1 : undefined}
                  onClick={() => onOpenPlace(place)}
                  aria-label={t("Open {place}", { place: place.name })}
                  className="hp-marquee__card overflow-hidden rounded-2xl border border-hp-ink/10 bg-hp-paper text-left"
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
                    <div className="line-clamp-1 text-[12px] font-bold text-hp-ink">
                      {place.name}
                    </div>
                    <div className="text-[10px] text-hp-muted">{place.area}</div>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
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

// v1 milestone: a single fixed nudge, no badges / no persisted achievements.
// Only fires as a toast when the user *crosses* it during a session.

// Local-only, top of the Pulse feed. "Covered" = the user has at least one own
// post at that place (posts-as-visited proxy — no check-in table in v1).
export function LocalDiscoveryCard({
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

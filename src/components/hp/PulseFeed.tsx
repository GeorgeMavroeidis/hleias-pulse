import { DISCOVERY_PLACE_IDS, DISCOVERY_MILESTONE } from "./pulse-shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Map as MapIcon, Bookmark, Heart, MessageCircle, Share2, MapPin } from "lucide-react";
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
import { SocialMap } from "./SocialMap";
import { PlaceStoryRail } from "./PlaceStoryRail";
import { type PlaceStoryGroup } from "@/lib/hp/place-stories";
import { LiveTicker } from "./LiveTicker";
import { TrendingHero } from "./TrendingHero";
import { buildActivityTicks } from "@/lib/hp/activity-data";
import { ContentMenu } from "./ContentMenu";
import { useModeration } from "./use-moderation";

export function PulseFeed({
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
  const moderation = useModeration();
  const [filter, setFilter] = useState("Now");
  const filters = ["Now", "Tonight", "Weekend", "Local tips"];
  const visiblePosts = posts.filter((post) => {
    const place = findPlace(post.placeId);
    const author = findPostAuthor(post);
    if (!place) return false;
    // Blocked authors are filtered server-side; muted ones are hidden here.
    if (moderation.isHidden(post.userId)) return false;
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

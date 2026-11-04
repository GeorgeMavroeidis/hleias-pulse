import type { CommentDraftBinding } from "@/lib/hp/comment-drafts";
import { CommentComposer, CommentReviewStatus } from "./CommentComposer";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
  CalendarHeart,
  X,
  MessageCircle,
  Share2,
  Clock,
  Wallet,
  Send,
  ExternalLink,
  Ticket,
  Check,
  Store,
  Phone,
  Globe,
  Users,
  UtensilsCrossed,
  BadgeCheck,
  Gift,
  ListChecks,
} from "lucide-react";
import {
  typeColor,
  authorTypeColor,
  type Author,
  type Place,
  type Post,
  type Comment,
} from "@/lib/hp-model";
import { type PulseData } from "@/lib/hp-api";
import { useI18n } from "@/lib/i18n";
import { ImageBox } from "./ImageBox";
import { AddToTripButton } from "./AddToTripButton";
import { DirectionsLink } from "./DirectionsLink";
import { ContentMenu } from "./ContentMenu";
import { useModeration } from "./use-moderation";
import { type PlaceStoryGroup } from "@/lib/hp/place-stories";
import type { PlaceBusinessProfile } from "@/lib/hp/business-types";
import { openStreetMapUrl } from "./pulse-shared";
import type { PlacePulseMetric } from "@/lib/hp/pulse-activity";
import { observationLabel } from "@/lib/hp/surface-freshness";
import { displayPostTime } from "@/lib/hp/post-time";
import { useCommonsPhotos } from "@/lib/hp/commons-photos";
import { placeGallery, thumbnailUrl, type ExploreMedia } from "@/lib/hp/explore-media";
import { useState } from "react";
import { Map as MapIcon } from "lucide-react";

export function PlaceDetailModal({
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
  commentDraft,
  findAuthor,
  findPostAuthor,
  storyGroups,
  onOpenStory,
  businessProfile,
  showClaimCta,
  onClaimPlace,
  onGetDealCode,
  gettingDealCode,
  nowMs = Date.now(),
  activityMetric,
}: {
  nowMs?: number;
  activityMetric?: PlacePulseMetric;
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
  commentDraft?: CommentDraftBinding;
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
  const { language, t } = useI18n();
  const eventCount = activityMetric?.eventCount ?? 0;
  const noteCount = activityMetric?.commentCount ?? 0;
  const hasBusinessDetail = Boolean(
    businessProfile &&
    ((businessProfile.dealActive && businessProfile.dealText) ||
      businessProfile.hoursText ||
      businessProfile.phone ||
      businessProfile.websiteUrl ||
      businessProfile.menuUrl ||
      businessProfile.photos.length > 0),
  );
  const moderation = useModeration();
  const placeStories = place
    ? (storyGroups.find((group) => group.placeId === place.id)?.stories ?? [])
    : [];
  // Blocked authors are filtered server-side; muted ones are hidden here.
  const visiblePosts = posts.filter((post) => !moderation.isHidden(post.userId));
  const commons = useCommonsPhotos(place);
  const storyGroup = place
    ? (storyGroups.find((group) => group.placeId === place.id) ?? null)
    : null;
  const gallery = place
    ? placeGallery(place, {
        posts: visiblePosts,
        storyGroup,
        businessPhotos: businessProfile?.photos ?? [],
        commons,
        limit: 30,
      })
    : [];
  const moments = visiblePosts.filter((post) => post.imageUrl?.trim()).slice(0, 9);

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
              <PlaceGallery
                items={gallery}
                placeName={place.name}
                onOpenStory={() => onOpenStory(place.id)}
              />
              <div className="absolute right-3 top-3 flex items-center gap-2">
                <ContentMenu
                  tone="light"
                  target={{
                    type: "place",
                    id: place.id,
                    authorUserId: place.userId,
                    summary: place.name,
                  }}
                />
                <button
                  type="button"
                  onClick={onClose}
                  className="pd-glass-button"
                  aria-label={t("Close")}
                >
                  <X size={17} strokeWidth={2.4} />
                </button>
              </div>
              <div className="pd-title">
                <span
                  className="inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-bold text-white"
                  style={{ background: "rgb(0 0 0 / 0.32)", backdropFilter: "blur(10px)" }}
                >
                  {t(PLACE_TYPE_LABEL[place.type] ?? "Local spot")}
                </span>
                <h2 className="mt-2">
                  {language === "GR" && place.greekName ? place.greekName : place.name}
                </h2>
                <p>
                  {language === "GR" && place.greekName ? place.name : place.greekName} ·{" "}
                  {place.area}
                </p>
                {businessProfile && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-hp-sunset">
                    <BadgeCheck size={12} />
                    {businessProfile.businessName
                      ? t("Managed by {name}", { name: businessProfile.businessName })
                      : t("Verified business")}
                  </span>
                )}
              </div>
            </div>
            <div className="pd-actions">
              <DirectionsLink
                destination={{ lat: place.lat, lng: place.lng, label: place.name }}
                className="pd-action pd-action--primary"
              />
              <button
                type="button"
                className="pd-action"
                data-on={saved ? "true" : "false"}
                aria-pressed={saved}
                onClick={() => onSave(place.id)}
              >
                <Bookmark size={18} strokeWidth={2.2} fill={saved ? "currentColor" : "none"} />
                {t(saved ? "Saved" : "Save")}
              </button>
              <button
                type="button"
                className="pd-action"
                onClick={() => onShare(place)}
                aria-label={t("Share {place}", { place: place.name })}
              >
                <Share2 size={18} strokeWidth={2.2} />
                {t("Share")}
              </button>
              <button
                type="button"
                className="pd-action"
                onClick={() => {
                  onClose();
                  onOpenMap(place.id);
                }}
              >
                <MapIcon size={18} strokeWidth={2.2} />
                {t("Map")}
              </button>
            </div>
            {placeStories.length > 0 && (
              <div className="pd-stories hp-no-scrollbar" role="list" aria-label={t("Stories")}>
                {placeStories.map((story) => (
                  <button
                    key={story.id}
                    type="button"
                    role="listitem"
                    className="pd-story"
                    onClick={() => onOpenStory(place.id)}
                    aria-label={t("Open stories from {place}", { place: place.name })}
                  >
                    <span className="pd-story__ring">
                      <img src={thumbnailUrl(story.mediaUrl, 250)} alt="" loading="lazy" />
                    </span>
                    <span className="max-w-full truncate">{story.authorName}</span>
                  </button>
                ))}
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
                postsToday={activityMetric?.postCount ?? 0}
                eventsTonight={eventCount}
                notes={noteCount}
                crowd=""
                budget={place.budget}
                bestTime={place.bestTime}
                mood={place.mood}
              />

              <p
                title={observationLabel(activityMetric?.lastSignalAt, nowMs, language).exact}
                className="mt-2 text-xs text-hp-muted"
              >
                {observationLabel(activityMetric?.lastSignalAt, nowMs, language).relative}
              </p>

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

              {moments.length > 0 && (
                <>
                  <h3 className="pd-section-title">
                    {t("Moments")}
                    <small>{t("{count} photos", { count: moments.length })}</small>
                  </h3>
                  <div className="pd-moments">
                    {moments.map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        aria-label={post.text}
                        onClick={() =>
                          document
                            .getElementById(`pd-post-${post.id}`)
                            ?.scrollIntoView({ behavior: "smooth", block: "center" })
                        }
                      >
                        <img src={thumbnailUrl(post.imageUrl, 330)} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="mt-5">
                <h3 className="pd-section-title">{t("Posts at this place")}</h3>
                <div className="flex flex-col gap-2">
                  {visiblePosts.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-hp-ink/10 p-4 text-center text-[12px] text-hp-muted">
                      {t("No posts at this place yet.")}
                    </div>
                  )}
                  {visiblePosts.map((p) => {
                    const a = findPostAuthor(p);
                    return (
                      <div
                        key={p.id}
                        id={`pd-post-${p.id}`}
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
                            className="rounded-sm px-1 py-[1px] text-[8px] font-bold uppercase tracking-wider text-hp-on-media"
                            style={{ background: authorTypeColor[a.type] }}
                          >
                            {a.type}
                          </span>
                          <span
                            title={observationLabel(p.createdAt, nowMs, language).exact}
                            className="ml-auto text-[10px] text-hp-muted"
                          >
                            {displayPostTime(p, nowMs, language)}
                          </span>
                          <ContentMenu
                            className="-my-1"
                            target={{
                              type: "post",
                              id: p.id,
                              authorUserId: p.userId,
                              authorName: a.name,
                              authorAvatarUrl: a.avatarUrl,
                              summary: p.text,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-[13px] text-hp-ink">{p.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-hp-ink/10 bg-hp-raised/60 p-3">
                <label
                  htmlFor={`place-detail-comment-${place.id}`}
                  className="text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                >
                  {language === "GR" ? "Γρήγορο σχόλιο" : "Quick comment"}
                </label>
                <div className="mt-2">
                  <CommentComposer
                    binding={commentDraft}
                    inputId={`place-detail-comment-${place.id}`}
                    label={language === "GR" ? "Γρήγορο σχόλιο" : "Quick comment"}
                    placeholder={t("Add a local note…")}
                    submitLabel={t("Post comment")}
                  />
                </div>
                {comments.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {comments.slice(-3).map((c, i) => (
                      <div
                        key={c.id ?? i}
                        className="rounded-2xl bg-hp-ink/5 px-3 py-2 text-[12px]"
                      >
                        <span className="font-bold text-hp-ink">{c.author}</span>{" "}
                        <span className="text-hp-ink/80">{c.text}</span>
                        <CommentReviewStatus comment={c} />
                        <span
                          title={observationLabel(c.createdAt, nowMs, language).exact}
                          className="mt-1 block text-[10px] text-hp-muted"
                        >
                          {observationLabel(c.createdAt, nowMs, language).relative}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="sticky bottom-0 flex items-center gap-2 border-t border-hp-ink/10 bg-hp-paper/90 p-3 backdrop-blur-xl">
              <div className="min-w-0 flex-1">
                <AddToTripButton kind="place" id={place.id} name={place.name} />
              </div>
              <button
                type="button"
                onClick={() => onToggleVisited(place.id)}
                aria-pressed={visited}
                className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold ${visited ? "bg-hp-sunset/12 text-hp-sunset" : "bg-hp-ink/5 text-hp-ink"}`}
              >
                <Check size={15} strokeWidth={visited ? 3 : 2.4} />
                {t("I've been here")}
              </button>
              <a
                href={openStreetMapUrl(place)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("Open {place} in OpenStreetMap", { place: place.name })}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-hp-ink/5 text-hp-ink"
              >
                <ExternalLink size={15} />
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
const PLACE_TYPE_LABEL: Record<Place["type"], string> = {
  beach: "Beach",
  culture: "Culture",
  nature: "Nature",
  food: "Food",
  local: "Local spot",
  village: "Village",
  night: "Night",
  sunset: "Sunset",
};

/** Swipeable hero: the place's own photo, owner photos, stories, posts and nearby Commons photos. */
function PlaceGallery({
  items,
  placeName,
  onOpenStory,
}: {
  items: ExploreMedia[];
  placeName: string;
  onOpenStory: () => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const current = items[index];
  const dots = items.slice(0, 12);
  return (
    <div className="pd-gallery">
      <div
        className="pd-gallery__track hp-no-scrollbar"
        onScroll={(event) => {
          const track = event.currentTarget;
          setIndex(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
        }}
        aria-label={t("Photos of {place}", { place: placeName })}
      >
        {items.map((item, itemIndex) => (
          <button
            key={item.id}
            type="button"
            className="pd-gallery__slide"
            onClick={item.kind === "story" ? onOpenStory : undefined}
            tabIndex={item.kind === "story" ? 0 : -1}
            aria-label={
              item.kind === "story"
                ? t("Open stories from {place}", { place: placeName })
                : item.caption || placeName
            }
          >
            <img
              src={itemIndex === 0 ? item.url : thumbnailUrl(item.url, 960)}
              alt={item.caption ?? ""}
              loading={itemIndex < 2 ? "eager" : "lazy"}
              decoding="async"
            />
          </button>
        ))}
      </div>
      <div className="pd-gallery__shade" aria-hidden="true" />
      {current && current.kind !== "place" && (
        <span className="pd-gallery__badge" data-kind={current.kind}>
          {t(
            current.kind === "story"
              ? "Story"
              : current.kind === "post"
                ? "Community photo"
                : current.kind === "business"
                  ? "From the business"
                  : "Nearby photo",
          )}
        </span>
      )}
      {current?.credit && current.kind === "commons" && (
        <a
          className="pd-gallery__credit"
          href={current.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("Photo: {credit}", { credit: current.credit })}
        </a>
      )}
      {dots.length > 1 && (
        <div className="pd-gallery__dots" aria-hidden="true">
          {dots.map((item, dotIndex) => (
            <span
              key={item.id}
              data-active={dotIndex === Math.min(index, dots.length - 1) ? "true" : "false"}
            />
          ))}
        </div>
      )}
    </div>
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
        <b>{postsToday}</b> {t("recent posts")}
      </span>,
    );
  }
  if (eventsTonight > 0) {
    clauses.push(
      <span key="events">
        <CalendarHeart strokeWidth={2.2} />
        <b>{eventsTonight}</b> {t("recent announcements")}
      </span>,
    );
  }
  if (notes > 0) {
    clauses.push(
      <span key="notes">
        <ListChecks strokeWidth={2.2} />
        <b>{notes}</b> {t("recent comments")}
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
              : t("No recent reports")}
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

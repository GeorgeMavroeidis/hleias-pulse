import { useState, type ReactNode } from "react";
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
import { ContentMenu } from "./ContentMenu";
import { useModeration } from "./use-moderation";
import { type PlaceStoryGroup } from "@/lib/hp/place-stories";
import type { PlaceBusinessProfile } from "@/lib/hp/business-types";
import { openStreetMapUrl } from "./pulse-shared";

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
  const moderation = useModeration();
  const placeStories = place
    ? (storyGroups.find((group) => group.placeId === place.id)?.stories ?? [])
    : [];
  // Blocked authors are filtered server-side; muted ones are hidden here.
  const visiblePosts = posts.filter((post) => !moderation.isHidden(post.userId));

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
              <div className="absolute right-3 top-3 flex items-center gap-1.5">
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
                  className="grid h-9 w-9 place-items-center rounded-full bg-hp-paper/95 text-hp-ink"
                  aria-label={t("Close")}
                >
                  <X size={16} />
                </button>
              </div>
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
                  {visiblePosts.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-hp-ink/10 p-4 text-center text-[12px] text-hp-muted">
                      No recent posts here yet. Be first.
                    </div>
                  )}
                  {visiblePosts.map((p) => {
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CalendarHeart,
  Check,
  ChevronRight,
  Map as MapIcon,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SkipForward,
  X,
} from "lucide-react";
import type { Author, Comment, Place, Post } from "@/lib/hp-model";
import { fallbackAuthor } from "@/lib/hp-model";
import { initialsAvatarDataUri } from "@/lib/hp/avatar";
import type { ActivityTick } from "@/lib/hp/activity-data";
import { deriveAreaIntelligenceSnapshot } from "@/lib/hp/area-intelligence";
import { buildPulseActivitySnapshot } from "@/lib/hp/pulse-activity";
import { buildTrafficPreviewScene, TRAFFIC_SCENES } from "@/lib/hp/traffic-preview";
import { buildPlaceStoryGroups, storyPlaceIdSet } from "@/lib/hp/place-stories";
import type { RsvpStatus } from "@/lib/hp/meet-types";
import { useI18n } from "@/lib/i18n";
import { BottomNav } from "./BottomNav";
import { ImageBox } from "./ImageBox";
import { MapBottomSheet } from "./MapBottomSheet";
import { MeetScreen } from "./MeetScreen";
import { PlaceStoryViewer } from "./PlaceStoryViewer";
import { PostDetailModal } from "./PostDetailModal";
import { PulseFeed } from "./PulseFeed";
import { RoutesScreen } from "./RoutesScreen";
import { buildAreaClusters, SocialMap } from "./SocialMap";
import {
  AREA_STATE_LABEL,
  MARKER_ANIMATION_THEMES,
  SIGNAL_QUALITY_LABEL,
  type MarkerAnimationTheme,
  type NavTab,
} from "./pulse-shared";
import "@/styles/traffic-preview.css";

const PLAY_DELAY_MS = 1800;
const LAST_SCENE_INDEX = TRAFFIC_SCENES.length - 1;

function minutesAgo(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((now - time) / 60_000));
}

/** The production ticker assigns stock portraits; the preview uses fictional initials only. */
function buildPreviewTicks(
  posts: Post[],
  meetEvents: ReturnType<typeof buildTrafficPreviewScene>["data"]["meetEvents"],
  stories: ReturnType<typeof buildTrafficPreviewScene>["data"]["stories"],
  places: Map<string, Place>,
  authors: Map<string, Author>,
  now: number,
): ActivityTick[] {
  const postTicks: ActivityTick[] = posts.flatMap((post) => {
    const ago = minutesAgo(post.createdAt, now);
    if (ago === null || ago > 60) return [];
    const author = authors.get(post.authorId) ?? fallbackAuthor;
    return [
      {
        id: `post-${post.id}`,
        who: author.name,
        avatar: initialsAvatarDataUri(author.name),
        verb: post.kind === "tip" ? ("dropped a tip" as const) : ("posted" as const),
        at: places.get(post.placeId)?.name ?? "Ilia",
        placeId: post.placeId,
        minutesAgo: ago,
      },
    ];
  });
  const meetTicks: ActivityTick[] = meetEvents.flatMap((event) => {
    const ago = minutesAgo(event.createdAt, now);
    if (ago === null || ago > 60) return [];
    return [
      {
        id: `meet-${event.id}`,
        who: event.hostName,
        avatar: initialsAvatarDataUri(event.hostName),
        verb: "is going" as const,
        at: places.get(event.placeId)?.name ?? "Ilia",
        placeId: event.placeId,
        minutesAgo: ago,
      },
    ];
  });
  const storyTicks: ActivityTick[] = stories.flatMap((story) => {
    const ago = minutesAgo(story.createdAt, now);
    if (ago === null || ago > 60) return [];
    return [
      {
        id: `story-${story.id}`,
        who: story.authorName,
        avatar: initialsAvatarDataUri(story.authorName),
        verb: "went live" as const,
        at: places.get(story.placeId)?.name ?? "Ilia",
        placeId: story.placeId,
        minutesAgo: ago,
      },
    ];
  });
  return [...postTicks, ...meetTicks, ...storyTicks]
    .sort((a, b) => a.minutesAgo - b.minutesAgo)
    .slice(0, 8);
}

function PreviewPlaceDetails({
  place,
  postCount,
  storyCount,
  comments,
  saved,
  onClose,
  onSave,
  onOpenStory,
  onOpenPost,
}: {
  place: Place;
  postCount: number;
  storyCount: number;
  comments: Comment[];
  saved: boolean;
  onClose: () => void;
  onSave: () => void;
  onOpenStory: () => void;
  onOpenPost: () => void;
}) {
  return (
    <div className="hp-preview-modal" role="presentation">
      <button
        type="button"
        className="hp-preview-modal__scrim"
        onClick={onClose}
        aria-label="Close place details"
      />
      <section
        className="hp-preview-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${place.name} preview details`}
      >
        <div className="relative h-44">
          <ImageBox
            src={place.imageUrl}
            alt={place.name}
            className="h-full w-full"
            rounded="rounded-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close place details"
            className="hp-preview-modal__close"
          >
            <X size={17} />
          </button>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-hp-sunset">
            Simulated place activity
          </p>
          <h2 className="mt-1 text-xl font-black text-hp-ink">{place.name}</h2>
          <p className="mt-1 text-xs text-hp-muted">
            {place.area} · {place.short}
          </p>
          <div className="mt-3 flex gap-2 text-xs font-bold text-hp-ink/70">
            <span className="rounded-full bg-hp-ink/5 px-2.5 py-1">{postCount} posts</span>
            <span className="rounded-full bg-hp-ink/5 px-2.5 py-1">{storyCount} stories</span>
            <span className="rounded-full bg-hp-ink/5 px-2.5 py-1">{comments.length} notes</span>
          </div>
          {comments.length > 0 && (
            <div className="mt-3 space-y-2">
              {comments.slice(0, 3).map((comment, index) => (
                <p
                  key={`${comment.author}-${index}`}
                  className="rounded-xl bg-hp-ink/5 p-2 text-xs text-hp-ink/80"
                >
                  <strong>{comment.author}:</strong> {comment.text}
                </p>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onSave} className="hp-preview-action">
              {saved ? "Saved locally" : "Save locally"}
            </button>
            {storyCount > 0 && (
              <button type="button" onClick={onOpenStory} className="hp-preview-action">
                View stories
              </button>
            )}
            {postCount > 0 && (
              <button type="button" onClick={onOpenPost} className="hp-preview-action">
                View post
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export function TrafficPreview() {
  const { t } = useI18n();
  const [anchor] = useState(() => new Date());
  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [theme, setTheme] = useState<MarkerAnimationTheme>("pulse");
  const [tab, setTab] = useState<NavTab>("map");
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [savedPosts, setSavedPosts] = useState<Record<string, boolean>>({});
  const [savedPlaces, setSavedPlaces] = useState<Record<string, boolean>>({});
  const [rsvp, setRsvp] = useState<Record<string, RsvpStatus>>({});
  const [localComments, setLocalComments] = useState<Record<string, Comment[]>>({});
  const [seenStories, setSeenStories] = useState<Set<string>>(() => new Set());
  const [storyPlaceId, setStoryPlaceId] = useState<string | null>(null);
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [openPlace, setOpenPlace] = useState<Place | null>(null);
  const [mapHeight, setMapHeight] = useState(560);
  const [idlePeek, setIdlePeek] = useState(72);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const scene = TRAFFIC_SCENES[sceneIndex];
  const sceneSnapshot = useMemo(
    () => buildTrafficPreviewScene(scene.id, anchor),
    [scene.id, anchor],
  );
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const full = Math.round(mapHeight * 0.85);
  const areaPreview = Math.min(
    full,
    Math.min(276, Math.max(mapHeight < 460 ? 200 : 248, Math.round(mapHeight * 0.34))),
  );
  const placePreview = Math.min(
    full,
    Math.min(228, Math.max(mapHeight < 460 ? 184 : 210, Math.round(mapHeight * 0.28))),
  );
  const peek = selectedAreaId ? 44 : idlePeek;
  const half = selectedAreaId ? (selectedPlaceId ? placePreview : areaPreview) : idlePeek;
  const [sheetHeight, setSheetHeight] = useState(72);

  useEffect(() => {
    if (!playing || sceneIndex >= LAST_SCENE_INDEX) return;
    const timer = window.setTimeout(
      () => setSceneIndex((index) => Math.min(index + 1, LAST_SCENE_INDEX)),
      PLAY_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, sceneIndex]);

  useEffect(() => {
    setSelectedAreaId(null);
    setSelectedPlaceId(null);
    setSheetHeight(72);
    setStoryPlaceId(null);
    setOpenPost(null);
    setOpenPlace(null);
  }, [sceneIndex]);

  useEffect(() => {
    if (!selectedAreaId) setSheetHeight(idlePeek);
  }, [selectedAreaId, idlePeek, sceneIndex]);

  useEffect(() => {
    if (tab !== "map") return;
    const stage = mapStageRef.current;
    if (!stage) return;
    const update = () => {
      const next = stage.getBoundingClientRect().height;
      if (next > 120) setMapHeight(next);
    };
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    update();
    return () => observer.disconnect();
  }, [tab]);

  const data = useMemo(() => {
    if (Object.keys(localComments).length === 0) return sceneSnapshot.data;
    return {
      ...sceneSnapshot.data,
      posts: sceneSnapshot.data.posts.map((post) => ({
        ...post,
        comments: [...post.comments, ...(localComments[post.id] ?? [])],
      })),
    };
  }, [sceneSnapshot.data, localComments]);
  const activitySnapshot = useMemo(
    () =>
      data === sceneSnapshot.data
        ? sceneSnapshot.activitySnapshot
        : buildPulseActivitySnapshot(data),
    [data, sceneSnapshot],
  );
  const areaIntelligence = useMemo(
    () =>
      data === sceneSnapshot.data
        ? sceneSnapshot.areaIntelligence
        : deriveAreaIntelligenceSnapshot(data, anchor),
    [data, sceneSnapshot, anchor],
  );
  const placeById = useMemo(
    () => new Map(data.places.map((place) => [place.id, place])),
    [data.places],
  );
  const authorById = useMemo(
    () => new Map(data.authors.map((author) => [author.id, author])),
    [data.authors],
  );
  const findPlace = useCallback((id: string) => placeById.get(id), [placeById]);
  const findAuthor = useCallback(
    (id: string) => authorById.get(id) ?? fallbackAuthor,
    [authorById],
  );
  const findPostAuthor = useCallback((post: Post) => findAuthor(post.authorId), [findAuthor]);
  const clusters = useMemo(
    () => buildAreaClusters(data.places, data.events, activitySnapshot, areaIntelligence),
    [data.places, data.events, activitySnapshot, areaIntelligence],
  );
  const storyGroups = useMemo(
    () => buildPlaceStoryGroups(data.places, seenStories, data.stories),
    [data.places, data.stories, seenStories],
  );
  const storyPlaceIds = useMemo(() => storyPlaceIdSet(storyGroups), [storyGroups]);
  const activityTicks = useMemo(
    () =>
      buildPreviewTicks(
        data.posts,
        data.meetEvents,
        data.stories,
        placeById,
        authorById,
        anchor.getTime(),
      ),
    [data.posts, data.meetEvents, data.stories, placeById, authorById, anchor],
  );
  const focusCluster = clusters.find((cluster) => cluster.id === sceneSnapshot.focusAreaId) ?? null;
  const selectedCluster = clusters.find((cluster) => cluster.id === selectedAreaId) ?? null;
  const selectedPlace = selectedPlaceId ? (findPlace(selectedPlaceId) ?? null) : null;
  const focusPlace = findPlace(sceneSnapshot.focusPlaceId) ?? null;
  const focusArea = areaIntelligence[sceneSnapshot.focusAreaId];
  const focusMetric = activitySnapshot[sceneSnapshot.focusPlaceId];
  const focusedPosts = data.posts.filter((post) => post.placeId === sceneSnapshot.focusPlaceId);
  const trendingPlace =
    focusPlace && focusMetric && (focusMetric.tier === "hot" || focusMetric.tier === "live")
      ? {
          ...focusPlace,
          status: focusMetric.tier === "live" ? ("busy" as const) : ("popular" as const),
          hotness: Math.min(10, focusMetric.score / 10),
          recentPostCount: focusMetric.postCount,
          commentCount: focusMetric.commentCount,
          avatars: data.authors
            .map((author) => author.avatarUrl)
            .filter((url): url is string => Boolean(url)),
        }
      : null;

  const jumpToMap = useCallback(
    (id: string) => {
      const place = findPlace(id);
      if (!place) return;
      const cluster = clusters.find((candidate) => candidate.places.some((item) => item.id === id));
      setTab("map");
      setSelectedAreaId(cluster?.id ?? sceneSnapshot.focusAreaId);
      setSelectedPlaceId(id);
      setSheetHeight(placePreview);
      setOpenPost(null);
      setOpenPlace(null);
      setStoryPlaceId(null);
    },
    [clusters, findPlace, placePreview, sceneSnapshot.focusAreaId],
  );

  const reset = () => {
    setPlaying(false);
    setSceneIndex(0);
    setSelectedAreaId(null);
    setSelectedPlaceId(null);
    setSheetHeight(idlePeek);
    setStoryPlaceId(null);
    setOpenPost(null);
    setOpenPlace(null);
    setLikes({});
    setSavedPosts({});
    setSavedPlaces({});
    setRsvp({});
    setLocalComments({});
    setSeenStories(new Set());
    setTab("map");
  };
  const selectScene = (index: number) => {
    setPlaying(false);
    setSceneIndex(index);
  };
  const currentPost = openPost
    ? (data.posts.find((post) => post.id === openPost.id) ?? null)
    : null;
  const previewPlaying = playing && sceneIndex < LAST_SCENE_INDEX;

  return (
    <main className="hp-traffic-preview" data-preview-scene={scene.id} data-preview-tab={tab}>
      <div className="hp-traffic-preview__layout">
        <div className="hp-traffic-preview__main">
          <header className="hp-traffic-preview__controls">
            <div className="hp-traffic-preview__heading">
              <div>
                <div className="hp-traffic-preview__eyebrow">
                  <span className="hp-traffic-preview__dot" /> Simulated · local only
                </div>
                <h1>Hleias Pulse traffic preview</h1>
                <p>Four fictional contributors. No sign-ins or saved activity.</p>
              </div>
              <div className="hp-traffic-preview__playback" aria-label="Playback controls">
                <button
                  type="button"
                  onClick={() => {
                    if (sceneIndex >= LAST_SCENE_INDEX) setSceneIndex(0);
                    setPlaying(!previewPlaying);
                  }}
                  aria-label={previewPlaying ? "Pause preview" : "Play preview"}
                >
                  {previewPlaying ? (
                    <Pause size={17} fill="currentColor" />
                  ) : (
                    <Play size={17} fill="currentColor" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => selectScene(Math.min(sceneIndex + 1, LAST_SCENE_INDEX))}
                  disabled={sceneIndex >= LAST_SCENE_INDEX}
                  aria-label="Step to next scene"
                >
                  <SkipForward size={17} />
                </button>
                <button type="button" onClick={reset} aria-label="Reset preview">
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>
            <div className="hp-traffic-preview__scene-list" role="group" aria-label="Traffic scene">
              {TRAFFIC_SCENES.map((option, index) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectScene(index)}
                  aria-pressed={sceneIndex === index}
                  className={sceneIndex === index ? "is-active" : ""}
                >
                  <span>{index + 1}</span>
                  {option.label}
                </button>
              ))}
            </div>
            <div className="hp-traffic-preview__control-footer">
              <p>
                <strong>{scene.label}:</strong> {scene.description}
              </p>
              <label>
                Marker motion
                <select
                  value={theme}
                  onChange={(event) => setTheme(event.target.value as MarkerAnimationTheme)}
                  aria-label="Marker animation theme"
                >
                  {MARKER_ANIMATION_THEMES.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </header>

          <div
            className="hp-app-shell hp-traffic-preview__phone"
            data-marker-animation-theme={theme}
          >
            <div className="hp-traffic-preview__phone-topbar">
              <div className="flex items-center gap-2">
                <img
                  src="/brand/ilia-pulse-logo.png"
                  alt=""
                  className="h-8 w-8 rounded-lg object-contain"
                />
                <div className="hp-brand leading-[0.85]">
                  <div className="text-[11px] font-black tracking-[0.04em]">ΗΛΕΙΑ</div>
                  <div className="text-[11px] font-black tracking-[0.18em] text-hp-sunset">
                    PULSE
                  </div>
                </div>
              </div>
              <span className="hp-traffic-preview__phone-badge">Simulated</span>
            </div>
            <div className="hp-traffic-preview__screen">
              {tab === "map" && (
                <div
                  ref={mapStageRef}
                  className="hp-map-stage relative h-full w-full"
                  data-utility-rail-hidden={mapHeight - sheetHeight < 248 ? "true" : "false"}
                >
                  <SocialMap
                    clusters={clusters}
                    events={data.events}
                    activitySnapshot={activitySnapshot}
                    selectedAreaId={selectedAreaId}
                    selectedPlaceId={selectedPlaceId}
                    storyPlaceIds={storyPlaceIds}
                    onSelectArea={(cluster) => {
                      setSelectedAreaId(cluster.id);
                      setSelectedPlaceId(null);
                      setSheetHeight(areaPreview);
                    }}
                    onSelectPlace={(place, cluster) => {
                      setSelectedAreaId(cluster.id);
                      setSelectedPlaceId(place.id);
                      setSheetHeight(placePreview);
                    }}
                    onResetView={() => {
                      setSelectedAreaId(null);
                      setSelectedPlaceId(null);
                      setSheetHeight(idlePeek);
                    }}
                    onClearSelection={() => {
                      setSelectedAreaId(null);
                      setSelectedPlaceId(null);
                      setSheetHeight(idlePeek);
                    }}
                    canGoBack={Boolean(selectedAreaId || selectedPlaceId)}
                    onBack={() => {
                      if (selectedPlaceId) {
                        setSelectedPlaceId(null);
                        setSheetHeight(areaPreview);
                      } else {
                        setSelectedAreaId(null);
                        setSheetHeight(idlePeek);
                      }
                    }}
                    bottomOverlayHeight={sheetHeight}
                    availableMapHeight={Math.max(0, mapHeight - sheetHeight)}
                    previewMode
                  />
                  <MapBottomSheet
                    cluster={selectedCluster}
                    selectedPlace={selectedPlace}
                    events={data.events}
                    storyGroups={storyGroups}
                    onOpenStory={setStoryPlaceId}
                    height={sheetHeight}
                    peek={peek}
                    half={half}
                    full={full}
                    onSetSnap={setSheetHeight}
                    onIdleHeightMeasured={setIdlePeek}
                    onOpenDetails={setOpenPlace}
                    onSavePlace={(id) => setSavedPlaces((old) => ({ ...old, [id]: !old[id] }))}
                    onSharePlace={() => undefined}
                    savedPlaceIds={Object.keys(savedPlaces).filter((id) => savedPlaces[id])}
                    claimedPlaceIds={[]}
                    dealPlaceIds={[]}
                    activeLens={null}
                    searchQuery=""
                    showDiscoveryEmptyState={false}
                    discoverySuggestion={null}
                    onOpenDiscoverySuggestion={() => undefined}
                    onClearLens={() => undefined}
                    onClearSearch={() => undefined}
                    previewMode
                    previewActivitySnapshot={activitySnapshot}
                  />
                </div>
              )}
              {tab === "pulse" && (
                <div className="h-full overflow-y-auto">
                  <PulseFeed
                    posts={data.posts}
                    storyGroups={storyGroups}
                    activityTicks={activityTicks}
                    trendingPlace={trendingPlace}
                    onOpenStory={setStoryPlaceId}
                    likes={likes}
                    postLikes={{}}
                    toggleLike={(id) => setLikes((old) => ({ ...old, [id]: !old[id] }))}
                    savedPosts={savedPosts}
                    toggleSavePost={(id) => setSavedPosts((old) => ({ ...old, [id]: !old[id] }))}
                    commentsByPost={{}}
                    onOpenPost={setOpenPost}
                    onOpenMap={jumpToMap}
                    onShare={() => undefined}
                    onTrendingGoing={() => undefined}
                    findPlace={findPlace}
                    findAuthor={findAuthor}
                    findPostAuthor={findPostAuthor}
                    previewMode
                  />
                </div>
              )}
              {tab === "meet" && (
                <MeetScreen
                  events={data.meetEvents.map((event) => ({
                    ...event,
                    going: event.going + (rsvp[event.id] === "going" ? 1 : 0),
                    maybe: event.maybe + (rsvp[event.id] === "maybe" ? 1 : 0),
                  }))}
                  rsvp={rsvp}
                  findPlace={findPlace}
                  onToggleRsvp={(event, next) =>
                    setRsvp((old) => {
                      const updated = { ...old };
                      if (updated[event.id] === next) delete updated[event.id];
                      else updated[event.id] = next;
                      return updated;
                    })
                  }
                  onOpenPlace={jumpToMap}
                  onCreate={() => undefined}
                  previewMode
                />
              )}
              {tab === "routes" && (
                <div className="h-full overflow-y-auto">
                  <RoutesScreen
                    routes={[]}
                    onOpenRoute={() => undefined}
                    savedRoutes={{}}
                    routeComments={{}}
                    findAuthor={findAuthor}
                    showMustSee={false}
                    places={data.places}
                    onOpenPlace={(place) => jumpToMap(place.id)}
                  />
                </div>
              )}
            </div>
            <BottomNav tab={tab} setTab={setTab} />
            {openPlace && (
              <PreviewPlaceDetails
                place={openPlace}
                postCount={data.posts.filter((post) => post.placeId === openPlace.id).length}
                storyCount={data.stories.filter((story) => story.placeId === openPlace.id).length}
                comments={data.placeComments[openPlace.id] ?? []}
                saved={Boolean(savedPlaces[openPlace.id])}
                onClose={() => setOpenPlace(null)}
                onSave={() =>
                  setSavedPlaces((old) => ({ ...old, [openPlace.id]: !old[openPlace.id] }))
                }
                onOpenStory={() => {
                  setOpenPlace(null);
                  setStoryPlaceId(openPlace.id);
                }}
                onOpenPost={() => {
                  setOpenPlace(null);
                  setOpenPost(data.posts.find((post) => post.placeId === openPlace.id) ?? null);
                }}
              />
            )}
            <PostDetailModal
              post={currentPost}
              onClose={() => setOpenPost(null)}
              onOpenMap={jumpToMap}
              onLike={() =>
                currentPost &&
                setLikes((old) => ({ ...old, [currentPost.id]: !old[currentPost.id] }))
              }
              liked={Boolean(currentPost && likes[currentPost.id])}
              likeCount={currentPost ? currentPost.likes + (likes[currentPost.id] ? 1 : 0) : 0}
              comments={currentPost?.comments ?? []}
              onComment={(text) =>
                currentPost &&
                setLocalComments((old) => ({
                  ...old,
                  [currentPost.id]: [
                    ...(old[currentPost.id] ?? []),
                    { author: "You (preview)", text, createdAt: anchor.toISOString() },
                  ],
                }))
              }
              saved={Boolean(currentPost && savedPosts[currentPost.id])}
              onSave={() =>
                currentPost &&
                setSavedPosts((old) => ({ ...old, [currentPost.id]: !old[currentPost.id] }))
              }
              onShare={() => undefined}
              findPlace={findPlace}
              findAuthor={findAuthor}
              findPostAuthor={findPostAuthor}
              previewMode
            />
            {storyPlaceId && (
              <PlaceStoryViewer
                groups={storyGroups}
                startPlaceId={storyPlaceId}
                markSeen={(ids) => setSeenStories((old) => new Set([...old, ...ids]))}
                onClose={() => setStoryPlaceId(null)}
                onOpenPlace={jumpToMap}
                onOpenPlaceDetails={(id) => {
                  const place = findPlace(id);
                  if (place) setOpenPlace(place);
                }}
                onShare={() => undefined}
                onToggleSave={(id) => setSavedPlaces((old) => ({ ...old, [id]: !old[id] }))}
                savedPlaceIds={Object.keys(savedPlaces).filter((id) => savedPlaces[id])}
                previewMode
              />
            )}
          </div>
        </div>

        <aside className="hp-traffic-preview__inspector" aria-label="Scene metrics">
          <div className="hp-traffic-preview__inspector-head">
            <span className="hp-traffic-preview__eyebrow">
              <Activity size={13} /> Visual after-effect
            </span>
            <h2>{focusCluster?.name ?? "Kourouta"}</h2>
            <p>Same place, new activity at each step.</p>
          </div>
          <div className="hp-traffic-preview__metric-grid">
            <div>
              <span>Map marker</span>
              <strong data-preview-marker-tier={focusCluster?.status}>
                {focusCluster?.status ?? "quiet"}
              </strong>
            </div>
            <div>
              <span>Area state</span>
              <strong data-preview-area-state={focusArea?.state}>
                {focusArea ? t(AREA_STATE_LABEL[focusArea.state]) : "Calm"}
              </strong>
            </div>
            <div>
              <span>Signal</span>
              <strong>{focusArea ? t(SIGNAL_QUALITY_LABEL[focusArea.signalQuality]) : "—"}</strong>
            </div>
            <div>
              <span>Area score</span>
              <strong>{focusArea?.activityScore.toFixed(1) ?? "0.0"}</strong>
            </div>
          </div>
          <div className="hp-traffic-preview__counts">
            <div>
              <Radio size={15} /> Posts <strong>{focusedPosts.length}</strong>
            </div>
            <div>
              <CalendarHeart size={15} /> Meet <strong>{data.meetEvents.length}</strong>
            </div>
            <div>
              <Activity size={15} /> Stories <strong>{data.stories.length}</strong>
            </div>
            <div>
              <ChevronRight size={15} /> Comments{" "}
              <strong>
                {focusedPosts.reduce((sum, post) => sum + post.comments.length, 0) +
                  (data.placeComments[sceneSnapshot.focusPlaceId]?.length ?? 0)}
              </strong>
            </div>
          </div>
          <p className="hp-traffic-preview__note">
            {scene.id === "later"
              ? "After three hours, recent area signals cool while the marker still reflects accumulated posts and Meet activity."
              : "Tap the map marker, Pulse cards, stories, or Meet RSVPs to inspect the simulated state."}
          </p>
          <button
            type="button"
            className="hp-traffic-preview__focus"
            onClick={() => {
              setTab("map");
              setSelectedAreaId(sceneSnapshot.focusAreaId);
              setSelectedPlaceId(null);
              setSheetHeight(areaPreview);
            }}
          >
            <MapIcon size={15} /> Focus area{" "}
            {selectedAreaId === sceneSnapshot.focusAreaId && <Check size={14} />}
          </button>
          <p className="hp-traffic-preview__footnote">
            The preview holds all reactions in memory. Reloading or resetting clears them.
          </p>
        </aside>
      </div>
    </main>
  );
}

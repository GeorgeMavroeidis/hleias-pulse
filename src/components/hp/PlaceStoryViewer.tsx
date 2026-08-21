import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bookmark, Flag, Map as MapIcon, Share2, X } from "lucide-react";
import { ImageBox } from "./ImageBox";
import {
  STORY_AUTHOR_COLOR,
  STORY_AUTHOR_LABEL,
  STORY_KIND_LABEL,
  formatStoryTime,
  storyDurationMs,
  toneStyle,
  type PlaceStory,
  type PlaceStoryGroup,
} from "@/lib/hp/place-stories";

interface Props {
  groups: PlaceStoryGroup[];
  startPlaceId: string;
  startStoryId?: string;
  markSeen: (ids: string[]) => void;
  onClose: () => void;
  onOpenPlace: (placeId: string) => void;
  onOpenPlaceDetails: (placeId: string) => void;
  onShare: (story: PlaceStory, group: PlaceStoryGroup) => void;
  onToggleSave?: (placeId: string) => void;
  savedPlaceIds?: string[];
}

const HOLD_TO_PAUSE_MS = 320;
const TAP_MOVE_THRESHOLD = 8; // px — beyond this, it's a swipe not a tap

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/* ---------- progress bar (self-contained, drives its own rAF) ---------- */
function StoryProgressBar({
  count,
  activeIndex,
  durationMs,
  paused,
  onComplete,
}: {
  count: number;
  activeIndex: number;
  durationMs: number;
  paused: boolean;
  onComplete: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const firedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Reset whenever the active story changes.
  useEffect(() => {
    setProgress(0);
    progressRef.current = 0;
    firedRef.current = false;
  }, [activeIndex]);

  useEffect(() => {
    if (reducedMotion || paused) return;
    let raf = 0;
    const start = performance.now() - progressRef.current * durationMs;
    const tick = (now: number) => {
      const elapsed = now - start;
      const next = clamp(elapsed / durationMs, 0, 1);
      progressRef.current = next;
      setProgress(next);
      if (next >= 1) {
        if (!firedRef.current) {
          firedRef.current = true;
          onCompleteRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeIndex, durationMs, paused, reducedMotion]);

  return (
    <div className="hp-story-progress" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const scale = i < activeIndex ? 1 : i === activeIndex ? (reducedMotion ? 1 : progress) : 0;
        return (
          <div key={i} className="hp-story-progress__bar">
            <div className="hp-story-progress__fill" style={{ transform: `scaleX(${scale})` }} />
          </div>
        );
      })}
    </div>
  );
}

/* ---------- author chip ---------- */
function AuthorChip({ story }: { story: PlaceStory }) {
  const color = STORY_AUTHOR_COLOR[story.authorType];
  return (
    <div className="flex items-center gap-2">
      <img
        src={story.authorAvatarUrl}
        alt=""
        width={30}
        height={30}
        loading="lazy"
        className="h-8 w-8 rounded-full border-2 border-white/85 object-cover"
      />
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-extrabold text-white">{story.authorName}</span>
          <span
            className="rounded px-1 py-[1px] text-[8px] font-black uppercase tracking-wider text-white"
            style={{ background: color }}
          >
            {STORY_AUTHOR_LABEL[story.authorType]}
          </span>
        </div>
        <div className="text-[10px] font-semibold text-white/70">
          {formatStoryTime(story.minutesAgo)} · {STORY_KIND_LABEL[story.kind]}
        </div>
      </div>
    </div>
  );
}

/* ---------- report chips (crowd / parking / condition) ---------- */
function ReportChips({ story }: { story: PlaceStory }) {
  const report = story.report;
  if (!report) return null;
  const chips: { label: string; value: string }[] = [];
  if (report.crowd) chips.push({ label: "Crowd", value: report.crowd });
  if (report.parking) chips.push({ label: "Parking", value: report.parking });
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm"
        >
          {chip.label}: <span className="uppercase">{chip.value}</span>
        </span>
      ))}
      {report.condition?.map((cond) => (
        <span
          key={cond}
          className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-bold capitalize text-white backdrop-blur-sm"
        >
          {cond}
        </span>
      ))}
    </div>
  );
}

/* ---------- end card shown after the last story ---------- */
function EndCard({
  group,
  onReplay,
  onOpenMap,
  onOpenDetails,
}: {
  group: PlaceStoryGroup;
  onReplay: () => void;
  onOpenMap: () => void;
  onOpenDetails: () => void;
}) {
  const tone = toneStyle(group.tone);
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="h-20 w-20 rounded-full p-[3px]" style={{ background: tone.gradient }}>
        <div className="grid h-full w-full place-items-center rounded-full bg-[#0b0a09]">
          <MapIcon size={26} style={{ color: tone.accent }} />
        </div>
      </div>
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-white/55">
          That's everything from
        </p>
        <h3 className="mt-1 text-2xl font-black text-white">{group.placeName}</h3>
        <p className="text-[12px] text-white/60">{group.area}</p>
      </div>
      <div className="flex w-full max-w-[260px] flex-col gap-2">
        <button
          type="button"
          onClick={onOpenMap}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-white shadow-lg"
        >
          <MapIcon size={15} /> Open {group.placeName} on map
        </button>
        <button
          type="button"
          onClick={onOpenDetails}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 py-3 text-[13px] font-bold text-white"
        >
          See place details
        </button>
        <button
          type="button"
          onClick={onReplay}
          className="mt-1 text-[12px] font-semibold text-white/60 underline-offset-4 hover:underline"
        >
          Replay stories
        </button>
      </div>
    </div>
  );
}

/* ---------- main viewer ---------- */
export function PlaceStoryViewer({
  groups,
  startPlaceId,
  startStoryId,
  markSeen,
  onClose,
  onOpenPlace,
  onOpenPlaceDetails,
  onShare,
  onToggleSave,
  savedPlaceIds = [],
}: Props) {
  const reducedMotion = useReducedMotion();
  const [viewerGroups] = useState(() => groups);
  const initialGroup = useMemo(() => {
    const idx = Math.max(
      0,
      viewerGroups.findIndex((g) => g.placeId === startPlaceId),
    );
    return idx;
  }, [viewerGroups, startPlaceId]);

  const [groupIndex, setGroupIndex] = useState(initialGroup);
  const [storyIndex, setStoryIndex] = useState(() => {
    const group = viewerGroups[initialGroup];
    if (!group) return 0;
    const idx = startStoryId ? group.stories.findIndex((s) => s.id === startStoryId) : -1;
    return idx >= 0 ? idx : 0;
  });
  const [atEnd, setAtEnd] = useState(false);
  const [paused, setPaused] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [transitionDirection, setTransitionDirection] = useState(1);

  const group = viewerGroups[groupIndex];
  const story = group?.stories[storyIndex];

  // Keep index bounds safe even if the viewer opens with stale or empty story data.
  useEffect(() => {
    if (groupIndex >= viewerGroups.length) {
      if (viewerGroups.length === 0) {
        onClose();
        return;
      }
      setGroupIndex(viewerGroups.length - 1);
      setStoryIndex(0);
    }
  }, [groupIndex, onClose, viewerGroups.length]);

  // Mark the active story seen.
  useEffect(() => {
    if (story) markSeen([story.id]);
  }, [story, markSeen]);

  const goToGroup = useCallback(
    (nextGroupIndex: number, storyPos: number, direction: number) => {
      if (nextGroupIndex < 0 || nextGroupIndex >= viewerGroups.length) return;
      setTransitionDirection(direction);
      setGroupIndex(nextGroupIndex);
      setStoryIndex(
        clamp(storyPos, 0, Math.max(0, viewerGroups[nextGroupIndex].stories.length - 1)),
      );
      setAtEnd(false);
    },
    [viewerGroups],
  );

  const next = useCallback(() => {
    if (!group) return;
    if (storyIndex < group.stories.length - 1) {
      setTransitionDirection(1);
      setStoryIndex((i) => i + 1);
      return;
    }
    if (groupIndex < viewerGroups.length - 1) {
      goToGroup(groupIndex + 1, 0, 1);
      return;
    }
    setAtEnd(true);
  }, [group, groupIndex, storyIndex, goToGroup, viewerGroups.length]);

  const prev = useCallback(() => {
    if (storyIndex > 0) {
      setTransitionDirection(-1);
      setStoryIndex((i) => i - 1);
      return;
    }
    if (groupIndex > 0) {
      const prevGroup = viewerGroups[groupIndex - 1];
      goToGroup(groupIndex - 1, prevGroup.stories.length - 1, -1);
    }
  }, [groupIndex, storyIndex, goToGroup, viewerGroups]);

  const nextGroup = useCallback(() => {
    if (groupIndex < viewerGroups.length - 1) goToGroup(groupIndex + 1, 0, 1);
  }, [groupIndex, goToGroup, viewerGroups.length]);

  const prevGroup = useCallback(() => {
    if (groupIndex > 0) {
      const prevG = viewerGroups[groupIndex - 1];
      goToGroup(groupIndex - 1, prevG.stories.length - 1, -1);
    }
  }, [groupIndex, goToGroup, viewerGroups]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          next();
          break;
        case "ArrowLeft":
          event.preventDefault();
          prev();
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        case " ":
          event.preventDefault();
          setPaused((p) => !p);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  // Lock background scroll while open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // ---- pointer gestures: tap (left/right) + swipe (down=close, sideways=group) ----
  const pointerState = useRef<{
    id: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastAt: number;
    velocityY: number;
    velocityX: number;
    axis: "x" | "y" | null;
    moved: boolean;
    holding: number | null;
  } | null>(null);

  const clearHold = (state: typeof pointerState.current) => {
    if (state?.holding) {
      window.clearTimeout(state.holding);
      state.holding = null;
      setPaused(false);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pointerState.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastAt: event.timeStamp,
      velocityY: 0,
      velocityX: 0,
      axis: null,
      moved: false,
      holding: window.setTimeout(() => setPaused(true), HOLD_TO_PAUSE_MS),
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture can fail on synthetic events */
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = pointerState.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (Math.abs(dx) > TAP_MOVE_THRESHOLD || Math.abs(dy) > TAP_MOVE_THRESHOLD) {
      state.moved = true;
      clearHold(state);
    }
    if (!state.axis) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      state.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    const elapsed = Math.max(event.timeStamp - state.lastAt, 16);
    state.velocityX = ((event.clientX - state.lastX) / elapsed) * 1000;
    state.velocityY = ((event.clientY - state.lastY) / elapsed) * 1000;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.lastAt = event.timeStamp;

    if (state.axis === "y") {
      setDrag({ x: 0, y: Math.max(0, dy) });
    } else {
      setDrag({ x: dx, y: 0 });
    }
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = pointerState.current;
    if (!state || state.id !== event.pointerId) return;
    pointerState.current = null;
    clearHold(state);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* already released */
    }
    setDrag(null);

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    // Tap (no meaningful movement): navigate by horizontal side.
    if (!state.moved) {
      const width = event.currentTarget.clientWidth || 1;
      const relX = state.startX - event.currentTarget.getBoundingClientRect().left;
      if (relX < width * 0.32) prev();
      else next();
      return;
    }

    if (state.axis === "y") {
      if (dy > 92 || state.velocityY > 650) {
        onClose();
      }
      return;
    }
    if (state.axis === "x") {
      if (dx < -56 || state.velocityX < -550) nextGroup();
      else if (dx > 56 || state.velocityX > 550) prevGroup();
    }
  };

  if (!group || !story) {
    return null;
  }

  const tone = toneStyle(group.tone);
  const saved = savedPlaceIds.includes(group.placeId);
  const dragOpacity = drag?.y ? clamp(1 - drag.y / 320, 0.25, 1) : 1;

  return (
    <AnimatePresence>
      <motion.div
        key="story-viewer"
        className="hp-story-viewer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        role="dialog"
        aria-modal="true"
        aria-label={`Stories from ${group.placeName}`}
      >
        <div className="hp-story-stage">
          <motion.div
            className="hp-story-frame"
            animate={{
              x: drag?.x ?? 0,
              y: drag?.y ?? 0,
              opacity: dragOpacity,
            }}
            transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
          >
            {/* media */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${group.placeId}-${story.id}`}
                className="absolute inset-0"
                initial={{
                  opacity: 0,
                  x: reducedMotion ? 0 : transitionDirection * 28,
                  scale: reducedMotion ? 1 : 1.018,
                  filter: reducedMotion ? "none" : "blur(2px)",
                }}
                animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
                exit={{
                  opacity: 0,
                  x: reducedMotion ? 0 : transitionDirection * -22,
                  scale: reducedMotion ? 1 : 0.992,
                  filter: reducedMotion ? "none" : "blur(1px)",
                }}
                transition={{ duration: reducedMotion ? 0.12 : 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <ImageBox
                  src={story.mediaUrl}
                  alt={`${group.placeName} — ${STORY_KIND_LABEL[story.kind]}`}
                  className="absolute inset-0 h-full w-full"
                  rounded="rounded-none"
                  gradientFallback={tone.gradient}
                />
              </motion.div>
            </AnimatePresence>

            <div className="hp-story-scrim-top" />
            <div className="hp-story-scrim-bottom" />

            {/* progress */}
            <StoryProgressBar
              count={group.stories.length}
              activeIndex={storyIndex}
              durationMs={storyDurationMs(story.kind)}
              paused={paused || atEnd}
              onComplete={next}
            />

            {/* header */}
            <div className="absolute inset-x-0 top-0 z-[7] flex items-center justify-between px-3 pb-6 pt-[calc(env(safe-area-inset-top,0px)+2.4rem)]">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: tone.accent }}
                  />
                  <span className="truncate text-[15px] font-black text-white">
                    {group.placeName}
                  </span>
                </div>
                <div className="text-[10px] font-semibold text-white/65">{group.area}</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close stories"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm"
              >
                <X size={17} />
              </button>
            </div>

            {/* tap + swipe capture layer (sits below footer/header so controls stay tappable) */}
            {!atEnd && (
              <div
                className="hp-story-touch-layer absolute inset-x-0 z-[5]"
                style={{ top: "5.5rem", bottom: "11.5rem" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={finishPointer}
                onPointerCancel={finishPointer}
              />
            )}

            {/* footer: author, caption, actions */}
            {!atEnd && (
              <div className="absolute inset-x-0 bottom-0 z-[7] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10">
                <div className="mb-3">
                  <AuthorChip story={story} />
                </div>
                {story.caption && (
                  <p className="mb-2.5 text-[14px] font-medium leading-snug text-white">
                    {story.caption}
                  </p>
                )}
                <ReportChips story={story} />

                {/* action row */}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPlace(group.placeId);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-white py-2.5 text-[12px] font-extrabold text-hp-ink"
                  >
                    <MapIcon size={14} /> Map
                  </button>
                  {onToggleSave && (
                    <button
                      type="button"
                      onClick={() => onToggleSave(group.placeId)}
                      aria-label={saved ? "Unsave place" : "Save place"}
                      className={`grid h-10 w-10 place-items-center rounded-full border backdrop-blur-sm ${
                        saved
                          ? "border-hp-sunset bg-hp-sunset/20 text-hp-sunset"
                          : "border-white/30 text-white"
                      }`}
                    >
                      <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onShare(story, group)}
                    aria-label="Share story"
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/30 text-white backdrop-blur-sm"
                  >
                    <Share2 size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="Report story"
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/30 text-white backdrop-blur-sm"
                  >
                    <Flag size={15} />
                  </button>
                </div>
                <p className="mt-2 text-center text-[9px] font-medium text-white/40">
                  Tap sides to move · swipe down to close · hold to pause
                </p>
              </div>
            )}

            {atEnd && (
              <EndCard
                group={group}
                onReplay={() => {
                  setAtEnd(false);
                  goToGroup(0, 0, -1);
                }}
                onOpenMap={() => {
                  onClose();
                  onOpenPlace(group.placeId);
                }}
                onOpenDetails={() => {
                  onClose();
                  onOpenPlaceDetails(group.placeId);
                }}
              />
            )}
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

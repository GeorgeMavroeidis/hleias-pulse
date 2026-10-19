/** One clock and one set of strict evidence boundaries for every live surface. */
export const FRESHNESS_LIMITS = {
  currentMs: 60 * 60_000,
  recentMs: 3 * 60 * 60_000,
  historicalMs: 6 * 60 * 60_000,
  futureToleranceMs: 5 * 60_000,
} as const;

export type Clock = { nowMs: () => number };
export const systemClock: Clock = { nowMs: () => Date.now() };
export const fixedClock = (nowMs: number): Clock => ({ nowMs: () => nowMs });
export type EvidenceTime = string | number | Date | null | undefined;
export type FreshnessState = "unknown" | "current" | "recent" | "historical" | "stale" | "expired";
export type Freshness = {
  state: FreshnessState;
  observedAtMs: number | null;
  ageMs: number | null;
  currentUntilMs: number | null;
  recentUntilMs: number | null;
  expiresAtMs: number | null;
  isCurrent: boolean;
  isRecent: boolean;
};

export function timestampMs(value: EvidenceTime): number | null {
  const timestamp =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Date.parse(value)
          : Number.NaN;
  return Number.isFinite(timestamp) && Math.abs(timestamp) <= 8.64e15 ? timestamp : null;
}

export function evaluateFreshness({
  observedAt,
  expiresAt,
  nowMs,
}: {
  observedAt: EvidenceTime;
  expiresAt?: EvidenceTime;
  nowMs: number;
}): Freshness {
  const observation = timestampMs(observedAt);
  const expiry = expiresAt == null ? null : timestampMs(expiresAt);
  if (
    timestampMs(nowMs) === null ||
    observation === null ||
    observation > nowMs + FRESHNESS_LIMITS.futureToleranceMs ||
    (expiresAt != null && (expiry === null || expiry < observation))
  ) {
    return {
      state: "unknown",
      observedAtMs: null,
      ageMs: null,
      currentUntilMs: null,
      recentUntilMs: null,
      expiresAtMs: null,
      isCurrent: false,
      isRecent: false,
    };
  }
  const ageMs = Math.max(0, nowMs - observation);
  const currentUntilMs = Math.min(observation + FRESHNESS_LIMITS.currentMs, expiry ?? Infinity);
  const recentUntilMs = Math.min(observation + FRESHNESS_LIMITS.recentMs, expiry ?? Infinity);
  const isCurrent = nowMs < currentUntilMs;
  const isRecent = nowMs < recentUntilMs;
  const state: FreshnessState =
    expiry !== null && nowMs >= expiry
      ? "expired"
      : isCurrent
        ? "current"
        : isRecent
          ? "recent"
          : ageMs < FRESHNESS_LIMITS.historicalMs
            ? "historical"
            : "stale";
  return {
    state,
    observedAtMs: observation,
    ageMs,
    currentUntilMs,
    recentUntilMs,
    expiresAtMs: expiry,
    isCurrent,
    isRecent,
  };
}

// These IDs were repeatedly re-dated by refresh_generic_stories(). Their stored
// created_at is a fetch side effect, not an observation, even after the RPC stops.
export const RECYCLED_STORY_IDS: ReadonlySet<string> = new Set([
  "story-kourouta",
  "story-kourouta-sunbeds",
  "story-katakolo",
  "story-olympia",
  "story-foloi",
  "story-kyllini",
  "story-zacharo",
  "story-andritsaina",
  "story-kakovatos",
  "story-kaiafas",
  "story-chlemoutsi",
]);

export function storyObservedAt(story: { id: string; createdAt?: string | null }) {
  return RECYCLED_STORY_IDS.has(story.id) ? null : (story.createdAt ?? null);
}

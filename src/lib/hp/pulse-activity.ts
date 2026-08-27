import type { Place, PlaceStatus } from "@/lib/hp-model";
import type { PulseData } from "@/lib/hp-api";

export type PulseTier = "quiet" | "moving" | "hot" | "live";

export type PlacePulseMetric = {
  hotness: number;
  postCount: number;
  eventCount: number;
  commentCount: number;
  score: number;
  tier: PulseTier;
};

export type PulseActivitySnapshot = Record<string, PlacePulseMetric>;

const TIER_RANK: Record<PulseTier, number> = {
  quiet: 0,
  moving: 1,
  hot: 2,
  live: 3,
};

const STATUS_FLOOR: Record<PlaceStatus, PulseTier> = {
  quiet: "quiet",
  active: "moving",
  popular: "hot",
  busy: "live",
};

export function scorePulseActivity(
  hotness: number,
  postCount: number,
  eventCount: number,
  commentCount: number,
) {
  return hotness * 10 + postCount * 1.8 + eventCount * 14 + commentCount * 0.45;
}

function tierFromScore(score: number): PulseTier {
  if (score >= 105) return "live";
  if (score >= 82) return "hot";
  if (score >= 55) return "moving";
  return "quiet";
}

function strongestTier(first: PulseTier, second: PulseTier) {
  return TIER_RANK[first] >= TIER_RANK[second] ? first : second;
}

export function pulseTierForMetric(score: number, statuses: PlaceStatus[] = []): PulseTier {
  return statuses.reduce(
    (tier, status) => strongestTier(tier, STATUS_FLOOR[status]),
    tierFromScore(score),
  );
}

export function fallbackPulseMetric(place: Place, eventCount = 0): PlacePulseMetric {
  const score = scorePulseActivity(
    place.hotness,
    place.recentPostCount,
    eventCount,
    place.commentCount,
  );
  return {
    hotness: place.hotness,
    postCount: place.recentPostCount,
    eventCount,
    commentCount: place.commentCount,
    score,
    tier: pulseTierForMetric(score, [place.status]),
  };
}

export function pulseMetricForPlace(
  place: Place,
  snapshot: PulseActivitySnapshot,
  fallbackEventCount = 0,
) {
  return snapshot[place.id] ?? fallbackPulseMetric(place, fallbackEventCount);
}

export function aggregatePulseMetrics(
  places: Place[],
  snapshot: PulseActivitySnapshot,
  fallbackEventCounts: ReadonlyMap<string, number> = new Map(),
): PlacePulseMetric {
  if (places.length === 0) {
    return {
      hotness: 0,
      postCount: 0,
      eventCount: 0,
      commentCount: 0,
      score: 0,
      tier: "quiet",
    };
  }

  const metrics = places.map((place) =>
    pulseMetricForPlace(place, snapshot, fallbackEventCounts.get(place.id) ?? 0),
  );
  const hotness = Math.max(
    ...metrics.map((metric) => metric.hotness),
    metrics.reduce((sum, metric) => sum + metric.hotness, 0) / metrics.length,
  );
  const postCount = metrics.reduce((sum, metric) => sum + metric.postCount, 0);
  const eventCount = metrics.reduce((sum, metric) => sum + metric.eventCount, 0);
  const commentCount = metrics.reduce((sum, metric) => sum + metric.commentCount, 0);
  const score = scorePulseActivity(hotness, postCount, eventCount, commentCount);

  return {
    hotness,
    postCount,
    eventCount,
    commentCount,
    score,
    tier: pulseTierForMetric(
      score,
      places.map((place) => place.status),
    ),
  };
}

export function buildPulseActivitySnapshot(data: PulseData): PulseActivitySnapshot {
  const postCounts = new Map<string, number>();
  const commentCounts = new Map<string, number>();
  const eventCounts = new Map<string, number>();

  data.posts.forEach((post) => {
    postCounts.set(post.placeId, (postCounts.get(post.placeId) ?? 0) + 1);
    commentCounts.set(post.placeId, (commentCounts.get(post.placeId) ?? 0) + post.comments.length);
  });

  Object.entries(data.placeComments).forEach(([placeId, comments]) => {
    commentCounts.set(placeId, (commentCounts.get(placeId) ?? 0) + comments.length);
  });

  data.events.forEach((event) => {
    eventCounts.set(event.placeId, (eventCounts.get(event.placeId) ?? 0) + 1);
  });
  data.meetEvents.forEach((event) => {
    eventCounts.set(event.placeId, (eventCounts.get(event.placeId) ?? 0) + 1);
  });

  return Object.fromEntries(
    data.places.map((place) => {
      const postCount = Math.max(place.recentPostCount, postCounts.get(place.id) ?? 0);
      const commentCount = Math.max(place.commentCount, commentCounts.get(place.id) ?? 0);
      const eventCount = eventCounts.get(place.id) ?? 0;
      const score = scorePulseActivity(place.hotness, postCount, eventCount, commentCount);
      return [
        place.id,
        {
          hotness: place.hotness,
          postCount,
          eventCount,
          commentCount,
          score,
          tier: pulseTierForMetric(score, [place.status]),
        },
      ];
    }),
  );
}

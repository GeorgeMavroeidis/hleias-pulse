import type { PulseData } from "@/lib/hp-api";
import type { Place, PlaceType } from "@/lib/hp-model";
import { groupPlacesByArea } from "@/lib/hp/area-catalog";
import {
  AREA_INTELLIGENCE_CONFIG,
  type AreaIntelligence,
  type AreaIntelligenceSnapshot,
  type AreaState,
  type SignalQuality,
} from "@/lib/hp/area-intelligence";
import type { MeetCategory } from "@/lib/hp/meet-types";

export const DISCOVERY_LENSES = ["chill", "social", "music", "beach", "food"] as const;
export type DiscoveryLens = (typeof DISCOVERY_LENSES)[number];
export type DiscoveryProminenceBand = "low" | "medium" | "high";
export type DiscoveryRecommendationReason = "emerging" | "rising" | "hot" | "active";

export type DiscoveryProfile = {
  lensRelevance: Record<DiscoveryLens, number>;
};

export type DiscoverySnapshot = {
  places: Record<string, DiscoveryProfile>;
  areas: Record<string, DiscoveryProfile>;
};

export type MarkerProminence = {
  score: number;
  band: DiscoveryProminenceBand;
  opacityFactor: number;
  scaleFactor: number;
  zIndexBoost: number;
};

export type DiscoveryAreaCandidate = {
  areaId: string;
  lat: number;
  lng: number;
  intelligence: AreaIntelligence | null;
};

export type DiscoveryRecommendation = {
  areaId: string;
  score: number;
  distanceKm: number;
  reason: DiscoveryRecommendationReason;
};

type LensRule = {
  placeTypes: Partial<Record<PlaceType, number>>;
  tags: Record<string, number>;
  meetCategories: Partial<Record<MeetCategory, number>>;
  conflictingTags?: Record<string, number>;
  stateAffinity: Record<AreaState, number>;
};

export type DiscoveryConfig = {
  contentFreshMs: number;
  maximumContentBoost: number;
  additionalMatchBoost: number;
  maximumMatchBoost: number;
  areaStrongestShare: number;
  semanticProminenceShare: number;
  stateProminenceShare: number;
  emergingProminenceShare: number;
  qualityFactor: Record<SignalQuality, number>;
  prominence: {
    lowOpacity: number;
    selectedContextOpacity: number;
    lowScale: number;
    highScale: number;
    denseLowScale: number;
    denseHighScale: number;
    lowBandMaximum: number;
    highBandMinimum: number;
    zIndexRange: number;
  };
  recommendation: {
    maximumDistanceKm: number;
    distanceDecayKm: number;
    minimumLensRelevance: number;
    minimumScore: number;
    weights: {
      distance: number;
      state: number;
      lens: number;
      momentum: number;
      quality: number;
      recency: number;
    };
    stateOpportunity: Partial<Record<AreaState, number>>;
    qualityOpportunity: Record<SignalQuality, number>;
  };
  lenses: Record<DiscoveryLens, LensRule>;
};

const HOUR = 60 * 60_000;

export const DISCOVERY_CONFIG: DiscoveryConfig = {
  contentFreshMs: 6 * HOUR,
  maximumContentBoost: 0.85,
  additionalMatchBoost: 0.04,
  maximumMatchBoost: 0.15,
  areaStrongestShare: 0.7,
  semanticProminenceShare: 0.78,
  stateProminenceShare: 0.14,
  emergingProminenceShare: 0.08,
  qualityFactor: {
    confirmed: 1,
    stable: 0.85,
    fading: 0.55,
    uncertain: 0.35,
  },
  prominence: {
    lowOpacity: 0.62,
    selectedContextOpacity: 0.76,
    lowScale: 0.95,
    highScale: 1.03,
    denseLowScale: 0.98,
    denseHighScale: 1.02,
    lowBandMaximum: 0.35,
    highBandMinimum: 0.7,
    zIndexRange: 120,
  },
  recommendation: {
    maximumDistanceKm: 60,
    distanceDecayKm: 18,
    minimumLensRelevance: 0.35,
    minimumScore: 0.48,
    weights: {
      distance: 0.28,
      state: 0.22,
      lens: 0.25,
      momentum: 0.1,
      quality: 0.08,
      recency: 0.07,
    },
    stateOpportunity: {
      hot: 1,
      rising: 0.9,
      active: 0.75,
    },
    qualityOpportunity: {
      confirmed: 1,
      stable: 0.8,
      fading: 0.35,
      uncertain: 0,
    },
  },
  lenses: {
    chill: {
      placeTypes: { nature: 0.9, sunset: 0.88, beach: 0.75, village: 0.55 },
      tags: {
        quiet: 1,
        calm: 1,
        chill: 1,
        slow: 0.9,
        spa: 0.8,
        shade: 0.72,
        sunset: 0.68,
        walk: 0.58,
        family: 0.5,
      },
      meetCategories: { sunset: 0.72, beach: 0.58, cleanup: 0.5 },
      conflictingTags: { party: 0.35, dj: 0.4, after: 0.3, bars: 0.25, night: 0.2 },
      stateAffinity: { calm: 1, rising: 0.65, active: 0.85, hot: 0.45, cooling: 0.8 },
    },
    social: {
      placeTypes: { night: 0.9, local: 0.82, food: 0.75, village: 0.7 },
      tags: {
        party: 1,
        panigyri: 1,
        local: 0.82,
        beer: 0.8,
        pregame: 0.8,
        after: 0.78,
        bars: 0.75,
        drinks: 0.7,
        coffee: 0.58,
      },
      meetCategories: { social: 1, panigyri: 1, food: 0.78, music: 0.75 },
      stateAffinity: { calm: 0.35, rising: 0.9, active: 0.85, hot: 1, cooling: 0.45 },
    },
    music: {
      placeTypes: { night: 1, local: 0.5, beach: 0.4 },
      tags: {
        music: 1,
        dj: 1,
        live: 1,
        party: 0.85,
        panigyri: 0.82,
        night: 0.8,
        after: 0.68,
      },
      meetCategories: { music: 1, panigyri: 0.82 },
      conflictingTags: { quiet: 0.2 },
      stateAffinity: { calm: 0.2, rising: 0.95, active: 0.85, hot: 1, cooling: 0.35 },
    },
    beach: {
      placeTypes: { beach: 1, sunset: 0.78 },
      tags: {
        beach: 1,
        coast: 0.9,
        sea: 0.88,
        swim: 0.86,
        sunset: 0.62,
        port: 0.45,
      },
      meetCategories: { beach: 1, sunset: 0.72, cleanup: 0.55 },
      stateAffinity: { calm: 0.7, rising: 0.8, active: 0.9, hot: 1, cooling: 0.6 },
    },
    food: {
      placeTypes: { food: 1, local: 0.62, village: 0.55 },
      tags: {
        food: 1,
        seafood: 1,
        coffee: 0.78,
        wine: 0.76,
        drinks: 0.58,
        beer: 0.52,
        local: 0.38,
      },
      meetCategories: { food: 1, panigyri: 0.55, social: 0.45 },
      stateAffinity: { calm: 0.55, rising: 0.8, active: 0.9, hot: 1, cooling: 0.5 },
    },
  },
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number, digits = 3) => {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
};
const smoothstep = (start: number, end: number, value: number) => {
  const progress = clamp01((value - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
};

function normalizedTokens(values: string[]) {
  return values.flatMap((value) =>
    value
      .toLowerCase()
      .split(/[\s,/·-]+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

function combinedMatchScore(scores: number[], config: DiscoveryConfig) {
  const positive = scores.filter((score) => score > 0).sort((a, b) => b - a);
  if (positive.length === 0) return 0;
  return clamp01(
    positive[0] +
      Math.min(config.maximumMatchBoost, (positive.length - 1) * config.additionalMatchBoost),
  );
}

function tokenScore(tokens: string[], rule: LensRule, config: DiscoveryConfig) {
  const score = combinedMatchScore(
    tokens.map((token) => rule.tags[token] ?? 0),
    config,
  );
  const penalty = Math.max(0, ...tokens.map((token) => rule.conflictingTags?.[token] ?? 0));
  return clamp01(score * (1 - penalty));
}

function timestampFreshness(
  value: string | null | undefined,
  now: number,
  config: DiscoveryConfig,
) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60_000) return 0;
  return clamp01(1 - Math.max(0, now - timestamp) / config.contentFreshMs);
}

function derivePlaceLensRelevance(
  place: Place,
  content: {
    posts: PulseData["posts"];
    events: PulseData["events"];
    meetEvents: PulseData["meetEvents"];
  },
  lens: DiscoveryLens,
  now: number,
  config: DiscoveryConfig,
) {
  const rule = config.lenses[lens];
  const placeTokens = normalizedTokens(place.tags);
  const staticScore = combinedMatchScore(
    [rule.placeTypes[place.type] ?? 0, tokenScore(placeTokens, rule, config)],
    config,
  );

  const contentScores: number[] = [];
  content.posts.forEach((post) => {
    contentScores.push(
      tokenScore(normalizedTokens(post.tags), rule, config) *
        timestampFreshness(post.createdAt, now, config),
    );
  });
  content.events.forEach((event) => {
    contentScores.push(
      tokenScore(normalizedTokens([...event.tags, event.vibe]), rule, config) *
        timestampFreshness(event.createdAt, now, config),
    );
  });
  content.meetEvents.forEach((event) => {
    const semanticScore = combinedMatchScore(
      [
        rule.meetCategories[event.category] ?? 0,
        tokenScore(normalizedTokens([...event.tags, event.vibe]), rule, config),
      ],
      config,
    );
    contentScores.push(semanticScore * timestampFreshness(event.createdAt, now, config));
  });

  const contentScore = Math.max(0, ...contentScores);
  const multiSourceBoost = staticScore > 0 && contentScore > 0 ? 0.08 : 0;
  return round(
    clamp01(Math.max(staticScore, contentScore * config.maximumContentBoost) + multiSourceBoost),
  );
}

function emptyLensRelevance(): Record<DiscoveryLens, number> {
  return { chill: 0, social: 0, music: 0, beach: 0, food: 0 };
}

export function aggregateDiscoveryProfiles(
  profiles: Array<DiscoveryProfile | null | undefined>,
  config: DiscoveryConfig = DISCOVERY_CONFIG,
): DiscoveryProfile {
  const lensRelevance = emptyLensRelevance();
  DISCOVERY_LENSES.forEach((lens) => {
    const values = profiles
      .map((profile) => profile?.lensRelevance[lens] ?? 0)
      .sort((a, b) => b - a);
    if (values.length === 0) return;
    const strongest = values[0];
    const top = values.slice(0, 3);
    const topMean = top.reduce((sum, value) => sum + value, 0) / top.length;
    lensRelevance[lens] = round(
      strongest * config.areaStrongestShare + topMean * (1 - config.areaStrongestShare),
    );
  });
  return { lensRelevance };
}

export function deriveDiscoverySnapshot(
  data: PulseData,
  now: Date | number = Date.now(),
  config: DiscoveryConfig = DISCOVERY_CONFIG,
): DiscoverySnapshot {
  const timestamp = now instanceof Date ? now.getTime() : now;
  const groupByPlace = <Item extends { placeId: string }>(items: Item[]) => {
    const grouped = new Map<string, Item[]>();
    items.forEach((item) => {
      const group = grouped.get(item.placeId);
      if (group) group.push(item);
      else grouped.set(item.placeId, [item]);
    });
    return grouped;
  };
  const postsByPlace = groupByPlace(data.posts);
  const eventsByPlace = groupByPlace(data.events);
  const meetEventsByPlace = groupByPlace(data.meetEvents);
  const places = Object.fromEntries(
    data.places.map((place) => {
      const lensRelevance = emptyLensRelevance();
      DISCOVERY_LENSES.forEach((lens) => {
        lensRelevance[lens] = derivePlaceLensRelevance(
          place,
          {
            posts: postsByPlace.get(place.id) ?? [],
            events: eventsByPlace.get(place.id) ?? [],
            meetEvents: meetEventsByPlace.get(place.id) ?? [],
          },
          lens,
          timestamp,
          config,
        );
      });
      return [place.id, { lensRelevance } satisfies DiscoveryProfile];
    }),
  );
  const areas = Object.fromEntries(
    [...groupPlacesByArea(data.places).entries()].map(([areaId, areaPlaces]) => [
      areaId,
      aggregateDiscoveryProfiles(
        areaPlaces.map((place) => places[place.id]),
        config,
      ),
    ]),
  );
  return { places, areas };
}

export function getPlaceLensRelevance(
  snapshot: DiscoverySnapshot,
  placeId: string,
  lens: DiscoveryLens,
) {
  return snapshot.places[placeId]?.lensRelevance[lens] ?? 0;
}

export function getAreaLensRelevance(
  snapshot: DiscoverySnapshot,
  areaId: string,
  lens: DiscoveryLens,
) {
  return snapshot.areas[areaId]?.lensRelevance[lens] ?? 0;
}

function prominenceFromScore(
  score: number,
  context: { selected?: boolean; hasSelection?: boolean; dense?: boolean },
  config: DiscoveryConfig,
): MarkerProminence {
  if (context.selected) {
    return { score: 1, band: "high", opacityFactor: 1, scaleFactor: 1, zIndexBoost: 0 };
  }
  const eased = smoothstep(0.15, 0.85, score);
  const lowOpacity = context.hasSelection
    ? config.prominence.selectedContextOpacity
    : config.prominence.lowOpacity;
  const lowScale = context.dense ? config.prominence.denseLowScale : config.prominence.lowScale;
  const highScale = context.dense ? config.prominence.denseHighScale : config.prominence.highScale;
  const band: DiscoveryProminenceBand =
    score < config.prominence.lowBandMaximum
      ? "low"
      : score >= config.prominence.highBandMinimum
        ? "high"
        : "medium";
  return {
    score: round(score),
    band,
    opacityFactor: round(lowOpacity + (1 - lowOpacity) * eased),
    scaleFactor: round(lowScale + (highScale - lowScale) * eased),
    zIndexBoost: Math.round(config.prominence.zIndexRange * score),
  };
}

export function deriveMarkerProminence(
  profile: DiscoveryProfile | null | undefined,
  intelligence: AreaIntelligence | null | undefined,
  lens: DiscoveryLens | null,
  context: { selected?: boolean; hasSelection?: boolean; dense?: boolean } = {},
  config: DiscoveryConfig = DISCOVERY_CONFIG,
): MarkerProminence {
  if (!lens) {
    return { score: 1, band: "high", opacityFactor: 1, scaleFactor: 1, zIndexBoost: 0 };
  }
  const semanticRelevance = profile?.lensRelevance[lens] ?? 0;
  const stateAffinity = intelligence ? config.lenses[lens].stateAffinity[intelligence.state] : 0;
  const quality = intelligence ? config.qualityFactor[intelligence.signalQuality] : 0;
  const emergingBoost = intelligence?.emerging && semanticRelevance >= 0.35 ? 1 : 0;
  const score = clamp01(
    semanticRelevance * config.semanticProminenceShare +
      stateAffinity * quality * config.stateProminenceShare +
      emergingBoost * config.emergingProminenceShare,
  );
  return prominenceFromScore(score, context, config);
}

export function aggregateClusterProminence(
  prominences: MarkerProminence[],
  context: { selected?: boolean; hasSelection?: boolean; dense?: boolean } = {},
  config: DiscoveryConfig = DISCOVERY_CONFIG,
) {
  if (prominences.length === 0) return prominenceFromScore(0, context, config);
  const scores = prominences.map((item) => item.score).sort((a, b) => b - a);
  const top = scores.slice(0, 3);
  const topMean = top.reduce((sum, value) => sum + value, 0) / top.length;
  return prominenceFromScore(
    scores[0] * config.areaStrongestShare + topMean * (1 - config.areaStrongestShare),
    context,
    config,
  );
}

export function distanceKm(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDelta = radians(second.lat - first.lat);
  const lngDelta = radians(second.lng - first.lng);
  const firstLat = radians(first.lat);
  const secondLat = radians(second.lat);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function recommendationReason(intelligence: AreaIntelligence): DiscoveryRecommendationReason {
  if (intelligence.emerging) return "emerging";
  if (intelligence.state === "rising") return "rising";
  if (intelligence.state === "hot") return "hot";
  return "active";
}

export function rankDiscoveryRecommendations(
  candidates: DiscoveryAreaCandidate[],
  origin: { lat: number; lng: number },
  lens: DiscoveryLens | null,
  snapshot: DiscoverySnapshot,
  options: { excludeAreaId?: string | null; now?: Date | number } = {},
  config: DiscoveryConfig = DISCOVERY_CONFIG,
): DiscoveryRecommendation[] {
  const nowValue = options.now ?? Date.now();
  const now = nowValue instanceof Date ? nowValue.getTime() : nowValue;
  const weights = config.recommendation.weights;
  const activeWeight =
    weights.distance +
    weights.state +
    weights.momentum +
    weights.quality +
    weights.recency +
    (lens ? weights.lens : 0);

  return candidates
    .flatMap((candidate): DiscoveryRecommendation[] => {
      const intelligence = candidate.intelligence;
      if (!intelligence || candidate.areaId === options.excludeAreaId) return [];
      const stateScore = config.recommendation.stateOpportunity[intelligence.state] ?? 0;
      const qualityScore = config.recommendation.qualityOpportunity[intelligence.signalQuality];
      if (stateScore === 0 || qualityScore === 0) return [];
      const candidateDistance = distanceKm(origin, candidate);
      if (candidateDistance > config.recommendation.maximumDistanceKm) return [];
      const lensScore = lens ? getAreaLensRelevance(snapshot, candidate.areaId, lens) : 0;
      if (lens && lensScore < config.recommendation.minimumLensRelevance) return [];
      const distanceScore = Math.exp(-candidateDistance / config.recommendation.distanceDecayKm);
      const momentumScore = intelligence.emerging
        ? 1
        : clamp01(Math.max(0, intelligence.momentum) / 40);
      const lastSignalTimestamp = intelligence.lastSignalAt
        ? Date.parse(intelligence.lastSignalAt)
        : Number.NaN;
      const recencyScore = Number.isFinite(lastSignalTimestamp)
        ? clamp01(
            1 - Math.max(0, now - lastSignalTimestamp) / AREA_INTELLIGENCE_CONFIG.fadingFreshMs,
          )
        : 0;
      const score =
        (distanceScore * weights.distance +
          stateScore * weights.state +
          lensScore * (lens ? weights.lens : 0) +
          momentumScore * weights.momentum +
          qualityScore * weights.quality +
          recencyScore * weights.recency) /
        activeWeight;
      if (score < config.recommendation.minimumScore) return [];
      return [
        {
          areaId: candidate.areaId,
          score: round(score),
          distanceKm: round(candidateDistance, 1),
          reason: recommendationReason(intelligence),
        },
      ];
    })
    .sort((first, second) => {
      const scoreDifference = second.score - first.score;
      if (Math.abs(scoreDifference) > 0.0001) return scoreDifference;
      const distanceDifference = first.distanceKm - second.distanceKm;
      if (Math.abs(distanceDifference) > 0.0001) return distanceDifference;
      const firstActivity =
        candidates.find((candidate) => candidate.areaId === first.areaId)?.intelligence
          ?.activityScore ?? 0;
      const secondActivity =
        candidates.find((candidate) => candidate.areaId === second.areaId)?.intelligence
          ?.activityScore ?? 0;
      return secondActivity - firstActivity || first.areaId.localeCompare(second.areaId);
    });
}

export function areaNeedsDiscoveryRecommendation(
  intelligence: AreaIntelligence | null | undefined,
  profile: DiscoveryProfile | null | undefined,
  lens: DiscoveryLens | null,
  config: DiscoveryConfig = DISCOVERY_CONFIG,
) {
  if (!intelligence) return true;
  if (lens) return (profile?.lensRelevance[lens] ?? 0) < config.recommendation.minimumLensRelevance;
  return (
    (intelligence.state === "calm" || intelligence.state === "cooling") &&
    (intelligence.signalQuality === "fading" || intelligence.signalQuality === "uncertain")
  );
}

export function viewportNeedsDiscoveryRecommendation(
  visibleAreaIds: string[],
  lens: DiscoveryLens | null,
  snapshot: DiscoverySnapshot,
  intelligence: AreaIntelligenceSnapshot,
) {
  if (visibleAreaIds.length === 0) return true;
  if (lens) {
    return !visibleAreaIds.some((areaId) => {
      const prominence = deriveMarkerProminence(snapshot.areas[areaId], intelligence[areaId], lens);
      return prominence.score >= 0.55;
    });
  }
  return !visibleAreaIds.some((areaId) => {
    const area = intelligence[areaId];
    return (
      area &&
      (area.state === "rising" || area.state === "active" || area.state === "hot") &&
      (area.signalQuality === "confirmed" || area.signalQuality === "stable")
    );
  });
}

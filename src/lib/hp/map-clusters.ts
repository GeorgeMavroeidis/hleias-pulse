import type { EventItem, Place } from "../hp-model";
import {
  areaDefinitionForId,
  groupPlacesByArea,
  toneForPlace,
  type AreaTone,
} from "./area-catalog";
import {
  getAreaIntelligence,
  type AreaIntelligence,
  type AreaIntelligenceSnapshot,
} from "./area-intelligence";
import {
  aggregatePulseMetrics,
  pulseMetricForPlace,
  type PulseActivitySnapshot,
  type PulseTier,
} from "./pulse-activity";
type LatLngTuple = [number, number];

type AreaStatus = PulseTier;

export type MapAreaCluster = {
  id: string;
  name: string;
  title: string;
  tone: AreaTone;
  status: AreaStatus;
  lat: number;
  lng: number;
  places: Place[];
  childPlaces: Place[];
  leadPlace: Place;
  activityLine: string;
  eventCount: number;
  postCount: number;
  commentCount: number;
  hotness: number;
  activityScore: number;
  intelligence: AreaIntelligence | null;
  labelOffsetPx: number;
  avatars: string[];
};

export function eventCountForPlace(events: EventItem[]) {
  return events.reduce<Map<string, number>>((counts, event) => {
    counts.set(event.placeId, (counts.get(event.placeId) ?? 0) + 1);
    return counts;
  }, new Map());
}

function activityLineForCluster(
  tone: AreaTone,
  places: Place[],
  postCount: number,
  eventCount: number,
) {
  const hasSunset = places.some(
    (place) => place.type === "sunset" || place.tags.includes("sunset"),
  );
  if (eventCount > 0 && postCount > 0)
    return `${postCount} posts · ${eventCount} event${eventCount === 1 ? "" : "s"}`;
  if (eventCount > 0) return `${eventCount} event${eventCount === 1 ? "" : "s"}`;
  if (hasSunset) return `sunset · ${postCount} posts`;
  if (tone === "nature" || tone === "village") return `${postCount} tips`;
  if (tone === "music") return `${postCount} posts`;
  return `${postCount} posts`;
}

function uniqueAvatars(places: Place[]) {
  const seen = new Set<string>();
  return places
    .flatMap((place) => place.avatars)
    .filter((avatar) => {
      if (seen.has(avatar)) return false;
      seen.add(avatar);
      return true;
    });
}

function centerOfPlaces(places: Place[], fallback: LatLngTuple): LatLngTuple {
  if (places.length === 0) return fallback;

  let minLat = places[0].lat;
  let maxLat = places[0].lat;
  let minLng = places[0].lng;
  let maxLng = places[0].lng;

  places.forEach((place) => {
    minLat = Math.min(minLat, place.lat);
    maxLat = Math.max(maxLat, place.lat);
    minLng = Math.min(minLng, place.lng);
    maxLng = Math.max(maxLng, place.lng);
  });

  const lat = (minLat + maxLat) / 2;
  const lng = (minLng + maxLng) / 2;

  return [lat, lng];
}

export function buildAreaClusters(
  places: Place[],
  events: EventItem[],
  activitySnapshot: PulseActivitySnapshot = {},
  intelligenceSnapshot: AreaIntelligenceSnapshot = {},
): MapAreaCluster[] {
  const eventCounts = eventCountForPlace(events);

  // Group by curated neighbourhood; places not in any def become standalone
  // single-pin "areas" (id `solo-<placeId>`) so they still render on the map.
  const grouped = groupPlacesByArea(places);

  return [...grouped.entries()]
    .map(([id, areaPlaces]) => {
      const def = areaDefinitionForId(id);
      const sortedPlaces = [...areaPlaces].sort(
        (a, b) =>
          pulseMetricForPlace(b, activitySnapshot, eventCounts.get(b.id) ?? 0).score -
          pulseMetricForPlace(a, activitySnapshot, eventCounts.get(a.id) ?? 0).score,
      );
      const lead = sortedPlaces[0];
      const activity = aggregatePulseMetrics(areaPlaces, activitySnapshot, eventCounts);
      const eventCount = activity.eventCount;
      const postCount = activity.postCount;
      const hotness = activity.hotness;
      const status = activity.tier;
      const tone = def?.tone ?? toneForPlace(lead);
      const name = def?.name ?? lead.name;
      const [lat, lng] = centerOfPlaces(areaPlaces, [lead.lat, lead.lng]);

      return {
        id,
        name,
        title: def?.title ?? name,
        tone,
        status,
        lat,
        lng,
        places: sortedPlaces,
        childPlaces: sortedPlaces,
        leadPlace: lead,
        activityLine: activityLineForCluster(tone, areaPlaces, postCount, eventCount),
        eventCount,
        postCount,
        commentCount: activity.commentCount,
        hotness,
        activityScore: activity.score,
        intelligence: getAreaIntelligence(intelligenceSnapshot, id),
        labelOffsetPx: 0,
        avatars: uniqueAvatars(sortedPlaces).slice(0, 3),
      };
    })
    .sort((a, b) => b.activityScore - a.activityScore);
}

import type { Place, PlaceType } from "../hp-model";
import type { MeetEvent } from "./meet-types";
import { isEventPast, type CulturalEvent } from "./cultural-events-types";
import { timestampMs } from "./freshness";
import { formatMeetDateTime } from "./meet-time";
import { isPublishedContent, meetPhase } from "./surface-freshness";
import {
  distanceKm,
  getPlaceLensRelevance,
  type DiscoveryLens,
  type DiscoverySnapshot,
} from "./discovery";
import type { MapDiscoveryViewport, RegionalDiscovery } from "./regional-discovery";

export type DiscoveryEvent =
  | {
      key: string;
      kind: "meet";
      title: string;
      date: string;
      placeId: string;
      phase: "upcoming" | "inProgress";
      event: MeetEvent;
    }
  | {
      key: string;
      kind: "cultural";
      title: string;
      date: string;
      placeId: string;
      event: CulturalEvent;
    };
export type DiscoveryRegionRow = {
  discovery: RegionalDiscovery;
  places: Place[];
  categories: PlaceType[];
  events: DiscoveryEvent[];
  visiblePlaceCount: number;
  visibleEventCount: number;
  lensRelevance: number;
  distanceKm: number;
};
export type MapDiscoveryContent = {
  matchingVisiblePlaceCount: number;
  visibleRegions: DiscoveryRegionRow[];
  regions: Map<string, DiscoveryRegionRow>;
  events: DiscoveryEvent[];
};

/** All linked event rows show the Ilia date/time, independent of the device zone. */
export function formatDiscoveryEventDate(
  event: Pick<DiscoveryEvent, "date">,
  language: "GR" | "EN",
) {
  return formatMeetDateTime(event.date, language);
}

export function deriveMapDiscoveryContent({
  places,
  regions,
  discovery,
  viewport,
  lens,
  meetEvents,
  culturalEvents,
  now: nowMs,
  hiddenUserIds = new Set<string>(),
}: {
  places: Place[];
  regions: RegionalDiscovery[];
  discovery: DiscoverySnapshot;
  viewport: MapDiscoveryViewport | null;
  lens: DiscoveryLens | null;
  meetEvents: MeetEvent[];
  culturalEvents: CulturalEvent[];
  now: number;
  hiddenUserIds?: ReadonlySet<string>;
}): MapDiscoveryContent {
  const byId = new Map(places.map((place) => [place.id, place]));
  const visibleIds = new Set(viewport?.visiblePlaceIds ?? []);
  const events: DiscoveryEvent[] = [];
  const seen = new Set<string>();
  const clockAvailable = timestampMs(nowMs) !== null;
  for (const event of meetEvents) {
    const key = `meet:${event.id}`;
    const phase = meetPhase(event, nowMs);
    if (
      !clockAvailable ||
      !byId.has(event.placeId) ||
      !isPublishedContent(event) ||
      (phase !== "upcoming" && phase !== "inProgress") ||
      (event.userId && hiddenUserIds.has(event.userId)) ||
      seen.has(key)
    )
      continue;
    seen.add(key);
    events.push({
      key,
      kind: "meet",
      title: event.title,
      date: event.happensAt,
      placeId: event.placeId,
      phase,
      event,
    });
  }
  for (const event of culturalEvents) {
    const key = `cultural:${event.id}`;
    if (
      !clockAvailable ||
      !event.placeId ||
      !byId.has(event.placeId) ||
      !isPublishedContent(event) ||
      !Number.isFinite(Date.parse(event.eventDate)) ||
      isEventPast(event, nowMs) ||
      (event.userId && hiddenUserIds.has(event.userId)) ||
      seen.has(key)
    )
      continue;
    seen.add(key);
    events.push({
      key,
      kind: "cultural",
      title: event.title,
      date: event.eventDate,
      placeId: event.placeId,
      event,
    });
  }
  events.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.key.localeCompare(b.key));
  const rows = regions.map((row): DiscoveryRegionRow => {
    const matching = row.contextualPlaceIds
      .map((id) => byId.get(id))
      .filter((place): place is Place => Boolean(place));
    const ids = new Set(matching.map((place) => place.id));
    const regionEvents = events.filter((event) => ids.has(event.placeId));
    return {
      discovery: row,
      places: matching,
      categories: [...new Set(matching.map((place) => place.type))].sort(),
      events: regionEvents,
      visiblePlaceCount: matching.filter((place) => visibleIds.has(place.id)).length,
      visibleEventCount: regionEvents.filter((event) => visibleIds.has(event.placeId)).length,
      lensRelevance: lens
        ? Math.max(
            0,
            ...matching
              .filter((place) => visibleIds.has(place.id))
              .map((place) => getPlaceLensRelevance(discovery, place.id, lens)),
          )
        : 0,
      distanceKm: viewport ? distanceKm(viewport.center, row.region.anchor) : 0,
    };
  });
  const visibleRegions = rows
    .filter((row) => row.visiblePlaceCount > 0)
    .sort(
      (a, b) =>
        b.lensRelevance - a.lensRelevance ||
        b.visiblePlaceCount - a.visiblePlaceCount ||
        b.visibleEventCount - a.visibleEventCount ||
        a.distanceKm - b.distanceKm ||
        a.discovery.region.id.localeCompare(b.discovery.region.id),
    );
  return {
    matchingVisiblePlaceCount: visibleRegions.reduce((sum, row) => sum + row.visiblePlaceCount, 0),
    visibleRegions,
    regions: new Map(rows.map((row) => [row.discovery.region.id, row])),
    events,
  };
}

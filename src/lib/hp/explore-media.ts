import type { Place, Post } from "../hp-model";
import type { DiscoveryLens, DiscoverySnapshot } from "./discovery";
import type { MapAreaCluster } from "./map-clusters";
import type { MarkerPulseSnapshot } from "./marker-pulse";
import type { PlaceStoryGroup } from "./place-stories";

/**
 * Pure helpers behind the Explore map: which photos a place has, how big to
 * fetch them, and in which order areas and places are offered. Nothing here
 * touches the network, the DOM or Supabase, so all of it is unit-tested.
 */

export type ExploreMediaKind = "place" | "business" | "story" | "post" | "commons";

export type ExploreMedia = {
  id: string;
  kind: ExploreMediaKind;
  /** Full-size source. Callers shrink it with `thumbnailUrl` for small slots. */
  url: string;
  caption?: string;
  /** Attribution line, required for Wikimedia Commons photos. */
  credit?: string;
  /** Where the photo lives (Commons file page) — shown with the credit. */
  sourceUrl?: string;
  storyId?: string;
  postId?: string;
  lat?: number;
  lng?: number;
};

/**
 * Wikimedia serves pre-rendered thumbnails at standard widths. Asking for one
 * of these is fast and cacheable; an arbitrary width may be rendered on demand
 * or refused, so requests are rounded up to the nearest bucket.
 */
export const WIKIMEDIA_THUMB_BUCKETS = [120, 250, 330, 500, 960, 1280] as const;

const WIKIMEDIA_THUMB =
  /^(https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/[^/]+)\/thumb\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)\/(\d+)px-([^/]+)$/;
const WIKIMEDIA_ORIGINAL =
  /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/[^/]+)\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/;
const RESIZABLE = /\.(jpe?g|png|webp)$/i;

export function wikimediaBucket(width: number) {
  return WIKIMEDIA_THUMB_BUCKETS.find((bucket) => bucket >= width) ?? 1280;
}

/**
 * A smaller copy of the same photo when the host supports it; otherwise the
 * original URL, unchanged. Only ever shrinks — it never asks for a thumbnail
 * wider than one the source URL already names.
 */
export function thumbnailUrl(src: string, width: number): string {
  const url = src.trim();
  if (!url) return url;
  const thumb = WIKIMEDIA_THUMB.exec(url);
  if (thumb) {
    const [, base, a, ab, file, current] = thumb;
    const bucket = Math.min(wikimediaBucket(width), Number(current));
    if (bucket === Number(current)) return url;
    return `${base}/thumb/${a}/${ab}/${file}/${bucket}px-${file}`;
  }
  const original = WIKIMEDIA_ORIGINAL.exec(url);
  if (original && RESIZABLE.test(original[4])) {
    const [, base, a, ab, file] = original;
    return `${base}/thumb/${a}/${ab}/${file}/${wikimediaBucket(width)}px-${file}`;
  }
  return url;
}

/** Same photo regardless of which thumbnail size a URL points at. */
export function mediaIdentity(src: string): string {
  const url = src.trim();
  const thumb = WIKIMEDIA_THUMB.exec(url);
  if (thumb) return `wm:${decodeSafe(thumb[4])}`;
  const original = WIKIMEDIA_ORIGINAL.exec(url);
  if (original) return `wm:${decodeSafe(original[4])}`;
  return url;
}

function decodeSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type PlaceGalleryInput = {
  posts?: readonly Post[];
  storyGroup?: PlaceStoryGroup | null;
  businessPhotos?: readonly string[];
  commons?: readonly ExploreMedia[];
  limit?: number;
};

/**
 * Every photo a place can show, best first: its own cover, the owner's
 * photos, live stories, community posts, then nearby Commons photos. Each
 * photo appears once even when two sources link different sizes of it.
 */
export function placeGallery(place: Place, input: PlaceGalleryInput = {}): ExploreMedia[] {
  const { posts = [], storyGroup, businessPhotos = [], commons = [], limit = 24 } = input;
  const seen = new Set<string>();
  const items: ExploreMedia[] = [];
  const push = (item: ExploreMedia) => {
    const url = item.url?.trim();
    if (!url) return;
    const key = mediaIdentity(url);
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ ...item, url });
  };

  push({ id: `place:${place.id}`, kind: "place", url: place.imageUrl, caption: place.short });
  businessPhotos.forEach((url, index) =>
    push({ id: `business:${place.id}:${index}`, kind: "business", url }),
  );
  for (const story of storyGroup?.stories ?? []) {
    push({
      id: `story:${story.id}`,
      kind: "story",
      url: story.mediaUrl,
      caption: story.caption,
      credit: story.authorName,
      storyId: story.id,
    });
  }
  const postsWithPhotos = posts
    .filter((post) => post.placeId === place.id && post.imageUrl?.trim())
    .slice()
    .sort((a, b) => postTime(b) - postTime(a) || b.likes - a.likes);
  for (const post of postsWithPhotos) {
    push({
      id: `post:${post.id}`,
      kind: "post",
      url: post.imageUrl,
      caption: post.text,
      postId: post.id,
    });
  }
  commons.forEach(push);
  return items.slice(0, Math.max(1, limit));
}

function postTime(post: Post) {
  const parsed = post.createdAt ? Date.parse(post.createdAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Relevance at which a place or area counts as matching a mood lens. */
export const LENS_MATCH_THRESHOLD = 0.35;

export function placeMatchesLens(
  placeId: string,
  lens: DiscoveryLens | null,
  discovery: DiscoverySnapshot,
) {
  if (!lens) return true;
  return (discovery.places[placeId]?.lensRelevance[lens] ?? 0) >= LENS_MATCH_THRESHOLD;
}

export function areaMatchesLens(
  area: MapAreaCluster,
  lens: DiscoveryLens | null,
  discovery: DiscoverySnapshot,
) {
  if (!lens) return true;
  if ((discovery.areas[area.id]?.lensRelevance[lens] ?? 0) >= LENS_MATCH_THRESHOLD) return true;
  return area.places.some((place) => placeMatchesLens(place.id, lens, discovery));
}

const PULSE_WEIGHT: Record<string, number> = {
  lively: 4,
  active: 3,
  emerging: 2,
  fading: 1,
  quiet: 0,
};

/** Live community signal first, then the lens, then the stored popularity. */
export function rankPlaces(
  places: readonly Place[],
  {
    lens = null,
    discovery = { places: {}, areas: {} },
    pulse = {},
    storyPlaceIds = new Set<string>(),
  }: {
    lens?: DiscoveryLens | null;
    discovery?: DiscoverySnapshot;
    pulse?: MarkerPulseSnapshot;
    storyPlaceIds?: ReadonlySet<string>;
  } = {},
): Place[] {
  const score = (place: Place) => {
    const level = pulse[place.id]?.level ?? "quiet";
    const lensScore = lens ? (discovery.places[place.id]?.lensRelevance[lens] ?? 0) : 0;
    return (
      (lens && lensScore < LENS_MATCH_THRESHOLD ? -100 : 0) +
      lensScore * 10 +
      (PULSE_WEIGHT[level] ?? 0) * 3 +
      (storyPlaceIds.has(place.id) ? 4 : 0) +
      place.hotness / 25
    );
  };
  return places
    .map((place) => ({ place, value: score(place) }))
    .sort((a, b) => b.value - a.value || a.place.name.localeCompare(b.place.name))
    .map(({ place }) => place);
}

export function rankAreas(
  areas: readonly MapAreaCluster[],
  {
    lens = null,
    discovery = { places: {}, areas: {} },
  }: { lens?: DiscoveryLens | null; discovery?: DiscoverySnapshot } = {},
): MapAreaCluster[] {
  const score = (area: MapAreaCluster) => {
    const matches = areaMatchesLens(area, lens, discovery);
    const lensScore = lens ? (discovery.areas[area.id]?.lensRelevance[lens] ?? 0) : 0;
    return (
      (matches ? 0 : -100) +
      lensScore * 10 +
      area.activityScore +
      area.hotness / 20 +
      area.places.length / 10
    );
  };
  return areas
    .map((area) => ({ area, value: score(area) }))
    .sort((a, b) => b.value - a.value || a.area.name.localeCompare(b.area.name))
    .map(({ area }) => area);
}

/**
 * The area's cover: a place with live stories if there is one, otherwise its
 * lead place, otherwise any place with a photo.
 */
export function areaCover(area: MapAreaCluster, storyPlaceIds: ReadonlySet<string> = new Set()) {
  const withPhoto = area.places.filter((place) => place.imageUrl?.trim());
  return (
    withPhoto.find((place) => storyPlaceIds.has(place.id)) ??
    (area.leadPlace.imageUrl?.trim() ? area.leadPlace : undefined) ??
    withPhoto[0] ??
    area.leadPlace
  );
}

/** Bounds that frame every place in a list, padded so pins never sit on an edge. */
export function placesBounds(
  places: readonly Pick<Place, "lat" | "lng">[],
  padDegrees = 0.004,
): [[number, number], [number, number]] | null {
  const valid = places.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
  if (!valid.length) return null;
  const lngs = valid.map((place) => place.lng);
  const lats = valid.map((place) => place.lat);
  return [
    [Math.min(...lngs) - padDegrees, Math.min(...lats) - padDegrees],
    [Math.max(...lngs) + padDegrees, Math.max(...lats) + padDegrees],
  ];
}

/** Great-circle distance in metres; good enough for spacing photos on a map. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type GeoPhotoGroup = {
  id: string;
  lat: number;
  lng: number;
  /** Metres from the place this group belongs to. */
  distance: number;
  items: ExploreMedia[];
};

/**
 * Commons geotags are often shared: dozens of photos of a site carry the same
 * coordinate. Photos within `mergeMeters` of each other become one group,
 * nearest to the place first.
 */
export function groupGeoPhotos(
  center: { lat: number; lng: number },
  photos: readonly ExploreMedia[],
  { mergeMeters = 45 }: { mergeMeters?: number } = {},
): GeoPhotoGroup[] {
  const groups: GeoPhotoGroup[] = [];
  for (const photo of photos) {
    if (
      typeof photo.lat !== "number" ||
      typeof photo.lng !== "number" ||
      !Number.isFinite(photo.lat) ||
      !Number.isFinite(photo.lng)
    )
      continue;
    const point = { lat: photo.lat, lng: photo.lng };
    const home = groups.find((group) => distanceMeters(group, point) <= mergeMeters);
    if (home) home.items.push(photo);
    else
      groups.push({
        id: photo.id,
        lat: point.lat,
        lng: point.lng,
        distance: distanceMeters(center, point),
        items: [photo],
      });
  }
  return groups.sort((a, b) => a.distance - b.distance);
}

export type PlaceBloom = {
  /** Shown in an arc around the selected pin: photos taken at the place. */
  halo: ExploreMedia[];
  /** Pinned where they were taken: groups clearly elsewhere around the place. */
  far: GeoPhotoGroup[];
};

/**
 * Splits a place's photos into the ring around its pin and the stacks pinned
 * at their own coordinates. Coordinates are never moved: a photo is either
 * drawn at its real spot or, when that spot is effectively the place itself,
 * drawn as part of the place.
 */
export function placeBloom(
  center: { lat: number; lng: number },
  gallery: readonly ExploreMedia[],
  commons: readonly ExploreMedia[],
  {
    haloMax = 5,
    farMax = 5,
    nearMeters = 220,
    farSpacingMeters = 200,
  }: { haloMax?: number; farMax?: number; nearMeters?: number; farSpacingMeters?: number } = {},
): PlaceBloom {
  const groups = groupGeoPhotos(center, commons);
  const near = groups.filter((group) => group.distance < nearMeters);
  const far: GeoPhotoGroup[] = [];
  for (const group of groups) {
    if (group.distance < nearMeters || far.length >= farMax) continue;
    if (far.some((other) => distanceMeters(other, group) < farSpacingMeters)) continue;
    far.push(group);
  }
  // Own photos first (stories, posts), then one photo per nearby spot, then the rest.
  const seen = new Set<string>();
  const halo: ExploreMedia[] = [];
  const add = (item: ExploreMedia | undefined) => {
    if (!item || halo.length >= haloMax || seen.has(item.id)) return;
    seen.add(item.id);
    halo.push(item);
  };
  gallery.filter((item) => item.kind !== "place" && item.kind !== "commons").forEach(add);
  near.forEach((group) => add(group.items[0]));
  near.forEach((group) => group.items.slice(1).forEach(add));
  return { halo, far };
}

/**
 * An area's name in the reader's language: curated areas go through the
 * dictionary; a one-place area takes that place's Greek name.
 */
export function areaDisplayName(
  area: { id: string; name: string; places: { greekName?: string; name: string }[] },
  language: "GR" | "EN",
  t: (key: string) => string,
) {
  if (language !== "GR") return area.name;
  const solo = area.id.startsWith("solo-") ? area.places[0] : undefined;
  if (solo?.greekName) return solo.greekName;
  return t(area.name);
}

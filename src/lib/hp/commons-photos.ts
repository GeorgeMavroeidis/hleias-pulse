import { useEffect, useState } from "react";
import type { Place } from "../hp-model";
import type { ExploreMedia } from "./explore-media";

/**
 * Geotagged photos from Wikimedia Commons around a place, so a site like
 * Ancient Olympia shows the photos people actually took there — each pinned at
 * the spot it was taken — instead of a single cover image.
 *
 * Read-only and anonymous: one public API call per place (`origin=*`, no
 * credentials), cached on the device for a week. Nothing is written to
 * Supabase. Every failure resolves to an empty list, so the map never depends
 * on Commons being reachable. Flip COMMONS_PHOTOS_ENABLED to turn it off.
 */
export const COMMONS_PHOTOS_ENABLED = true;

const API = "https://commons.wikimedia.org/w/api.php";
const CACHE_PREFIX = "hp.commons.v1:";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RESULTS = 40;

const RADIUS_BY_TYPE: Partial<Record<Place["type"], number>> = {
  culture: 700,
  beach: 1400,
  nature: 1600,
  village: 900,
  sunset: 1200,
};

/** Titles that are documents, not photos of the place. */
const NOT_A_PLACE_PHOTO =
  /\b(map|karte|plan|diagram|logo|coat of arms|flag|iss0\d+|view of earth|sentinel|landsat|satellite|scan|poster|stamp|document|chart|drawing|svg)\b/i;

type CommonsPage = {
  title: string;
  coordinates?: { lat: number; lon: number }[];
  imageinfo?: {
    url?: string;
    thumburl?: string;
    descriptionurl?: string;
    width?: number;
    height?: number;
    mime?: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }[];
};

const memory = new Map<string, ExploreMedia[]>();
const inflight = new Map<string, Promise<ExploreMedia[]>>();

function stripHtml(value: string | undefined) {
  if (!value) return "";
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/** Pure: Commons API pages → usable, attributed, located photos (exported for tests). */
export function commonsPagesToMedia(pages: readonly CommonsPage[]): ExploreMedia[] {
  const media: ExploreMedia[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const coordinate = page.coordinates?.[0];
    if (!info || !coordinate) continue;
    if (!/^image\/(jpeg|png|webp)$/.test(info.mime ?? "")) continue;
    const width = info.width ?? 0;
    const height = info.height ?? 0;
    if (width < 800 || height < 500) continue;
    const aspect = width / height;
    if (aspect < 0.55 || aspect > 2.4) continue;
    const title = page.title.replace(/^File:/, "");
    if (NOT_A_PLACE_PHOTO.test(title)) continue;
    const url = info.thumburl ?? info.url;
    if (!url) continue;
    const artist = stripHtml(info.extmetadata?.Artist?.value);
    const license = stripHtml(info.extmetadata?.LicenseShortName?.value);
    media.push({
      id: `commons:${title}`,
      kind: "commons",
      url,
      caption: stripHtml(info.extmetadata?.ObjectName?.value) || title.replace(/\.[a-z]+$/i, ""),
      credit: [artist, license, "Wikimedia Commons"].filter(Boolean).join(" · "),
      sourceUrl: info.descriptionurl,
      lat: coordinate.lat,
      lng: coordinate.lon,
    });
  }
  return media;
}

function readCache(placeId: string): ExploreMedia[] | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + placeId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; items: ExploreMedia[] };
    if (!parsed || Date.now() - parsed.at > CACHE_TTL_MS || !Array.isArray(parsed.items)) {
      return null;
    }
    return parsed.items;
  } catch {
    return null;
  }
}

function writeCache(placeId: string, items: ExploreMedia[]) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + placeId, JSON.stringify({ at: Date.now(), items }));
  } catch {
    // Storage full or blocked: the in-memory copy still serves this session.
  }
}

export function fetchCommonsPhotos(
  place: Pick<Place, "id" | "lat" | "lng" | "type">,
): Promise<ExploreMedia[]> {
  if (!COMMONS_PHOTOS_ENABLED || typeof window === "undefined") return Promise.resolve([]);
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return Promise.resolve([]);
  const hit = memory.get(place.id) ?? readCache(place.id);
  if (hit) {
    memory.set(place.id, hit);
    return Promise.resolve(hit);
  }
  const pending = inflight.get(place.id);
  if (pending) return pending;

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    generator: "geosearch",
    ggscoord: `${place.lat}|${place.lng}`,
    ggsradius: String(RADIUS_BY_TYPE[place.type] ?? 1000),
    ggslimit: String(MAX_RESULTS),
    ggsnamespace: "6",
    prop: "imageinfo|coordinates",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "960",
    iiextmetadatafilter: "Artist|LicenseShortName|ObjectName",
    colimit: "max",
  });
  const task = (async () => {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${API}?${params}`, { signal: controller.signal });
      window.clearTimeout(timer);
      if (!response.ok) return [];
      const body = (await response.json()) as { query?: { pages?: CommonsPage[] } };
      const items = commonsPagesToMedia(body.query?.pages ?? []);
      memory.set(place.id, items);
      writeCache(place.id, items);
      return items;
    } catch {
      return [];
    } finally {
      inflight.delete(place.id);
    }
  })();
  inflight.set(place.id, task);
  return task;
}

/** Commons photos for one place; `[]` until (and unless) they arrive. */
export function useCommonsPhotos(place: Pick<Place, "id" | "lat" | "lng" | "type"> | null) {
  const [state, setState] = useState<{ placeId: string | null; items: ExploreMedia[] }>({
    placeId: null,
    items: [],
  });
  const placeId = place?.id ?? null;
  const lat = place?.lat;
  const lng = place?.lng;
  const type = place?.type;
  useEffect(() => {
    if (!placeId || lat === undefined || lng === undefined || !type) return;
    let cancelled = false;
    void fetchCommonsPhotos({ id: placeId, lat, lng, type }).then((items) => {
      if (!cancelled) setState({ placeId, items });
    });
    return () => {
      cancelled = true;
    };
  }, [placeId, lat, lng, type]);
  return state.placeId === placeId ? state.items : [];
}

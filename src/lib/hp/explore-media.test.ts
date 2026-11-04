import assert from "node:assert/strict";
import test from "node:test";
import type { Place, Post } from "../hp-model";
import { commonsPagesToMedia } from "./commons-photos";
import {
  areaCover,
  distanceMeters,
  mediaIdentity,
  placeGallery,
  placeMatchesLens,
  placesBounds,
  rankAreas,
  rankPlaces,
  groupGeoPhotos,
  placeBloom,
  thumbnailUrl,
  type ExploreMedia,
} from "./explore-media";
import type { MapAreaCluster } from "./map-clusters";
import type { PlaceStoryGroup } from "./place-stories";

const place = (id: string, overrides: Partial<Place> = {}): Place => ({
  id,
  name: id,
  greekName: id,
  type: "beach",
  area: "Katakolo",
  x: 0,
  y: 0,
  lat: 37.64,
  lng: 21.32,
  pulse: 0,
  mood: "",
  crowd: "",
  budget: "",
  bestTime: "",
  tags: [],
  short: "",
  imageUrl: `https://example.test/${id}.jpg`,
  hotness: 50,
  commentCount: 0,
  recentPostCount: 0,
  status: "quiet" as Place["status"],
  avatars: [],
  ...overrides,
});

test("Wikimedia thumbnails shrink to a standard bucket and never grow", () => {
  const thumb =
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Katakolo_Port.jpg/1280px-Katakolo_Port.jpg";
  assert.equal(
    thumbnailUrl(thumb, 300),
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Katakolo_Port.jpg/330px-Katakolo_Port.jpg",
  );
  assert.equal(thumbnailUrl(thumb, 2000), thumb, "never asks for more than the source names");
  const small = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/X.jpg/250px-X.jpg";
  assert.equal(thumbnailUrl(small, 960), small);
  assert.equal(
    thumbnailUrl("https://upload.wikimedia.org/wikipedia/commons/e/e8/Pyrgos_rathaus.jpg", 120),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Pyrgos_rathaus.jpg/120px-Pyrgos_rathaus.jpg",
  );
  assert.equal(
    thumbnailUrl("https://upload.wikimedia.org/wikipedia/commons/1/12/Plan.svg", 330),
    "https://upload.wikimedia.org/wikipedia/commons/1/12/Plan.svg",
    "vector originals are left alone",
  );
  assert.equal(
    thumbnailUrl("https://visit-olympia.gr/a.jpeg", 330),
    "https://visit-olympia.gr/a.jpeg",
  );
  assert.equal(thumbnailUrl("", 330), "");
});

test("one photo linked at two sizes is the same media", () => {
  assert.equal(
    mediaIdentity(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/K%C3%A1.jpg/330px-K%C3%A1.jpg",
    ),
    mediaIdentity("https://upload.wikimedia.org/wikipedia/commons/a/a9/K%C3%A1.jpg"),
  );
});

test("gallery orders cover, business, stories, newest posts, Commons — without duplicates", () => {
  const target = place("olympia", { imageUrl: "https://example.test/cover.jpg" });
  const posts = [
    {
      id: "old",
      placeId: "olympia",
      imageUrl: "https://example.test/old.jpg",
      createdAt: "2026-01-01T00:00:00Z",
      likes: 9,
    },
    {
      id: "new",
      placeId: "olympia",
      imageUrl: "https://example.test/new.jpg",
      createdAt: "2026-06-01T00:00:00Z",
      likes: 1,
    },
    { id: "elsewhere", placeId: "other", imageUrl: "https://example.test/x.jpg", likes: 0 },
    { id: "dupe", placeId: "olympia", imageUrl: "https://example.test/cover.jpg", likes: 0 },
    { id: "blank", placeId: "olympia", imageUrl: "  ", likes: 0 },
  ] as Post[];
  const storyGroup = {
    placeId: "olympia",
    stories: [
      { id: "s1", mediaUrl: "https://example.test/story.jpg", caption: "now", authorName: "Ana" },
    ],
  } as unknown as PlaceStoryGroup;
  const commons: ExploreMedia[] = [
    { id: "c1", kind: "commons", url: "https://example.test/commons.jpg", lat: 37.6, lng: 21.6 },
  ];
  const gallery = placeGallery(target, {
    posts,
    storyGroup,
    businessPhotos: ["https://example.test/biz.jpg"],
    commons,
  });
  assert.deepEqual(
    gallery.map((item) => item.kind + ":" + item.url.split("/").pop()),
    [
      "place:cover.jpg",
      "business:biz.jpg",
      "story:story.jpg",
      "post:new.jpg",
      "post:old.jpg",
      "commons:commons.jpg",
    ],
  );
  assert.equal(gallery[2].storyId, "s1");
  assert.equal(placeGallery(target, { commons, limit: 1 }).length, 1);
});

test("lens matching and ranking put live, matching places first", () => {
  const discovery = {
    places: {
      a: { lensRelevance: { chill: 0.9, social: 0, music: 0, beach: 0, food: 0 } },
      b: { lensRelevance: { chill: 0.1, social: 0, music: 0, beach: 0, food: 0 } },
      c: { lensRelevance: { chill: 0.5, social: 0, music: 0, beach: 0, food: 0 } },
    },
    areas: {},
  };
  assert.equal(placeMatchesLens("a", "chill", discovery), true);
  assert.equal(placeMatchesLens("b", "chill", discovery), false);
  assert.equal(placeMatchesLens("b", null, discovery), true);
  const places = [place("b", { hotness: 99 }), place("c"), place("a")];
  assert.deepEqual(
    rankPlaces(places, { lens: "chill", discovery }).map((p) => p.id),
    ["a", "c", "b"],
  );
  const pulse = { c: { level: "lively" } } as never;
  assert.deepEqual(
    rankPlaces([place("a"), place("c")], { pulse }).map((p) => p.id),
    ["c", "a"],
    "live community signal outranks stored popularity",
  );
});

test("areas rank by lens match then activity; cover prefers a place with stories", () => {
  const area = (id: string, activityScore: number, places: Place[]) =>
    ({
      id,
      name: id,
      activityScore,
      hotness: 0,
      places,
      leadPlace: places[0],
    }) as unknown as MapAreaCluster;
  const quiet = area("quiet", 1, [place("q")]);
  const busy = area("busy", 9, [place("lead"), place("story-spot")]);
  assert.deepEqual(
    rankAreas([quiet, busy]).map((a) => a.id),
    ["busy", "quiet"],
  );
  assert.equal(areaCover(busy, new Set(["story-spot"])).id, "story-spot");
  assert.equal(areaCover(busy).id, "lead");
});

test("bounds and distances", () => {
  assert.equal(placesBounds([]), null);
  assert.deepEqual(placesBounds([{ lat: 1, lng: 2 }], 0), [
    [2, 1],
    [2, 1],
  ]);
  const olympia = { lat: 37.6441, lng: 21.6253 };
  const stadium = { lat: 37.6393, lng: 21.6342 };
  const d = distanceMeters(olympia, stadium);
  assert.ok(d > 850 && d < 1000, `~930 m, got ${Math.round(d)}`);
});

test("photos sharing a geotag group together; nothing is moved", () => {
  const center = { lat: 37.6441, lng: 21.6253 };
  const at = (id: string, lat: number, lng: number): ExploreMedia => ({
    id,
    kind: "commons",
    url: `https://example.test/${id}.jpg`,
    lat,
    lng,
  });
  const photos = [
    at("site-1", 37.6432, 21.6253),
    at("site-2", 37.6432, 21.6253),
    at("site-3", 37.64322, 21.62531),
    at("stadium", 37.6393, 21.6342),
    { id: "no-geo", kind: "commons", url: "https://example.test/n.jpg" } as ExploreMedia,
  ];
  const groups = groupGeoPhotos(center, photos);
  assert.deepEqual(
    groups.map((group) => [group.id, group.items.length]),
    [
      ["site-1", 3],
      ["stadium", 1],
    ],
  );
  assert.equal(groups[1].lat, 37.6393, "coordinates are never moved");
});

test("bloom: own photos and the place's own geotags ring the pin; distinct spots stay pinned", () => {
  const center = { lat: 37.6441, lng: 21.6253 };
  const commons: ExploreMedia[] = [
    {
      id: "here-a",
      kind: "commons",
      url: "https://example.test/a.jpg",
      lat: 37.6432,
      lng: 21.6253,
    },
    {
      id: "here-b",
      kind: "commons",
      url: "https://example.test/b.jpg",
      lat: 37.6432,
      lng: 21.6253,
    },
    {
      id: "stadium",
      kind: "commons",
      url: "https://example.test/s.jpg",
      lat: 37.6393,
      lng: 21.6342,
    },
    {
      id: "stadium-2",
      kind: "commons",
      url: "https://example.test/s2.jpg",
      lat: 37.6394,
      lng: 21.6343,
    },
    {
      id: "far-hill",
      kind: "commons",
      url: "https://example.test/h.jpg",
      lat: 37.6475,
      lng: 21.6205,
    },
  ];
  const gallery: ExploreMedia[] = [
    { id: "cover", kind: "place", url: "https://example.test/cover.jpg" },
    { id: "story", kind: "story", url: "https://example.test/story.jpg" },
  ];
  const bloom = placeBloom(center, gallery, commons, { haloMax: 3 });
  assert.deepEqual(
    bloom.halo.map((item) => item.id),
    ["story", "here-a", "here-b"],
    "own photos first, the place's cover never repeats",
  );
  assert.deepEqual(
    bloom.far.map((group) => [group.id, group.items.length]),
    [
      ["far-hill", 1],
      ["stadium", 2],
    ],
    "nearest distinct spot first, each with every photo taken there",
  );
});

test("Commons pages become attributed, located photos; documents and tiny files are dropped", () => {
  const info = (overrides = {}) => [
    {
      url: "https://upload.wikimedia.org/a.jpg",
      thumburl: "https://upload.wikimedia.org/thumb/a.jpg/960px-a.jpg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:a.jpg",
      width: 3000,
      height: 2000,
      mime: "image/jpeg",
      extmetadata: {
        Artist: { value: '<a href="//x">Kritheus</a>' },
        LicenseShortName: { value: "CC BY-SA 4.0" },
      },
      ...overrides,
    },
  ];
  const media = commonsPagesToMedia([
    {
      title: "File:Temple of Zeus.jpg",
      coordinates: [{ lat: 37.6, lon: 21.6 }],
      imageinfo: info(),
    },
    { title: "File:Site plan.jpg", coordinates: [{ lat: 37.6, lon: 21.6 }], imageinfo: info() },
    {
      title: "File:ISS061-E-62005 - View of Earth.jpg",
      coordinates: [{ lat: 37.6, lon: 21.6 }],
      imageinfo: info(),
    },
    {
      title: "File:Tiny.jpg",
      coordinates: [{ lat: 37.6, lon: 21.6 }],
      imageinfo: info({ width: 400 }),
    },
    {
      title: "File:Scan.tif",
      coordinates: [{ lat: 37.6, lon: 21.6 }],
      imageinfo: info({ mime: "image/tiff" }),
    },
    { title: "File:No place.jpg", imageinfo: info() },
  ]);
  assert.equal(media.length, 1);
  assert.equal(media[0].url, "https://upload.wikimedia.org/thumb/a.jpg/960px-a.jpg");
  assert.equal(media[0].credit, "Kritheus · CC BY-SA 4.0 · Wikimedia Commons");
  assert.equal(media[0].lat, 37.6);
  assert.equal(media[0].lng, 21.6);
  assert.equal(media[0].caption, "Temple of Zeus");
});

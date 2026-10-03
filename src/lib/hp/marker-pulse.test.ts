import assert from "node:assert/strict";
import test from "node:test";
import type { PulseData } from "../hp-api";
import type { Place, Post, StoryItem, Comment } from "../hp-model";
import {
  buildMarkerPulseInput,
  deriveMarkerPulseSnapshot,
  markerPulseForPlace,
  MARKER_PULSE_MAX_SNAPSHOT_AGE_MS,
  excludeHiddenPulseContributors,
} from "./marker-pulse";
import {
  readMarkerMotionPreference,
  MARKER_MOTION_STORAGE_KEY,
  LEGACY_MARKER_THEME_STORAGE_KEY,
} from "./marker-motion";

const NOW = Date.parse("2026-10-01T09:00:00Z");
const at = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const place: Place = {
  id: "place-a",
  name: "Place A",
  greekName: "Σημείο Α",
  type: "beach",
  area: "Ilia",
  lat: 37.64,
  lng: 21.31,
  x: 0,
  y: 0,
  pulse: 10,
  hotness: 10,
  status: "busy",
  commentCount: 999,
  recentPostCount: 999,
  mood: "",
  crowd: "",
  budget: "",
  bestTime: "",
  tags: [],
  short: "",
  imageUrl: "photo.jpg",
  avatars: [],
};
function data(): PulseData {
  return {
    places: [place],
    posts: [],
    stories: [],
    authors: [],
    profiles: [],
    events: [],
    meetEvents: [],
    culturalEvents: [],
    routes: [],
    vibeChips: [],
    claimedPlaceIds: [],
    dealPlaceIds: [],
    deals: [],
    placeComments: {},
    routeComments: {},
    culturalEventComments: {},
    source: "supabase",
  };
}
function post(id: string, minutes = 10, user = "user-a"): Post {
  return {
    id,
    placeId: place.id,
    authorId: "author",
    userId: user,
    kind: "spot",
    time: "now",
    createdAt: at(minutes),
    text: id,
    tags: [],
    likes: 99,
    imageUrl: "",
    comments: [],
  };
}
function story(id: string, minutes = 15, user = "user-b"): StoryItem {
  return {
    id,
    placeId: place.id,
    label: id,
    userId: user,
    kind: "photo",
    createdAt: at(minutes),
    expiresAfterHours: 6,
    authorName: "Contributor",
    authorType: "LOCAL",
    authorAvatarUrl: "",
    mediaUrl: "photo.jpg",
    caption: id,
  };
}
function level(input: PulseData) {
  return deriveMarkerPulseSnapshot(buildMarkerPulseInput(input, NOW), NOW)[place.id];
}

test("legacy hotness, statuses, counters, events and RSVP metadata never imply activity", () => {
  const input = data();
  input.events.push({
    id: "event",
    title: "Concert",
    placeId: place.id,
    time: "tonight",
    createdAt: at(1),
    price: "",
    vibe: "",
    tags: [],
  });
  input.meetEvents.push({
    id: "meet",
    title: "Gathering",
    placeId: place.id,
    lat: place.lat,
    lng: place.lng,
    hostName: "Host",
    hostAvatar: "",
    hostType: "LOCAL",
    happensAt: at(-60),
    createdAt: at(1),
    durationMin: 60,
    category: "social",
    vibe: "",
    price: "",
    description: "",
    coverUrl: "",
    tags: [],
    going: 999,
    maybe: 999,
    hot: true,
    attendeeAvatars: [],
    userId: "host-user",
  });
  assert.equal(level(input).level, null);
  assert.equal(markerPulseForPlace("missing", {}).level, null);
  assert.equal(input.places[0].imageUrl, "photo.jpg");
});

test("blocked/muted contributors are excluded from cached activity without resetting freshness", () => {
  const source = data();
  source.posts = [post("visible", 10, "visible-user"), post("blocked", 10, "blocked-user")];
  source.stories = [story("muted", 10, "muted-user")];
  const original = buildMarkerPulseInput(source, NOW);
  const before = JSON.stringify(original);
  const filtered = excludeHiddenPulseContributors(
    original,
    new Set(["blocked-user", "muted-user"]),
  );
  assert.deepEqual(
    filtered.evidence[place.id].map((e) => e.contributorId),
    ["visible-user"],
  );
  assert.equal(filtered.fetchedAt, original.fetchedAt);
  assert.equal(deriveMarkerPulseSnapshot(filtered, NOW)[place.id].level, "quiet");
  assert.equal(
    deriveMarkerPulseSnapshot(filtered, NOW + MARKER_PULSE_MAX_SNAPSHOT_AGE_MS + 1)[place.id].level,
    null,
  );
  assert.equal(
    deriveMarkerPulseSnapshot(
      excludeHiddenPulseContributors(
        original,
        new Set(["visible-user", "blocked-user", "muted-user"]),
      ),
      NOW,
    )[place.id].level,
    null,
  );
  assert.equal(JSON.stringify(original), before);
  assert.equal(excludeHiddenPulseContributors(original, new Set()), original);
});
test("unattributed seed content and invalid, future or unknown-place content are excluded", () => {
  const input = data();
  input.posts = [
    { ...post("seed"), userId: null, profileId: null },
    { ...post("invalid"), createdAt: "tonight" },
    { ...post("future"), createdAt: at(-6) },
    { ...post("unknown"), placeId: "unknown" },
  ];
  input.stories = [{ ...story("seed-story"), userId: null }];
  assert.deepEqual(buildMarkerPulseInput(input, NOW).evidence[place.id], []);
  assert.equal(level(input).level, null);
});
test("supported low community activity is quiet; no evidence remains neutral", () => {
  const input = data();
  input.posts = [post("one")];
  assert.equal(level(input).level, "quiet");
  assert.equal(level(data()).level, null);
});
test("a supported spike is emerging, while sustained single-source activity is active", () => {
  const input = data();
  input.posts = [post("one"), post("two", 12)];
  input.stories = [story("three"), story("four", 18)];
  assert.equal(level(input).level, "emerging");
  input.stories = [];
  input.posts.push(post("three", 20));
  assert.equal(level(input).level, "active");
});
test("lively requires strong confirmed evidence and at least two contributors", () => {
  const input = data();
  input.posts = Array.from({ length: 8 }, (_, i) => post(`post-${i}`));
  input.stories = [story("one"), story("two")];
  assert.equal(level(input).level, "lively");
  input.stories = input.stories.map((item) => ({ ...item, userId: "user-a" }));
  assert.equal(level(input).level, "active");
  assert.equal(level(input).contributorCount, 1);
});
test("past supported evidence fades; expired evidence eventually becomes neutral", () => {
  const input = data();
  input.posts = [post("one", 50), post("two", 52)];
  input.stories = [story("three", 55)];
  assert.equal(level(input).level, "fading");
  input.posts = input.posts.map((item) => ({ ...item, createdAt: at(9 * 60) }));
  input.stories = input.stories.map((item) => ({
    ...item,
    createdAt: at(9 * 60),
    expiresAfterHours: null,
  }));
  assert.equal(level(input).level, null);
});
test("story expiry is enforced on normalization and between refreshes", () => {
  const input = data();
  input.stories = [{ ...story("expired", 61), expiresAfterHours: 1 }];
  assert.equal(level(input).level, null);
  input.stories = [{ ...story("expiring", 59), expiresAfterHours: 1 }];
  const normalized = buildMarkerPulseInput(input, NOW);
  assert.equal(deriveMarkerPulseSnapshot(normalized, NOW)[place.id].level, "quiet");
  assert.equal(deriveMarkerPulseSnapshot(normalized, NOW + 60_000)[place.id].level, null);
});
test("duplicates do not strengthen posts, stories or comments", () => {
  const input = data();
  const comment: Comment = { author: "Person", text: "A note", userId: "user-c", createdAt: at(5) };
  const item = { ...post("one"), comments: [comment] };
  input.posts = [item];
  input.stories = [story("one")];
  input.placeComments = { [place.id]: [comment] };
  const original = level(input);
  input.posts.push(item);
  input.stories.push(input.stories[0]);
  input.placeComments[place.id].push(comment);
  assert.deepEqual(level(input), original);
  assert.equal(buildMarkerPulseInput(input, NOW).evidence[place.id].length, 4);
});
test("comment identity and timestamps are required; profiles can provide identity", () => {
  const input = data();
  input.placeComments = {
    [place.id]: [
      { author: "Seed name", text: "fake", createdAt: at(5) },
      { author: "Person", text: "missing time", userId: "user-a" },
      { author: "Person", text: "real", profileId: "profile-a", createdAt: at(5) },
    ],
  };
  assert.equal(buildMarkerPulseInput(input, NOW).evidence[place.id].length, 1);
});
test("snapshot age, unavailable source and backward clocks produce neutral markers", () => {
  const input = data();
  input.posts = [post("one")];
  const normalized = buildMarkerPulseInput(input, NOW);
  assert.equal(
    deriveMarkerPulseSnapshot(normalized, NOW + MARKER_PULSE_MAX_SNAPSHOT_AGE_MS)[place.id].level,
    "quiet",
  );
  assert.equal(
    deriveMarkerPulseSnapshot(normalized, NOW + MARKER_PULSE_MAX_SNAPSHOT_AGE_MS + 1)[place.id]
      .level,
    null,
  );
  assert.equal(
    deriveMarkerPulseSnapshot({ ...normalized, available: false }, NOW)[place.id].level,
    null,
  );
  assert.equal(deriveMarkerPulseSnapshot(normalized, NOW - 1)[place.id].level, null);
});
test("evidence is order independent and leaves production objects unchanged", () => {
  const input = data();
  input.posts = [post("one"), post("two")];
  input.stories = [story("three")];
  const before = JSON.stringify(input);
  const original = level(input);
  assert.equal(JSON.stringify(input), before);
  input.posts.reverse();
  assert.deepEqual(level(input), original);
  assert.equal(input.places[0].lat, 37.64);
  assert.equal(input.places[0].lng, 21.31);
});
test("saved motion migrates legacy identities and tolerates unavailable storage", () => {
  const storage = (values: Record<string, string>) => ({
    getItem: (key: string) => values[key] ?? null,
  });
  for (const old of ["pulse", "signal", "unknown"])
    assert.equal(
      readMarkerMotionPreference(storage({ [LEGACY_MARKER_THEME_STORAGE_KEY]: old })),
      "pulse",
    );
  assert.equal(
    readMarkerMotionPreference(storage({ [LEGACY_MARKER_THEME_STORAGE_KEY]: "calm" })),
    "calm",
  );
  assert.equal(
    readMarkerMotionPreference(
      storage({ [MARKER_MOTION_STORAGE_KEY]: "pulse", [LEGACY_MARKER_THEME_STORAGE_KEY]: "calm" }),
    ),
    "pulse",
  );
  assert.equal(
    readMarkerMotionPreference({
      getItem() {
        throw new Error("blocked");
      },
    }),
    "pulse",
  );
  assert.equal(readMarkerMotionPreference(), "pulse");
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildTrafficPreviewScene } from "./traffic-preview";
import type { MeetEvent } from "./meet-types";
import type { CulturalEvent } from "./cultural-events-types";
import type { RegionalDiscovery } from "./regional-discovery";
import { deriveMapDiscoveryContent, formatDiscoveryEventDate } from "./map-discovery-content";

const NOW = Date.parse("2026-10-05T15:00:00Z");
const HOUR = 3_600_000;
const scene = buildTrafficPreviewScene("live", NOW);
const place = scene.data.places[0];
const meet: MeetEvent = {
  ...scene.data.meetEvents[0],
  id: "meet",
  moderationStatus: "published",
  createdAt: "2020-01-01T00:00:00Z",
};
const culture: CulturalEvent = {
  id: "culture",
  title: "Local concert",
  greekTitle: "Συναυλία",
  eventType: "concert",
  venueName: "Kourouta",
  area: "Kourouta",
  placeId: place.id,
  lat: place.lat,
  lng: place.lng,
  eventDate: "2026-10-05T16:00:00Z",
  organizerName: "Fictional organizer",
  organizerId: null,
  descriptionEl: "Τοπική δοκιμή",
  descriptionEn: "Local fixture",
  posterUrl: "",
  ticketUrl: null,
  isPastEvent: false,
  isOfficial: false,
  likesCount: 0,
  moderationStatus: "published",
  userId: "culture-host",
  createdAt: "2020-01-01T00:00:00Z",
};
const region: RegionalDiscovery = {
  region: {
    id: "kourouta",
    name: "Kourouta",
    tone: "beach",
    identity: { primary: "coastal" },
    placeIds: [place.id],
    anchor: { lat: place.lat, lng: place.lng },
    bounds: [
      [place.lng, place.lat],
      [place.lng, place.lat],
    ],
    standalone: false,
  },
  searchedPlaceIds: [place.id],
  contextualPlaceIds: [place.id],
  signal: {
    level: null,
    tier: "quiet",
    quality: "uncertain",
    lastSignalAt: null,
    score: 0,
    contributorCount: 0,
  },
};
const base = {
  places: [place],
  regions: [region],
  discovery: { places: {}, areas: {} },
  viewport: null,
  lens: null,
  now: NOW,
  meetEvents: [] as MeetEvent[],
  culturalEvents: [] as CulturalEvent[],
};

test("discovery retains long in-progress Meets and excludes short ended Meets, regardless of announcement age", () => {
  const events = deriveMapDiscoveryContent({
    ...base,
    meetEvents: [
      {
        ...meet,
        id: "long",
        happensAt: new Date(NOW - 2 * HOUR).toISOString(),
        durationMin: 180,
      },
      {
        ...meet,
        id: "short",
        happensAt: new Date(NOW - HOUR / 2).toISOString(),
        durationMin: 15,
      },
      {
        ...meet,
        id: "upcoming",
        happensAt: new Date(NOW + HOUR).toISOString(),
      },
    ],
  });
  assert.deepEqual(
    events.events.map((event) => [event.key, event.kind === "meet" && event.phase]),
    [
      ["meet:long", "inProgress"],
      ["meet:upcoming", "upcoming"],
    ],
  );
  assert.equal(events.regions.get("kourouta")!.events.length, 2);
});

test("discovery Meet phases change exactly at the start and duration end", () => {
  const event = {
    ...meet,
    happensAt: new Date(NOW).toISOString(),
    durationMin: 15,
  };
  const at = (now: number) =>
    deriveMapDiscoveryContent({ ...base, now, meetEvents: [event] }).events;
  const before = at(NOW - 1)[0];
  const started = at(NOW)[0];
  assert.equal(before.kind === "meet" && before.phase, "upcoming");
  assert.equal(started.kind === "meet" && started.phase, "inProgress");
  assert.equal(at(NOW + 15 * 60_000 - 1).length, 1);
  assert.equal(at(NOW + 15 * 60_000).length, 0);
});

test("discovery excludes pending, rejected, hidden, invalid, unlinked and duplicate event rows", () => {
  const result = deriveMapDiscoveryContent({
    ...base,
    meetEvents: [
      { ...meet, moderationStatus: "pending" },
      meet,
      meet,
      { ...meet, id: "rejected", moderationStatus: "rejected" },
      { ...meet, id: "hidden", userId: "hidden-host" },
      { ...meet, id: "unlinked", placeId: "missing-place" },
      { ...meet, id: "invalid-start", happensAt: "Tonight" },
      { ...meet, id: "invalid-duration", durationMin: 0 },
    ],
    culturalEvents: [
      { ...culture, moderationStatus: "pending" },
      culture,
      culture,
      { ...culture, id: "hidden", userId: "hidden-host" },
      { ...culture, id: "unlinked", placeId: null },
      { ...culture, id: "invalid-date", eventDate: "Tonight" },
    ],
    hiddenUserIds: new Set(["hidden-host"]),
  });
  assert.deepEqual(
    result.events.map((event) => event.key),
    ["cultural:culture", "meet:meet"],
  );
});

test("invalid clocks remove schedule claims while retaining browsable places", () => {
  for (const now of [Number.NaN, Number.POSITIVE_INFINITY, 8.64e15 + 1]) {
    const result = deriveMapDiscoveryContent({
      ...base,
      now,
      meetEvents: [meet],
      culturalEvents: [culture],
    });
    assert.equal(result.events.length, 0);
    assert.deepEqual(
      result.regions.get("kourouta")!.places.map((place) => place.id),
      [place.id],
    );
  }
});

test("discovery dates and phases use Athens across device zones and the DST transition", () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ["Europe/Athens", "America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
      process.env.TZ = timezone;
      const now = Date.parse("2026-10-25T02:00:00Z");
      const result = deriveMapDiscoveryContent({
        ...base,
        now,
        meetEvents: [{ ...meet, happensAt: "2026-10-25T01:30:00Z", durationMin: 90 }],
        culturalEvents: [{ ...culture, eventDate: "2026-10-25T16:00:00Z" }],
      });
      const row = result.events.find((event) => event.kind === "meet")!;
      assert.equal(row.kind === "meet" && row.phase, "inProgress");
      assert.match(formatDiscoveryEventDate(row, "EN"), /03:30.*Europe\/Athens/);
      assert.match(
        formatDiscoveryEventDate(result.events.find((event) => event.kind === "cultural")!, "EN"),
        /18:00.*Europe\/Athens/,
      );
      assert.match(formatDiscoveryEventDate(row, "GR"), /0?3:30.*Europe\/Athens/);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("cultural events keep the Athens calendar-day grace through exact midnight", () => {
  const event = { ...culture, eventDate: "2026-10-04T18:00:00Z" };
  const at = (now: string) =>
    deriveMapDiscoveryContent({
      ...base,
      now: Date.parse(now),
      culturalEvents: [event],
    }).events.length;
  assert.equal(at("2026-10-04T20:59:59.999Z"), 1);
  assert.equal(at("2026-10-04T21:00:00.000Z"), 0);
});

test("explicit discovery clocks never read the machine clock", () => {
  const previous = Date.now;
  try {
    Date.now = () => {
      throw new Error("Unexpected wall-clock read");
    };
    assert.equal(deriveMapDiscoveryContent({ ...base, meetEvents: [meet] }).events.length, 1);
  } finally {
    Date.now = previous;
  }
});

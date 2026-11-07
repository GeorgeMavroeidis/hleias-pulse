import assert from "node:assert/strict";
import test from "node:test";
import type { Place } from "@/lib/hp-model";
import {
  STAY_BASES,
  baseOrigin,
  byDistance,
  distanceLabel,
  driveMinutes,
  isNearAnyPlace,
  nearbyBounds,
  readGpsIfAllowed,
  withDistance,
  type NearOrigin,
} from "./near-me";

function place(id: string, lat: number, lng: number): Place {
  return {
    id,
    name: id,
    greekName: id,
    type: "local",
    area: "A",
    x: 0,
    y: 0,
    lat,
    lng,
    pulse: 0,
    mood: "",
    crowd: "low",
    budget: "free",
    bestTime: "",
    tags: [],
    short: "",
    imageUrl: "",
    hotness: 0,
    commentCount: 0,
    recentPostCount: 0,
    status: "quiet",
    avatars: [],
  };
}

const katakolo = place("katakolo-port", 37.646, 21.32);
const olympia = place("ancient-olympia", 37.638, 21.63);
const kourouta = place("kourouta-beach", 37.86, 21.33);
const places = [olympia, kourouta, katakolo];

test("drive time grows with distance, rounds to 5 minutes, never below 5", () => {
  assert.equal(driveMinutes(0.2), 5);
  assert.equal(driveMinutes(27), 50); // 27 km straight ~ 38 road km at 45 km/h ~ 50 min
  assert.ok(driveMinutes(60) > driveMinutes(30));
  assert.equal(driveMinutes(30) % 5, 0);
  assert.equal(driveMinutes(NaN), 0);
});

test("places are sorted nearest first from a base", () => {
  const origin = baseOrigin("katakolo", places, "GR") as NearOrigin;
  assert.ok(origin);
  assert.equal(origin.source, "base");
  assert.equal(origin.label, "Κατάκολο");
  const ordered = withDistance(places, origin).map((r) => r.place.id);
  assert.deepEqual(ordered, ["katakolo-port", "kourouta-beach", "ancient-olympia"]);
});

test("a base whose place is missing yields no origin", () => {
  assert.equal(baseOrigin("katakolo", [olympia], "EN"), null);
  assert.equal(baseOrigin("nowhere", places, "EN"), null);
});

test("every stay base is listed once", () => {
  const ids = STAY_BASES.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("distance labels read sensibly", () => {
  assert.equal(distanceLabel(0.4, 5, "GR"), "Πολύ κοντά");
  assert.equal(distanceLabel(0.4, 5, "EN"), "Very close");
  assert.equal(distanceLabel(4.26, 10, "EN"), "4.3 km · ~10′");
  assert.equal(distanceLabel(12.4, 25, "GR"), "12 χλμ · ~25′");
});

// A stub of the two browser APIs: a permission state and a position that counts its reads.
function browser(state: PermissionState | "throws", lat = 37.67543, lng = 21.44123) {
  let reads = 0;
  return {
    reads: () => reads,
    apis: {
      permissions: {
        query: async () => {
          if (state === "throws") throw new Error("not supported");
          return { state } as PermissionStatus;
        },
      },
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) => {
          reads += 1;
          ok({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition);
        },
      },
    },
  };
}

test("opening the app never asks for location: without a prior yes nothing is read", async () => {
  for (const state of ["prompt", "denied", "throws"] as const) {
    const stub = browser(state);
    assert.equal(await readGpsIfAllowed("GR", stub.apis), null, state);
    assert.equal(stub.reads(), 0, `${state}: the position must not be read`);
  }
  assert.equal(await readGpsIfAllowed("EN", undefined), null);
});

test("with location already allowed, one read, rounded to about 100 m", async () => {
  const stub = browser("granted");
  const origin = await readGpsIfAllowed("EN", stub.apis);
  assert.equal(stub.reads(), 1);
  assert.deepEqual(origin, {
    lat: 37.675,
    lng: 21.441,
    source: "gps",
    label: "My location",
  });
});

test("only somewhere near our places counts as near", () => {
  const pyrgos = { lat: 37.675, lng: 21.441 };
  const athens = { lat: 37.984, lng: 23.728 };
  assert.equal(isNearAnyPlace(pyrgos, places), true);
  assert.equal(isNearAnyPlace(athens, places), false);
  assert.equal(isNearAnyPlace(pyrgos, []), false);
});

test("things are ordered nearest first, unknown places last, and nothing moves without an origin", () => {
  const items = ["olympia", "nowhere", "katakolo", "kourouta"];
  const at = { olympia, katakolo, kourouta } as Record<string, Place | undefined>;
  const nearKatakolo = { lat: 37.65, lng: 21.33 };
  assert.deepEqual(
    byDistance(items, (id) => at[id], nearKatakolo),
    ["katakolo", "kourouta", "olympia", "nowhere"],
  );
  assert.deepEqual(
    byDistance(items, (id) => at[id], null),
    items,
  );
});

test("near you frames the nearest places around the visitor, closer when they are close", () => {
  const atKatakolo = { lat: 37.646, lng: 21.32 };
  const one = nearbyBounds(atKatakolo, places, 1)!;
  const all = nearbyBounds(atKatakolo, places, 3)!;
  // Centred on the visitor.
  assert.ok(Math.abs((one[0][0] + one[1][0]) / 2 - atKatakolo.lng) < 1e-9);
  assert.ok(Math.abs((all[0][1] + all[1][1]) / 2 - atKatakolo.lat) < 1e-9);
  // Wider when it has to reach Olympia, 30 km east, and every place inside.
  assert.ok(all[1][0] - all[0][0] > one[1][0] - one[0][0]);
  for (const p of places)
    assert.ok(p.lng >= all[0][0] && p.lng <= all[1][0] && p.lat >= all[0][1] && p.lat <= all[1][1]);
  assert.equal(nearbyBounds(atKatakolo, []), null);
});

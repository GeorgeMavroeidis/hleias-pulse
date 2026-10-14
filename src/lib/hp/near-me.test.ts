import assert from "node:assert/strict";
import test from "node:test";
import type { Place } from "@/lib/hp-model";
import {
  STAY_BASES,
  baseOrigin,
  distanceLabel,
  driveMinutes,
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

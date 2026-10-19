import assert from "node:assert/strict";
import test from "node:test";
import type { Place } from "@/lib/hp-model";
import { defaultPlaceImage, distanceKm, nearestPlace, roundCoordinate } from "./place-defaults";

function place(id: string, type: Place["type"], lat: number, lng: number, imageUrl = ""): Place {
  return {
    id,
    name: id,
    greekName: id,
    type,
    area: `area-${id}`,
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
    imageUrl,
    hotness: 0,
    commentCount: 0,
    recentPostCount: 0,
    status: "quiet",
    avatars: [],
  };
}

const olympia = place("olympia", "culture", 37.638, 21.63, "o.jpg");
const katakolo = place("katakolo", "local", 37.646, 21.32, "k.jpg");
const kourouta = place("kourouta", "beach", 37.86, 21.33);

test("distance is roughly right (Olympia to Katakolo ~27 km)", () => {
  const km = distanceKm(olympia.lat, olympia.lng, katakolo.lat, katakolo.lng);
  assert.ok(km > 25 && km < 29, `got ${km}`);
});

test("nearest place picks the closest one", () => {
  assert.equal(nearestPlace(37.64, 21.33, [olympia, katakolo, kourouta])?.id, "katakolo");
  assert.equal(nearestPlace(37.64, 21.62, [olympia, katakolo, kourouta])?.id, "olympia");
});

test("nearest place is null without places or with bad coordinates", () => {
  assert.equal(nearestPlace(37.6, 21.6, []), null);
  assert.equal(nearestPlace(NaN, 21.6, [olympia]), null);
});

test("default image prefers the same kind, then any, then empty", () => {
  assert.equal(defaultPlaceImage("culture", [katakolo, olympia]), "o.jpg");
  assert.equal(defaultPlaceImage("beach", [kourouta, katakolo]), "k.jpg");
  assert.equal(defaultPlaceImage("beach", [kourouta]), "");
});

test("coordinates are rounded to 5 decimals", () => {
  assert.equal(roundCoordinate(37.6384567891), 37.63846);
});

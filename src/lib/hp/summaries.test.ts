import assert from "node:assert/strict";
import test from "node:test";
import type { Place, RouteItem } from "@/lib/hp-model";
import { MAX_FACTS, PLACE_SUMMARY_GR, placeSummary, routeSummary, visitLabel } from "./summaries";

function place(overrides: Partial<Place>): Place {
  return {
    id: "ancient-olympia",
    name: "Ancient Olympia",
    greekName: "Αρχαία Ολυμπία",
    type: "culture",
    area: "Olympia",
    x: 0,
    y: 0,
    lat: 37.6,
    lng: 21.6,
    pulse: 0,
    mood: "",
    crowd: "medium",
    budget: "€€",
    bestTime: "late afternoon",
    tags: ["culture", "walk"],
    short: "Ancient ruins, golden light.",
    imageUrl: "",
    hotness: 0,
    commentCount: 0,
    recentPostCount: 0,
    status: "quiet",
    avatars: [],
    ...overrides,
  };
}

function route(overrides: Partial<RouteItem>): RouteItem {
  return {
    id: "route-4",
    title: "Forest Escape",
    authorId: "a",
    lede: "Trade the heat for shade.",
    duration: "half day",
    budget: "free",
    stops: [
      { time: "10:00", placeId: "x", title: "x", body: "" },
      { time: "12:00", placeId: "y", title: "y", body: "" },
    ],
    tags: ["nature", "shade"],
    imageUrl: "",
    commentCount: 0,
    saves: 0,
    routingProfile: "driving-car",
    routeGeometry: null,
    routeDistanceMeters: null,
    routeDurationSeconds: null,
    routeInputHash: null,
    ...overrides,
  } as RouteItem;
}

test("Greek place card uses the Greek name and Greek line", () => {
  const card = placeSummary(place({}), "GR");
  assert.equal(card.title, "Αρχαία Ολυμπία");
  assert.equal(card.line, PLACE_SUMMARY_GR["ancient-olympia"]);
  assert.equal(card.untranslated, false);
  assert.deepEqual(
    card.facts.map((f) => f.label),
    ["≈ 1–2 ώρ.", "€€ Μέτριο", "Καλύτερα: αργά το απόγευμα", "Περπάτημα"],
  );
});

test("a place with no Greek line falls back to English and says so", () => {
  const card = placeSummary(place({ id: "brand-new-place" }), "GR");
  assert.equal(card.line, "Ancient ruins, golden light.");
  assert.equal(card.untranslated, true);
});

test("English card keeps the database text as is", () => {
  const card = placeSummary(place({}), "EN");
  assert.equal(card.title, "Ancient Olympia");
  assert.equal(card.line, "Ancient ruins, golden light.");
  assert.equal(card.untranslated, false);
});

test("unknown free-text values are shown as written, never dropped", () => {
  const card = placeSummary(place({ bestTime: "after the festival", tags: [] }), "GR");
  assert.ok(card.facts.some((f) => f.label === "Καλύτερα: after the festival"));
  assert.ok(card.facts.some((f) => f.kind === "crowd" && f.label === "Μέτριος κόσμος"));
});

test("cards never carry more than MAX_FACTS chips", () => {
  const card = placeSummary(place({ tags: ["family", "quiet", "walk", "shade"] }), "GR");
  assert.ok(card.facts.length <= MAX_FACTS);
});

test("route card translates duration and counts stops", () => {
  const card = routeSummary(route({}), "GR");
  assert.deepEqual(
    card.facts.map((f) => f.label),
    ["μισή μέρα", "Δωρεάν", "2 στάσεις", "Σκιά"],
  );
  assert.equal(routeSummary(route({ duration: "5h" }), "GR").facts[0].label, "5 ώρες");
});

test("visit label collapses a single value", () => {
  assert.equal(visitLabel("sunset", "EN"), "≈ 1 h");
  assert.equal(visitLabel("beach", "EN"), "≈ 2–4 h");
});

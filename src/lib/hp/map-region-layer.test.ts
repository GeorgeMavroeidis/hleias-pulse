import assert from "node:assert/strict";
import test from "node:test";
import {
  markerActivityDescription,
  nonOverlappingBubbles,
  regionBubbleView,
} from "./map-region-layer";
import type { MarkerPulseSignal } from "./marker-pulse";
import type { RegionalDiscovery } from "./regional-discovery";
import { FRESHNESS_LIMITS } from "./freshness";

const now = Date.parse("2026-10-05T12:00:00Z");
const t = (key: string, params?: Record<string, string | number>) =>
  key.replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? k));

const QUIET: MarkerPulseSignal = {
  level: null,
  tier: "quiet",
  quality: "confirmed",
  lastSignalAt: null,
  score: 0,
  contributorCount: 0,
};

function area(contextualPlaceIds: string[], signal: MarkerPulseSignal = QUIET) {
  return {
    region: { id: "katakolo", name: "Katakolo", anchor: { lat: 37.64, lng: 21.32 } },
    searchedPlaceIds: ["a", "b", "c"],
    contextualPlaceIds,
    signal,
  } as unknown as RegionalDiscovery;
}

const THUMB =
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/28/Katakolo.jpg/1280px-Katakolo.jpg";
const ORIGINAL = "https://upload.wikimedia.org/wikipedia/commons/8/8e/Lighthouse.jpg";
const PLACES = [
  { id: "a", hotness: 9, imageUrl: "https://visit-olympia.gr/files/a.jpeg" },
  { id: "b", hotness: 7, imageUrl: THUMB },
  { id: "c", hotness: 5, imageUrl: ORIGINAL },
];

test("palette context cannot grant Live to uncertain or aged retained evidence", () => {
  const signal: MarkerPulseSignal = {
    level: "lively",
    tier: "live",
    quality: "confirmed",
    lastSignalAt: new Date(now - 60000).toISOString(),
    score: 99,
    contributorCount: 3,
  };
  assert.match(markerActivityDescription(signal, now, "EN", t), /activity: Live/);
  assert.doesNotMatch(
    markerActivityDescription({ ...signal, quality: "uncertain" }, now, "EN", t),
    /activity: Live/,
  );
  assert.doesNotMatch(
    markerActivityDescription(signal, now + FRESHNESS_LIMITS.currentMs, "EN", t),
    /activity: Live/,
  );
  assert.match(
    markerActivityDescription(signal, now + FRESHNESS_LIMITS.recentMs, "EN", t),
    /Historical community activity/,
  );
});

test("an area bubble shows its name and the most popular matching photo at bubble size", () => {
  const view = regionBubbleView(area(["b", "c"]), PLACES, null, t, now, "EN");
  assert.equal(view.name, "Katakolo");
  assert.equal(view.label, "Katakolo. Explore · 2 places");
  // "a" is more popular but does not match the current lens, so it never leads.
  assert.equal(
    view.photoUrl,
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/28/Katakolo.jpg/120px-Katakolo.jpg",
  );
});

test("with no matching photo a bubble falls back to the area's places, then to its dot", () => {
  const fallback = regionBubbleView(area([]), PLACES.slice(1), null, t, now, "EN");
  assert.match(fallback.photoUrl, /\/120px-Katakolo\.jpg$/);
  const dot = regionBubbleView(
    area([]),
    [{ id: "a", hotness: 1, imageUrl: " " }],
    null,
    t,
    now,
    "EN",
  );
  assert.equal(dot.photoUrl, "");
  assert.equal(dot.label, "Katakolo. No matching places");
});

test("a single-place area speaks Greek through its place's own Greek name", () => {
  const solo = {
    ...area(["b"]),
    region: { id: "solo-b", name: "Lechaina", anchor: { lat: 37.9, lng: 21.3 } },
  } as unknown as RegionalDiscovery;
  const lechaina = [{ id: "b", hotness: 1, imageUrl: THUMB, greekName: "Λεχαινά" }];
  assert.equal(regionBubbleView(solo, lechaina, null, t, now, "GR").name, "Λεχαινά");
  assert.equal(regionBubbleView(solo, lechaina, null, t, now, "EN").name, "Lechaina");
});

test("overlapping bubbles yield to the more important one, like map labels", () => {
  const box = (id: string, left: number, top: number) => ({ id, left, top, width: 80, height: 70 });
  const shown = nonOverlappingBubbles([
    box("first", 0, 0),
    box("touching", 60, 20),
    box("clear", 200, 0),
  ]);
  assert.deepEqual([...shown], ["first", "clear"]);
});

test("bubble copy never carries raw evidence, contributor IDs, scores or timestamps", () => {
  const live: MarkerPulseSignal = {
    level: "lively",
    tier: "live",
    quality: "confirmed",
    lastSignalAt: new Date(now - 60000).toISOString(),
    score: 99,
    contributorCount: 3,
  };
  const view = regionBubbleView(area(["b"], live), PLACES, null, t, now, "EN");
  assert.match(view.label, /Recent community activity: Live/);
  assert.doesNotMatch(JSON.stringify(view), /contributor|score|evidence|99|\d{4}-\d{2}-\d{2}T/);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { Place, RouteItem } from "@/lib/hp-model";
import {
  FULL_DAY_HOURS,
  MAX_DAYS,
  addItem,
  createPlan,
  dayHours,
  deck,
  moveItem,
  parsePlan,
  plannedDayCount,
  removeItem,
  resetSkipped,
  routeHours,
  setDays,
  skip,
  suggestDay,
} from "./trip-plan";

const NOW = new Date("2026-10-11T12:00:00.000Z");

function place(id: string, type: Place["type"], hotness = 0): Place {
  return {
    id,
    name: id,
    greekName: id,
    type,
    area: "A",
    x: 0,
    y: 0,
    lat: 0,
    lng: 0,
    pulse: 0,
    mood: "",
    crowd: "low",
    budget: "free",
    bestTime: "morning",
    tags: [],
    short: "",
    imageUrl: "",
    hotness,
    commentCount: 0,
    recentPostCount: 0,
    status: "quiet",
    avatars: [],
  };
}

const places = [
  place("beach", "beach", 5),
  place("museum", "culture", 9),
  place("cafe", "local", 1),
];
const routes = [{ id: "r1", duration: "half day" } as RouteItem];
const findPlace = (id: string) => places.find((p) => p.id === id);
const findRoute = (id: string) => routes.find((r) => r.id === id);

test("trip length is clamped to 1..MAX_DAYS", () => {
  assert.equal(createPlan(0, NOW).days, 1);
  assert.equal(createPlan(99, NOW).days, MAX_DAYS);
  assert.equal(createPlan(4.6, NOW).days, 5);
});

test("adding the same thing twice moves it instead of duplicating", () => {
  let plan = createPlan(3, NOW);
  plan = addItem(plan, { kind: "place", id: "beach", day: 1 });
  plan = addItem(plan, { kind: "place", id: "beach", day: 3 });
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].day, 3);
  plan = moveItem(plan, "place", "beach", 2);
  assert.equal(plan.items[0].day, 2);
  plan = removeItem(plan, "place", "beach");
  assert.equal(plan.items.length, 0);
});

test("day hours use the long end of each estimate, routes by duration", () => {
  let plan = createPlan(2, NOW);
  plan = addItem(plan, { kind: "place", id: "beach", day: 1 }); // beach max 4
  plan = addItem(plan, { kind: "route", id: "r1", day: 1 }); // half day = 4
  assert.equal(dayHours(plan, 1, findPlace, findRoute), 8);
  assert.equal(dayHours(plan, 2, findPlace, findRoute), 0);
});

test("new picks go to the emptiest day", () => {
  let plan = createPlan(3, NOW);
  plan = addItem(plan, { kind: "place", id: "beach", day: 1 });
  plan = addItem(plan, { kind: "place", id: "cafe", day: 2 });
  assert.equal(suggestDay(plan, findPlace, findRoute), 3);
});

test("progress counts days with something planned", () => {
  let plan = createPlan(4, NOW);
  plan = addItem(plan, { kind: "place", id: "beach", day: 1 });
  plan = addItem(plan, { kind: "place", id: "cafe", day: 1 });
  plan = addItem(plan, { kind: "place", id: "museum", day: 3 });
  assert.equal(plannedDayCount(plan), 2);
});

test("the deck hides planned and skipped places, liveliest first", () => {
  let plan = createPlan(2, NOW);
  assert.deepEqual(
    deck(plan, places).map((p) => p.id),
    ["museum", "beach", "cafe"],
  );
  plan = addItem(plan, { kind: "place", id: "museum", day: 1 });
  plan = skip(plan, "beach");
  assert.deepEqual(
    deck(plan, places).map((p) => p.id),
    ["cafe"],
  );
});

test("shortening the trip moves items from removed days onto the last day", () => {
  let plan = createPlan(5, NOW);
  plan = addItem(plan, { kind: "place", id: "beach", day: 5 });
  plan = setDays(plan, 3);
  assert.equal(plan.days, 3);
  assert.equal(plan.items[0].day, 3);
});

test("route durations parse into planning hours", () => {
  assert.equal(routeHours("5h"), 5);
  assert.equal(routeHours("half day"), 4);
  assert.equal(routeHours("1 day"), FULL_DAY_HOURS);
  assert.equal(routeHours("whenever"), 3);
});

test("stored plans are validated; junk means start fresh", () => {
  assert.equal(parsePlan(null), null);
  assert.equal(parsePlan("not json"), null);
  assert.equal(parsePlan(JSON.stringify({ version: 2, days: 3, items: [] })), null);
  const plan = parsePlan(
    JSON.stringify({
      version: 1,
      days: 2,
      items: [
        { kind: "place", id: "beach", day: 9 },
        { kind: "nope", id: "x", day: 1 },
      ],
      skipped: ["cafe", 4],
    }),
  );
  assert.ok(plan);
  assert.deepEqual(plan.items, [{ kind: "place", id: "beach", day: 2 }]);
  assert.deepEqual(plan.skipped, ["cafe"]);
});

test("skipped cards can be brought back, and nothing else changes", () => {
  let plan = createPlan(2, NOW);
  plan = addItem(plan, { kind: "place", id: "museum", day: 1 });
  plan = skip(plan, "beach");
  const back = resetSkipped(plan);
  assert.deepEqual(back.skipped, []);
  assert.deepEqual(back.items, plan.items);
  assert.equal(resetSkipped(back), back);
  assert.deepEqual(
    deck(back, places).map((p) => p.id),
    ["beach", "cafe"],
  );
});

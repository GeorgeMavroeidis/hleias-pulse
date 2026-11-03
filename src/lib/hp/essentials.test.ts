import assert from "node:assert/strict";
import test from "node:test";
import {
  ESSENTIALS_CARDS,
  ESSENTIALS_SECTIONS,
  cardFreshness,
  essentialsBySection,
  sectionCounts,
  visibleCards,
  type EssentialsCard,
} from "./essentials";

const NOW = Date.parse("2026-10-11T12:00:00.000Z");

function card(overrides: Partial<EssentialsCard>): EssentialsCard {
  return {
    id: "c",
    section: "arrive",
    region: "ilia",
    title: { GR: "t", EN: "t" },
    body: { GR: "b", EN: "b" },
    lastCheckedAt: null,
    owner: "team",
    draft: true,
    ...overrides,
  };
}

test("a never-checked card is unchecked, not fresh", () => {
  assert.equal(cardFreshness({ lastCheckedAt: null }, NOW), "unchecked");
});

test("an unparseable date is treated as unchecked", () => {
  assert.equal(cardFreshness({ lastCheckedAt: "soon" }, NOW), "unchecked");
});

test("a card goes stale after the threshold, not before", () => {
  assert.equal(cardFreshness({ lastCheckedAt: "2026-09-01" }, NOW, 90), "fresh");
  assert.equal(cardFreshness({ lastCheckedAt: "2026-06-01" }, NOW, 90), "stale");
});

test("grouping keeps section order, filters by region and drops empty sections", () => {
  const cards = [
    card({ id: "e", section: "emergency" }),
    card({ id: "a", section: "arrive" }),
    card({ id: "other", section: "roads", region: "achaia" }),
  ];
  const groups = essentialsBySection(cards, "ilia");
  assert.deepEqual(
    groups.map((g) => [g.section.id, g.cards.map((c) => c.id)]),
    [
      ["arrive", ["a"]],
      ["emergency", ["e"]],
    ],
  );
});

test("shipped content: ids unique, sections known, non-draft cards were checked", () => {
  const ids = ESSENTIALS_CARDS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate card id");
  const sectionIds = new Set(ESSENTIALS_SECTIONS.map((s) => s.id));
  for (const c of ESSENTIALS_CARDS) {
    assert.ok(sectionIds.has(c.section), `${c.id}: unknown section ${c.section}`);
    if (!c.draft) assert.ok(c.lastCheckedAt, `${c.id}: published card without lastCheckedAt`);
  }
});

test("visitors never see draft cards; the team does", () => {
  const cards = [
    card({ id: "d", draft: true }),
    card({ id: "p", draft: false, lastCheckedAt: "2026-10-11" }),
  ];
  assert.deepEqual(
    visibleCards(cards, false).map((c) => c.id),
    ["p"],
  );
  assert.equal(visibleCards(cards, true).length, 2);
});

test("section counts follow what is visible", () => {
  const cards = [
    card({ id: "a", section: "arrive", draft: true }),
    card({ id: "e", section: "emergency", draft: false, lastCheckedAt: "2026-10-11" }),
  ];
  assert.deepEqual(sectionCounts(cards, "ilia", false), {
    arrive: 0,
    roads: 0,
    see: 0,
    watch: 0,
    emergency: 1,
  });
  assert.equal(sectionCounts(cards, "ilia", true).arrive, 1);
});

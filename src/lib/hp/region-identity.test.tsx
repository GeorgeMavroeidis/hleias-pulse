import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider, useI18n } from "../i18n";
import { PLACES } from "../../../scripts/hp-seed-data";
import { AREA_DEFINITIONS } from "./area-catalog";
import { buildMapRegions, deriveRegionalDiscovery } from "./regional-discovery";
import {
  identityForPlaceCategory,
  regionalDescriptorKeys,
  REGION_IDENTITIES,
} from "./region-identity";
import { communityActivityCopy, temporalHeadline } from "./context-copy";
import { getTemporalAtmosphere } from "./temporal-atmosphere";
import { FRESHNESS_LIMITS } from "./freshness";
import {
  NEUTRAL_MARKER_PULSE,
  EMPTY_MARKER_PULSE_INPUT,
  excludeHiddenPulseContributors,
  type MarkerPulseInput,
} from "./marker-pulse";

test("geographic identities override activity tones without changing curated membership", () => {
  const regions = buildMapRegions(PLACES);
  const expected = {
    kourouta: "coastal",
    katakolo: "harbour",
    kyllini: "harbour",
    pyrgos: "urban",
    olympia: "heritage",
    foloi: "forest",
    zacharo: "coastal",
  };
  for (const [id, identity] of Object.entries(expected)) {
    const region = regions.find((r) => r.id === id)!;
    assert.equal(region.identity.primary, identity);
    assert.deepEqual(
      region.placeIds,
      [...AREA_DEFINITIONS.find((a) => a.id === id)!.placeIds].sort(),
    );
  }
  assert.equal(regions.find((r) => r.id === "kourouta")!.tone, "music");
  assert.equal(regions.find((r) => r.id === "zacharo")!.identity.secondary, "nature");
  for (const region of regions.filter((r) => !r.standalone))
    assert.ok(REGION_IDENTITIES[region.identity.primary]);
});

test("standalone categories have conservative identities, never inferred social activity", () => {
  for (const [category, expected] of Object.entries({
    beach: "coastal",
    sunset: "coastal",
    culture: "heritage",
    nature: "nature",
    village: "village",
    night: "local",
    food: "local",
    local: "local",
  })) {
    const place = {
      ...PLACES[0],
      id: "unknown-place",
      type: category as (typeof PLACES)[number]["type"],
    };
    const [region] = buildMapRegions([place]);
    assert.equal(region.standalone, true);
    assert.equal(region.identity.primary, expected);
  }
});

test("descriptors use real categories, deduplicate and cap at three without adding events or social claims", () => {
  assert.deepEqual(regionalDescriptorKeys({ primary: "coastal" }, ["beach", "beach", "sunset"]), [
    "Coast",
    "beach",
    "sunset",
  ]);
  assert.deepEqual(
    regionalDescriptorKeys({ primary: "harbour", secondary: "coastal" }, ["culture"]),
    ["Harbour", "Coast", "culture"],
  );
  assert.deepEqual(regionalDescriptorKeys({ primary: "nature" }, ["nature"]), ["Nature"]);
  assert.deepEqual(regionalDescriptorKeys(identityForPlaceCategory("night"), []), ["Local places"]);
  assert.equal(
    regionalDescriptorKeys({ primary: "heritage" }, ["food", "beach", "culture", "night"]).length,
    3,
  );
});

test("temporal, regional and fallback context cannot manufacture community activity", () => {
  const regions = buildMapRegions(PLACES);
  for (const instant of [
    "2026-10-03T06:00:00Z",
    "2026-10-03T12:00:00Z",
    "2026-10-03T16:00:00Z",
    "2026-10-03T18:00:00Z",
    "2026-10-03T22:00:00Z",
  ]) {
    const now = Date.parse(instant);
    const rows = deriveRegionalDiscovery(
      regions,
      new Set(PLACES.map((p) => p.id)),
      null,
      { places: {}, areas: {} },
      EMPTY_MARKER_PULSE_INPUT,
      now,
    );
    assert.ok(rows.every((row) => communityActivityCopy(row.signal, now) === null));
    const headline = temporalHeadline(getTemporalAtmosphere({ now }));
    assert.equal(headline.source, "temporal");
    assert.doesNotMatch(headline.key, /busier|active|quiet|winding|crowd|tonight/i);
  }
  const now = Date.parse("2026-10-03T12:00:00Z");
  assert.equal(communityActivityCopy({ ...NEUTRAL_MARKER_PULSE, level: "lively" }, now), null);
  const dated = {
    ...NEUTRAL_MARKER_PULSE,
    level: "quiet" as const,
    tier: "quiet" as const,
    quality: "stable" as const,
    lastSignalAt: new Date(now).toISOString(),
  };
  assert.equal(communityActivityCopy({ ...dated, lastSignalAt: null }, now), null);
  const copy = communityActivityCopy(dated, now);
  assert.equal(copy?.source, "community-activity");
  assert.equal(copy?.key, "Recent community activity: {level}");
  assert.equal(copy?.params?.level, "Quiet");
  // Presentation anatomy must never become the public status name.
  assert.equal(
    communityActivityCopy({ ...dated, level: "lively", tier: "hot" }, now)?.params?.level,
    "Hot",
  );
});

test("regional context uses shared observation age, preserves accepted evidence after old fetches, and excludes hidden users", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  const observedAt = now - 60_000;
  const regions = buildMapRegions(PLACES),
    region = regions.find((r) => r.id === "olympia")!;
  const input: MarkerPulseInput = {
    available: true,
    fetchedAt: now,
    placeIds: region.placeIds,
    evidence: {
      [region.placeIds[0]]: [
        {
          kind: "post" as const,
          contributorId: "hidden-user",
          timestamp: observedAt,
          weight: 1,
          expiresAt: null,
        },
      ],
    },
  };
  const derive = (source = input, clock = now) =>
    deriveRegionalDiscovery(
      regions,
      new Set(region.placeIds),
      null,
      { places: {}, areas: {} },
      source,
      clock,
    ).find((r) => r.region.id === "olympia")!.signal;
  const signal = derive();
  assert.equal(signal.level, "quiet");
  assert.equal(signal.tier, "quiet");
  assert.equal(communityActivityCopy(signal, now)?.params?.level, "Quiet");
  assert.equal(
    communityActivityCopy(
      derive(excludeHiddenPulseContributors(input, new Set(["hidden-user"]))),
      now,
    ),
    null,
  );
  assert.equal(communityActivityCopy(derive({ ...input, available: false }), now), null);
  for (const fetchedAt of [null, now - 24 * 60 * 60_000, now + 24 * 60 * 60_000]) {
    assert.deepEqual(derive({ ...input, fetchedAt }), signal);
  }
  // A retained projection must lose Recent at exactly the shared evidence limit.
  assert.ok(communityActivityCopy(signal, observedAt + FRESHNESS_LIMITS.recentMs - 1));
  assert.equal(communityActivityCopy(signal, observedAt + FRESHNESS_LIMITS.recentMs), null);
  assert.equal(
    communityActivityCopy(
      derive(input, observedAt + FRESHNESS_LIMITS.recentMs),
      observedAt + FRESHNESS_LIMITS.recentMs,
    ),
    null,
  );
  const futureInput: MarkerPulseInput = {
    ...input,
    evidence: {
      [region.placeIds[0]]: input.evidence[region.placeIds[0]].map((item) => ({
        ...item,
        timestamp: now + FRESHNESS_LIMITS.futureToleranceMs + 1,
      })),
    },
  };
  assert.equal(communityActivityCopy(derive(futureInput), now), null);
  assert.equal(communityActivityCopy(derive(input, Number.NaN), Number.NaN), null);
});

test("new temporal headlines and all identity descriptors have actual Greek translations", () => {
  const keys = [
    "Morning in Ilia",
    "Afternoon in Ilia",
    "Evening in Ilia",
    "Golden hour",
    "Late night",
    "Explore Ilia",
    "Quiet",
    "Moving",
    "Hot",
    "Live",
    ...Object.values(REGION_IDENTITIES).map((value) => value.label),
  ];
  function Probe() {
    const { t } = useI18n();
    for (const key of keys) assert.notEqual(t(key), key, `missing Greek translation: ${key}`);
    return createElement("span", null, keys.map((key) => t(key)).join(" · "));
  }
  assert.match(
    renderToStaticMarkup(createElement(I18nProvider, null, createElement(Probe))),
    /Ηλεία/,
  );
});

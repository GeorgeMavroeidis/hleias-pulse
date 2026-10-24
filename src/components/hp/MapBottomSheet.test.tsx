import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider, useI18n, type TranslationParams } from "@/lib/i18n";
import { MapBottomSheet, type MapBottomSheetProps } from "./MapBottomSheet";
import { communityActivityCopy } from "@/lib/hp/context-copy";
import {
  deriveMapDiscoveryContent,
  formatDiscoveryEventDate,
} from "@/lib/hp/map-discovery-content";
import { initialMapDiscoveryState } from "@/lib/hp/map-discovery-state";
import {
  markerPulseInputFromActivity,
  deriveMarkerPulseSnapshot,
  deriveEvidencePulseSignal,
} from "@/lib/hp/marker-pulse";
import { buildPlaceStoryGroups } from "@/lib/hp/place-stories";
import {
  buildMapRegions,
  deriveRegionalDiscovery,
  discoveryViewport,
} from "@/lib/hp/regional-discovery";
import { createSheetGeometry } from "@/lib/hp/sheet-geometry";
import { FRESHNESS_LIMITS } from "@/lib/hp/freshness";
import {
  buildTrafficPreviewScene,
  TRAFFIC_SCENES,
  type TrafficScene,
} from "@/lib/hp/traffic-preview";

const ANCHOR = Date.parse("2026-10-05T15:00:00Z");
const noop = () => {};
const blankDiscovery = { places: {}, areas: {} };

function fixture(sceneId: TrafficScene = "live"): MapBottomSheetProps {
  const scene = buildTrafficPreviewScene(sceneId, ANCHOR);
  const { data, nowMs } = scene;
  const input = markerPulseInputFromActivity(
    scene.activitySnapshot,
    data.places.map((place) => place.id),
    nowMs,
  );
  const markerPulseSnapshot = deriveMarkerPulseSnapshot(input, nowMs);
  const ids = new Set(data.places.map((place) => place.id));
  const regions = deriveRegionalDiscovery(
    buildMapRegions(data.places),
    ids,
    null,
    blankDiscovery,
    input,
    nowMs,
  );
  const bounds: [[number, number], [number, number]] = [
    [20, 36],
    [23, 39],
  ];
  const viewport = discoveryViewport(
    { lat: data.places[0].lat, lng: data.places[0].lng },
    10,
    bounds,
    bounds,
    data.places,
    ids,
  );
  const content = deriveMapDiscoveryContent({
    places: data.places,
    regions,
    discovery: blankDiscovery,
    viewport,
    lens: null,
    meetEvents: data.meetEvents,
    culturalEvents: [],
    now: nowMs,
  });
  const place = data.places.find((item) => item.id === scene.focusPlaceId)!;
  const region = regions.find((item) => item.region.placeIds.includes(place.id))!;
  return {
    nowMs,
    atmosphere: {
      period: "evening",
      headlineKey: "Tonight's pulse",
      paletteKey: "evening",
      basis: "solar",
    },
    state: {
      ...initialMapDiscoveryState,
      viewport,
      snap: "expanded",
      selection: { kind: "placeSelected", regionId: region.region.id, placeId: place.id },
    },
    content,
    selectedPlace: place,
    markerPulseSnapshot,
    heights: { collapsed: 88, preview: 320, expanded: 520 },
    geometry: createSheetGeometry(520),
    onSnap: noop,
    onCollapsedHeightMeasured: noop,
    onSelectRegion: noop,
    onSelectPlace: noop,
    onClear: noop,
    onBack: noop,
    onOpenDetails: noop,
    onOpenEvent: noop,
    onSavePlace: noop,
    onSharePlace: noop,
    onOpenStory: noop,
    onClearLens: noop,
    onClearSearch: noop,
    savedPlaceIds: [],
    claimedPlaceIds: [],
    dealPlaceIds: [],
    storyGroups: buildPlaceStoryGroups(data.places, new Set(), data.stories, nowMs),
    searchQuery: "",
    dataStatus: "ready",
    selectedPlaceMatchesLens: true,
  };
}

function render(props: MapBottomSheetProps) {
  let translate = (message: string, _params?: TranslationParams) => message;
  function Probe() {
    const { t } = useI18n();
    translate = t;
    return createElement(MapBottomSheet, props);
  }
  const markup = renderToStaticMarkup(createElement(I18nProvider, null, createElement(Probe)));
  return { markup, t: translate };
}

function text(markup: string) {
  return markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

test("every local preview scene uses dated canonical status and keeps later stories without current claims", () => {
  for (const { id } of TRAFFIC_SCENES) {
    const props = fixture(id);
    const { markup, t } = render(props);
    const signal = props.markerPulseSnapshot[props.selectedPlace!.id];
    const copy = communityActivityCopy(signal, props.nowMs);
    assert.equal(markup.includes('data-copy-source="community-activity"'), Boolean(copy), id);
    if (copy)
      assert.ok(text(markup).includes(t(copy.key, { level: t(String(copy.params!.level)) })), id);
    if (signal.lastSignalAt) assert.ok(markup.includes("Europe/Athens"), id);
    else assert.ok(text(markup).includes("Άγνωστος χρόνος παρατήρησης"), id);
    assert.doesNotMatch(text(markup), /Lively|Emerging|Active|Tonight's pulse/);
    if (id === "later") {
      assert.equal(copy, null);
      assert.ok(
        text(markup).includes(t("Open stories for {place}", { place: props.selectedPlace!.name })),
      );
      assert.ok(text(markup).includes("3 ώρες"));
      assert.equal(
        props.storyGroups.some((group) => group.live),
        false,
      );
    }
  }
});

test("a rounded 99 metric displays Hot and a stale supplied Live snapshot cannot extend Live", () => {
  const props = fixture();
  const totalWeight = -4 * Math.log(1 - 98.99 / 100);
  const hot = deriveEvidencePulseSignal(
    (["post", "story", "comment"] as const).map((kind, index) => ({
      kind,
      contributorId: String(index),
      timestamp: props.nowMs,
      weight: totalWeight / 3,
    })),
    props.nowMs,
  );
  assert.equal(hot.score, 99);
  assert.equal(hot.tier, "hot");
  const rendered = render({ ...props, markerPulseSnapshot: { [props.selectedPlace!.id]: hot } });
  assert.ok(
    text(rendered.markup).includes(
      rendered.t("Recent community activity: {level}", { level: rendered.t("Hot") }),
    ),
  );
  assert.doesNotMatch(text(rendered.markup), /Lively/);
  const stale = render({ ...props, nowMs: props.nowMs + FRESHNESS_LIMITS.currentMs });
  assert.ok(
    text(stale.markup).includes(
      stale.t("Recent community activity: {level}", { level: stale.t("Hot") }),
    ),
  );
  assert.ok(
    !text(stale.markup).includes(
      stale.t("Recent community activity: {level}", { level: stale.t("Live") }),
    ),
  );
  assert.ok(stale.markup.includes("Europe/Athens"));
});

test("schedule rows retain actual long in-progress Meets, reject ended and pending, and format Athens across devices", () => {
  const props = fixture();
  const place = props.selectedPlace!;
  const liveScene = buildTrafficPreviewScene("live", ANCHOR);
  const template = liveScene.data.meetEvents.find((event) => event.placeId === place.id)!;
  const meetEvents = [
    {
      ...template,
      id: "long",
      title: "Long local gathering",
      createdAt: "2020-01-01T00:00:00Z",
      happensAt: new Date(props.nowMs - 2 * 3_600_000).toISOString(),
      durationMin: 180,
      moderationStatus: "published" as const,
    },
    {
      ...template,
      id: "short",
      title: "Ended short gathering",
      happensAt: new Date(props.nowMs - 30 * 60_000).toISOString(),
      durationMin: 15,
      moderationStatus: "published" as const,
    },
    {
      ...template,
      id: "pending",
      title: "Private pending gathering",
      happensAt: new Date(props.nowMs + 60_000).toISOString(),
      moderationStatus: "pending" as const,
    },
  ];
  const regions = [...props.content.regions.values()].map((row) => row.discovery);
  props.content = deriveMapDiscoveryContent({
    places: liveScene.data.places,
    regions,
    discovery: blankDiscovery,
    viewport: props.state.viewport,
    lens: null,
    meetEvents,
    culturalEvents: [],
    now: props.nowMs,
  });
  const previousZone = process.env.TZ;
  try {
    let expected: string | null = null;
    for (const zone of ["Europe/Athens", "America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
      process.env.TZ = zone;
      const { markup, t } = render(props);
      const visible = text(markup);
      assert.ok(visible.includes("Long local gathering"));
      assert.ok(visible.includes(t("In progress")));
      assert.ok(visible.includes(formatDiscoveryEventDate(props.content.events[0], "GR")));
      assert.doesNotMatch(visible, /Ended short gathering|Private pending gathering/);
      if (expected === null) expected = visible;
      else assert.equal(visible, expected);
    }
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

test("an explicit accepted clock produces identical content after a machine clock jump", () => {
  const props = fixture();
  const previousNow = Date.now;
  try {
    Date.now = () => Date.parse("2030-01-01T00:00:00Z");
    const future = text(render(props).markup);
    Date.now = () => Date.parse("2020-01-01T00:00:00Z");
    assert.equal(text(render(props).markup), future);
  } finally {
    Date.now = previousNow;
  }
});

test("a stale selected place prop cannot mount another place's detail/save/share actions", () => {
  const props = fixture();
  const other = buildTrafficPreviewScene("live", ANCHOR).data.places.find(
    (place) => place.id !== props.selectedPlace!.id,
  )!;
  const { markup, t } = render({ ...props, selectedPlace: other });
  assert.ok(!markup.includes(`aria-label="${t("Share {place}", { place: other.name })}"`));
  assert.ok(!text(markup).includes(t("Details")));
  assert.ok(!markup.includes("aria-pressed="));
});

test("a selected place outside a soft lens remains its own controlled target with a clear-lens action", () => {
  const props = fixture();
  const selected = props.selectedPlace!;
  const regionId =
    props.state.selection.kind === "placeSelected" ? props.state.selection.regionId : "";
  const original = props.content.regions.get(regionId)!;
  props.content = {
    ...props.content,
    regions: new Map([
      [
        regionId,
        { ...original, places: [], discovery: { ...original.discovery, contextualPlaceIds: [] } },
      ],
    ]),
  };
  props.state = { ...props.state, activeLens: "music" };
  const { markup, t } = render({ ...props, selectedPlaceMatchesLens: false });
  assert.ok(text(markup).includes(t("Clear lens")));
  assert.ok(text(markup).includes(t("Details")));
  assert.ok(markup.includes(t("Share {place}", { place: selected.name })));
  assert.ok(markup.includes(`aria-label="${selected.name}"`));
});

test("empty search offers separate query and lens recovery while idle evening copy stays neutral", () => {
  const props = fixture("quiet");
  props.state = {
    ...initialMapDiscoveryState,
    snap: "preview",
    viewport: props.state.viewport,
    activeLens: "music",
  };
  props.selectedPlace = null;
  props.content = {
    matchingVisiblePlaceCount: 0,
    visibleRegions: [],
    regions: new Map(),
    events: [],
  };
  props.searchQuery = "no matching place";
  const { markup, t } = render(props);
  const visible = text(markup);
  assert.ok(visible.includes(t("Clear search")));
  assert.ok(visible.includes(t("Clear lens")));
  assert.ok(visible.includes(t("No matching places here")));
  assert.ok(visible.includes(t("Evening in Ilia")));
  assert.doesNotMatch(visible, /Tonight's pulse|Lively|Recent community activity/);
  assert.ok(markup.includes('role="region"'));
  assert.ok(markup.includes('aria-controls="hp-discovery-content"'));
});

test("overview and selected-region views share the accepted clock, canonical tiers and historical expiry", () => {
  for (const { id } of TRAFFIC_SCENES) {
    const props = fixture(id);
    const selected = props.state.selection;
    assert.equal(selected.kind, "placeSelected");
    if (selected.kind !== "placeSelected") continue;
    const row = props.content.regions.get(selected.regionId)!;
    for (const selection of [
      { kind: "idle" } as const,
      { kind: "regionSelected", regionId: selected.regionId } as const,
    ]) {
      const { markup, t } = render({
        ...props,
        state: { ...props.state, selection },
        selectedPlace: null,
      });
      const visible = text(markup);
      const copy = communityActivityCopy(row.discovery.signal, props.nowMs);
      if (copy)
        assert.ok(
          visible.includes(t(copy.key, { level: t(String(copy.params!.level)) })),
          `${id}:${selection.kind}`,
        );
      if (row.discovery.signal.lastSignalAt) assert.ok(markup.includes("Europe/Athens"), id);
      if (id === "later") {
        assert.ok(!visible.includes(t("Recent community activity: {level}", { level: t("Live") })));
        assert.ok(!visible.includes(t("Recent community activity: {level}", { level: t("Hot") })));
        assert.ok(visible.includes("3 ώρες"));
      }
      assert.doesNotMatch(visible, /Lively|Emerging|Tonight's pulse/);
    }
  }
});

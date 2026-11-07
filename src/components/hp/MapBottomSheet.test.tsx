import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider, useI18n, type TranslationParams } from "@/lib/i18n";
import { MapBottomSheet, type MapBottomSheetProps } from "./MapBottomSheet";
import { communityActivityCopy } from "@/lib/hp/context-copy";
import { googleMapsDirectionsUrl } from "@/lib/hp/route-navigation";
import {
  deriveMapDiscoveryContent,
  formatDiscoveryEventDate,
} from "@/lib/hp/map-discovery-content";
import { initialMapDiscoveryState, type SheetSnap } from "@/lib/hp/map-discovery-state";
import { setOrigin } from "@/lib/hp/near-me";
import { eventsToday } from "@/lib/hp/region-glance";
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
  assert.ok(!markup.includes("google.com/maps/dir"));
});

test("the selected-place sheet directs guests to that place's actual coordinates", () => {
  const props = fixture();
  const place = props.selectedPlace!;
  const { markup } = render(props);
  const href = googleMapsDirectionsUrl(
    { lat: place.lat, lng: place.lng, label: place.name },
    "driving-car",
  );
  assert.ok(markup.includes(`href="${href.replaceAll("&", "&amp;")}"`));
  assert.ok(markup.includes("Google Maps"));
});

test("a selected place sheet offers Trip, Details, Save and Share in one row", () => {
  const { markup, t } = render(fixture());
  const body = text(markup);
  const trip = body.indexOf(t("Trip"));
  assert.ok(trip >= 0);
  assert.ok(trip < body.indexOf(t("Details")));
  assert.ok(markup.includes(`aria-label="${t("Save")}"`));
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

test("a quiet area nudges a local to post, but never a tourist", () => {
  const props = fixture();
  const selected = props.state.selection;
  if (selected.kind !== "placeSelected") throw new Error("fixture selects a place");
  const row = props.content.regions.get(selected.regionId)!;
  const quietRow = {
    ...row,
    discovery: { ...row.discovery, signal: { ...row.discovery.signal, lastSignalAt: null } },
  };
  const regionProps = {
    ...props,
    content: { ...props.content, regions: new Map([[selected.regionId, quietRow]]) },
    state: {
      ...props.state,
      selection: { kind: "regionSelected" as const, regionId: selected.regionId },
    },
    selectedPlace: null,
    onPostHere: noop,
  };
  const local = render({ ...regionProps, audience: "LOCAL" });
  assert.ok(text(local.markup).includes(local.t("Nobody has posted here yet.")));
  assert.ok(text(local.markup).includes(local.t("Post something")));
  const tourist = render({ ...regionProps, audience: "TOURIST" });
  assert.ok(!text(tourist.markup).includes(tourist.t("Nobody has posted here yet.")));
});

function idleSheet(props: MapBottomSheetProps, snap: SheetSnap): MapBottomSheetProps {
  return {
    ...props,
    state: { ...props.state, selection: { kind: "idle" }, snap },
    selectedPlace: null,
    onSetLens: noop,
  };
}

test("idle with live stories: stories take the lenses' row, and the lenses move into the panel", () => {
  const props = fixture("live");
  assert.ok(props.storyGroups.length > 0, "the live scene has stories");
  const collapsed = render(idleSheet(props, "collapsed")).markup;
  assert.ok(collapsed.includes("hp-discovery-story-rail"));
  assert.ok(!collapsed.includes("hp-discovery-lens-rail"), "no lens row next to the stories");
  const expanded = render(idleSheet(props, "expanded")).markup;
  assert.ok(expanded.includes("hp-discovery-story-rail"));
  assert.ok(expanded.includes("hp-discovery-lens-rail"), "lenses stay one swipe away");
  const storiesOnly = render({
    ...idleSheet(props, "expanded"),
    content: { ...props.content, events: [] },
    dealPlaceIds: [],
  });
  assert.ok(
    !text(storiesOnly.markup).includes(storiesOnly.t("Now in Ilia")),
    "no empty heading when the stories above are all that is on",
  );
  const quiet = render(idleSheet({ ...props, storyGroups: [] }, "collapsed")).markup;
  assert.ok(quiet.includes("hp-discovery-lens-rail"), "without stories the lenses keep their row");
  assert.ok(!quiet.includes("hp-discovery-story-rail"));
});

test("idle, the panel opens with what is on now: today's events and live deals", () => {
  const props = fixture("live");
  const today = eventsToday(props.content.events, props.nowMs);
  const dealPlace = [...props.content.regions.values()][0].places[0];
  const { markup, t } = render({
    ...idleSheet(props, "expanded"),
    dealPlaceIds: [dealPlace.id],
  });
  const visible = text(markup);
  assert.ok(visible.includes(t("Now in Ilia")));
  for (const event of today) assert.ok(visible.includes(event.title), event.title);
  assert.ok(visible.includes(dealPlace.name));
  assert.ok(visible.includes(t("Deal")));
  assert.ok(!visible.includes(t("Nothing new right now.")));
  assert.ok(visible.indexOf(t("Now in Ilia")) < visible.indexOf(t("Explore this view")));
});

test("idle with nothing on, the panel says so and offers the first story, never invented activity", () => {
  const props = fixture("quiet");
  const quiet = {
    ...idleSheet(props, "expanded"),
    storyGroups: [],
    dealPlaceIds: [],
    content: { ...props.content, events: [] },
  };
  let posted = 0;
  const { markup, t } = render({ ...quiet, onPost: () => posted++ });
  const visible = text(markup);
  assert.ok(visible.includes(t("Nothing new right now.")));
  assert.ok(visible.includes(t("Post the first story")));
  assert.doesNotMatch(visible, /Tonight's pulse|Lively|#1/);
  const withoutComposer = text(render(quiet).markup);
  assert.ok(!withoutComposer.includes(t("Post the first story")), "no dead button");
  assert.equal(posted, 0);
});

test("once the visitor shared where they are, live stories run nearest first", () => {
  const props = fixture("live");
  const scene = buildTrafficPreviewScene("live", ANCHOR);
  const inView = [...props.content.regions.values()].flatMap((row) => row.places);
  // Two places far apart, each with one current story.
  const [first, last] = [inView[0], inView[inView.length - 1]];
  assert.notEqual(first.id, last.id);
  const story = scene.data.stories[0];
  const stories = [first, last].map((place) => ({
    ...story,
    id: `story-${place.id}`,
    placeId: place.id,
  }));
  const storyGroups = buildPlaceStoryGroups(scene.data.places, new Set(), stories, scene.nowMs);
  assert.equal(storyGroups.length, 2);
  const railOrder = (markup: string) => {
    const rail = markup.slice(markup.indexOf("hp-discovery-story-rail"));
    return storyGroups
      .map((group) => ({ id: group.placeId, at: rail.indexOf(`>${group.placeName}<`) }))
      .sort((a, b) => a.at - b.at)
      .map((entry) => entry.id);
  };
  for (const here of [first, last]) {
    setOrigin({ lat: here.lat, lng: here.lng, source: "gps", label: "My location" });
    try {
      const { markup, t } = render({ ...idleSheet(props, "expanded"), storyGroups });
      assert.equal(railOrder(markup)[0], here.id, `nearest first from ${here.id}`);
      assert.ok(text(markup).includes(t("Now near you")));
    } finally {
      setOrigin(null);
    }
  }
});

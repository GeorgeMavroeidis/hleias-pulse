# Phase 4 — Zoom hierarchy and regional discovery

Implemented from merged Phase 3 commit `eb7b68d` on
`feat/phase4-regional-discovery`, targeting `codex/maplibre-route-previews`.
Scope ends at Phase 4. The existing discovery sheet, backend, data contracts,
refresh cadence, route previews, and content records are unchanged.

## A. Zoom hierarchy implemented

The map now follows **REGION → ACTIVITY → PLACE → DETAIL**. At wide zoom,
one native MapLibre GeoJSON symbol layer gives geographic discovery context.
At closer zoom, the existing single Supercluster system supplies count clusters
and individual Pulse markers. Details continue through existing selection and
sheet/modal behavior.

Regional symbols use an orange Pulse core, cream separation, charcoal name,
and a factual count or supported recent-community-content state. Symbol and
text collision handling includes basemap settlement labels; unrelated town
labels remain available. The existing scrolling area rail provides keyboard
selection, including visible standalone entries. Its DOM is capped at 24 entries.

Selected places retain their real geographic pin even at wide zoom. Once regional
symbols fade away, a selected area emphasizes an existing member cluster or
place instead of adding a second regional bubble.

## B. Exact thresholds and why

| Zoom | Disclosure |
| --- | --- |
| 8–10.5 | Regional symbols; zero ordinary place/cluster DOM markers |
| 10.5–11.5 | Smooth complementary regional/detail opacity crossfade |
| 11.5–14 | Spatial clusters progressively resolve into places |
| 14–18 | Individual places; existing event/story accents and details |

`map-policy.ts` owns the thresholds and camera limits. Overview remains 9.25,
with map limits 8–18. Initial catalog fitting can choose a lower zoom to accommodate
the full geometry and overlays (8.21 in the 440×700 isolated real-catalog view).
Supercluster retains radius 58, minimum two members, and maximum cluster zoom 13,
so zoom 14 guarantees individual points. Pulse motion remains eligible from 11.5;
automatic collision-managed place names remain eligible from 15.5.

The last 0.35 zoom units before each integer boundary crossfade the adjacent
cached topologies. Shared identities retain full opacity and their marker
instances. Place coordinates never interpolate or move. Pure tests verify that
each member's combined representation weight stays one through the cluster
crossfades.

## C. Regional data model

`MapRegion` contains canonical ID, name, tone, sorted member IDs, anchor,
member-coordinate bounds, and a standalone flag. It reuses all 16 existing
curated areas in `area-catalog.ts`. The loaded 51-place catalog also has six
uncatalogued `solo-*` entries, preserved under their actual place names. No new
Amaliada area or invented geography is introduced.

Geometry comes from all loaded members before search/lenses. Anchors are the
midpoint of the member bounds, and bounds describe available places rather than
administrative territory. Search cannot relocate a region. `RegionalDiscovery`
holds searched IDs, contextually relevant IDs, and the derived signal separately
from the geographic model.

`MapDiscoveryViewport` retains center/visibleAreaIds and adds zoom, hierarchy,
full bounds, usable bounds above overlays, visiblePlaceIds, and primaryAreaId.
Geographic candidates come from the same spatial index, independently of label
collision. The usable geographic bounds enclose all four screen corners; exact
membership uses projected screen coordinates so rotation, tilt, controls, and
sheet obstruction cannot report an invisible place. Primary area uses visible
contextual member count, then distance from
the map center to those members' centroid, then stable ID; an empty context has
no primary area. Updates are coalesced and deduplicated after settling, resize,
overlay changes, and discovery-context changes.

## D. Activity aggregation

Regional signals pool normalized Phase 3 observations across contextual members,
then use the same evidence-to-state helper as individual markers. They do not
average states or sum contributor totals. A contributor present in multiple
places counts once. With a lens, members must have the existing semantic
relevance of at least 0.35; search also limits membership. Other places retain
the existing soft lens emphasis at close zoom.

Evidence includes attributable public posts, stories, and comments. Existing
normalization excludes unknown place IDs, invalid/unattributed content, duplicates,
expired stories, and timestamps outside the five-minute future tolerance.
Weights remain story 1.25, post 1, and comment 0.35. The existing intelligence
model uses a 90-minute recent window, six-hour baseline, 30-minute consistency
buckets, time decay, and existing freshness/confidence thresholds. Its internal
activity thresholds remain 45 for Active and 75 for Hot, with
`legacyActivityShare: 0`; no numeric activity score is shown to users.

Uncertain evidence becomes Neutral. Fading quality or cooling becomes Fading;
Hot becomes Lively only with confirmed quality and at least two distinct
contributors, otherwise Active; rising/emerging becomes Emerging; other
supported activity is Active or Quiet. Qualitative text explicitly says
“Recent community activity.” This describes content, not attendance or live
presence. Stored hotness, seed counters, event listings, likes, and RSVP totals
cannot strengthen regional activity.

## E. Honest missing-data behavior

Missing evidence, failed refreshes, backward clocks, or snapshots older than
three minutes yield Neutral: **region name + Explore · N places**, with
lens-specific count wording when relevant. Zero matching members receive
subdued context treatment and “No matching places,” with no activity claim.
Standalone entries remain neutral discovery entries. No supported evidence
means Neutral, never a measured Quiet state.

Regional GeoJSON and accessibility labels contain no contributor identity,
raw evidence, timestamps, or internal scores. There are no new API calls,
pollers, database changes, or production fixtures. The real production catalog
was Neutral during verification. The existing sheet still has its legacy
intelligence presentation; changing that is outside this phase.

## F. Camera and restoration

Native regional clicks, the area rail, restored area links, and Back-to-area
share one framing helper. It fits the full stable member bounds above current
overlays, caps regional focus at 13.25, and uses 380ms duration. Singleton or
coincident bounds use the region anchor and a safe-viewport offset. Reduced
motion requests zero duration.

Place focus retains the existing 14.25 target when coming from farther away;
an already close, visible place preserves the user's zoom. Cluster expansion,
route geometry/stops, location behavior, generous pan bounds, and overview reset
remain. Pointer, wheel, and keyboard gestures stop camera motion immediately.
Refreshes, lenses, and incidental selection clearing do not auto-fit. Initial
catalog framing runs only once and yields to navigation, selection, and routes.

Existing URL precedence and area/place/story/post/route/tab restoration remain.
An area restore waits for map readiness and its data before framing once.
Place-only links retain their detail modal and geographic selection. Back uses
the existing selection history; Reset explicitly returns to the 9.25 overview.

## G. Performance strategy and evidence

- Wide zoom uses native regional symbols and no ordinary marker DOM tree.
- One Supercluster index is keyed only by sorted place IDs/coordinates.
  Metadata/evidence refreshes, lenses, selection, and fractional zoom retain it.
- Cached adjacent integer topologies and lazy cluster-leaf caches avoid repeated
  clustering. Queries are viewport-buffered and the query cache is bounded.
- Fractional zoom updates opacity/selection on stable marker identities. No
  continuous spatial-index rebuild, per-marker timer, or per-frame viewport callback.
- Geographic viewport, label collision, and motion density run after settling.
  Existing compositor-only marker animation and the Phase 3 animation budget remain.

Final 500-place desktop samples used the same in-app browser, 440×700 map, and
2.8-second requestAnimationFrame sampler as Phase 3. Movement went from zoom 12
to 15.5 over 2.2 seconds. No builds/checks ran during these samples.

| Sample | Phase 3 median / p95 / max | Final Phase 4 median / p95 / max |
| --- | --- | --- |
| Idle | 16.7 / 17.4 / 17.7ms | 16.7 / 17.4 / 33.3ms |
| Cluster-to-place movement | 16.7 / 17.7 / 50ms | 16.7 / 17.3 / 100ms |

Typical desktop frame times remain comparable. The worst transition frame is
longer when 500 place markers mount; this is a remaining dense-DOM limit, not
a physical-device FPS claim. Earlier Phase 4 movement sampling also recorded
an 83.3ms worst frame. Measurements are exploratory single-browser samples.

In the 500-place sweep, low zoom had zero DOM markers, intermediate zoom had
one/two clusters, and zoom 14/15.5 had 500 precise places. Across 26 threshold
samples in both directions the index count stayed constant. Evidence refresh
and eight rapid selections did not create/remove existing 500-place markers or
rebuild the index. Production PulseApp JS is 427.59kB versus Phase 3's 420.38kB;
main CSS remains 169.64kB and MapLibre bundles remain unchanged.

## H. Files changed

Added:

- `src/lib/hp/map-policy.ts` — centralized disclosure and camera policy.
- `src/lib/hp/regional-discovery.ts` — geometry, context, activity, viewport.
- `src/lib/hp/map-topology.ts` — one spatial index, caches, topology crossfades.
- `src/lib/hp/map-region-layer.ts` — native regional sprites/symbols and labels.
- `src/lib/hp/regional-discovery.test.ts` — eleven regional/topology test cases.
- `docs/phase4-regional-discovery.md` — this report.

Updated:

- `src/components/hp/PulseApp.tsx` — contextual regional data integration.
- `src/components/hp/SocialMap.tsx` — disclosure, rendering, camera, viewport.
- `src/lib/hp/marker-pulse.ts` — shared evidence-to-state helper.
- `src/lib/hp/map-visuals.ts` — label threshold from central policy.
- `src/lib/i18n.tsx` — Greek regional count/discovery/accessibility wording.
- `package.json` — regional suite included in map checks.

## I. Tests performed

- Typecheck: both TypeScript projects pass.
- Lint: zero errors, the same three existing warnings in AdminDashboard/blend-ui.
- Map visual contract checks, 12 marker tests, nine cartography tests, and eleven
  regional tests pass. Regional tests cover continuity, complete membership,
  stable filtered geometry, contextual evidence, contributor deduplication,
  expiry/freshness, neutral standalone entries, privacy-safe GeoJSON, installed
  SDK symbol validation, coordinate/index stability, and geographic viewport.
  Installed-SDK rotation/tilt coverage tests five bearings at three pitches,
  retaining visible centered members and excluding places under sheets/controls
  even when they fall inside the geographic query envelope.
- Discovery (9), intelligence (8), routing (5), and secret tests (4) pass.
- Secret scan and diff whitespace checks are clean. Production build passes
  with the existing large-chunk warning.
- Actual SocialMap browser checks with the real 51-place catalog and isolated
  80/500-place synthetic fixtures outside the product tree: repeated thresholds
  in both directions, all five lenses at overview/transition/place zooms, empty
  searches, native regional clicks, member counts, and exact place coordinates.
- The 18-case lens matrix retained the camera and index while counts changed
  logically; other close-zoom places remained visible. Empty search had no markers.
- Coincident 80-place fixture: one count-80 cluster at zoom 12 and 80 precise
  place markers at zoom 14. Singleton entries use bounded regional framing.
- Region restoration capped Olympia at 13.25 and its usable viewport contained
  all four members. Place selection, Back-to-area, Reset, keyboard panning,
  interrupted animation, refresh without refit, and a 480px sheet were checked.
- Outside-Ilia navigation at `[20, 36.5]`, zoom 12: zero visible members, no
  primary area, no ordinary markers, and successful explicit Reset.
- Actual map rotation/tilt matrix: all 15 bearing/pitch combinations retained
  the centered Ancient Olympia place and selected Olympia as the primary area.
- Final static-production checks at 390×844: place-only deep link opens its
  existing detail modal, selection remains above the sheet after closing it,
  regional keyboard selection works, and overview has zero ordinary DOM markers.
  Production error-log inspection found no console errors.

Exact reduced-motion CSS rules were exercised in isolated browser verification;
the host OS preference was not changed. Device-level reduced-motion camera
behavior and physical iOS/Android performance remain manual checks. Route tests
and unchanged restoration paths provide compatibility evidence; no new external
navigation, location permissions, content writes, or backend test writes occurred.

## J. Manual visual scenarios

1. On a physical phone, pinch repeatedly across 10.5/11.5 and integer cluster
   boundaries through zoom 14. Check coastal density and Olympia, including the
   occasional dense-transition frame stall.
2. Tap a regional symbol or keyboard-select its rail entry. Check full member
   framing and immediate pan/pinch interruption; expand the existing sheet.
3. Try all five lenses and search at overview and close zoom. Counts/activity
   must use matching places, while other close-zoom places retain soft emphasis.
4. Open area/place/story/post/route/tab links and use Back/Reset. Pan outside
   Ilia and confirm a refresh or filter does not pull the map back.
5. With real supported community content, verify Quiet/Emerging/Active/Lively/
   Fading wording. Missing/failed/stale data must show neutral Explore counts.
6. Enable the device's Reduce Motion setting and check static marker effects,
   zero-duration region focus, and readable settlement/regional label collision.

Stop after Phase 4. Merge, deployment, and Phase 5 are outside this delivery.

The pre-commit engineering review identified an incorrect two-corner viewport
calculation on rotated maps. The four-corner envelope plus exact screen-space
membership fixes that blocker while preserving rotation and tilt navigation.

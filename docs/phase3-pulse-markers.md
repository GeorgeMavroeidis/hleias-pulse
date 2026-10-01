# Phase 3 — Pulse markers

Implemented from the merged Phase 2 base `5edb1d9` on
`feat/phase3-pulse-markers`, targeting `codex/maplibre-route-previews`.
This phase changes map markers and their evidence/motion integration. It does
not change discovery-sheet layout, introduce regional discovery, or start Phase 4.

## A. Existing architecture and constraints

- MapLibre GL renders the map. Places and both cluster forms are DOM
  `MapLibre.Marker` instances, not native symbol layers.
- Curated area groups provide overview clusters. Supercluster provides detail
  clusters with the existing radius 58, minimum 2 points, and maximum zoom 13.
  Existing zoom disclosure, crossfades, group centers, expansion, and selected
  area anchors must stay compatible.
- Place markers used circular photos; clusters used collages and avatars.
  Photos and decoration enlarged their footprint beyond the geographic point.
- Events are listings attached to their existing place IDs. There is no separate
  public event-pin family. Stories attach to places too. Deals already have
  separate presentation; no new featured/curated flag is introduced.
- Existing selection callbacks, Enter/Space activation, back/overview controls,
  camera safety, search, discovery lenses, routes, and geolocation remain.
- The legacy activity tier incorporates stored hotness, status, counters, and
  event counts. Seeded/default values make it unsuitable for claiming recent
  community activity. Existing ranking and sheet consumers still use it.
- CSS owns motion. Marker/runtime refs support reuse, but changing content
  signatures previously recreated some marker instances.

## B. New architecture

`marker-pulse.ts` normalizes attributable public evidence and derives a separate
per-place snapshot. `PulseApp` updates and ages it through the existing refresh
mechanism. `SocialMap` consumes the snapshot without changing place coordinates
or the cluster algorithm.

One DOM factory creates a fixed anatomy: core, state ring, selection contour,
selection accent, event arc, story dot, and name. Updates change text, classes,
attributes, and CSS variables directly. Place text uses `textContent`; it cannot
become injected HTML. Numbered route-stop text uses the same safe insertion.

Place cores are 14px, or 16px for Lively, centered on `[place.lng, place.lat]`.
Cream separates the orange point from the light map; charcoal defines its edge.
The transparent 44px interaction target does not enlarge the visible core.
Rings stay within a 40px decorative footprint, including existing mild lens
scale factors. Cluster cores are 30/34/40px and show the count of **places**.
Clusters are static and carry no aggregate activity claim.

Selection adds a double contour and stacking priority, without doubling size.
Names appear on selection, hover, and keyboard focus. At zoom 15.5, settled
viewport collision checks prioritize selection, then discovery prominence and
stable ID. Existing lens opacity, scale, and stacking behavior is preserved.
A separate context-opacity variable is available for later work; this phase
does not introduce unrelated-marker fading.

Photos, collages, avatars, and thumbnail warming are removed from public map
markers. Existing imagery remains in sheets, stories, and details. Admin Leaflet
markers, route geometry, numbered stops, and the user-location dot retain their
existing roles.

A short-map positioning fix moves the attribution control to the left when it
would overlap the overview-reset control above a tall sheet. All map credits
remain available. The discovery sheet itself is unchanged.

## C. Supported states

| State            | Meaning and treatment                                                                      | Pulse cycle |
| ---------------- | ------------------------------------------------------------------------------------------ | ----------- |
| Neutral (`null`) | Missing/uncertain evidence; static dashed outline                                          | None        |
| Quiet            | Supported low community activity; subdued static core                                      | None        |
| Emerging         | Existing rising/emerging evidence; subtle breath                                           | 8s          |
| Active           | Supported activity; restrained halo                                                        | 6s          |
| Lively           | Strong confirmed evidence from at least two contributors; 16px core and one radiating ring | 5s          |
| Fading           | Existing cooling/fading evidence; lower intensity and dissipating ring                     | 10s         |

Calm doubles cycle durations while keeping the same palette and geometry.
Legacy Calm migrates to Calm; legacy Pulse/Signal migrate to Pulse. System
reduced motion removes ring/accent animation and transitions. Known animated
states can receive one 650ms selection accent; Neutral remains static.

Small Mediterranean-blue accents mean an event is listed or a story is
available. They do not imply attendance, popularity, or a measured live crowd.

## D. Data assumptions

- Evidence is limited to public bootstrap posts, stories, post comments, and
  place comments with `userId` or `profileId`, a valid timestamp, and a known
  place link. Contributor attribution is a content signal, not proof of presence.
- Unattributed seed/editorial content, display-time strings, stored hotness,
  status, counters, event listings, likes, and RSVP totals cannot strengthen a
  marker state. No random or synthetic activity enters production logic.
- Existing area-intelligence thresholds, weighting, clock tolerance, and decay
  are reused with `legacyActivityShare: 0`. Lively additionally requires
  confirmed quality and at least two contributors; otherwise it becomes Active.
- Stories expire according to their existing lifetime. Invalid timestamps,
  timestamps beyond the existing five-minute future tolerance, and unknown
  place IDs are excluded. Evidence is deduplicated before scoring.
- Comments have no stable ID in the current contract, so deduplication uses
  target, contributor, timestamp, and text. No database/schema change is required.

## E. Missing activity

No supported evidence means Neutral, never measured Quiet. Failed refreshes
neutralize the cached snapshot immediately. Snapshots older than three minutes
derive Neutral on the shared aging tick or foreground freshness check. There is
no additional polling or per-marker timer. Accessibility text explicitly says
community activity is unavailable. Automatic map summaries use counts,
selection, or filter context instead of unsupported claims about tonight.

The loaded 51-place public dataset was Neutral during browser verification.
Its factual event/story accents and existing imagery remained available.
This is expected when returned content lacks supported recent attribution.

## F. Performance and density

- Marker identity survives evidence updates, selection, zoom changes that retain
  that identity, and motion preference changes. Only topology/filter removal
  destroys a marker. No map remount is needed.
- CSS animates only ring transform/opacity. The geographic core never pulses or
  bounces. No React animation loop, marker interval, or continuous label pass.
- Motion starts at zoom 11.5. Visible meaningful states compete for one ordinary
  animation per crowded 96px cell, capped at 24 ordinary markers plus selection.
- Movement, hidden documents, offscreen coordinates, and sheet obstruction pause
  effects. Distant/suppressed effects have no running animation. Labels and
  density are recalculated on viewport settling and relevant data/selection changes.
- Public map image elements drop from 500 to zero in the 500-place fixture.
  Main CSS drops from Phase 2's 210.43kB to 169.64kB; PulseApp JS drops from
  427.74kB to 420.38kB. MapLibre/worker bundles remain unchanged.

Isolated fixtures mounted the actual map component, with 6, 80, and 500 places,
plus identical-coordinate overlaps. Synthetic activity was labeled test-only
and kept outside the production tree. All checked marker coordinates matched
the fixture inputs. Six states rendered, with four animated meaningful states.
The 80-place fixture had nine running rings; the 500-place fixture had 16, or
18 after rapid selection and evidence changes. Applying the actual reduced-motion
CSS rules produced zero animations and zero ring transforms. Expanded-sheet
clipping reduced the animation set.

The initial 500-place pass created exactly 500 markers and one map. Evidence
refresh plus eight rapid selections left creation/removal counts at 500/0.
Later changing 500 → 80 → 500 legitimately added/removed identities; subsequent
evidence and Calm changes left those creation/removal counters unchanged.
An 80-place overlap cluster displayed count 80 and expanded to zoom 14.25.

Exploratory same-browser 500-place frame samples (2.8-second requestAnimationFrame
checks, existing 440×700 map fixture):

| Sample                     | Phase 2 median / p95 / max | Phase 3 median / p95 / max |
| -------------------------- | -------------------------- | -------------------------- |
| Idle                       | 33.3 / 34.3 / 100ms        | 33.3 / 34.3 / 34.4ms       |
| Cluster-to-detail pan/zoom | 1166.7 / 2067.5 / 2067.5ms | 65.8 / 332.4 / 334.3ms     |

These are single desktop in-app-browser samples, with roughly 30Hz idle
scheduling and other local work. They show no observed regression and substantially
fewer dense-transition stalls, but do **not** establish physical-device FPS.
The 500-place transition still has long frames. Existing DOM-marker topology
and continuous zoom reconciliation remain; a native-layer migration is outside
this phase. Label collisions are settle-only and quadratic at worst.

## G. Files changed

Added:

- `src/lib/hp/marker-pulse.ts` — evidence normalization and state snapshot.
- `src/lib/hp/marker-motion.ts` — preference and legacy migration.
- `src/lib/hp/map-clusters.ts` — extracted existing grouping and event linkage.
- `src/lib/hp/marker-pulse.test.ts` — evidence/state/migration coverage.
- `src/styles/pulse-markers.css` — shared geometry, state, interaction, motion.
- `docs/phase3-pulse-markers.md` — this report.

Updated:

- `SocialMap.tsx`, `PulseApp.tsx`, `PulseTopBar.tsx`, `pulse-shared.ts` — marker
  integration, stable lifecycle, refreshing, factual summaries, and preferences.
- `src/lib/hp/map-visuals.ts` — sizes, density priority, phases, label collisions.
- `src/lib/i18n.tsx` — Greek labels and accessibility descriptions.
- `src/styles.css`, `src/styles/map-base.css`, `src/styles/map-overlays.css` —
  stylesheet integration, obsolete overrides removed, compact-map control fix.
- `scripts/check-map-visuals.ts`, `package.json` — revised marker contracts and
  marker test command.

Removed obsolete marker styles:
`src/styles/markers.css`, `marker-themes.css`, and `marker-anatomy.css`.
No place/event records, seed fixtures, dependencies, database objects,
discovery-sheet components, or production mock-data sources were changed.

## H. Checks performed

- `npm run typecheck` — both TypeScript projects pass.
- `npm run lint` — zero errors; the same three existing warnings in
  `AdminDashboard.tsx` and `blend-ui.tsx`.
- `npm run test:map-visuals` — geometry, 1–500-marker budget, clipping,
  selection/labels, stable DOM, keyboard/lenses, coordinates, event linkage,
  full cluster membership/counts/expansion, and basemap contracts pass.
  Includes 12 marker tests and 9 cartography tests.
- `npm run test:discovery` (9), `test:intelligence` (8), `test:routing` (5), and
  `test:secrets` (4) — all pass.
- `npm run check:secrets` — clean.
- `npm run build` — static production build passes; existing large-chunk warning.
- `git diff --check` — clean.
- Development and final static-production browser checks — search narrows
  markers, all five lenses select and alter prominence, clusters expand,
  Enter/Space selection works, selected contours remain visible, photos remain
  in the sheet, and map panning/zooming work. No production console errors.
- Development responsive view at 390×844 and production desktop framing of the
  440px app. Fixture density/reuse and reduced-motion rule checks as above.

Reduced-motion rule behavior was exercised by applying the exact media-query
contents in the isolated test harness. The OS preference itself was not changed;
native accessibility integration and physical iOS/Android performance remain
manual checks. No new content, location permissions, or server writes were used.

## I. Manual visual checks

1. On a physical phone, pan and pinch from overview counts into individual
   places. Check overlapping coastal points and a dense area such as Olympia.
2. Select several places quickly. Confirm the point stays precise, the double
   contour/name is clear above the sheet, and the sheet keeps its images.
3. Try all five lenses, a matching search, and an empty search. Clear each and
   verify the expected markers return.
4. Compare Pulse and Calm with supported recent community content. Neutral
   seed-only places should stay static; event/story accents remain factual.
5. Turn on the device's Reduce Motion setting. Check static rings, no selection
   accent, keyboard focus where available, and camera transitions.
6. Open a tall selected-place sheet on a short screen. Attribution must remain
   reachable and must not cover the overview-reset button.

Stop after Phase 3. Merge, deployment, regional discovery, and Phase 4 are not
part of this delivery.

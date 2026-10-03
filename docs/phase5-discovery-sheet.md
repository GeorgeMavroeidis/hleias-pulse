# Phase 5 — discovery sheet and selection

Phase 5 builds on Phase 4 (`e01f58f`) and retains the existing custom Framer Motion sheet. Vaul is installed but was not the map sheet implementation. No library, dependency, backend, polling, or schema change was needed.

## A. Selection architecture

`map-discovery-state.ts` owns one discriminated selection: idle, regionSelected (region ID), or placeSelected (region and place IDs). The same reducer owns collapsed/preview/expanded snap, active lens, settled viewport, camera (center, zoom, bearing, pitch), and up to twelve valid Back targets. Current place records are derived from loaded data rather than copied into selection state.

Region and marker taps, sheet rows, route stops, new places, and deep-link restoration dispatch atomic selection actions. Close, empty-map taps, and full collapse clear selection/history and retain the camera. Back/Escape first closes a map-owned detail overlay; expanded idle collapses directly, expanded selection steps down to preview, and selected preview restores selection history. Browser Back keeps its normal navigation behavior. Search/data deletion prunes invalid selection/history. Soft lenses and manual zoom-out retain a selected place. Leaving Map captures its exact camera and clears selection; returning restores camera and lens.

The reducer also owns an explicit route-framing revision. Opening/reopening a route advances it; a captured camera records the revision already framed. Route layers and stop pins redraw on Map return without overriding that camera. Geometry refreshes also preserve manual navigation. An imperative current-tab ref rejects late viewport updates from the outgoing map during tab exit animation.

## B. Sheet states and snap points

The pre-Phase-5 sheet had a measured idle peek, a blank 44px selected peek, separate region/place previews, and an 85% expanded height. Its lists only scrolled when expanded, and drag height updated app state continuously.

The retained sheet now uses:

- **Collapsed:** measured summary, at least 72px when the stage permits, with a keyboard-operable expand button and factual matching-place count.
- **Preview:** idle/region target 220–276px (38% of stage); place target 252–300px (42% of stage). Both are clamped to available space. Lists scroll here too.
- **Expanded:** approximately 62% of the map stage, keeping at least 188px of map when enough space exists for a usable sheet body. Short landscape stages reduce that map minimum toward 72px. Coincident physical snaps are deduplicated for dragging, while named snap intent survives resize.

The stage is measured above bottom navigation. Navigation continues to own the bottom safe-area inset; the sheet adds no duplicate inset. Short landscape chrome is compacted so content remains scrollable. Header-only pointer capture separates sheet dragging from map panning, list scrolling, and horizontal filters. Pointer cancellation/lost capture restores the committed snap. Labelled headings, selection announcements, Back/Close/snap controls, focus restoration, and existing modal ownership preserve keyboard access. Reduced motion sets sheet/camera duration to zero.

## C. Camera coordination and performance

Regions fit their established full-member bounds using the destination preview height and existing zoom cap. A selected place at close zoom only pans when outside the safe rectangle; wider views use the established place focus zoom. The rectangle accounts for sheet, chrome, marker radius, and screen dimensions, including short landscape stages. Camera snapshots include orientation and suppress initial catalog fitting on remount.

Explicit route framing uses `cameraForBounds` followed by `easeTo`, keeping route padding out of persistent map state. The active-route return check preserved center `[21.43873210666021, 37.68026584596865]`, zoom 13.8, bearing 45, pitch 30, and zero persistent padding exactly after native pan/zoom. All three route stop markers were restored. Reopening the same route advanced the framing revision and replaced that saved view.

Live sheet geometry uses a Motion value and a small imperative subscription. No app state update occurs per drag frame. Necessary corrections are coalesced through requestAnimationFrame; up to three small settled corrections handle perspective. Viewport discovery is published after sheet motion settles. Map gestures interrupt camera motion; intentionally offscreen selections remain retained. Selected pins stay fully emphasized, regional members remain close to normal, and unrelated markers/signals are subtly faded through the existing systems.

Isolated fixtures outside the product source tree measured:

- 80-place expansion: two discovery-root renders, one settled viewport update; zero map/index rebuilds or marker creation/removal.
- 500-place expansion: three discovery-root renders, two viewport updates; zero map/index rebuilds or marker creation. Seventy offscreen markers were removed as the necessary camera pan changed visible bounds.
- Actual `PulseApp` pointer drag under React StrictMode: four render calls (two commits), zero new maps, indexes, markers, or removals.
- All fifteen combinations of bearing 0/45/90/180/270 and pitch 0/30/60 retained a safe selected pin after expansion.
- Camera remount preserved `[21.4408, 37.6705]`, zoom 15.5, bearing 45, pitch 30 exactly.

These local development measurements establish render/index stability, not a physical-device FPS guarantee. The dense 500-place run had frame spikes; median frame interval was 16.7ms. Fixtures/instrumentation are not bundled into production.

## D. Discovery data

`map-discovery-content.ts` derives viewport-matching region rows, catalog places/categories, counts, and dated events. Idle ranking is deterministic: lens relevance, matching visible-place count, eligible visible-event count, distance from viewport center, stable region ID. Region selection reveals all matching members and their eligible events; place selection reveals image, area, short description, budget/best time when present, verified/deal status, stories, and existing Save/Share/navigation/Details flows.

Qualitative context reuses normalized Phase 3/4 attributable public community evidence with the existing three-minute freshness policy. Meet events use the existing one-hour start grace window; cultural events use their existing end/start rules. Invalid dates, missing place links, duplicated event identities, and blocked/muted authors are excluded. Meet rows open the existing Meet surface focused on the event; cultural rows open the existing detail modal.

## E. Unavailable live data

No stored hotness, attendance, crowd/status, seed counter, likes, or RSVP total implies live discovery activity. Missing/stale/failed/unattributed community evidence produces neutral catalog/category context. Legacy undated events remain in the existing detail flow and never enter scheduled discovery counts. Opening-state claims are omitted because structured hours are unavailable. Loading/error/empty-search states use honest copy; existing application retry behavior remains available. Missing/failed place photos use an explicit fallback.

## F. Files modified

- `package.json`
- `src/components/hp/ImageBox.tsx`
- `src/components/hp/MapBottomSheet.tsx`
- `src/components/hp/MeetScreen.tsx`
- `src/components/hp/PulseApp.tsx`
- `src/components/hp/SocialMap.tsx`
- `src/components/hp/pulse-shared.ts`
- `src/lib/hp/cultural-events-types.ts`
- `src/lib/hp/map-discovery-content.ts` (new)
- `src/lib/hp/map-discovery-state.ts` (new)
- `src/lib/hp/map-discovery.test.ts` (new)
- `src/lib/hp/map-region-layer.ts`
- `src/lib/hp/map-sheet-camera.ts` (new)
- `src/lib/hp/regional-discovery.ts`
- `src/lib/hp/sheet-geometry.ts` (new)
- `src/lib/i18n.tsx`
- `src/styles/map-chrome.css`
- `docs/phase5-discovery-sheet.md` (new)

## G. Validation

Passed: typecheck, lint (zero errors; three pre-existing warnings), map visual contracts, marker tests, cartography tests, regional discovery tests, fourteen new map-discovery tests, existing discovery/intelligence/routing tests, secret-scanner tests and scan, production static build, and `git diff --check`. The existing large-bundle warning remains.

New tests cover atomic transitions, bounded/pruned history, Back/collapse semantics, lens/zoom retention, tab camera snapshots, resize/coincident snaps, viewport counts/ranking, dated/muted/invalid event eligibility, safe rectangles, live geometry subscriptions, orientation signatures, and installed MapLibre SDK correction under rotation/pitch. Existing regional/marker tests cover stale/unavailable community evidence and geographic membership.

Browser checks used the actual production static entry plus isolated development fixtures. Checked all ten requested scenarios: idle → region; region → place; place → another place; place → idle; selected-sheet drag; partial-sheet map pan; selection/filter changes; resize/rotation; 320×568 and 568×320 layouts; Back/Escape. Also checked modal dismissal ordering, tab departure/return, failed photos, honest loading/error copy, reduced-motion JavaScript behavior, Greek wrapping, and keyboard controls. Production Meet contained no eligible dated events during this run, so event eligibility/action wiring was checked with fixtures and code inspection rather than by creating production data.

Additional browser checks covered English copy, 150% text geometry, area-over-place deep-link precedence, place details from a shared link, route details/map opening, and Meet event focus after resetting an excluding filter. That last check exposed a focus-before-mount race; focus now waits for the target card's filter/data commit and runs once per requested event. The corrected fixture focused the intended card and scrolled it into view.

The pre-commit engineering-manager review found two blockers: expanded idle Back did not collapse directly, and retained routes reframed the map on tab return. Both were corrected and gained regression coverage. The route browser retest also exposed and corrected the late exit-animation viewport update described above. Dense-map physical-device smoothness and device accessibility/authenticated actions remain release checks.

## H. Manual device scenarios

Before release, repeat the ten flows on a physical iPhone/WebView, including safe-area insets, 200% text, VoiceOver announcements, long touch drags/cancellation, system reduced motion, and interrupted camera gestures. Confirm GPS permission/locate behavior with device permission, route stop/route preview coordination, browser Back, and shared place/area/route links. Verify event-row focus with a real eligible Meet/cultural event and Save/Share actions in an authenticated session. No authenticated write, GPS permission grant, merge, or deployment was performed in this phase.

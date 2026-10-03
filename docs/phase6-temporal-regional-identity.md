# Phase 6 — temporal atmosphere and regional identity

Built on merged Phase 5 commit `098eb0e415ec08246b960219cba2ccb3a1f2df07`, on `feat/phase6-temporal-regional-identity`, targeting `codex/maplibre-route-previews`. Presentation changes are limited to the map and discovery sheet. No backend, schema, new data request, deployment, or final-polish work is included.

## A. Temporal architecture

`temporal-atmosphere.ts` owns the pure `getTemporalAtmosphere({ now })` resolver. It returns period, headline translation key, palette key, calculation basis, and the next absolute boundary timestamp. `Intl.DateTimeFormat` interprets calendar dates in **Europe/Athens**; the developer's or viewer's timezone does not change the result.

Pinned SunCalc `2.1.0` calculates sunrise, evening golden-hour start, and sunset locally at the existing Ilia map center `[21.52, 37.68]`. No GPS or solar API is used. Calculations are cached by Athens calendar date, bounded to eight dates. Invalid or misordered sunlight results fall back honestly. See the [SunCalc implementation and definitions](https://github.com/mourner/suncalc/tree/v2.1.0); its BSD notice is preserved in `public/third-party/suncalc-LICENSE.txt`.

`createTemporalAtmosphereClock` owns one boundary timeout and publishes only changed presentation fields. Midnight can recalculate tomorrow's sunlight without publishing an unchanged late-night atmosphere. `useTemporalAtmosphere` activates that clock only while Map is active and the document is visible, resolves immediately on return, and cleans up on unmount. The existing app clock notifications detect forward/backward clock jumps; no additional interval or network polling was added.

Initial map construction uses the latest palette, including changes while the asynchronous basemap loads. Subsequent changes reuse the cartography rules and call `setPaintProperty` only for recognized color properties. Sources, layers, layouts, sprites, topology, routes, markers, camera, selection, and sheet snap are preserved. Regional text/halos change with the basemap; orange-and-cream symbols retain their geometry and colors. Supported paint transitions use **800 ms**, or **0 ms** for reduced motion.

## B. Time periods and rules

Starting boundaries are inclusive; ending boundaries are exclusive.

| Period      | Athens interval                        | Idle headline     | Palette     |
| ----------- | -------------------------------------- | ----------------- | ----------- |
| Morning     | Sunrise to 12:00                       | Morning in Ilia   | Day         |
| Afternoon   | 12:00 to evening golden-hour start     | Afternoon in Ilia | Day         |
| Golden hour | Calculated golden-hour start to sunset | Golden hour       | Golden hour |
| Evening     | Sunset to 23:00                        | Tonight's pulse   | Evening     |
| Late night  | 23:00 to next sunrise                  | Late night        | Late night  |

Solar timestamps are absolute instants. Civil noon, 23:00, and midnight are resolved in Athens without a fixed UTC offset or assumed 24-hour civil day. For example, at the Ilia reference point on June 21, 2026, evening golden hour begins around 20:20 Athens and sunset is around 20:59; on December 21 they are around 16:38 and 17:19. These are regional reference calculations, not location-specific promises.

If sunlight calculation fails: morning 06:00–12:00, afternoon 12:00–18:00, evening 18:00–23:00, late night otherwise. There is no golden-hour claim in this fallback. An invalid clock uses the day palette and “Explore Ilia.”

## C. Copy-generation rules

`context-copy.ts` defines explicit temporal, community-activity, regional-metadata, and fallback sources. The discovery sheet exposes those sources in `data-copy-source` attributes. Temporal copy describes the period only. Selected region/place names keep heading priority.

Community wording remains separately labelled **“Recent community activity: …”** and accepts only existing evidence-derived signals with a supported level and non-uncertain quality. Static geography, clock state, likes, hotness, RSVP totals, attendance, opening hours, and raw seed counters cannot create that wording. Missing/stale/unavailable evidence produces neutral exploration/category context. New temporal headlines and identity labels have Greek translations through the existing localization system.

Regional descriptions combine primary/secondary identity with actual matching place categories, remove duplicate keys, and cap output at three terms. They do not infer events, crowds, “social” conditions, or comparative busyness.

## D. Regional identity architecture

`region-identity.ts` defines coastal, urban, harbour, heritage, forest, nature, village, and neutral local identities. Optional `AreaDefinition.identity` metadata is separate from existing activity/content `tone`; curated membership and coordinates are unchanged. `buildMapRegions` carries this identity into discovery.

| Region   | Primary / secondary identity |
| -------- | ---------------------------- |
| Kourouta | Coastal                      |
| Katakolo | Harbour / coastal            |
| Kyllini  | Harbour / coastal            |
| Pyrgos   | Urban                        |
| Olympia  | Heritage                     |
| Foloi    | Forest / nature              |
| Zacharo  | Coastal / nature             |

Remaining curated areas derive identity from their existing geographic tones. Standalone places use their actual category; food/night/local categories stay neutral local. A selected region gets a small muted header line and faint border detail. Markers remain uniform and the global brand dominates. Warm cream, blue sea, charcoal labels, orange cores, coastline, and existing curved/line geometry carry the brand without illustrations or repeated logos.

## E. Static versus live data

- **Deterministic time:** the explicit timestamp, Athens calendar rules, and local solar calculation. No social inference.
- **Community evidence:** existing normalized public, attributable contributions, deduplicated by contributor and subject to the existing three-minute freshness policy. Blocked/muted contributors are excluded before marker and regional signals derive. Filtering preserves the original fetch time and availability, so moderation cannot make stale evidence fresh.
- **Static regional metadata:** catalog identity, real place membership, categories, names, and muted accent tokens. Identity does not vary with time or activity.
- **Fallback:** neutral exploration/category wording and day/clock fallback palettes when clock or evidence is unavailable. No synthetic live behavior is shipped.

## F. Exact files changed

- `docs/phase6-temporal-regional-identity.md` (new)
- `package.json`
- `package-lock.json`
- `public/third-party/suncalc-LICENSE.txt` (new)
- `scripts/check-map-cartography.test.ts`
- `src/components/hp/MapBottomSheet.tsx`
- `src/components/hp/PulseApp.tsx`
- `src/components/hp/SocialMap.tsx`
- `src/components/hp/use-temporal-atmosphere.ts` (new)
- `src/lib/hp/area-catalog.ts`
- `src/lib/hp/context-copy.ts` (new)
- `src/lib/hp/map-cartography.ts`
- `src/lib/hp/map-region-layer.ts`
- `src/lib/hp/marker-pulse.ts`
- `src/lib/hp/marker-pulse.test.ts`
- `src/lib/hp/regional-discovery.ts`
- `src/lib/hp/regional-discovery.test.ts`
- `src/lib/hp/region-identity.ts` (new)
- `src/lib/hp/region-identity.test.tsx` (new)
- `src/lib/hp/temporal-atmosphere.ts` (new)
- `src/lib/hp/temporal-atmosphere.test.ts` (new)
- `src/lib/i18n.tsx`
- `src/styles/map-base.css`
- `src/styles/map-chrome.css`

## G. Validation results

Passed:

- `npm run typecheck` for both app and Node TypeScript projects.
- `npm run lint`: zero errors; the same three existing warnings in `AdminDashboard.tsx` and `blend-ui.tsx`.
- `npm run test:map-visuals`: existing visual contracts plus **64 passing tests** (13 marker, 11 cartography, 12 regional discovery, 14 map discovery, 8 temporal, 6 identity).
- Discovery (9), intelligence (8), routing (5), and secret-scanner (4) tests; **90 tests total** across these suites.
- `npm run check:secrets`: clean.
- `npm run build`: production static build succeeds; existing large-chunk warning remains.
- `git diff --check`.

Temporal coverage includes every period and exact boundary, midnight/year rollover, real summer/winter sunlight, both Athens DST transitions, invalid clocks, failed/null/misordered solar results, bounded caching, timer cleanup/resume/deduplication, clock jumps, and matching subprocess outputs under UTC, Athens, and America/Los_Angeles developer timezones. Identity/copy coverage includes catalog overrides, membership preservation, standalone fallbacks, factual/deduplicated/capped descriptors, Greek translations, missing/stale/hidden-author evidence, and backward snapshot ages.

All four palette styles validate against the installed MapLibre validator using the captured actual Bright style. Source/layout preservation is checked. Primary/secondary land labels and water labels meet at least 4.5:1 contrast against their principal surfaces; land/sea separation meets at least 1.5:1. Runtime tests prove paint values match initial style creation, transitions respect duration, and regional geometry/disclosure and route overlays remain unchanged. These token checks supplement visual inspection rather than promising contrast over every satellite/provider feature.

Browser QA used real `SocialMap`/`MapBottomSheet` components in isolated fixtures outside the repository, plus the built production static app. All twenty palette/zoom combinations (five periods × overview/place zoom × real 51-place catalog/dense 500-place fixture) kept map/index instances, camera, layers, sources, counts, and marker instances stable: zero marker creation/removal per atmosphere change, no captured map errors. Selection/expanded snap/route pins and bearing 45°/pitch 30° were retained across an atmosphere change. Six requested region identities/descriptors rendered correctly and neutrally without evidence.

The actual lifecycle hook was exercised under React StrictMode with a fixture clock at noon and the real calculated golden-hour boundary. It retained one timer while active, zero outside Map/hidden/unmounted, and immediately resolved forward/backward clock jumps on tab/visibility return. Reduced-motion map paint reported duration zero. Checked Greek/English, 320×568 portrait, 568×320 landscape, 390×844 overview/place states, 150% root text, and honest data-error copy. Production showed the correct Athens afternoon headline/palette, neutral evidence wording, and Map → Feed → Map return without console errors.

Fixtures, clock/visibility controls, instrumentation, synthetic catalog records, screenshots, and browser JSON results live outside the worktree and are not bundled or committed. Browser checks establish functional stability and rendering on this desktop browser, not physical-device FPS or accessibility certification. The existing upstream Bright sprite warning for missing `rail` remains outside Phase 6 scope; no runtime map error was captured.

## H. Manual visual states to inspect

1. Morning and afternoon at overview and place zoom: warm ivory/blue, distinct idle headlines, identical day palette.
2. Golden hour: warmer land and coordinated roads/buildings; coastline, water names, orange cores, and cream controls remain clear.
3. Evening and late night: progressively muted cream/blue, dark labels and readable geographic hierarchy.
4. Selected Kourouta, Katakolo, Pyrgos, Olympia, Foloi, and Zacharo: subtle short accent line; factual descriptors; exact matching counts; selected names above temporal copy.
5. A selected place, expanded sheet, and route with a manually rotated/tilted camera across a real boundary: no reframe, map reload, selection change, or snap change.
6. Hide/resume and leave/return to Map across a boundary; repeat with a changed system clock and reduced motion.
7. Greek/English on narrow portrait/landscape screens and larger text: no headline overflow; compact sheet stays usable and scrollable.
8. Missing/stale/failed evidence and blocked/muted authors: neutral wording; no community activity derived from static identity or time.

Before release, repeat boundary transitions, system reduced motion, 200% text, VoiceOver, safe-area behavior, and dense-map responsiveness on physical iPhone/WebView hardware. Existing authenticated actions/GPS permissions were not exercised or modified. No merge or deployment was performed.

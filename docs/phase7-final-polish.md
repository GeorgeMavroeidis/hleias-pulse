# Phase 7 — final motion, interaction, and visual polish

Phase 7 finishes the Phase 6 design without replacing its geography, visual identity, evidence-derived Pulse semantics, or REGION → ACTIVITY → PLACE → DETAIL progression. Base: `ba9d493` on `codex/maplibre-route-previews`. No backend schema, public API, dependency, deployment, or data-content changes.

## Audit and decisions

A means an actual problem; B means worthwhile polish; C means preserve.

| Surface | Class | Evidence and outcome |
| --- | --- | --- |
| Location control | A | Failures were console-only; repeated requests and late callbacks lacked a shared lifecycle. Added translated pending/denied/timeout/unavailable feedback, duplicate suppression, teardown invalidation, and reduced-motion camera handling. |
| Marker removal | B | Immediate disappearance interrupted visual continuity. Added 160 ms opacity exit, immediate inert/hidden/non-focusable state, cancellation when an ID returns, and immediate removal under reduced motion. |
| Viewport lifecycle | A | A pending frame could outlive its effect. Added coalescing/disposal helper; cancel initial resize timeout too. |
| Image replacement | A | Failed state survived a changed source. Key the internal image lifecycle by source/source-set and compose caller handlers; regression fixture proves failed→replacement recovery. |
| Motion hierarchy | B | Camera, CSS, and component timings differed. Named common durations/easing now drive camera, shared transitions, selection accent, image reveal, and atmosphere. Contract tests prevent mirrored CSS values drifting. |
| Header/navigation at large text | A | 320×568, 200% text, and simulated safe insets caused oversized icon controls and clipped navigation. Keep 44 px minimum icon targets, wrap navigation labels, and compact decorative header spacing with a text-relative container rule. |
| Search, Deals, filters | C | Search zero-match recovery, Deals empty state, and return to Map work. Preserve existing filtering and navigation behavior. |
| Sheet and selection | C | Preserve reducer ownership, snap geometry, contextual content and accessible controls. Interrupted selection resolves to newest place; invalid filters clear selection; pointer drag and keyboard collapse work. |
| Camera and geography | C | Cluster expansion and regional framing preserve bearing/pitch. Selected point remains above the expanded sheet. Existing bounds, labels, route overlays, and map sources remain intact. |
| Pulse and regional signals | C/B | Preserve real evidence thresholds and density suppression. Reduced motion retains distinct static dashed/solid/double/dotted ring treatments and labels. Unavailable evidence stays unavailable. |
| Time of day | C | Keep the existing temporal clock, boundary/DST tests, and palette-only map updates. Five-period/two-zoom matrices retain camera, map, index, sources, layers and marker identity. |
| Loading/error surfaces | B | Replace moving image shimmer with a restrained static surface, contextual image fallbacks, and translated generic map-load error copy. |
| Haptics and legacy | C/A | No established haptics integration exists; add none. Reference searches found obsolete sea shimmer and hotness glow code; remove those only. Keep motion preference compatibility and offline geographic generator/data. |

## Architecture and lifecycle

`PulseApp` remains orchestration, `SocialMap` owns rendering/camera, and `MapBottomSheet` remains presentation. The discovery reducer remains selection authority. Continuous sheet geometry stays outside React state updates per drag frame. Selection content changes immediately; animation never gates input.

`motion.ts` defines milliseconds for press 80, micro 120, state 160, content 190, panel 240, pan 280, spatial 320, overview 340, focus 380, selection 650, atmosphere 800, and tab 180. Shared transitions expose seconds to Framer Motion; camera easing uses the same curve. Existing consumers retain the shared export.

`marker-exit.ts` owns one timeout for all pending exits, supports cancellation/reappearance, and flushes on teardown or reduced motion. Marker positioning remains MapLibre-owned. A disappearing focused marker returns focus to the map canvas. `map-frame.ts` coalesces viewport work and makes late callbacks inert. `map-location.ts` uses generation invalidation because browser geolocation cannot be aborted. It does not persist location or change existing precision/timeouts.

## Performance evidence

Local instrumented fixtures used the actual components, the 51-place catalog and 500 synthetic places, compared with unchanged Phase 6. Fixtures/debug controls are outside the repository and production bundle. These are work counters, not device FPS or battery benchmarks.

| Measurement | Phase 6 | Phase 7 |
| --- | --- | --- |
| 1 s settled idle, either catalog | 0 React commits, marker/index/map work, paint calls, queries, projections | Same |
| Five temporal changes, 51 places | 5 map + 5 sheet commits; 852 paint writes; 30 projections | Same |
| Five temporal changes, 500 places | 5 map + 5 sheet commits; 1,136 paint writes; 5,880 projections | Same except 7,840 projections |
| Map/index rebuilds or marker churn during temporal changes | 0 | 0 |
| Rendered-feature queries during temporal changes | 0 | 0 |

The denser fixture recorded one additional projection/settling pass; this is not evidence of a speed improvement. No FPS improvement is claimed. Both neutral-evidence fixtures had zero ongoing marker animations. Existing density logic is preserved. New exit scheduling uses one timer even for 500 exits; no per-marker JavaScript animation loop or subscription was added.

## Accessibility and browser verification

Checked production entry and real-component fixtures in the Codex browser: Greek/English, narrow portrait and landscape, 390×844, 320×568, and 568×320. The 200% text check used a 32 px root font with simulated 24 px top/20 px bottom safe-area spacing. At 320×568 both languages had document width 320 and navigation bottom 568. Greek navigation wraps at that extreme; less map area is available, but controls remain reachable.

Verified search zero matches and Clear search recovery, empty Deals, Map→Pulse→Map, appearance Escape/focus return, pointer sheet drag to expanded, keyboard collapse/focus return, interrupted selection, filter invalidation, marker exit cancellation, image-source recovery, GPS duplicate/denial/teardown behavior, sheet-safe point framing, regional bearing 35°/pitch 25°, and cluster expansion from zoom 12 to 14 retaining bearing 40°/pitch 20°.

Reduced motion was emulated through the media-query listener and actual CSS media branches in the local fixture. Runtime change kept the existing map, set atmosphere transitions to zero, and left no document animations. This does not claim a native OS or physical-device accessibility audit. No real location permission was requested in fixture tests.

## Checks and limitations

- Typecheck passes.
- Lint passes with zero errors and three existing warnings: one AdminDashboard effect dependency and two blend-ui fast-refresh exports.
- Map visual contract and 71 map tests pass, including seven new motion/lifecycle tests. Discovery 9, intelligence 8, routing 5, and secret-scanner 4 tests pass: 97 tests total.
- Secret scan and `git diff --check` pass.
- Production static build passes; existing large-chunk warning remains (MapLibre about 1.06 MB minified).
- Ten browser interaction regressions and three camera/filter checks pass. Palette matrices preserve map/index/camera/layers/sources and produce no marker churn.
- Disposable local Supabase stack: auth-profile and post-write smokes pass. Seven other smoke scripts fail identically on Phase 6 and Phase 7. Routes/admin/verification require an existing admin owner; live-surfaces requires seeded Meet events; block-enforcement needs two auth users; deal-race needs an eligible user without a business; moderation encounters existing `ReportAlreadyReviewedError`. Optional vector/logflare were excluded for local Docker compatibility. These results are not a green backend certification.
- Physical iPhone haptics, VoiceOver, native reduced-motion settings, real GPS, device FPS/battery, and offline network recovery remain unverified. Existing supplied feed/demo content is unchanged; map community evidence is not fabricated.

Backend/product follow-up: reliable live community evidence, real photos, populated Meet/deal data, and suitable authenticated/admin fixture accounts are needed for complete end-to-end product certification. No frontend inference substitutes for missing evidence.

## Exact changed files

- `package.json`: motion test command and map-suite integration.
- `scripts/build-ionian-land.ts`: clarify retained offline generator purpose.
- `scripts/check-map-visuals.ts`: recognize extracted frame lifecycle contract.
- `src/components/hp/ImageBox.tsx`: source reset, composed events, quiet loading/reveal.
- `src/components/hp/MapBottomSheet.tsx`: contextual image fallback.
- `src/components/hp/PulseApp.tsx`: shared tab transition.
- `src/components/hp/PulseTopBar.tsx`: shared/reduced-motion search and menu transition.
- `src/components/hp/SocialMap.tsx`: camera normalization, marker exits, location feedback and cleanup.
- `src/components/hp/pulse-shared.ts`: re-export central transitions.
- `src/lib/hp/map-policy.ts`: shared focus duration.
- `src/lib/hp/temporal-atmosphere.ts`: shared atmosphere duration.
- `src/lib/hp/map-frame.ts` (new): coalesced/disposable viewport frame.
- `src/lib/hp/map-location.ts` (new): request lifecycle and status messages.
- `src/lib/hp/marker-exit.ts` (new): single-timer exit lifecycle.
- `src/lib/hp/motion.ts` (new): timing/easing definitions.
- `src/lib/hp/motion.test.ts` (new): seven contract/lifecycle regressions.
- `src/lib/hp/sea-shimmer.ts` (deleted): unreferenced legacy sea effect.
- `src/lib/i18n.tsx`: Greek recovery messages.
- `src/styles/deals.css`: remove obsolete reduced-motion selectors.
- `src/styles/engagement.css`: remove unused sea shimmer/hotness glow rules.
- `src/styles/map-chrome.css`: location status and map image placeholders.
- `src/styles/pulse-markers.css`: exit and static reduced-motion distinctions.
- `src/styles/shell.css`: narrow/large-text header and navigation.
- `src/styles/theme.css`: target size and shared motion tokens.
- `src/styles/utilities.css`: image loading/reveal.
- `docs/phase7-final-polish.md`: this audit and delivery record.

## Manual QA before release

1. On an iPhone, explore region→place→detail; interrupt camera movement, drag the sheet, filter the selected place away and back, then return from Pulse/Deals.
2. Switch Greek/English, rotate the device, enable large text and native reduced motion; inspect focus, labels, navigation, static Pulse levels and sheet visibility with VoiceOver.
3. Try location allowed, denied and unavailable; leave Map while a request is pending. Check recovery without duplicate movement.
4. Inspect image loading/failure/replacement, empty search/regions, offline map failure and temporal boundaries.
5. Repeat with populated staging data and appropriate accounts; resolve the documented backend smoke prerequisites before release certification.

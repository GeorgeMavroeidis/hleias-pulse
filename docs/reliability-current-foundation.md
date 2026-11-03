# Current-design integration: foundation

This is the first of the three approved integration PRs. Its base is the complete
reliability stack at `d81410218f38a313c75de903ecfc21590bfcc450`. The design reference
is `981e55fedf15a7a45310705a58695b833758dd53`, whose tree matches the phase 7 worktree
at `f507d0fb4b7d5c963c56190d9583ce2a150bad5e`.

## Included here

- Adopt the existing phase 1 header, navigation, controls, safe-area metadata,
  focus treatment, restrained surfaces and 44px control targets. Keep the visible
  active-search query and its query-only Clear action.
- Apply the phase 2 daytime cartography transform to the real provider response
  inside the existing guarded map initialization. Preserve provider assets,
  road topology, orientation labels and attribution. The bundled Bright JSON is
  an offline test fixture, never a runtime fallback; its licence notice sits
  beside it in `scripts/fixtures/openfreemap-bright.LICENSE.md`.
- Adopt phase 7 image-source recovery, composed image event handlers, a static
  loading placeholder, shared motion tokens, enlarged-text header treatment and
  reduced-motion appearance/search transitions.
- Expose an explicit UTC `previewAt`, visible Athens simulation clock and fixed
  acceptance-clock link. Missing or invalid values use one captured session clock.
  Live → Later preserves evidence timestamps and advances only the evaluation
  clock by 3h10m; every surface receives that same clock.

The account button receives visual markup only. Authentication, drafts, access
checks, saved items, creation rules, freshness thresholds and refresh ownership
remain the reliability implementation. Map initialization still owns its full
deadline, retry and cleanup behavior. The fictional preview still uses its
source-free style and bundled SVG coast; cartography adds no preview network
sources. Both the guarded local entry points and production release guards remain.

## Deliberate intermediate boundary

The existing renderer and sheet interfaces remain runnable. Their marker styles,
three animation choices and sea-shimmer dependency are retained until the second
PR replaces that renderer. The second PR adds compact markers and regional zoom
disclosure driven by the reliability evidence model. The third adds coordinated
selection/sheets and Athens atmosphere presentation. No SunCalc dependency or
unused temporal/selection subsystem is introduced here.

## Validation

Validation results for this integration must be recorded after running its exact
working-tree checks. Historical phase screenshots and browser measurements are
design references only; they do not establish acceptance of this integration.
Required checks include lint, both TypeScript projects, cartography and motion
contracts, existing map visual/recovery tests, freshness and preview tests,
discovery/intelligence tests, affected recovery/draft/creation/surface suites,
secret checks, and release/local-test builds.

Checks run on the complete foundation patch: all 242 offline tests passed,
including cartography, motion, map recovery, freshness, preview, discovery,
drafts, creation and surface contracts. Both TypeScript projects, lint (zero
errors; three existing warnings), map visual contracts, migration-version
checks, source and built-output secret scans, release build, guarded local-test
build and `git diff --check` passed. Existing dynamic-import and chunk-size build
warnings remain. This PR changes no database or API inputs. The independent
engineering-manager gate remains required before commit.

Actual guest and signed-in browser acceptance remains pending on the final
combined app at 390×844 and 1440×900. It must cover Greek/English, keyboard,
reduced motion, all five scenes and fixed-clock Quiet/Live/Three-hour comparisons.
Every screenshot must record its worktree, branch, immutable revision, entry point,
viewport, scene and account role. No production data or deployment is changed.

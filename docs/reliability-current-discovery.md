# Current-design integration: selection, discovery and temporal presentation

This is stage 3 of the approved phase-7/reliability integration. Its immutable
base is `834a94f209d534b323575165b00bb2b84fb97920` (compact map, PR 99); the design
reference is `981e55fedf15a7a45310705a58695b833758dd53`. The original eight
reliability PRs and their security/database fixes remain in the stack.

## Behavior and ownership

- One reducer owns map selection, Back history, sheet snaps, camera capture and
  route framing. Shared sheet geometry coordinates the map's usable viewport
  with the sheet, including drag, short screens and reduced motion.
- The discovery sheet opens exact place, story and event targets. A selected
  place remains available under a soft lens; an active search has its own clear
  action. Search/query removal and unavailable IDs prune selection without
  resetting comment drafts.
- Place and regional activity use the accepted shared dataset and freshness
  clock. Public tiers remain Quiet/Moving/Hot/Live. Live requires confirmed
  evidence younger than one hour; Recent ends at three hours. Historical
  observations keep their dates, and still-visible stories remain available.
- Scheduled Meets use publication eligibility and start plus duration, including
  long gatherings that remain in progress. Linked schedules display Athens
  time. Opening a Meet resets its category filter and focuses its exact card.
- Temporal headlines and paint-only map palettes use the same supplied clock.
  Evening says "Evening in Ilia". Solar time, palette and static regional
  identity cannot establish Live, full or a Tonight recommendation. The exact
  `suncalc` 2.1.0 dependency and its license are included; no timer or refresh
  owner is added. Water-label contrast receives the phase-7 correction.
- Location requests have recoverable status and cancellation. Coordinates stay
  in transient map presentation; the fictional preview requests no location.
  Initialization deadlines, retry focus, stale-callback guards, filtered place
  list, source-free preview and nonfatal post-load tile errors remain intact.

The existing app owns all four target/account draft bindings, captured-revision
acknowledgements, authentication/profile interruptions, failed-write retry,
pending-author visibility and accepted-refresh reconciliation. The sheet adds
no composer, synthetic public discussion or fallback post. The new Escape
handler yields to higher-priority dialogs, preserving the underlying detail
target during sign-in; cultural-event details also make the shell inert.
Saved permission-checked context, honest unavailable actions, empty Deals and
explicit-place creation remain on their existing paths.

## Validation and delivery

The assembled worktree passes all 328 offline tests, both TypeScript projects,
map visual contracts, migration-version checks and the source/built-asset secret
scan. Lint has zero errors and three existing warnings in unchanged files. Both
the production static build and guarded local-test build pass; their existing
large-chunk warning remains. CI includes the final discovery, sheet, identity,
temporal, frame, location and regional-layer suites in addition to the existing
reliability/security suites. The sole engineering-manager gate is required
before commit. Scratch preparation and source contracts do not replace browser
acceptance.

Actual browser acceptance remains pending. Required evidence covers guests and
two local signed-in clients at 390×844 and 1440×900, Greek/English, keyboard and
reduced motion, fixed-clock Quiet/Live/Three-hour screenshots, interrupted
draft/auth/write journeys, refresh publication within 60 seconds, honest empty
states, map failure/retry and ordinary Firefox/Safari. Each capture must identify
the worktree, branch, immutable revision, entry point, account role, viewport and
scene. The effective browser setting still denies the local origin despite the
reported block removal; no alternate-origin/browser execution bypass is used.

All test traffic stays in the fictional preview or disposable local Supabase.
No production data, database deployment, merge or deployment is authorized by
this integration.

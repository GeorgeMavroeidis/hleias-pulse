# Final design review — 1–2 November 2026

The recommended foundation is #100's compact map, discovery sheets and dated
activity, with selected Trip features reviewed as an addition. Final visual
selection and main merges remain the product owner's decision.

The [GitHub review tracker](https://github.com/GeorgeMavroeidis/hleias-pulse/issues/105)
indexes all 13 existing PRs. Their dependency chain is preserved. Track labels
separate preview (#88), reliability (#89–96), design/map (#98–100), and planning
(#97). Each PR links back to the tracker and retains its historical evidence.

## Three versions, not thirteen competing designs

| Version                   | Reviewed revision                          | Contents                                                                                                               |
| ------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Main                      | `befd263ee87d927fc9a56a1a20573836dc31a6a1` | Current merged baseline, compact composer, Light/Dark/System; older map bubbles                                        |
| Combined #100             | `cf9257ee00e66995a9cea342c6c0013ad51ec5ea` | Reliability stack, compact map, coordinated sheets, dated activity, selected/focused photos from #103                  |
| `margaris/trip-map-pulse` | `b0ffc281e33dc1b389c10685f2f0969857ee9ab4` | Contains #100 and current main; adds device-only Trip, Essentials, Quick look, nearby discovery and sheet/feed changes |

The Trip implementation is now available in shared Git. Earlier notes saying it
was unavailable describe the previous state. Phase 1–7 branches are historical
references. #103 was merged into #100's branch, rather than into main.

## Keep, revise, or defer

| Surface                             | Recommendation                                | Reason                                                                                                                                                                           |
| ----------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map geography and markers           | **Keep #100**                                 | Compact regional disclosure and small ordinary dots reduce clutter; engaged places reveal a photo with dot fallback.                                                             |
| Map appearance                      | **Keep #100**                                 | Light/Dark/System and separate Pulse/Calm settings preserve the selected place and existing map while colors change.                                                             |
| Search and place sheets             | **Keep #100**                                 | Active search remains visible, Clear search is explicit, and region/place/Back share one selection flow.                                                                         |
| Map recovery                        | **Keep #100**                                 | Rejected initialization offers Retry and a filtered place list whose details remain usable.                                                                                      |
| Pulse activity                      | **Keep #100**                                 | Dated evidence replaces accumulated-count Live/Full claims; the feed, map and event presentation share freshness.                                                                |
| Routes                              | **Keep #100; consider Trip chips**            | Retain curated routes and the active-stop guide. External navigation must preserve each route's walking/driving profile and selected stop.                                       |
| Meet                                | **Keep #100**                                 | Explicit place selection, Athens future/DST validation, pending-owner refresh and event status address behavior beyond styling.                                                  |
| Saved and Deals                     | **Keep #100**                                 | Loading, empty, failed and unavailable states are distinct. Empty-state screenshots do not establish real account/backend acceptance.                                            |
| Account and creation                | **Keep the integrated base**                  | Preserve the already merged compact composer and appearance. Account redesign stays a separate proposal.                                                                         |
| Trip planner and shared Add to trip | **Keep as a candidate addition**              | Useful visitor workflow with a shared device-only plan; clearing browser data removes it and it does not synchronize across devices.                                             |
| Navigation with Trip                | **Revise before final selection**             | Compare the fifth raised coral Trip tab against the quieter four-tab base; settle prominence and the relationship with the create button.                                        |
| Quick look                          | **Keep structure; revise content**            | Short place/route summaries help browsing. Greek wording, visit-duration estimates and descriptive claims need local editorial review.                                           |
| Nearby estimates                    | **Revise wording**                            | Existing minutes use straight-line distance, a road factor and an assumed speed. Label them as rough planning estimates; Google Maps supplies actual directions and travel time. |
| Essentials                          | **Keep structure; complete verified content** | Most visitor sections remain Coming soon because draft cards are hidden. Assign content ownership and verify sources before presenting a complete visitor guide.                 |
| Region introductions                | **Defer unreviewed copy**                     | The branch marks introductions “to be checked”; finish local review before the final public design. Retain evidence-based event/context rows.                                    |
| Trip cloud sync/check-ins           | **Defer**                                     | Separate proposals introduce product and data decisions outside this review and the Directions change.                                                                           |

## Evidence and its limits

The separately delivered HTML gallery and screenshot archive compare all three
release/static entries at 390×844 and 1440×900, Greek/English, and Light/Dark.
The matrix has 24 configurations and 288 views: map, region, search, place,
details, Pulse, Routes, Meet, account, Saved and Deals, plus Trip/Essentials/Quick
look where implemented. Matching fixture data and an explicit
`2026-11-01T12:00:00.000Z` clock keep comparisons reproducible.

The review harness supplies fictional read responses entirely in memory. Its
signed-in visitor is a browser fixture, rather than a database account. All
application API requests target a dummy loopback endpoint, hosted Supabase
requests are blocked, and mutation requests are refused. Main's obsolete
`refresh_generic_stories` call is refused as well. Ordinary map tiles and existing
photos may load from public providers; image failures are recorded in the
manifest. This establishes UI comparison evidence, not backend, moderation,
ordinary Safari/Firefox, physical-device or final combined-release acceptance.

Local Trip checks passed: both TypeScript projects, lint (four existing warnings),
the production static build and 37 feature tests for Essentials, summaries,
Trip, nearby distance, region introductions and glance rows. The Trip branch
still has no open PR and no code/Smoke result on GitHub at this pinned revision;
its Supabase Preview check is skipped. Keep remote validation as a separate gate.

## Directions implementation

The focused change is based on #100 and targets its existing branch. The place
sheet exposes **Directions / Οδηγίες** where the external-map icon was; the
OpenStreetMap reference remains in full place details. The detail footer has
the same reusable Directions link.

Web users get a real HTTPS anchor, including keyboard and modified-click support.
iOS uses the existing Capacitor launcher, tries the HTTPS URL when native probing
or launch fails, and offers a fresh browser tap if both attempts are refused.
The failure hint is scoped to the destination URL. Existing route navigation
retains its walking/driving profile; ordinary place directions default to driving.
The URL uses the selected place's coordinates and omits an origin and API key.
Google Maps resolves the starting point. No geolocation read, new routing call,
backend interface, schema change or paid service is introduced.

Browser evidence covers both links in all eight guest viewport/language/theme
combinations, 44px targets, correct destinations, keyboard activation, returning
to the same map, and zero location reads. The actual launcher adapter is exercised
with installed/missing/probe-error/refused simulated iOS bridge responses and a
fresh HTTPS fallback tap. Physical-device launcher acceptance remains separate.

## Integration boundary

Retain the existing chain:
**#88 → #89 → #90 → #91 → #92 → #93 → #94 → #95 → #96 → #98 → #99 → #100**.
#97 remains an independent planning PR. The Directions PR follows #100. The Trip
branch is reviewed separately before any integration decision; this work does
not merge it automatically.

Fresh isolated checkouts preserve the relocated primary checkout's dirty index,
files, untracked source and old worktree records. Main merges, PR closures,
deployment, hosted schema changes and paid work remain outside this preparation.

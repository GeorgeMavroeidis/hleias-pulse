# Current-design integration: map renderer

This is the second of the three approved integration PRs. Its immutable base is
`7e24a25df4e3fbf46ede96ec7783f8e4dc1b6adf` (foundation, PR 98). The renderer design
comes from phase 4 at `e01f58f`; compatible compact-marker CSS, pure policy and
exit cleanup come from the final design reference `981e55f`. Historical phase
screenshots are references, not acceptance evidence for this combined patch.

## Included here

- Replace image collages and oversized animated markers with fixed geographic
  cores, place-count clusters and regional disclosure. Keep one spatial index
  through evidence refreshes, blend zoom topologies without losing membership,
  and clip discovery membership using all four projected viewport corners.
- Adapt regional and place presentation to the existing canonical activity metric.
  CSS level names remain internal; public tiers are Quiet, Moving, Hot and Live.
  Every evidence-backed label includes its observation age, with the exact Athens
  time available in accessible labels and titles. Shared freshness boundaries also
  guard retained snapshots: Live ends at one hour and Recent ends at three hours.
- Preserve the complete guarded initialization deadline, abort and stale-callback
  checks, retry focus behavior, filtered fallback place list, search clear and
  data-refresh actions. A source/tile failure after load leaves the map usable.
  Daytime cartography still transforms only the real provider style.
- Preserve the source-free fictional preview and bundled SVG land. Preview regions
  use DOM markers and the keyboard region rail; no regional or route GeoJSON
  sources and no device-location controls are introduced into the preview.
- Limit decorative motion to visible eligible markers, preserve reduced-motion
  shapes, and cancel exit work on reappearance or teardown. Reappearing markers
  regain keyboard and pointer interaction without rebuilding their geographic core.

Public regional source properties contain translated presentation, geometry,
place count and placement priority only. Raw evidence, contributor identities and
internal activity scores are not copied into worker source properties. The
bundled MapLibre worker URL is preserved; no browser secret, API input, database
migration, production data, deployment or new external asset dependency changes.

## Intermediate boundary

The existing sheet callbacks and `MapAreaCluster` bridge remain usable. Coordinated
selection, the new sheet system, temporal atmosphere and the location request
feedback model belong to the third PR. Root-owned app/preview glue supplies one
clock and the shared marker/region projection; this renderer adds no refresh owner.

## Validation

On this exact working tree, all 30 current-map tests passed (including 13 new
renderer tests), along with 22 map-recovery, nine cartography and two shared-motion
tests. The map visual verifier, both TypeScript projects and `git diff --check`
passed. Root's complete offline run passed all 263 tests. Lint passed with zero
errors and the three existing AdminDashboard/blend-ui warnings; both-project
typechecking, migration version checks, source and release-bundle secret scans,
release and guarded local-test static builds also passed. Existing dynamic-import
and large-chunk build warnings remain. The independent engineering-manager gate
is required before committing this proposal. The renderer suite covers
all five preview scenes, strict one-hour/three-hour claim expiry, canonical rounded
score handling, safe public regional properties, collision-aware SDK style,
8–18 zoom membership, crossfade continuity, 15 rotated/pitched SDK camera cases,
regional sprite setup/failure and marker exit/reappearance deadlines. The map
visual verifier checks compact geometry, 1–500 marker motion/label budgets, valid
animation properties, source-free preview and preserved recovery contracts.

Browser acceptance remains pending on the final combined app. It must cover guest
and signed-in flows at 390×844 and 1440×900, Greek/English, keyboard and reduced
motion, plus fixed-clock Quiet/Live/Three-hour screenshot comparisons. Every
screenshot must record worktree, branch, immutable revision, entry point, viewport,
scene and account role. Offline/source checks do not establish browser acceptance.

# Reliability and map-design integration

This preparation uses main `b13daaf97aef9a0857862afb322e442e1b5d73d0`, which already
includes the simpler composer (#101) and Light/Dark/System appearance (#102).
Existing PRs and their history are retained through ordinary merge commits.
No PR has been merged into main by this preparation, and no deployment or hosted
database change is included.

## Branch and worktree contents

Each row is cumulative: it includes its updated predecessor. Worktree folders are
under the sibling `worktrees/` directory. The seed-cleanup branch name differs
from its worktree folder name.

| PR   | Worktree                       | Branch                              | Added behavior                                                                     |
| ---- | ------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------- |
| #97  | tourist-stay-pack              | docs/tourist-stay-pack              | Separate tourist stay-pack proposal; documentation only                            |
| #88  | local-traffic-preview          | feat/local-traffic-preview          | Five source-free fictional traffic scenes and fixed preview clock                  |
| #89  | reliability-local-test         | feat/reliability-local-test         | Guarded loopback browser and build tooling                                         |
| #90  | reliability-freshness          | feat/reliability-freshness          | Truthful observation-time and freshness boundaries                                 |
| #91  | reliability-seed-comments      | feat/reliability-seed-cleanup       | Synthetic seed-comment cleanup                                                     |
| #92  | reliability-creation-time      | feat/reliability-creation-time      | Explicit place selection and future Europe/Athens Meet-time validation             |
| #93  | reliability-comment-drafts     | feat/reliability-comment-drafts     | Target/account-isolated comment drafts, interruption and retry                     |
| #94  | reliability-search-saved       | feat/reliability-search-saved       | Persistent search visibility and truthful Saved/Deals recovery                     |
| #95  | reliability-map-recovery       | feat/reliability-map-recovery       | Bounded map initialization, retry and place fallback                               |
| #96  | reliability-surfaces           | feat/reliability-surfaces           | Shared refresh/freshness across stories, posts and events                          |
| #98  | reliability-current-foundation | feat/reliability-current-foundation | Interface foundation and one captured-template map appearance owner                |
| #99  | reliability-current-markers    | feat/reliability-current-markers    | Compact renderer, regional discovery and independent Pulse/Calm motion             |
| #100 | reliability-current-discovery  | feat/reliability-current-discovery  | Shared discovery selection/sheets, camera/route continuity and temporal appearance |

The earlier seven phase branches remain references; they are not reimported into
this stack. Foundation/phase documents record historical validation and UI
boundaries. The current motion choices are Pulse and Calm, separate from color
scheme; the former three-theme control is superseded.

## Preserved behavior

- Global creation starts without a selected place; a deliberate place-context
  action can prefill one. Optional controls stay collapsed and account identity,
  image defaults, input retention and Athens DST/future-time checks remain.
- Device appearance persistence, prepaint initialization, native appearance
  synchronization, bilingual accessible controls and media/QR exceptions remain.
- Initial and runtime map colors derive from one resolver and an immutable,
  unthemed provider template. Color changes preserve the map, camera, selection,
  sources, route overlays and markers. Regional sprite pixels update under their
  existing IDs; their geometry and activity accent remain independent of geography.
- Light retains the reviewed day/golden/evening/night palettes. Dark remains navy
  with subtle period variation. The accepted shared clock owns temporal changes;
  appearance adds no timer or fabricated activity evidence.
- The three existing reliability migrations are retained unchanged. No new
  schema, authentication model or public backend API is introduced.

## Acceptance and human merge queue

Every prepared commit requires one engineering-manager PASS, both TypeScript
projects, lint, affected tests, source secret scanning, a clean diff and fresh
CI/Smoke results. The final immutable revision additionally requires the complete
combined suite, migration checks, production/TanStack/guarded local-test builds
and built-output secret scanning.

Before any main merge, complete the combined browser ledger: guest, two ordinary
local accounts and admin; GR/EN; mobile 390×844 and desktop 1440×900; Light/Dark/
System, keyboard and reduced motion; every tab/account/Saved/Deals and creation,
Meet times, draft/auth interruptions, failed-write retry, publication within
60 seconds, all five fixed-clock scenes, freshness boundaries, regional density,
sheet/back navigation, route and camera continuity, and map failure/retry/fallback.
Firefox and Safari need actual browser evidence. Physical-device native appearance
remains a documented follow-up; offline tests do not establish browser acceptance.

Full backend reconstruction belongs to the disposable CI Smoke runner. Preserve
the running local database. Browser fixtures must be scoped to local synthetic
accounts/content after contract verification, then cleaned up and verified without
resetting or stopping the shared stack. Record revision, entry, viewport, language,
appearance, scene and role with acceptance evidence outside source.

Only after acceptance passes, the human merge queue is:
**#97 → #88 → #89 → #90 → #91 → #92 → #93 → #94 → #95 → #96 → #98 → #99 → #100**.
Use merge commits. After each main merge, refresh the next branch against main,
retarget its existing PR to main, and require current CI/Smoke and resolved
discussions. Any code change renews review and affected acceptance. Stop for an
unexpected main change or failed check. Main merges remain human clicks.

## Preservation and separate work

The primary dirty checkout's branch, index and content are preserved. Separate
binary staged/unstaged patches and untracked-source backups for all four dirty
worktrees are retained outside source, with hashes. Two byte-identical scratch
duplicates from reliability-surfaces are quarantined with their manifest.

No historical worktree is removed during preparation. After integration, remove
only inactive clean folders whose commits are included in main; preserve branches,
dirty/reference worktrees and Phase 1–7 references until replacement is verified.
Update the inventory after the human merge queue, rather than treating open PRs as
merged work.

Account redesign and the local Trip implementations remain a separate queue:
first put each intended implementation into shared Git, then review its scope and
integration. Neither is included here. Production deployment, hosted migrations
and paid work remain outside this preparation.

# IDEAS.md

> Not auto-loaded by Claude Code (unlike CLAUDE.md) — reference it explicitly when
> you want it read, e.g. "check IDEAS.md before we plan the next phase." Dump
> anything here, half-formed or not; no need to organize while brainstorming.
> Clean-up (turning an idea into a real task) happens later, on your own time.

## New Feature Ideas
- Myths — not a current feature, may revisit in brainstorming later

## Security to Review
<!-- Anything you want double-checked, now or later —
     e.g. "make sure Deals redemption codes can't be reused twice" -->
- ~~Deals redemption codes reused twice~~ — already covered, see `smoke:deal-race`

## Architecture / Tech Debt
<!-- Things that work today but should be revisited —
     e.g. "myths module needs real scope before Phase 2" -->
- Error tracking (e.g. Sentry) — set up before public launch, cheap insurance,
  worth doing a bit earlier than the rest of this list
- ~~CI pipeline (auto-run tests)~~ — **already built.**
  `.github/workflows/ci.yml` runs lint → secret scan → typecheck → the three
  offline test suites → build, on every PR and every push to `main`. Two gaps
  remain, and they are the real items:
  - **CD** — no deploy job. `deploy:worker` is still run by hand.
  - **Branch protection** — CI runs but nothing forces it green before merge, and
    nothing enforces CODEOWNERS review. One settings change on `main`.
- Rate limiting — add before public launch, prevents abuse/cost spikes; not
  needed while it's just the two of you testing
- Caching / CDN for the Map and Stories feeds — static assets already get
  Cloudflare's CDN for free via current hosting; only dynamic/API response
  caching would still be a future concern, once real traffic shows up
- Monitoring & alerts — add once real users depend on the app staying up
- Scaling (read replicas, etc.) — revisit only once you actually hit load
  problems; not a pre-launch concern

## Open Questions
<!-- Unresolved product or technical questions, yours or your buddy's -->
- Who owns local business partnerships, content moderation, and
  community-building? Unassigned as of now — needs deciding before Phase 3 (Deals).
- iOS bundle id / app display name currently say "Ilia Pulse" / com.theodoros.iliapulse
  — confirmed brand name is "Hleias Pulse," so decide whether to update these to match
  or leave the internal identifier as-is intentionally.
- Should `src/components/admin/` really sit in Margaris's lane? CODEOWNERS was
  rewritten to match Team Notes' layer split, which sends every component to
  Margaris — including the admin workspace, which verifies businesses, resolves
  place claims and writes `admin_audit_logs`. It renders, so a layer split says
  frontend; its blast radius says security surface. Same question, weaker, for
  `SocialMap.tsx`. Decide before branch protection is switched on, because that
  is the moment it starts blocking merges.
- ~~What does the `live-surfaces` module/smoke test actually cover?~~ — **answered**,
  see Architecture in CLAUDE.md. It is not a module: it is the
  `20260617161000_make_live_surfaces_supabase.sql` migration (the cutover off mock
  data, which created `meet_events`, `event_rsvps`, `story_views` and
  `user_activity_days`) plus the smoke test that exercises them.
- ~~What is `Meets`?~~ — **answered**, now scoped in CLAUDE.md → Architecture.
  RSVP-able local gatherings hung off a place, with categories, capacity and
  trigger-maintained going/maybe counts.

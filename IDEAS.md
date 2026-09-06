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

### From the 2026-09-06 backend audit

- **Expired stories are still readable straight off the table.** `stories` carries
  `expires_after_hours` (constrained to 6 or 24), but the expiry filter lives only
  inside `get_pulse_bootstrap()`
  (`20260617161000_make_live_surfaces_supabase.sql:652`). The table's own SELECT
  policy — most recently rewritten at
  `20260905190000_enforce_blocks_server_side.sql:148` — checks `moderation_status`
  and block relationships, **not expiry**. Anyone holding the publishable key can
  `from("stories").select()` and read every story that ever "expired". Nothing
  deletes them either, so "ephemeral" is a convention of the read path, not a
  property of the data. Two separate fixes: add the predicate to the policy, and
  decide a retention/deletion story — this is user media tied to a location, so
  GDPR applies.

- **A reporter can reopen or rewrite a report a moderator already closed.**
  `content_reports_update_own` (`20260905130000_add_user_moderation.sql`) is
  `using (reporter_id = auth.uid())` with no status restriction, and
  `with check (... and status = 'open')`. The USING side lets a reporter update an
  `actioned` or `dismissed` row; the WITH CHECK side permits the new status to be
  `'open'`. So a closed report can be flipped back open, and its `reason`, `note`,
  `target_type` and `target_id` rewritten after the fact. See Open Questions for
  whether to narrow it or drop it.

- **`audit:rls`'s drift gate has never had a baseline.**
  `supabase/policy-snapshot.json` does not exist and is not in git history, so
  `npm run audit:rls -- --check` cannot pass — it exits 1 with "does not exist
  yet". Only the no-arg write mode has ever been run. The entire reason the script
  was written (catch a table silently gaining a second INSERT policy, the way
  `meet_events` did) is currently inert. Generate the snapshot and commit it.

- **Good news worth recording, so nobody re-audits it from scratch:** all 29
  tables have RLS enabled _and_ at least one policy — zero coverage gaps — and
  every SECURITY DEFINER function has an explicit `search_path`, which
  `audit-rls.ts` calls out as its own privilege-escalation route. There are no
  Supabase Edge Functions to audit.

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

### From the 2026-09-06 backend audit

- **Whole modules have zero test coverage.** Covered today: users
  (`smoke:auth-profile`), post/story writes (`smoke:post-write`), map
  (`test:intelligence`, `test:map-visuals`), discovery (`test:discovery`), deal
  redemption (`smoke:deal-race`), live surfaces (`smoke:live-surfaces`), and block
  enforcement at the DB layer (`smoke:block-enforcement`). **Uncovered entirely:**
  `admin` (`admin-api.ts` — the whole owner/editor/moderator privilege model,
  `write_admin_audit_log`, `review_place_claim`), the `cultural_events` /
  `organizers` track including `prevent_organizer_self_verification`, `businesses`
  including `prevent_business_self_verification`, `routes` / `route_stops`, and
  `saved_items`. The admin gap is the sharpest of these: it is the one surface
  with its own privilege-escalation path and nothing exercises it.

- **`smoke:block-enforcement` tests the database, not the app.** It connects with
  `pg` and asserts the policy bites, which is the right test for the policy — and
  it has been passing the whole time the app's blocking did nothing at all,
  because the UI never reached those tables. A green smoke test sitting next to a
  broken feature is the pattern to watch for: assert at the layer the user
  actually goes through, not only the one underneath it.

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
- Should the `stories` expiry predicate move into the RLS policy, or should
  expired stories be deleted on a schedule (pg_cron, or an external job)? The
  policy hides them; deletion is what GDPR retention actually wants. Probably
  both — but the deletion half needs a decision on whether the media in Storage
  goes with the row.
- Should `content_reports_update_own` be narrowed to
  `using (... and status = 'open')`, or dropped outright? A reporter arguably has
  no business editing a filed report at all. The only consumer is the
  `reportContent()` upsert, which exists to dedupe re-reports, not to allow
  revision — and that path can be satisfied without a general UPDATE grant.
- ~~What does the `live-surfaces` module/smoke test actually cover?~~ — **answered**,
  see Architecture in CLAUDE.md. It is not a module: it is the
  `20260617161000_make_live_surfaces_supabase.sql` migration (the cutover off mock
  data, which created `meet_events`, `event_rsvps`, `story_views` and
  `user_activity_days`) plus the smoke test that exercises them.
- ~~What is `Meets`?~~ — **answered**, now scoped in CLAUDE.md → Architecture.
  RSVP-able local gatherings hung off a place, with categories, capacity and
  trigger-maintained going/maybe counts.

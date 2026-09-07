# IDEAS.md

> Not auto-loaded by Claude Code (unlike CLAUDE.md) — reference it explicitly when
> you want it read, e.g. "check IDEAS.md before we plan the next phase." Dump
> anything here, half-formed or not; no need to organize while brainstorming.
> Clean-up (turning an idea into a real task) happens later, on your own time.
>
> The **ordered** plan (stages, what's next, done-when) lives in `ROADMAP.md`.
> This file is the unordered feed that flows into it.

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

- ~~**A reporter can reopen or rewrite a report a moderator already closed.**~~
  **Already fixed in the live DB, and this audit note was wrong about the state.**
  `20260905160000_close_rls_audit_gaps.sql` narrowed `content_reports_update_own`
  to `using (reporter_id = auth.uid() and status = 'open')` — the note above
  describes the earlier `20260905130000` version, which is not what is live.
  Verified 2026-09-06: re-filing a report a moderator has `actioned` raises
  `42501` on the USING clause, and `smoke:moderation` now asserts that
  `reportContent()` surfaces it as a plain "already reviewed" message and leaves
  the actioned row untouched.

- ~~**`audit:rls`'s drift gate has never had a baseline.**~~ **Fixed 2026-09-06.**
  `supabase/policy-snapshot.json` is generated and committed;
  `npm run audit:rls -- --check` passes ("Live policy state matches"). It also
  turned out all four `pg`-based scripts (`audit:rls`, `smoke:block-enforcement`,
  `smoke:deal-race`, `smoke:moderation`) were pointed at `db.<ref>.supabase.co`,
  which does not resolve for this pooler-only project — all four now use
  `aws-0-eu-central-1.pooler.supabase.com` with user `postgres.<ref>`.

- **Good news worth recording, so nobody re-audits it from scratch** (snapshot,
  2026-09-06): all **30** tables have RLS enabled _and_ at least one policy —
  `rlsDisabled` is empty, zero coverage gaps — 115 policies total, and all 17
  SECURITY DEFINER functions have an explicit `search_path`, which `audit-rls.ts`
  calls out as its own privilege-escalation route. No Supabase Edge Functions to
  audit. `meet_events` INSERT is a single policy and `content_reports` UPDATE is
  two (own + admin) — both PR #47 gaps are closed.

### From the 2026-09-07 backend test-coverage pass

- **The two highest-privilege actions in the app write no audit row.**
  `admin_audit_logs` is well covered for content: `moderate_content()` and
  `review_place_claim()` each insert their own row, and the
  `write_admin_audit_log()` trigger sits on `places`, `posts`, `comments`,
  `stories`, `meet_events`, `routes`, `cultural_events` and
  `place_business_profiles`. Three tables have **neither** — no trigger, and no
  explicit insert in the function or the API that writes them:
  - `businesses` and `organizers` — so **verifying a business leaves no trace**,
    and a verified business is what unlocks place claims and deals
    (`20260905170000`), i.e. the revenue path. `setBusinessVerification()` /
    `setOrganizerVerification()` in `admin-api.ts` are plain `.update()` calls.
  - `admin_members` — so **granting somebody `owner` leaves no trace either**.
    That is the single most powerful action in the system, and afterwards
    nothing records who did it, when, or to whom. `setAdminMember()` /
    `removeAdminMember()` are a plain upsert and delete.

  Verified 2026-09-07 while writing `smoke:admin`, which asserts the audited
  paths and deliberately does *not* pin this gap, so fixing it will not fail the
  test. Fix is one migration: either extend `write_admin_audit_log()` to those
  three tables, or insert explicitly. Worth deciding whether an audit row should
  also survive its actor — `admin_audit_logs.actor_id` is `ON DELETE SET NULL`,
  so deleting a user anonymises their history rather than keeping it.

## Architecture / Tech Debt

<!-- Things that work today but should be revisited —
     e.g. "myths module needs real scope before Stage 2 (see ROADMAP.md)" -->

- Error tracking (e.g. Sentry) — set up before public launch, cheap insurance,
  worth doing a bit earlier than the rest of this list
- ~~CI pipeline (auto-run tests)~~ — **already built.**
  `.github/workflows/ci.yml` runs lint → secret scan → typecheck → the three
  offline test suites → build, on every PR and every push to `main`. One gap
  left:
  - **CD** — no deploy job. `deploy:worker` is still run by hand.

  ~~Branch protection~~ is configured (2026-09-06): `main` requires the
  `lint · typecheck · test · build` check green and resolved conversations,
  blocks force-push/delete, and enforces for admins. **Required approvals: 0** —
  Mavroeidis merges solo, no second sign-off. Bump it back to 1 only if you
  decide you want a hard "someone else looked at it" gate.
- Rate limiting — add before public launch, prevents abuse/cost spikes; not
  needed while it's just the two of you testing
- Caching / CDN for the Map and Stories feeds — static assets already get
  Cloudflare's CDN for free via current hosting; only dynamic/API response
  caching would still be a future concern, once real traffic shows up
- Monitoring & alerts — add once real users depend on the app staying up
- Scaling (read replicas, etc.) — revisit only once you actually hit load
  problems; not a pre-launch concern

### From the 2026-09-06 backend audit

- ~~**Whole modules have zero test coverage.**~~ **Three of the gaps closed
  2026-09-07.** `smoke:admin` covers the whole owner/editor/moderator privilege
  model (`has_admin_role`, `moderate_content`, `review_place_claim`,
  `write_admin_audit_log`, and admin_members visibility);
  `smoke:verification-guards` covers `prevent_organizer_self_verification` /
  `prevent_business_self_verification` plus the insert-as-verified route the
  triggers do not see; `smoke:routes` covers routes / route_stops read/write RLS,
  ordering and cascade. **Still uncovered:** `cultural_events` beyond organizer
  verification (publishing, comments, reactions), `place_business_profiles`
  claims beyond the deal-race fixture, and `saved_items`.

- **`smoke:block-enforcement` tests the database, not the app.** It connects with
  `pg` and asserts the policy bites, which is the right test for the policy — and
  it has been passing the whole time the app's blocking did nothing at all,
  because the UI never reached those tables. A green smoke test sitting next to a
  broken feature is the pattern to watch for: assert at the layer the user
  actually goes through, not only the one underneath it.

## Open Questions

<!-- Unresolved product or technical questions, yours or your buddy's -->

- Who owns local business partnerships, content moderation, and
  community-building? Unassigned as of now — needs deciding before Stage 3
  (see `ROADMAP.md` → Open decisions).
- iOS bundle id / app display name currently say "Ilia Pulse" / com.theodoros.iliapulse
  — confirmed brand name is "Hleias Pulse," so decide whether to update these to match
  or leave the internal identifier as-is intentionally.
- ~~Should `src/components/admin/` really sit in Margaris's lane?~~ **Moot as of
  2026-09-06 — ownership lanes were dropped entirely.** Both maintainers are
  full-stack with full access; CODEOWNERS is now a single shared line that only
  auto-requests both as reviewers. The admin workspace still deserves careful
  review because of its blast radius (it verifies businesses, resolves place
  claims, writes `admin_audit_logs`), but that is a "look here first" note, not
  an owner.
- Should the `stories` expiry predicate move into the RLS policy, or should
  expired stories be deleted on a schedule (pg_cron, or an external job)? The
  policy hides them; deletion is what GDPR retention actually wants. Probably
  both — but the deletion half needs a decision on whether the media in Storage
  goes with the row.
- ~~Should `content_reports_update_own` be narrowed to
  `using (... and status = 'open')`, or dropped outright?~~ **Decided 2026-09-06:
  keep it narrowed (it already is, via `20260905160000`).** A reporter may still
  correct a report they just filed, up until a moderator picks it up; after that
  the row is theirs no longer. `reportContent()` and `smoke:moderation` are
  aligned with this. Dropping the policy entirely was considered and rejected —
  the "fix a typo in the reason right after filing" case is worth keeping.
- ~~What does the `live-surfaces` module/smoke test actually cover?~~ — **answered**,
  see Architecture in CLAUDE.md. It is not a module: it is the
  `20260617161000_make_live_surfaces_supabase.sql` migration (the cutover off mock
  data, which created `meet_events`, `event_rsvps`, `story_views` and
  `user_activity_days`) plus the smoke test that exercises them.
- ~~What is `Meets`?~~ — **answered**, now scoped in CLAUDE.md → Architecture.
  RSVP-able local gatherings hung off a place, with categories, capacity and
  trigger-maintained going/maybe counts.

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

- ~~**The two highest-privilege actions in the app write no audit row.**~~
  **Closed 2026-09-07**, `20260907120000_audit_privileged_admin_writes.sql`.
  `businesses`, `organizers` and `admin_members` had no audit coverage at all —
  no trigger, and no explicit insert in the function or the API that writes
  them — so verifying a business (the gate on place claims and deals,
  `20260905170000`, i.e. the revenue path) and granting somebody `owner` each
  left no trace of who did it, when, or to whom.

  Two new triggers rather than hanging the existing `write_admin_audit_log()`
  on all three, because the two cases want opposite defaults:
  - `write_admin_member_audit_log()` on `admin_members` is deliberately
    **role-blind**. `write_admin_audit_log()` returns early unless the actor is
    owner/editor, which is right for the tables it already covers — without it
    every ordinary user's post and comment would write an audit row — but on
    `admin_members` that gate would skip exactly the writes that matter most: a
    promotion made over `psql` or with the `service_role` key has no
    `auth.uid()` at all, so `has_admin_role()` is false and the row would
    vanish. It records `current_user` alongside, and `smoke:admin` pins the
    property by asserting that the fixture's own JWT-less insert is audited.
  - `write_verification_audit_log()` on `businesses` / `organizers` fires **only
    on a verification transition** — including a row *inserted* already
    verified, which is the one route the `BEFORE UPDATE`
    `prevent_*_self_verification()` guards cannot see. A self-service
    application (a row that starts `pending`) is not an admin act and writes
    nothing, so the table cannot fill with noise; `smoke:admin` pins that too.

  Adds no policy, table or column: `audit:rls --check` reported the two new
  SECURITY DEFINER functions and nothing else, which is the evidence it hands
  nobody a new capability. Applied to the live database the same day.

- ~~**A refused admin write reported success.**~~ **Closed 2026-09-07**, same
  pass, in `src/lib/admin-api.ts`. Postgres refuses a privileged write in two
  very different ways and only one is loud: an INSERT that fails a policy's
  `WITH CHECK` raises 42501, but an UPDATE or DELETE that fails a `USING`
  clause simply matches no rows — nothing changes and PostgREST reports
  success. So a moderator clicking "Verify" on a business got a green "Business
  verified." notice while the row never moved, and `removeAdminMember()`
  reported a member removed who was still on the team. Every privileged
  update/delete now chains `.select()` and raises `AdminWriteRefusedError` on an
  empty result. **Enforcement did not move** — RLS was always refusing these
  correctly, and `smoke:admin` still re-reads each row over `pg` to prove the
  policy, not the client, is what stopped the write. Only the reporting was
  wrong. Same fix applied to `deleteAdminPlace`, `clearPlaceDeal`,
  `editAdminPost` and `editAdminComment`, which had the identical defect;
  `replaceAdminRouteStops` deliberately excluded, since a route with no stops
  makes "deleted nothing" a legitimate outcome there.

- ~~**Should an audit row survive its actor?**~~ **Decided 2026-09-07 — yes,
  keep the actor.** `20260907170000_audit_log_survives_actor_deletion.sql` drops
  `admin_audit_logs_actor_id_fkey`, so the column keeps the id instead of being
  nulled when the account goes. The reasoning: an audit table records an id, it
  does not participate in the lifecycle of the thing it names. Under
  `ON DELETE SET NULL` the whole history collapsed to "somebody did this"
  precisely when a person has a motive to disappear — and the 2026-09-07
  triggers made that worse by design, because the history now worth keeping
  (who verified a business, who granted `owner`) was exactly the history that
  vanished.

  What it retains is an opaque uuid and nothing else — no name, no email. The
  `details` payloads carry roles and status transitions, not personal fields,
  and the earlier choice to log a deleted business/organizer *without* the
  applicant's `user_id` still stands. **Keep it that way:** these rows are now
  permanent, so nothing personal should ever be written into them.

  Free of side effects, checked before writing it: the constraint points at
  `auth.users`, outside the exposed `public` schema, so
  `admin_audit_logs.Relationships` in `database.types.ts` is already `[]` and
  regenerating types is a no-op. Dropping a constraint is catalogue-only —
  instant, no table rewrite.

  The same migration also removes the two `actor := null` guards from
  `20260907120000`, because dropping the constraint without them would cement a
  bug rather than fix one. Those guards were there to stop an audit row pointing
  at a user the same statement was deleting from failing the foreign key check —
  but the condition is only `tg_op = 'DELETE' and actor = subject`, with nothing
  scoping it to a cascade. `"Owners can remove team members"` has no
  self-exclusion and `removeAdminMember()` is a plain delete by `user_id`, so an
  owner may remove their **own** admin row from the dashboard — and the guard
  then nulls the actor on a live person whose account still exists, something
  `ON DELETE SET NULL` would never have done. Without the fix, "who resigned
  their own ownership" would read as nobody, permanently. Found in review by a
  parallel session and verified against the policy and the API before acting.

  Two things checked rather than asserted, both recorded in the migration
  header: the constraint name really is `admin_audit_logs_actor_id_fkey` (a
  `drop ... if exists` on a wrong name is a silent no-op), and the retained uuid
  really is opaque — every identity column in the schema references `auth.users`
  or `profiles`, `profiles.id` cascades from `auth.users`, and no identity uuid
  column exists without a foreign key, so `actor_id` becomes the only place the
  id survives. Re-check that if a table ever stores a user id loosely.

  **Still open, and smaller:** the retention *period*. Keeping the trail
  indefinitely is a decision nobody has actually made, and GDPR wants a stated
  period rather than "forever by default". Not urgent while there are no
  outside users, but it should not be forgotten either.

- **A new `AFTER DELETE` trigger silently changes what every existing test
  fixture leaves behind.** Worth writing down, because it generalises well past
  the three scripts it happened to hit. `20260907120000` put audit triggers on
  `businesses`, `organizers` and `admin_members`, and `admin_audit_logs` has no
  foreign key back to any of them — so a fixture touching those tables now
  leaves audit rows the `auth.users` cascade never reaches. The existing "sweep
  `admin_audit_logs` by `actor_id`" cleanup missed them for two independently
  sufficient reasons: the trigger fires *during* the cascade, i.e. after that
  sweep has already run, and it records `actor_id` as null anyway, because the
  `postgres` role has no `auth.uid()`. Fixed in `d383700` with a second pass
  keyed on `entity_id`. `20260907170000` sharpens the rule rather than softening
  it — with the foreign key gone, nothing cascades those rows away at all, so an
  `entity_id` sweep is the only cleanup that works.

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

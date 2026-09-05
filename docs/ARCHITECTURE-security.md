# Security & Data Architecture — ΗΛΕΙΑ PULSE

Status: **Current.** Written 2026-09-05 by the full-schema RLS audit, then re-verified the
same day against the live project (`kfxfnqryfmuxiwlswyyn`) before being promoted out of
draft. Every claim below was checked, not inherited — where a check could not be run this
session, the file says so rather than asserting.

Owner: Mavroeidis (`supabase/**` is his lane per `CLAUDE.md`). Companion to `USER.md`,
which specs auth/identity in detail — this file covers the RLS/data-security model for
everything else and should stay in sync with it rather than duplicate it.

## Why this file exists

A full-schema RLS audit found a live moderation-bypass bug (`meet_events`, Finding #1) that
had survived **two separate attempts** to fix it, because nothing tracked "what every
table's policies are supposed to be" in one place. The audit had to reconstruct that state
from scratch by reading all 24 migration files. That reconstruction is the seed of this
document, and is now also enforceable: `npm run audit:rls` snapshots live policy state to
`supabase/policy-snapshot.json`, so the next silent regression is a line in a diff rather
than a from-scratch audit.

## The single most important fact

**`anon` holds a blanket SELECT grant on tables our migrations never granted it.**

An anonymous request to `content_reports`, `user_blocks`, `admin_members`,
`deal_redemptions`, `user_preferences` or `user_security_events` returns **HTTP 200 with
zero rows** — not `permission denied`. That is Supabase's default privileges on the
`public` schema, not anything the migrations did. Nothing is leaking today, and each of
those tables has a correct policy.

But it means **RLS is the only boundary this application has.** There is no grant layer
underneath to catch a mistake. Every one of the findings below was a single policy
expression away from being public, and the next one will be too.

## The security model — non-negotiable principles

These generalize the principles `USER.md` already states for auth/profiles to every table
in the schema:

1. **RLS is the enforcement boundary. The client is not.** Every write path in `hp-api.ts`
   can send whatever it wants; policies are what actually stop a bad actor. `hp-api.ts`
   always sending `moderation_status: "pending"` is *why the app works*, not *why it's
   safe* — Finding #1 existed precisely because a stale policy assumed the client's
   discipline was the safeguard.
2. **`auth.uid()` is the only source of truth for identity.** No policy trusts a
   client-supplied user/profile/business id. Every ownership check is
   `column = (select auth.uid())`.
3. **Roles and verification live in server-controlled tables, never `user_metadata`.**
   Verified: roles live in `admin_members`, `has_admin_role()` / `current_admin_role()`
   read it directly, and nothing anywhere reads `user_metadata` for permissions.
   `admin_members` is owner-write-only and carries a `prevent_last_admin_owner` trigger.
4. **Self-verification is blocked at the trigger level, not just by policy.** `businesses`
   and `organizers` carry `BEFORE UPDATE` triggers — named `guard_business_self_verification`
   and `guard_organizer_self_verification`, running the functions
   `prevent_business_self_verification` and `prevent_organizer_self_verification` — that
   reject a `verification_status` change by anyone but an owner/editor. Load-bearing, given
   the grant situation above. Any new verification-gated feature must follow this pattern,
   not rely on policy alone.
5. **`SECURITY DEFINER` functions validate ownership internally.** All 16 do this today and
   all 16 set an explicit `search_path` (verified function by function — see the inventory).
   Any new one must too, and must never accept a caller-supplied id as authority.
6. **A permissive-policy addition is never "just additive."** Postgres ORs permissive
   policies together for the same command. Finding #1 happened because two migrations
   *dropped the wrong policy name* and nobody noticed a table had gained a second, more
   permissive INSERT policy instead of losing its old one. **Any PR that creates or drops a
   policy must state, in its description, how many policies now exist per command per table
   it touches.** That one line would have caught Finding #1 on sight, both times.
7. **A policy that references another table is subject to that table's RLS.** This is the
   subtlest one and it fails *silently*. A block-enforcement predicate written as a plain
   subquery over `user_blocks` matches nothing, always, because `user_blocks_all_own` hides
   the relevant rows from the very reader being filtered. Cross-table checks of this shape
   need a `SECURITY DEFINER` helper — see `blocked_user_ids()`.

## Table inventory

RLS is enabled on **all 30 tables in `public`, and every one has at least one policy**.
There is no unprotected table.

### Confirmed correct — no changes needed

| Table | Model |
|---|---|
| `profiles` | Public read of safe fields; owner-only insert/update via `auth.uid()`. Verified live: `anon` sees handle, display name, avatar, bio, home area, default identity, timestamps. No email, no phone. |
| `posts`, `comments`, `places`, `stories` | Exactly one INSERT policy each, gated on `auth.uid()` and `pending` moderation status; owner-only update/delete |
| `saved_items`, `post_likes` | Owner-based, `(user_id, ...)` keyed, correctly scoped |
| `story_views` | Seen-state, owner-scoped |
| `user_preferences`, `user_security_events` | Owner-only read/write, no anon access |
| `businesses`, `organizers` | INSERT forces `pending`; verification changes blocked by trigger, not policy alone (principle #4) |
| `admin_members` | Source of truth for roles; owner-write-only, not client-writable |
| `deal_redemptions` | Carries a broad `grant update, delete … to authenticated`, but the only write policy is `"Editors can manage deal redemptions"` (owner/editor). A user **cannot** reset their own redeemed code. Verified. |
| Storage: `avatars`, `content-media` | Public read by design; writes path-scoped to `<auth.uid()>/…`; business/organizer uploads additionally gated on `current_business_id()`/`current_organizer_id()` |
| `user_place_visits` | INSERT/SELECT granted to `public` rather than `authenticated` — cosmetic inconsistency only; the predicate is `user_id = auth.uid()`, NULL-false for anon, so not exploitable. Worth tidying, not urgent. |

### Findings — all fixed, none yet applied to production

Every fix below is written, reviewed and PR'd. **None has been pushed to the live database**
(`supabase db push` has not been run for any of them), so all five gaps are still open in
production as of this writing.

**#1 — HIGH — `meet_events`: moderation bypass.** → PR #47

A June policy, `"Authenticated users can create own meet events"`
(`with check (... and moderation_status = 'published')`), was supposed to be retired when
moderation shipped in August. Two later migrations tried to drop it and both used the wrong
policy name (missing "own"), so the drop silently no-op'd twice. Because permissive policies
OR together, `meet_events` has had **two live INSERT policies** since August. Any
authenticated user can insert a meet event that is immediately public, with no moderator
ever seeing it — the only content type with this hole. `posts`/`places`/`stories`/`comments`
each have exactly one INSERT policy and are unaffected.

Fix: drop the stale policy by its real name. The correct policy already exists.

**#2 — MEDIUM — `content_reports`: reports can be reopened or retargeted.** → PR #47

`content_reports_update_own` put its status guard only in `WITH CHECK`, not `USING`. `USING`
decides which rows may be touched at all; `WITH CHECK` only decides what they may become.
Without a status test in `USING`, a reporter can pick up a report a moderator already moved
to `reviewing`/`actioned`/`dismissed` and write it back to `open`. `target_type`/`target_id`/
`reason`/`note` are also freely updatable while `open`, so retargeting is a way to step
around the `unique (reporter_id, target_type, target_id)` dedupe.

Fix: add `and status = 'open'` to `USING` as well as `WITH CHECK`.

**#3 — MEDIUM — deal visibility isn't tied to business verification.** → PR #49

`place_business_profiles.status` (claim approval) and `businesses.verification_status` are
independent, with nothing linking them downstream. Verified live:

```
GET /rest/v1/place_business_profiles
  -> claim 07d272ed… on 'lechaina', approved, deal_active true,
     deal text + phone number 6972517725      (business "gm" is REJECTED)

POST /rest/v1/rpc/get_pulse_bootstrap
  -> claimed_place_ids ['lechaina']   deal_place_ids ['lechaina']   deals []
```

The empty `deals` array is the tell: that bootstrap key inner-joins `businesses`, so RLS
already filtered it; the two place-id arrays read `place_business_profiles` alone and did
not. The map has been showing a deal badge for a deal the list cannot render and
`redeem_deal_code()` can never accept, since it requires `current_business_id()`
(verified-only).

Fix: public read requires a verified business, and `issue_deal_code()` joins on it. This
changes product behaviour — an approved claim under a non-verified business goes dark —
and was approved as such.

**#4 — MEDIUM — `redeem_deal_code()` double-redemption race.** → PR #50

It read a code with a plain `SELECT`, then updated by primary key with no `for update` and
no `and status = 'issued'` on the `UPDATE`'s `WHERE`. Two concurrent redemptions of one code
both succeed. Money path.

Fix: collapse to a single guarded `UPDATE … FROM … RETURNING`. Under READ COMMITTED the
second session blocks on the row lock, re-evaluates its predicate against the updated row
(EvalPlanQual), matches nothing, and raises the existing error. Proven by
`npm run smoke:deal-race`, which drives the interleaving by hand rather than firing parallel
requests and hoping they collide.

**#5 — MEDIUM — blocking had no server-side enforcement.** → PR #51

`user_blocks` RLS only let you read rows where you are the blocker. The "hide a blocker's
content from the person they blocked" half — described in the moderation migration's own
comment, with an index (`user_blocks_blocked_idx`) built for it — was never implemented. No
policy referenced `user_blocks`, and the index had been unused since the day it was created.
Not a privilege gap, but a completeness gap against Apple Guideline 1.2: if A blocks B, B's
app kept receiving A's posts.

Fix: a `blocked_user_ids()` `SECURITY DEFINER` helper (principle #7 — the plain subquery
version silently matches nothing) plus a predicate on the four public content read policies.
Carries a deliberate disclosure trade-off, documented in the migration and the PR: server-
side enforcement necessarily lets a blocked user learn they were blocked. Safety wins,
because the direction that protects a harassment victim is exactly the direction that
requires the disclosure.

## SECURITY DEFINER function inventory

**16 functions**, every one carrying an explicit `search_path`, and every one validating
ownership or role internally rather than trusting a caller-supplied id. Verified function by
function — this closes the `TODO` the draft left here.

| Function | What it enforces |
|---|---|
| `has_admin_role`, `current_admin_role` | Role lookup against `admin_members`; the basis of every admin policy |
| `current_business_id`, `current_organizer_id` | Identity lookup, **verified-only** — returns NULL for a pending or rejected business/organizer |
| `set_place_deal` | Requires `current_business_id()` to own an **approved** claim |
| `review_place_claim` | Requires an admin role |
| `moderate_content` | Requires an admin role |
| `issue_deal_code` | Requires an approved claim; after PR #49, also a verified business |
| `redeem_deal_code` | Requires `current_business_id()`; atomic after PR #50 |
| `prevent_business_self_verification`, `prevent_organizer_self_verification` | Trigger functions (as `guard_*` triggers); reject a non-owner/editor `verification_status` change — principle #4 |
| `prevent_last_owner_removal` | Stops the last `admin_members` owner being removed |
| `handle_new_auth_user` | Reads `raw_user_meta_data` only for display name/avatar/`default_identity`, whitelisted to 4 values — never for permissions |
| `write_admin_audit_log` | Writes the admin audit trail |
| `handle_event_rsvp_counts`, `refresh_meet_event_rsvp_counts` | Counter maintenance triggers |

Not definer, listed for contrast:

- `get_pulse_bootstrap` — `SECURITY INVOKER`, so RLS applies to everything it returns. This
  is why fixing a policy fixes the bootstrap for free, and why Finding #3's fix reaches
  `claimed_place_ids` and `deal_place_ids` with no edit to the function.
- `set_updated_at` — a plain `updated_at` trigger.

PR #51 adds a 17th, `blocked_user_ids()`: no arguments, derives the reader from `auth.uid()`
internally, explicit `search_path`.

## Auth hardening — current state

Cross-reference with `USER.md`'s launch checklist rather than duplicate it.

- Anonymous sign-ins: **disabled** (`external_anonymous_users_enabled = false`).
- Email confirmation: **off** (`mailer_autoconfirm = true`) — deliberate for early testing
  per `USER.md`, but it means every account is free to create, which is what makes any
  policy gap cheap to exploit.
- Password minimum length: **6**. HIBP leaked-password check: **off**. CAPTCHA: **off**.
- No service-role or secret key in `src/`, `public/` or `cloudflare-static-src/` — only the
  publishable key, as required. This is now enforced on every PR by `npm run check:secrets`
  in CI, rather than relying on review.

These four settings are Supabase dashboard config, not migrations. They are the largest
remaining item and belong with the launch checklist.

## Process — what actually prevents the next one

The technical fixes were the easy part. The failure mode was **an RLS policy change landing
without anyone re-checking how many policies now exist on that table for that command.**

1. **Any PR touching `supabase/migrations/**` that creates or drops a policy states, per
   table it touches, how many policies now exist per command.** One line in a PR
   description. It would have caught Finding #1 twice.
2. **`npm run audit:rls` before and after.** Snapshots RLS-enabled state, every policy per
   table per command, `anon`/`authenticated` grants, and the definer inventory with each
   `search_path`, to `supabase/policy-snapshot.json`. `--check` exits 1 on drift and prints
   the added and removed lines. Commit the updated snapshot with the migration that caused
   it. It needs `SUPABASE_DB_PASSWORD`, so it is a local gate — CI has no database
   credentials and its suites are deliberately offline.
3. **`npm run check:secrets` runs in CI** and blocks the build on a committed `.env`,
   service-role key, JWT, database password, credentialed Postgres URL, AWS key or GitHub
   token. `sb_publishable_` is exempt by design.

## Open items

1. Push Findings #1–#5 to production (PRs #47, #49, #50, #51) and generate the first
   `policy-snapshot.json` afterwards — generating it before would bake the gaps into the
   baseline.
2. Finish the report/block/mute persistence swap. `moderation-store.ts:11` still imports
   `./moderation-api-stub` instead of `@/lib/hp-api`, so a report reaches nobody and a block
   dies on reload, even though the tables and functions have been live since PR #42. One
   import line, plus the same in `ReportSheet.tsx:7`, plus deleting the stub.
   **Margaris's lane** — this is the Apple Guideline 1.2 blocker, and PR #51 is only its
   server half.
3. Auth hardening: password length, HIBP, CAPTCHA, and a decision on email confirmation.
4. Delete the ~15 `@hleiaspulse-audit.test` accounts and their issued deal codes.
5. Tidy the `user_place_visits` `public`-vs-`authenticated` grant (cosmetic).
6. Branch-protect `main`. CI runs but nothing enforces it, so none of the gates above are
   actually mandatory yet.

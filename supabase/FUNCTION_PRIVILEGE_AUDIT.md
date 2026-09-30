# PostgreSQL function privilege audit — 2026-09-28

Scope: all 32 Hleias Pulse functions in the current `main` migration-built schema.
The push queue and route-stop audit routines are already in mainline migrations;
the legacy `notify_question_answered()` trigger function was removed in favour
of the durable queue. Platform-owned `net`, `vault` and
`supabase_functions` routines remain in `policy-snapshot.json` but are not
modified here. The hosted database was not migrated or smoke-tested.

Roles in the matrix are direct Data API callers. `—` means no Data API role;
the PostgreSQL owner retains its inherent privilege. `A` = `anon`, `U` =
`authenticated`, `S` = `service_role`. Supabase anonymous _accounts_ use `U`.
All functions below are intended to have `search_path = ''` after the migration.
`D`/`I` are SECURITY DEFINER/INVOKER. `✓` under Auth means the body derives
`auth.uid()` or checks an admin/business role; `trigger` means provenance is
enforced by the table write or trigger, rather than by a callable RPC check.

| Function                                | Caller that needs it               | Mode | Schema  | API | Auth                                                           | RLS bypass / write amplification                                                                                                                                                                                                                     |
| --------------------------------------- | ---------------------------------- | ---- | ------- | --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blocked_user_ids()`                    | Feed RLS policies                  | D    | public  | A,U | ✓ own block relationships                                      | Reads past RLS, restricted to the caller's relationships; no writes. Anon gets an empty set.                                                                                                                                                         |
| `current_admin_role()`                  | Admin UI, route preview, audit log | D    | public  | U   | ✓ own membership                                               | Reads past `admin_members` RLS, restricted by `auth.uid()`; no writes.                                                                                                                                                                               |
| `current_business_id()`                 | Business policies and deal RPCs    | D    | public  | U   | ✓ own verified business                                        | Reads past `businesses` RLS, restricted by `auth.uid()`; no writes.                                                                                                                                                                                  |
| `current_organizer_id()`                | Organizer policies                 | D    | public  | U   | ✓ own verified organizer                                       | Reads past `organizers` RLS, restricted by `auth.uid()`; no writes.                                                                                                                                                                                  |
| `get_pulse_bootstrap()`                 | Guest and signed-in initial load   | I    | public  | A,U | RLS                                                            | Read-only; caller RLS remains in force.                                                                                                                                                                                                              |
| `has_admin_role(text[])`                | Admin RLS policies and RPCs        | D    | public  | U   | ✓ own membership, requested role set                           | Reads past `admin_members` RLS; no writes. The caller can test only its own role.                                                                                                                                                                    |
| `issue_deal_code(text)`                 | Signed-in deal claimant            | D    | public  | U   | ✓ `auth.uid()`, approved claim, verified business, active deal | Inserts past RLS. A per-user transaction lock serializes issuance; claim and business row locks prevent concurrent revocation. An existing live code is reused. At most 10 new codes/hour and 30/day per user, including redeemed and expired codes. |
| `moderate_content(text,text,text)`      | Owner/editor/moderator             | D    | public  | U   | ✓ admin role and status vocabulary                             | Updates one target past RLS and inserts an audit row; owner/editor updates may also fire one audit trigger row.                                                                                                                                      |
| `redeem_deal_code(text)`                | Verified business                  | D    | public  | U   | ✓ `current_business_id()` and matching code                    | Atomic conditional update past RLS; one code can redeem once.                                                                                                                                                                                        |
| `refresh_generic_stories()`             | Guest and signed-in bootstrap      | D    | public  | A,U | Fixed seed IDs + expiry predicate; no identity check           | Updates at most 11 editorial rows after their 6/24-hour expiry. Every page load can invoke it, but repeated early calls write zero rows. Removing A would break the current guest Stories rail.                                                      |
| `review_place_claim(uuid,text)`         | Owner/editor                       | D    | public  | U   | ✓ admin role and status vocabulary                             | Updates one claim past RLS and writes an audit row; audit trigger may add another.                                                                                                                                                                   |
| `set_place_deal(uuid,text,boolean)`     | Verified owner business            | D    | public  | U   | ✓ `current_business_id()`, approved claim, length cap          | Updates one claim past RLS.                                                                                                                                                                                                                          |
| `set_updated_at()`                      | Table triggers                     | I    | private | —   | trigger                                                        | Updates only `NEW.updated_at`; no RLS bypass.                                                                                                                                                                                                        |
| `handle_new_auth_user()`                | `auth.users` insert trigger        | D    | private | —   | trigger                                                        | Inserts profile, preferences and security event past RLS: three rows per signup.                                                                                                                                                                     |
| `refresh_meet_event_rsvp_counts(text)`  | RSVP trigger helper                | D    | private | —   | trigger                                                        | Recounts RSVP rows and updates one Meet event past RLS. Direct public calls formerly allowed arbitrary event recounts.                                                                                                                               |
| `handle_event_rsvp_counts()`            | RSVP row trigger                   | D    | private | —   | trigger                                                        | Calls the counter for one event, or two if event ID changes.                                                                                                                                                                                         |
| `prevent_last_owner_removal()`          | `admin_members` guard trigger      | D    | private | —   | trigger                                                        | Reads admin membership past RLS; rejects removal of the last owner.                                                                                                                                                                                  |
| `prevent_organizer_self_verification()` | Organizer update guard             | D    | private | —   | ✓ admin role on status change                                  | Reads role past RLS; no writes.                                                                                                                                                                                                                      |
| `prevent_business_self_verification()`  | Business update guard              | D    | private | —   | ✓ admin role on status change                                  | Reads role past RLS; no writes.                                                                                                                                                                                                                      |
| `write_admin_audit_log()`               | Admin content write triggers       | D    | private | —   | ✓ owner/editor                                                 | Inserts at most one audit row per changed row past RLS.                                                                                                                                                                                              |
| `write_admin_member_audit_log()`        | Admin membership trigger           | D    | private | —   | trigger                                                        | Inserts one audit row per membership write past RLS.                                                                                                                                                                                                 |
| `write_verification_audit_log()`        | Business/organizer triggers        | D    | private | —   | trigger                                                        | Inserts one audit row per verification transition past RLS.                                                                                                                                                                                          |

## Push and route-stop functions

These nine routines come from `20260918120000_security_p0_push_hardening.sql`
and `20260920193000_reconcile_api_grants.sql`. The three worker RPCs retain
explicit `S` grants; the other routines have no Data API caller.

| Function                                      | Needed by / mode / schema               | API | Internal check and effect                                                                                                                                                                | Path |
| --------------------------------------------- | --------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `claim_push_delivery_batch()`                 | Push worker / D / public                | S   | No JWT check; service grant is the boundary. Each call recovers at most 20 expired leases, fans out at most 20 outbox rows to at most 10 devices each, and claims at most 20 deliveries. | `''` |
| `prepare_push_delivery(uuid,uuid)`            | Push worker / D / public                | S   | Matches a claim token; rechecks eligibility and endpoint, may delete a bad subscription and update a delivery.                                                                           | `''` |
| `complete_push_delivery(uuid,uuid,text,text)` | Push worker / D / public                | S   | Validates outcome and claim token; updates one delivery, may delete a stale subscription and refreshes outbox status.                                                                    | `''` |
| `enforce_push_subscription_endpoint()`        | Subscription trigger / D / private      | —   | Trigger checks endpoint allowlist and payload byte limits; no API call.                                                                                                                  | `''` |
| `enforce_push_subscription_limit()`           | Subscription trigger / D / private      | —   | Per-user advisory lock and ten-device cap; no API call.                                                                                                                                  | `''` |
| `enqueue_published_question_answer()`         | Comment/publish trigger / D / private   | —   | Checks question, recipient and blocks; inserts an outbox row. Comment volume can amplify queue writes.                                                                                   | `''` |
| `invoke_push_worker()`                        | Internal push trigger/job / D / private | —   | Reads Vault values, pins worker URL, sends one `net.http_post`; no API call.                                                                                                             | `''` |
| `is_allowed_push_endpoint(text)`              | Push endpoint validator / I / private   | —   | Checks a candidate against the allowed endpoint patterns; no writes or RLS bypass.                                                                                                       | `''` |
| `refresh_push_outbox_status(uuid)`            | Worker helper / D / private             | —   | Recomputes one outbox status; no API call.                                                                                                                                               | `''` |
| `write_route_stop_audit_log()`                | Route stop trigger / D / private        | —   | Owner/editor check and audit insert.                                                                                                                                                     | `''` |

The three service worker RPCs stay in `public` because the current worker uses
the Data API; moving them would need a different API schema or direct DB
connection. The client RPCs stay in `public` for the same reason. Trigger-only
routines move to `private`; existing triggers refer to function OIDs and keep
firing. The RSVP trigger body is updated to call the moved helper explicitly.

## Observed exposure and residual risks

- Hosted `current_admin_role`, `current_business_id`, `current_organizer_id`,
  `has_admin_role`, `get_pulse_bootstrap` and `blocked_user_ids` had direct
  `anon` grants when inspected. The observed app-function ACLs did not have a
  `PUBLIC` entry; the remaining exposure was explicit `anon` and broad
  `service_role` grants. The hosted `postgres` default for new functions in
  `public` also granted `service_role`. Several privileged functions were still in
  exposed `public` with `search_path = public`. This migration removes the
  unnecessary grants and sets an empty path; only the three guest RPCs in the
  matrix keep `anon`.
- `refresh_generic_stories` remains a guest-callable write by product design.
  Its fixed IDs and expiry predicate cap committed writes, but page loads still
  run the query. A future scheduled service job could remove this guest RPC.
- `issue_deal_code` now serializes requests per user and caps new codes at 10
  per hour and 30 per day. The cap is per account; separate anonymous accounts
  have separate quotas. Existing live codes are returned before the cap check.
- The push queue is reproducible from migrations and covered by local unit
  and database smoke tests. Registration is capped at ten subscriptions per user;
  one worker call has bounded recovery, fanout and claim work. Endpoint and key
  byte limits bound per-row payloads. Its worker URL is pinned to this hosted project;
  another deployment needs an intentional configuration change.

## Verification, impact and rollback

`npm run test:function-privileges` checks the complete local app-function
inventory, exact allowed roles, absence of PUBLIC grants, safe paths, closed
defaults, and real accepted/rejected calls. It refuses to run unless its
PostgreSQL cluster identifier matches the local Supabase Docker container.
`npm run audit:rls -- --check` compares the committed local security snapshot.
`npm run test:push-security`, `npm run smoke:push-security`, and
`npm run smoke:deal-race` cover worker authorization, queue durability,
bounded fanout, concurrent issuance, revocation, the quota and one-time redemption.
The two destructive smokes require the CLI-reported local API credentials and
database. A loopback tunnel or foreign service key is rejected before writes.
Admin, moderation and
verification smokes passed on a disposable local stack with a seeded owner.
None of these checks should target the hosted project without a separate
deployment decision.

Each migration is one transaction: a failure before commit rolls that migration
back. After commit, rollback requires a _new_ migration. The privilege rollback
would need to move trigger functions back to `public`, restore the RSVP helper
reference and grant only necessary API callers. The push-limit rollback would
restore the previous `claim_push_delivery_batch()` body and remove the device
cap trigger and size checks without dropping queue data. The deal rollback
would remove the quota and advisory lock while retaining the existing redemption safety fix.
Restoring PUBLIC defaults would reopen the original exposure.
The existing mainline push migration can delete endpoints outside the provider
allowlist. Review the live invalid-endpoint count before approving deployment.
The new fanout-limit migration
fails if existing endpoint or key values exceed its byte limits. Recheck both
counts on hosted immediately before approval; users can register subscriptions
between this review and deployment. An earlier read-only hosted observation
found one valid subscription and no invalid endpoints, but that can change.
The expected API impact is denial of direct calls to internal routines and of
`service_role` calls to client RPCs. Guest bootstrap and all signed-in client
RPC names retain their grants. Applying these migrations to the hosted database
requires a separate release approval. None of these three new migrations was
applied to hosted during this work; an earlier local-stack port collision
with a live SSH tunnel is recorded in `SECURITY_BASELINE.md`.

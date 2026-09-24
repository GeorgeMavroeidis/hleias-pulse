# Security baseline

`policy-snapshot.json` is the expected catalog after replaying the committed
migrations into a fresh local Supabase database. It is not a copy of production.
CI runs the full `audit:rls --check` through `db:verify` after two clean resets.
The check fails on any changed object, including an additional policy or a new
`SECURITY DEFINER` function. `db:verify` also creates each of those as a probe,
verifies the check fails, then removes it.

The snapshot records all `public` tables, views and materialized views; their
owners, RLS flags, view definitions/options and direct grants; every `public`
policy's name, command, roles, `USING` and `WITH CHECK`; all `public` and
`private` functions, including argument types, overloads, owners, `EXECUTE`
grants and `search_path`; definitions of privileged functions in other
non-system schemas; `private` queue tables/policies; storage buckets and
`storage.objects` RLS, grants and policies; and table/function default ACLs
for the global and `public` scopes. Public tables without RLS, `storage.objects`
without RLS, and application `SECURITY DEFINER` functions without an explicit
`search_path` fail even when they happen to match a snapshot.

## Updating the baseline

1. Add a forward migration. Review each changed policy predicate, role, grant,
   function owner/body/signature, bucket or view against the intended API.
2. Stop the local project and ensure the configured DB port is free. Run
   `npm run db:verify` to replay from a clean database. If a migration
   intentionally changes security, preview with
   `npm run supabase:local -- audit:rls --write` on that fresh database.
3. Review the object summary and unified diff alongside the migration. Then
   run `npm run supabase:local -- audit:rls --write --accept=PASTE_REVIEW_DIGEST`
   with the printed digest, and rerun `npm run db:verify`. Snapshot writes
   require the Docker database's actual
   PostgreSQL cluster identifier, so a loopback SSH tunnel is refused.

`--check` is always read-only. It may be run against production as a deployment
preflight, but a mismatch must be investigated. Neither `--check` nor `--write`
applies migrations. There is no automatic path that accepts production state.

## Reviewed 2026-09-24 differences

The earlier committed snapshot only listed policy labels, selected role grants,
RLS-disabled tables and privileged function names/search paths. Its production
drift was not evidence that production should become the baseline. The fresh
replay on current `origin/main` includes the push hardening migration
`20260918120000` and API grant reconciliation `20260920193000`; both are also
recorded in the production migration ledger. The reviewed target has 31 public
relations (all tables have RLS), two private queue tables, 118 public policies,
14 storage object policies, two buckets and 25 public functions.

Fresh replay exposed one remaining grant error: a function newly created by
`postgres` could still be executed by `anon` because the schema-level default
`REVOKE` in `20260920193000` cannot cancel PostgreSQL's global `PUBLIC EXECUTE`
default. `20260924110000` revokes that global default. A transaction-scoped
probe changed from `has_function_privilege('anon', ..., 'execute') = true` to
`false` after replay. Existing function grants remain recorded separately.

A read-only production comparison after this local migration still fails. The
material expected difference is the pending global default-function grant
change. Remaining differences are textual formatting of several legacy
function definitions, three provider-managed `net`/`supabase_functions`
functions present only in local Supabase, `storage.objects` owner grant options,
and provider default ACLs. These are visible in the diff and were not copied
from production into the local baseline. Do not treat a passing local check as
proof that production has received the new migration.

The local Supabase bootstrap also contains `supabase_admin` default ACLs that
auto-grant API roles on objects that **that role** creates in `public`. The
application migrations create objects as `postgres`; that role cannot change
`supabase_admin`'s defaults. The baseline records these provider defaults and
will detect changes to them. Review ownership whenever adding a migration.

During an earlier local recovery attempt, port `54322` was occupied by an SSH
tunnel. CLI debug output showed default-privilege `REVOKE` statements sent
through that port before bootstrap failed on an existing table; the previous
production ACL state is unavailable, so their exact effect cannot be proved.
No corrective production SQL was run. `db:verify` now refuses an occupied DB
port before invoking the CLI, and snapshot writes compare the connected cluster
with the local Docker database. Any production remediation requires a separately
reviewed deployment and explicit approval.

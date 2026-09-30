# Supabase reconstruction and recovery

This procedure reconstructs the application schema and development/demo content
from Git. It does **not** recover real accounts, posts, uploaded objects, Auth
provider configuration, Vault/Function secrets, or scheduled-service credentials.
Those require the corresponding backups/configuration. Never run the demo seed
against production.

## Clean local recovery

Prerequisites: Node 22, npm, Git, and a running Docker-compatible engine. Use the
committed `package-lock.json` (`npm ci`) so the Supabase CLI and generation tools
are reproducible. The project uses PostgreSQL 17.

On macOS without Docker Desktop, a dedicated free Colima VM can be used:

```sh
brew install colima docker
colima start --profile hleias-recovery --vm-type vz --cpu 4 --memory 6 --disk 40 --activate=false
export DOCKER_HOST="unix://${HOME}/.colima/hleias-recovery/docker.sock"
```

From the repository checkout:

```sh
npm ci
npm run test:db-safety
npm run check:migration-versions
npm run db:verify
npm run typecheck
npm run build
```

`db:verify` starts the Supabase backend (omitting only Studio and telemetry
sidecars), explicitly runs `supabase db reset --local --yes`
twice, compares the application catalog (schemas, enums, sequences, views,
columns, constraints, indexes, function definitions/ACLs, triggers, RLS
predicates, table grants, storage policies/buckets and default privileges),
checks the committed generated types and seed, runs database lint, all ten smoke
scripts, the full RLS snapshot check, and verifies fixture cleanup by primary
key. Audit-log rows are retained intentionally. The command accepts no remote
URL, linked target, or arbitrary reset flags. Local credentials stay in
child-process memory.

For an individual local reset or test:

```sh
npx --no-install supabase start
npx --no-install supabase db reset --local --yes
npm run supabase:local -- db:contract
npm run supabase:local -- smoke:live-surfaces
npm run supabase:local -- audit:rls --check
```

The local wrapper reads addresses/credentials from `supabase status`, requires
loopback addresses, and ignores `.env`, including any hosted database password.
Run the wrapper even outside CI. Unwrapped destructive smoke scripts now fail
before connecting to any database.

To discard **this local project's** containers and persisted data before a clean
restart (only when those local data are disposable):

```sh
npx --no-install supabase stop --no-backup
npm run db:verify
```

Do not use `--linked`, `--db-url`, `db push`, `migration repair`, or a production
connection string during local recovery. Never use a remote reset as a production
recovery technique. Rebuild into an isolated new environment, restore validated
backups there, test, then approve a controlled cutover separately.

## Seed contract

- Places, primary-photo galleries, authors, posts/comments, routes/stops and legacy
  events are created before their dependent content.
- Six published Meet fixtures have the original IDs, place links, seed attendance
  and future-relative start times. Re-seeding preserves real RSVP contributions.
- Eleven editorial Stories have the original copy, IDs, media and 6/24-hour expiry
  expected by `refresh_generic_stories()`. Relative timestamps are intentional;
  determinism means the schema and fixture relationships, not frozen demo dates.
- Five municipal cultural events receive their place links after places exist.
  Municipal organizer UUIDs are assigned by the historical migration; no production
  UUID is copied into Git.
- Three inert development Auth rows support existing smoke preconditions: two
  ordinary users and one permanent owner. They have no password/provider identity
  and are banned indefinitely. The owner keeps the last-owner protection intact
  while disposable test owners are removed. These are not usable login accounts.
- `avatars` and `content-media` buckets and all 14 object policies come from
  migrations. Reconstructing a bucket does not reconstruct its uploaded files.
- Push tables/functions/triggers/cron are reconstructed. No worker/VAPID/Vault
  secrets are seeded, so the cron function fails closed and sends no request.

Regenerate committed artifacts after an intentional change:

```sh
npm run supabase:generate-seed
npx --no-install supabase gen types --lang typescript --local --schema public > /tmp/hleias-database.types.ts
npx --no-install prettier --write /tmp/hleias-database.types.ts --config .prettierrc
cp /tmp/hleias-database.types.ts src/lib/supabase/database.types.ts
npm run supabase:local -- audit:rls --write
# Review the displayed diff and the migration that explains each change.
npm run supabase:local -- audit:rls --write --accept=PASTE_REVIEW_DIGEST
npm run db:verify
```

The first write command only previews a line-oriented diff and exits with an
error. Acceptance requires the exact digest printed for that diff, an actual
local Supabase Docker database, and cannot
use a loopback SSH tunnel. Review the policy diff with its migration; never
refresh the snapshot just to make a failed check green. The default `audit:rls`
invocation intentionally does nothing; specify `--check` or `--write`.

`db:verify` also refuses to start while its configured database port is already
in use. Stop a legitimate local stack before invoking it. This prevents the
CLI from sending initialization or reset SQL through a loopback SSH tunnel. If
the port is needed by another service, use an isolated checkout with a unique
Supabase project ID and unused ports in its temporary `config.toml`; restore
the committed config after verification.

## Production and migration-history audit (2026-09-20 through 2026-09-22)

Audited `origin/main` at `d11b9a3` and production project
`kfxfnqryfmuxiwlswyyn` using PostgreSQL sessions configured with
`default_transaction_read_only=on` and `BEGIN READ ONLY`. No live smoke,
migration, repair, deployment, seed or data modification was executed.

All **39** applied production migration versions and names exist in Git; none is
missing and none had a conflicting name. The older missing `add_question_post_kind`
note is resolved. The only historical statement-text difference after normalizing
comments/whitespace is the already committed empty-database guard around the
Stories insert in `20260617161000`; it prevents a pre-seed foreign-key failure.
Historical migration files were not rewritten by this work.

Before allocating `20260920193000`, fetched origin and inspected **58 refs and
7 worktrees**, including uncommitted SQL. No timestamp/name collisions existed;
the greatest existing version was `20260919120000` on the separate route-preview
branch. That unmerged feature is not imported into this backend repair.

The read-only catalog comparison found production drift despite the matching
ledger: `posts/comments.sort_order` remained `integer` rather than `bigint`; one
deal-text constraint and one place-visit index had legacy names;
`set_place_deal()` retained older behavior; two place-visit policies targeted
`PUBLIC`; and hosted legacy defaults granted broad table/function privileges.
The route-stop audit trigger and redemption cleanup FKs were also invalid when
exercised from a clean stack. These differences are all represented by the new
forward migration; no historical migration was edited.

At the time of that audit, the new migration was **pending** in production. It converges those
catalog objects, declares API table/RPC grants explicitly, removes legacy
`TRUNCATE/REFERENCES/TRIGGER` and implicit function privileges, adds the two
upsert UPDATE policies, repairs the route-stop audit trigger, and makes deal
cleanup cascades explicit. Service-role access is declared; private push queues
and the route-stop trigger function remain inaccessible directly. The reviewed
snapshot records this target schema. A read-only ledger check on 2026-09-24
confirmed `20260920193000` is now applied in production. The later
`20260924110000` default-function privilege migration remains local only.

To repeat a live inventory, use an explicitly read-only session and query only
metadata; compare the returned version **and name** with `supabase/migrations`:

```sql
BEGIN READ ONLY;
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
ROLLBACK;
```

Fetch before reserving a future timestamp, then run
`npm run check:migration-versions`. Do not renumber an applied version or mark a
missing file as applied to hide a mismatch. Recover its original reviewed SQL
from the migration ledger and verify an empty replay before any rollout.

## Root causes addressed

| Area                          | Failure on clean reconstruction                       | Resolution                                              |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| Meet / Stories                | Backfills ran before their places existed             | Complete fixtures in the seed, after places             |
| Gallery / image URLs          | Pre-seed updates matched zero rows                    | Final gallery values and URL corrections in seed source |
| Municipal event links         | Places absent during linking migration                | Explicit post-place links in seed                       |
| API permissions               | Hosted legacy auto-grants masked missing declarations | Canonical explicit grants with unchanged RLS rules      |
| Admin / block / deal fixtures | Tests assumed pre-existing users and owner            | Inert development identities; keep last-owner guard     |
| Security drift                | Production policy roles differed from Git             | Forward migration reconciles authored roles             |
| UPSERT permissions            | First story/activity UPSERT required missing UPDATE   | Explicit UPDATE grants and own-row policies             |
| Route-stop audit              | Generic trigger read a nonexistent `id` column        | Composite-key-specific private trigger                  |
| Deal cleanup                  | Denormalized FKs blocked parent cleanup               | Explicit cascades on claim, business and place          |
| Recovery safety               | `.env` could override local environment settings      | Process precedence plus strict local wrapper            |
| Regression coverage           | Most smokes skipped; RLS check scoped only to push    | Complete reconstruction and full suite in CI            |

## Verified recovery result (2026-09-22)

The dedicated local PostgreSQL 17 stack was rebuilt twice from an empty database.
Both runs completed migrations and seed without intervention and produced catalog
SHA-256 `1fe5fd5606b07b18046aeb658a8a634c7d9e23d2df84635f39a323cd1fa1743d`.
Database lint, the seed replay/idempotence contract, generated-type comparison,
all ten smoke scripts, full RLS snapshot comparison, and primary-key fixture
cleanup passed. The baseline before this repair rebuilt successfully at the SQL
level but contained zero Meets, seven rather than eleven editorial Stories, zero
municipal place links, and 51 places with empty galleries; its live-surfaces
smoke failed. Production remained read-only throughout this audit.

Production deployment still requires separate approval and the push operational
checks documented in `SECURITY.md`.

References: [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations),
[Colima installation](https://colima.run/docs/installation/).

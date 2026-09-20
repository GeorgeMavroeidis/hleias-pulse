/**
 * Snapshot the live security posture of the client-facing `public` schema and
 * the locked `private` schema, and diff it.
 *
 * Why this exists: on 2026-09-05 an audit found that meet_events had carried
 * two INSERT policies since August. A migration had tried to retire the old one
 * and dropped the wrong policy name; a second migration repeated the same wrong
 * name. `drop policy if exists` on a name that does not exist is a silent
 * no-op, so both attempts did nothing and the table quietly kept a policy that
 * let any authenticated user publish straight past moderation.
 *
 * Nothing caught it because nothing recorded what the policies were supposed to
 * be. Reconstructing that took reading all 24 migrations by hand. This turns
 * that reconstruction into a file: a table silently gaining a second INSERT
 * policy shows up as one added line in a reviewable diff.
 *
 * It captures three things, because all three are load-bearing:
 *
 *   1. RLS enabled, per table. Anything false is an open door.
 *   2. Every policy, per table, per command.
 *   3. Table grants to anon and authenticated. This is the one people skip, and
 *      it is why the policies matter so much here: Supabase's default
 *      privileges hand `anon` a blanket SELECT on tables our migrations never
 *      granted it, so RLS is the ONLY thing keeping content_reports,
 *      user_blocks, admin_members and deal_redemptions shut. Every policy slip
 *      is instantly public. The snapshot should make that obvious rather than
 *      leave it as folklore.
 *
 * Plus the SECURITY DEFINER function inventory, since a definer function that
 * loses its explicit search_path is its own privilege-escalation route.
 *
 *   npm run audit:rls            # write supabase/policy-snapshot.json
 *   npm run audit:rls -- --check # exit 1 if live state has drifted from it
 *   npm run audit:rls -- --check --scope=push
 *                                # compare only the P0 push trust boundary
 *
 * Needs SUPABASE_DB_PASSWORD (.env or environment), like the smoke scripts.
 * CI runs the push-scoped check against its disposable local stack; the full
 * check remains the production preflight gate.
 */
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

import { createPgSession } from "./lib/pg";

const SNAPSHOT_PATH = "supabase/policy-snapshot.json";

type Snapshot = {
  definerFunctions: { name: string; searchPath: string | null }[];
  grants: Record<string, Record<string, string[]>>;
  policies: Record<string, Record<string, string[]>>;
  rlsDisabled: string[];
  tables: string[];
};

const PUSH_DEFINER_FUNCTIONS = new Set([
  "claim_push_delivery_batch",
  "complete_push_delivery",
  "prepare_push_delivery",
  "private.enforce_push_subscription_endpoint",
  "private.enqueue_published_question_answer",
  "private.invoke_push_worker",
  "private.refresh_push_outbox_status",
]);

function isPushTable(table: string) {
  return table === "push_subscriptions" || table.startsWith("private.push_notification_");
}

/**
 * Local bootstrap intentionally differs from the production-wide snapshot in
 * legacy, unrelated objects. The P0 CI gate therefore compares only the trust
 * boundary this change owns; the default audit remains a full production
 * posture comparison for rollout preflight.
 */
function pushScope(snapshot: Snapshot): Snapshot {
  return {
    definerFunctions: snapshot.definerFunctions.filter(({ name }) =>
      PUSH_DEFINER_FUNCTIONS.has(name),
    ),
    grants: Object.fromEntries(
      Object.entries(snapshot.grants).filter(([table]) => isPushTable(table)),
    ),
    policies: Object.fromEntries(
      Object.entries(snapshot.policies).filter(([table]) => isPushTable(table)),
    ),
    rlsDisabled: snapshot.rlsDisabled.filter(isPushTable),
    tables: snapshot.tables.filter(isPushTable),
  };
}

async function collect(client: pg.Client): Promise<Snapshot> {
  const tables = await client.query<{
    relname: string;
    relrowsecurity: boolean;
    schema_name: string;
  }>(`
    select n.nspname as schema_name, c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
    order by case when n.nspname = 'public' then 0 else 1 end, c.relname
  `);

  const policies = await client.query<{
    cmd: string;
    permissive: string;
    policyname: string;
    roles: string;
    schemaname: string;
    tablename: string;
  }>(`
    select schemaname, tablename, policyname, cmd, permissive, array_to_string(roles, ',') as roles
    from pg_policies
    where schemaname in ('public', 'private')
    order by case when schemaname = 'public' then 0 else 1 end, tablename, cmd, policyname
  `);

  // Client roles matter for the public schema. service_role is included as
  // well because the private queue intentionally denies even direct table
  // access to the worker; it must go through the narrow RPC surface.
  const grants = await client.query<{
    grantee: string;
    privilege_type: string;
    table_schema: string;
    table_name: string;
  }>(`
    select table_schema, table_name, grantee, privilege_type
    from information_schema.role_table_grants
    where (table_schema = 'public' and grantee in ('anon', 'authenticated'))
       or (table_schema = 'private' and grantee in ('anon', 'authenticated', 'service_role'))
    order by case when table_schema = 'public' then 0 else 1 end,
             table_name, grantee, privilege_type
  `);

  const definer = await client.query<{
    name: string;
    schema_name: string;
    search_path: string | null;
  }>(`
    select n.nspname as schema_name, p.proname as name,
           (select cfg from unnest(coalesce(p.proconfig, '{}')) cfg
             where cfg like 'search_path=%' limit 1) as search_path
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
    order by case when n.nspname = 'public' then 0 else 1 end, p.proname
  `);

  const policyMap: Snapshot["policies"] = {};
  for (const row of policies.rows) {
    const table =
      row.schemaname === "public" ? row.tablename : `${row.schemaname}.${row.tablename}`;
    const byCmd = (policyMap[table] ??= {});
    (byCmd[row.cmd] ??= []).push(
      `${row.policyname} [${row.roles}]${row.permissive === "PERMISSIVE" ? "" : " RESTRICTIVE"}`,
    );
  }

  const grantMap: Snapshot["grants"] = {};
  for (const row of grants.rows) {
    const table =
      row.table_schema === "public" ? row.table_name : `${row.table_schema}.${row.table_name}`;
    const byGrantee = (grantMap[table] ??= {});
    (byGrantee[row.grantee] ??= []).push(row.privilege_type);
  }

  return {
    definerFunctions: definer.rows.map((row) => ({
      name: row.schema_name === "public" ? row.name : `${row.schema_name}.${row.name}`,
      searchPath: row.search_path,
    })),
    grants: grantMap,
    policies: policyMap,
    rlsDisabled: tables.rows
      .filter((row) => !row.relrowsecurity)
      .map((row) =>
        row.schema_name === "public" ? row.relname : `${row.schema_name}.${row.relname}`,
      ),
    tables: tables.rows.map((row) =>
      row.schema_name === "public" ? row.relname : `${row.schema_name}.${row.relname}`,
    ),
  };
}

/** Human-readable, line-oriented, so a diff points at the thing that changed. */
function render(snapshot: Snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

async function main() {
  const check = process.argv.includes("--check");
  const scopeArgument = process.argv.find((argument) => argument.startsWith("--scope="));
  if (scopeArgument && scopeArgument !== "--scope=push") {
    throw new Error(`Unsupported audit scope: ${scopeArgument.slice("--scope=".length)}`);
  }
  const scopedToPush = scopeArgument === "--scope=push";
  // Session mode: read-only introspection, but this script has always used
  // 5432 and there is no reason to move it. The session's value here is the
  // guarded connection — a drop used to kill the process with a raw stack
  // trace instead of a readable failure.
  const db = createPgSession("session", "audit-rls");

  let snapshot: Snapshot;
  try {
    snapshot = await db.withPg(collect);
  } finally {
    await db.close();
  }

  const rendered = render(snapshot);

  // A table with RLS off, or one with no policy at all, is a finding on its
  // own — loud, whether or not the snapshot matches.
  const unprotected = snapshot.tables.filter(
    (table) => !table.startsWith("private.") && !snapshot.policies[table],
  );
  const privateGrants = Object.keys(snapshot.grants).filter((table) =>
    table.startsWith("private."),
  );
  if (snapshot.rlsDisabled.length || unprotected.length || privateGrants.length) {
    console.error("RLS COVERAGE FAILURE");
    if (snapshot.rlsDisabled.length) {
      console.error(`  RLS disabled: ${snapshot.rlsDisabled.join(", ")}`);
    }
    if (unprotected.length) {
      console.error(`  No policy at all: ${unprotected.join(", ")}`);
    }
    if (privateGrants.length) {
      console.error(`  Client/service grants on private tables: ${privateGrants.join(", ")}`);
    }
    process.exit(1);
  }

  if (!check) {
    writeFileSync(SNAPSHOT_PATH, rendered);
    const policyCount = Object.values(snapshot.policies).reduce(
      (total, byCmd) => total + Object.values(byCmd).reduce((n, list) => n + list.length, 0),
      0,
    );
    console.log(
      `Wrote ${SNAPSHOT_PATH}: ${snapshot.tables.length} tables, ${policyCount} policies, ` +
        `${snapshot.definerFunctions.length} SECURITY DEFINER functions.`,
    );
    return;
  }

  let expected: string;
  try {
    expected = readFileSync(SNAPSHOT_PATH, "utf8");
  } catch {
    console.error(`${SNAPSHOT_PATH} does not exist yet. Run \`npm run audit:rls\` to create it.`);
    process.exit(1);
    return;
  }

  const expectedSnapshot = JSON.parse(expected) as Snapshot;
  const expectedForComparison = render(
    scopedToPush ? pushScope(expectedSnapshot) : expectedSnapshot,
  );
  const actualForComparison = render(scopedToPush ? pushScope(snapshot) : snapshot);
  const scopeLabel = scopedToPush ? "push security scope in " : "";

  if (expectedForComparison === actualForComparison) {
    console.log(`Live policy state matches ${scopeLabel}${SNAPSHOT_PATH}.`);
    return;
  }

  console.error(`Live policy state has DRIFTED from ${scopeLabel}${SNAPSHOT_PATH}.`);
  const before = expectedForComparison.split("\n");
  const after = actualForComparison.split("\n");
  const seen = new Set(before);
  const gone = new Set(after);
  for (const line of after) if (!seen.has(line)) console.error(`  + ${line.trim()}`);
  for (const line of before) if (!gone.has(line)) console.error(`  - ${line.trim()}`);
  console.error(
    "\nIf this is intentional, re-run `npm run audit:rls` and commit the snapshot " +
      "with the migration that caused it.",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

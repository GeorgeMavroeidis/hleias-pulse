/**
 * Snapshot the live security posture of the `public` schema, and diff it.
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
 *
 * Needs SUPABASE_DB_PASSWORD (.env or environment), like the smoke scripts, so
 * it is a local/on-demand gate rather than a CI job — CI has no database
 * credentials and its suites are deliberately offline.
 */
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const projectRef = "kfxfnqryfmuxiwlswyyn";
const SNAPSHOT_PATH = "supabase/policy-snapshot.json";

function readEnvValue(name: string) {
  try {
    const env = readFileSync(".env", "utf8");
    const value = env
      .split(/\n/)
      .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
      .find((match) => match?.[1] === name)?.[2]
      ?.trim()
      .replace(/^['"]|['"]$/g, "");
    return value || process.env[name];
  } catch {
    return process.env[name];
  }
}

function createPgClient() {
  const password = readEnvValue("SUPABASE_DB_PASSWORD");
  if (!password) {
    throw new Error(
      "SUPABASE_DB_PASSWORD is missing. Put it in .env, like the smoke scripts expect.",
    );
  }

  // This project (created 2026-08) is pooler-only — db.<ref>.supabase.co does
  // not resolve. Session mode (port 5432), user postgres.<ref>.
  return new pg.Client({
    host: "aws-0-eu-central-1.pooler.supabase.com",
    port: 5432,
    database: "postgres",
    user: `postgres.${projectRef}`,
    password,
    ssl: { rejectUnauthorized: false },
  });
}

type Snapshot = {
  definerFunctions: { name: string; searchPath: string | null }[];
  grants: Record<string, Record<string, string[]>>;
  policies: Record<string, Record<string, string[]>>;
  rlsDisabled: string[];
  tables: string[];
};

async function collect(client: pg.Client): Promise<Snapshot> {
  const tables = await client.query<{ relname: string; relrowsecurity: boolean }>(`
    select c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `);

  const policies = await client.query<{
    cmd: string;
    permissive: string;
    policyname: string;
    roles: string;
    tablename: string;
  }>(`
    select tablename, policyname, cmd, permissive, array_to_string(roles, ',') as roles
    from pg_policies
    where schemaname = 'public'
    order by tablename, cmd, policyname
  `);

  // Only anon and authenticated matter here: those are the two roles a request
  // from the app or from the open internet actually arrives as.
  const grants = await client.query<{
    grantee: string;
    privilege_type: string;
    table_name: string;
  }>(`
    select table_name, grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
    order by table_name, grantee, privilege_type
  `);

  const definer = await client.query<{ name: string; search_path: string | null }>(`
    select p.proname as name,
           (select cfg from unnest(coalesce(p.proconfig, '{}')) cfg
             where cfg like 'search_path=%' limit 1) as search_path
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
    order by p.proname
  `);

  const policyMap: Snapshot["policies"] = {};
  for (const row of policies.rows) {
    const byCmd = (policyMap[row.tablename] ??= {});
    (byCmd[row.cmd] ??= []).push(
      `${row.policyname} [${row.roles}]${row.permissive === "PERMISSIVE" ? "" : " RESTRICTIVE"}`,
    );
  }

  const grantMap: Snapshot["grants"] = {};
  for (const row of grants.rows) {
    const byGrantee = (grantMap[row.table_name] ??= {});
    (byGrantee[row.grantee] ??= []).push(row.privilege_type);
  }

  return {
    definerFunctions: definer.rows.map((row) => ({ name: row.name, searchPath: row.search_path })),
    grants: grantMap,
    policies: policyMap,
    rlsDisabled: tables.rows.filter((row) => !row.relrowsecurity).map((row) => row.relname),
    tables: tables.rows.map((row) => row.relname),
  };
}

/** Human-readable, line-oriented, so a diff points at the thing that changed. */
function render(snapshot: Snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

async function main() {
  const check = process.argv.includes("--check");
  const client = createPgClient();
  await client.connect();

  let snapshot: Snapshot;
  try {
    snapshot = await collect(client);
  } finally {
    await client.end();
  }

  const rendered = render(snapshot);

  // A table with RLS off, or one with no policy at all, is a finding on its
  // own — loud, whether or not the snapshot matches.
  const unprotected = snapshot.tables.filter((table) => !snapshot.policies[table]);
  if (snapshot.rlsDisabled.length || unprotected.length) {
    console.error("RLS COVERAGE FAILURE");
    if (snapshot.rlsDisabled.length) {
      console.error(`  RLS disabled: ${snapshot.rlsDisabled.join(", ")}`);
    }
    if (unprotected.length) {
      console.error(`  No policy at all: ${unprotected.join(", ")}`);
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

  if (expected === rendered) {
    console.log(`Live policy state matches ${SNAPSHOT_PATH}.`);
    return;
  }

  console.error(`Live policy state has DRIFTED from ${SNAPSHOT_PATH}.`);
  const before = expected.split("\n");
  const after = rendered.split("\n");
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

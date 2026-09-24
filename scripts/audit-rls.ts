/** Snapshot the API-facing security catalogue. Generate only from a fresh local stack. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { readEnvValue } from "./lib/env";
import { createPgSession } from "./lib/pg";

const PATH = "supabase/policy-snapshot.json";
type Row = Record<string, unknown>;
type Snapshot = {
  version: number;
  publicRelations: Row[];
  privateRelations: Row[];
  publicPolicies: Row[];
  privatePolicies: Row[];
  publicFunctions: Row[];
  privateFunctions: Row[];
  otherPrivilegedFunctions: Row[];
  storageBuckets: Row[];
  storageObjects: Row[];
  storagePolicies: Row[];
  defaultPrivileges: Row[];
};

// Direct catalogue ACLs include PUBLIC and privileges inherited from PostgreSQL
// defaults. information_schema.role_table_grants silently omits some of these.
const acl = (value: string, owner: string, kind: string) => `
  select coalesce(r.rolname, 'PUBLIC') as grantee,
         pg_get_userbyid(a.grantor) as grantor,
         a.privilege_type as privilege, a.is_grantable as grantable
  from aclexplode(coalesce(${value}, acldefault(${kind.length === 1 ? `'${kind}'` : kind}, ${owner}))) a
  left join pg_roles r on r.oid = a.grantee
  order by grantee, privilege, grantable, grantor`;

async function rows(client: pg.Client, sql: string): Promise<Row[]> {
  return (await client.query<Row>(sql)).rows;
}

async function collect(client: pg.Client): Promise<Snapshot> {
  await client.query("begin transaction isolation level repeatable read read only");
  try {
    const relationsSql = (schema: string) => `
      select c.relname as name,
             case c.relkind when 'r' then 'table' when 'p' then 'partitioned table'
               when 'f' then 'foreign table' when 'v' then 'view' else 'materialized view' end as kind,
             pg_get_userbyid(c.relowner) as owner,
             case when c.relkind in ('r','p') then c.relrowsecurity else null end as "rlsEnabled",
             case when c.relkind in ('r','p') then c.relforcerowsecurity else null end as "rlsForced",
             c.reloptions as options,
             case when c.relkind in ('v','m') then pg_get_viewdef(c.oid, true) else null end as definition,
             coalesce((select jsonb_agg(to_jsonb(g) order by g.grantee, g.privilege, g.grantor) from lateral
               (${acl("c.relacl", "c.relowner", "r")}) g), '[]'::jsonb) as grants
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = '${schema}' and c.relkind in ('r','p','f','v','m')
      order by c.relname`;
    const publicRelations = await rows(client, relationsSql("public"));
    const privateRelations = await rows(client, relationsSql("private"));
    const policiesSql = (schema: string) => `
      select tablename as relation, policyname as name, cmd as command,
             permissive, array(select role::text from unnest(roles) role order by role) as roles,
             qual as "using", with_check as "withCheck"
      from pg_policies where schemaname = '${schema}'
      order by tablename, policyname`;
    const publicPolicies = await rows(client, policiesSql("public"));
    const privatePolicies = await rows(client, policiesSql("private"));
    const functionsSql = (schema: string) => `
      select format('%I.%I(%s)', n.nspname, p.proname,
                    pg_get_function_identity_arguments(p.oid)) as signature,
             case p.prokind when 'p' then 'procedure' else 'function' end as kind,
             pg_get_function_arguments(p.oid) as arguments,
             pg_get_userbyid(p.proowner) as owner,
             p.prosecdef as "securityDefiner",
             (select substr(cfg, length('search_path=') + 1)
                from unnest(p.proconfig) cfg where cfg like 'search_path=%' limit 1) as "searchPath",
             coalesce((select jsonb_agg(to_jsonb(g) order by g.grantee, g.privilege, g.grantor) from lateral
               (${acl("p.proacl", "p.proowner", "f")}) g), '[]'::jsonb) as "executeGrants",
             case when p.prosecdef then pg_get_functiondef(p.oid) else null end as definition
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = '${schema}' and p.prokind in ('f', 'p')
      order by signature`;
    const publicFunctions = await rows(client, functionsSql("public"));
    const privateFunctions = await rows(client, functionsSql("private"));
    const otherPrivilegedFunctions = await rows(
      client,
      `select format('%I.%I(%s)', n.nspname, p.proname,
                     pg_get_function_identity_arguments(p.oid)) as signature,
              case p.prokind when 'p' then 'procedure' else 'function' end as kind,
              pg_get_function_arguments(p.oid) as arguments,
              pg_get_userbyid(p.proowner) as owner,
              p.prosecdef as "securityDefiner",
              (select substr(cfg, length('search_path=') + 1)
                 from unnest(p.proconfig) cfg where cfg like 'search_path=%' limit 1) as "searchPath",
              coalesce((select jsonb_agg(to_jsonb(g) order by g.grantee, g.privilege, g.grantor)
                        from lateral (${acl("p.proacl", "p.proowner", "f")}) g), '[]'::jsonb) as "executeGrants",
              pg_get_functiondef(p.oid) as definition
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and n.nspname not in ('public', 'pg_catalog', 'information_schema')
         and n.nspname <> 'private'
         and n.nspname not like 'pg_%'
       order by signature`,
    );
    const storageBuckets = await rows(
      client,
      `
      select id, name, public, file_size_limit as "fileSizeLimit",
             allowed_mime_types as "allowedMimeTypes"
      from storage.buckets order by id`,
    );
    const storageObjects = await rows(
      client,
      `
      select c.relrowsecurity as "rlsEnabled", c.relforcerowsecurity as "rlsForced",
             coalesce((select jsonb_agg(to_jsonb(g) order by g.grantee, g.privilege, g.grantor) from lateral
               (${acl("c.relacl", "c.relowner", "r")}) g), '[]'::jsonb) as grants
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage' and c.relname = 'objects'`,
    );
    const storagePolicies = await rows(
      client,
      `
      select tablename as relation, policyname as name, cmd as command,
             permissive, array(select role::text from unnest(roles) role order by role) as roles,
             qual as "using", with_check as "withCheck"
      from pg_policies where schemaname = 'storage' and tablename = 'objects'
      order by tablename, policyname`,
    );
    const defaultPrivileges = await rows(
      client,
      `
      select pg_get_userbyid(d.defaclrole) as owner, n.nspname as schema,
             case d.defaclobjtype when 'r' then 'tables' else 'functions' end as "objectType",
             coalesce((select jsonb_agg(to_jsonb(g) order by g.grantee, g.privilege, g.grantor) from lateral
               (${acl("d.defaclacl", "d.defaclrole", "d.defaclobjtype")}) g), '[]'::jsonb) as grants
      from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
      where d.defaclobjtype in ('r','f') and (d.defaclnamespace = 0 or n.nspname = 'public')
      order by owner, schema nulls first, "objectType"`,
    );
    await client.query("commit");
    const readable = ({ definition, ...f }: Row) => ({
      ...f,
      ...(typeof definition === "string"
        ? { definitionLines: definition.replace(/\r\n?/g, "\n").trimEnd().split("\n") }
        : {}),
    });
    return {
      version: 4,
      publicRelations,
      privateRelations,
      publicPolicies,
      privatePolicies,
      publicFunctions: publicFunctions.map(readable),
      privateFunctions: privateFunctions.map(readable),
      otherPrivilegedFunctions: otherPrivilegedFunctions.map(readable),
      storageBuckets,
      storageObjects,
      storagePolicies,
      defaultPrivileges,
    };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

function unifiedDiff(before: string, after: string): string {
  const dir = mkdtempSync(join(tmpdir(), "rls-audit-"));
  try {
    const oldPath = join(dir, "committed");
    const newPath = join(dir, "database");
    writeFileSync(oldPath, before);
    writeFileSync(newPath, after);
    try {
      return execFileSync(
        "diff",
        ["-u", "--label", "committed baseline", "--label", "database state", oldPath, newPath],
        { encoding: "utf8" },
      );
    } catch (error) {
      return (error as { stdout?: string }).stdout ?? String(error);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function changeSummary(expectedText: string, current: Snapshot): string {
  let expected: Snapshot;
  try {
    expected = JSON.parse(expectedText) as Snapshot;
  } catch {
    return "Existing snapshot is missing or not valid JSON; inspect the full diff.";
  }
  if (expected.version !== current.version)
    return `Snapshot format: v${expected.version ?? "legacy"} → v${current.version}; inspect the full diff.`;
  const sections: { name: keyof Snapshot; id: (row: Row) => string }[] = [
    { name: "publicRelations", id: (r) => String(r.name) },
    { name: "privateRelations", id: (r) => String(r.name) },
    { name: "publicPolicies", id: (r) => `${r.relation} / ${r.name}` },
    { name: "privatePolicies", id: (r) => `${r.relation} / ${r.name}` },
    { name: "publicFunctions", id: (r) => String(r.signature) },
    { name: "privateFunctions", id: (r) => String(r.signature) },
    { name: "otherPrivilegedFunctions", id: (r) => String(r.signature) },
    { name: "storageBuckets", id: (r) => String(r.id) },
    { name: "storagePolicies", id: (r) => `${r.relation} / ${r.name}` },
    {
      name: "defaultPrivileges",
      id: (r) => `${r.owner} / ${r.schema ?? "global"} / ${r.objectType}`,
    },
  ];
  const lines: string[] = [];
  for (const section of sections) {
    const before = new Map((expected[section.name] as Row[]).map((r) => [section.id(r), r]));
    const after = new Map((current[section.name] as Row[]).map((r) => [section.id(r), r]));
    for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const old = before.get(id);
      const next = after.get(id);
      if (!old) lines.push(`+ ${section.name}: ${id}`);
      else if (!next) lines.push(`- ${section.name}: ${id}`);
      else if (JSON.stringify(old) !== JSON.stringify(next)) {
        const fields = [...new Set([...Object.keys(old), ...Object.keys(next)])].filter(
          (key) => JSON.stringify(old[key]) !== JSON.stringify(next[key]),
        );
        lines.push(`~ ${section.name}: ${id} (${fields.join(", ")})`);
      }
    }
  }
  if (JSON.stringify(expected.storageObjects) !== JSON.stringify(current.storageObjects))
    lines.push("~ storageObjects (RLS or grants)");
  return lines.length ? `Changed objects:\n${lines.join("\n")}\n` : "";
}

/** A loopback address may be an SSH tunnel. Prove it is the Docker database. */
async function assertLocalDockerDatabase(client: pg.Client) {
  const port = Number(readEnvValue("SUPABASE_DB_PORT") ?? "54322");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("A valid local SUPABASE_DB_PORT is required for snapshot writes.");
  const connected = (
    await client.query<{ system_identifier: string }>(
      "select system_identifier from pg_control_system()",
    )
  ).rows[0]?.system_identifier;
  const names = execFileSync(
    "docker",
    ["ps", "--filter", `publish=${port}`, "--format", "{{.Names}}"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n");
  for (const name of names.filter((n) => n.startsWith("supabase_db_"))) {
    const dockerId = execFileSync(
      "docker",
      [
        "exec",
        name,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-Atqc",
        "select system_identifier from pg_control_system()",
      ],
      { encoding: "utf8" },
    ).trim();
    if (dockerId === connected) return;
  }
  throw new Error(
    `Port ${port} does not reach its local Supabase Docker database. Check for an SSH tunnel or port conflict.`,
  );
}

async function main() {
  const check = process.argv.includes("--check");
  const write = process.argv.includes("--write");
  const acceptance = process.argv.find((arg) => arg.startsWith("--accept"));
  if (check === write || (acceptance && (!write || !/^--accept=[a-f0-9]{64}$/.test(acceptance))))
    throw new Error(
      "Use --check or --write [--accept=<review digest>]. --write previews the diff.",
    );
  if (
    write &&
    (!["127.0.0.1", "localhost", "::1"].includes(readEnvValue("SUPABASE_DB_HOST") ?? "") ||
      readEnvValue("SUPABASE_PROJECT_REF") !== "local")
  )
    throw new Error(
      "Snapshot writes require SUPABASE_DB_HOST=127.0.0.1 and SUPABASE_PROJECT_REF=local.",
    );

  const db = createPgSession("session", "audit-rls");
  let snapshot: Snapshot;
  try {
    snapshot = await db.withPg(async (client) => {
      if (write) await assertLocalDockerDatabase(client);
      return collect(client);
    });
  } finally {
    await db.close();
  }
  const badTables = snapshot.publicRelations.filter(
    (r) => (r.kind === "table" || r.kind === "partitioned table") && !r.rlsEnabled,
  );
  const badFunctions = [...snapshot.publicFunctions, ...snapshot.privateFunctions].filter(
    (f) => f.securityDefiner && f.searchPath === null,
  );
  if (
    badTables.length ||
    badFunctions.length ||
    snapshot.storageObjects.length !== 1 ||
    !snapshot.storageObjects[0].rlsEnabled
  )
    throw new Error(
      [
        ...badTables.map((r) => `RLS disabled: public.${r.name}`),
        ...badFunctions.map((f) => `SECURITY DEFINER missing search_path: ${f.signature}`),
        ...(!snapshot.storageObjects[0]?.rlsEnabled
          ? ["RLS disabled or missing: storage.objects"]
          : []),
      ].join("\n"),
    );

  const current = `${JSON.stringify(snapshot, null, 2)}\n`;
  let expected = "";
  try {
    expected = readFileSync(PATH, "utf8");
  } catch {
    /* first baseline */
  }
  if (expected === current) {
    console.log(`Security state matches ${PATH}.`);
    return;
  }
  console.error(changeSummary(expected, snapshot));
  console.error(unifiedDiff(expected, current));
  const digest = createHash("sha256").update(expected).update("\0").update(current).digest("hex");
  if (check) {
    console.error(
      "Security baseline drift. Review the diff and migrations; never accept hosted state as baseline.",
    );
    process.exitCode = 1;
  } else if (acceptance === `--accept=${digest}`) {
    writeFileSync(PATH, current);
    console.log(`Accepted local migration state in ${PATH}.`);
  } else if (acceptance) {
    throw new Error("Review digest does not match this diff; preview and inspect it again.");
  } else {
    console.error(
      `Preview only. Review the diff, then run --write --accept=${digest} on the fresh local database.`,
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

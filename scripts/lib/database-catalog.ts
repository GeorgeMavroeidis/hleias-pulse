import type pg from "pg";

/** OID-free metadata; comparable between independently created databases. */
export async function databaseCatalog(client: pg.Client) {
  const queries = {
    schemas: `select nspname, nspacl from pg_namespace
      where nspname in ('public','private') order by 1`,
    enums: `select n.nspname, t.typname, e.enumlabel, e.enumsortorder
      from pg_enum e join pg_type t on t.oid=e.enumtypid
      join pg_namespace n on n.oid=t.typnamespace
      where n.nspname in ('public','private') order by 1,2,4`,
    sequences: `select sequence_schema,sequence_name,data_type,start_value,
      minimum_value,maximum_value,increment,cycle_option from information_schema.sequences
      where sequence_schema in ('public','private') order by 1,2`,
    views: `select n.nspname,c.relname,c.relkind,pg_get_viewdef(c.oid) as definition
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') and c.relkind in ('v','m') order by 1,2`,
    columns: `select table_schema, table_name, column_name, data_type, udt_name,
      is_nullable, column_default from information_schema.columns
      where table_schema in ('public', 'private') order by 1,2,ordinal_position`,
    constraints: `select n.nspname as schema, c.relname as table_name, con.conname,
      pg_get_constraintdef(con.oid) as definition from pg_constraint con
      join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') order by 1,2,3`,
    indexes: `select schemaname, tablename, indexname, indexdef from pg_indexes
      where schemaname in ('public','private') order by 1,2,3`,
    policies: `select * from pg_policies where schemaname in ('public','private','storage')
      order by schemaname,tablename,policyname`,
    functions: `select n.nspname as schema, p.proname,
      pg_get_function_identity_arguments(p.oid) as args, p.prosecdef, p.proconfig, p.proacl,
      pg_get_functiondef(p.oid) as definition from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and p.prokind='f' order by 1,2,3`,
    triggers: `select n.nspname as schema, c.relname as table_name, t.tgname,
      pg_get_triggerdef(t.oid) as definition from pg_trigger t
      join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private','auth') and not t.tgisinternal order by 1,2,3`,
    grants: `select table_schema,table_name,grantee,privilege_type
      from information_schema.role_table_grants
      where table_schema in ('public','private') order by 1,2,3,4`,
    buckets: `select id,name,public,file_size_limit,allowed_mime_types
      from storage.buckets order by id`,
    rls: `select n.nspname as schema,c.relname,c.relrowsecurity,c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') and c.relkind in ('r','p') order by 1,2`,
    defaults: `select r.rolname,n.nspname,a.defaclobjtype,a.defaclacl
      from pg_default_acl a join pg_roles r on r.oid=a.defaclrole
      left join pg_namespace n on n.oid=a.defaclnamespace order by 1,2,3`,
  };
  const result: Record<string, unknown[]> = {};
  for (const [name, sql] of Object.entries(queries)) {
    result[name] = (await client.query(sql)).rows;
  }
  return result;
}

/** Primary-key identities must be identical before and after every smoke,
 * including audit records that survive deleted actors through SET NULL FKs.
 */
export async function fixtureIdentities(client: pg.Client) {
  const tables = (
    await client.query<{ schema: string; table_name: string; keys: string[] }>(`
    select n.nspname as schema,c.relname as table_name,
      json_agg(a.attname order by k.ordinality) as keys
    from pg_constraint p join pg_class c on c.oid=p.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    cross join lateral unnest(p.conkey) with ordinality k(attnum,ordinality)
    join pg_attribute a on a.attrelid=c.oid and a.attnum=k.attnum
    where p.contype='p' and (
      n.nspname in ('public','private')
      or (n.nspname='auth' and c.relname='users')
      or (n.nspname='storage' and c.relname='objects'))
    group by n.nspname,c.relname order by 1,2
  `)
  ).rows;
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const result: Record<string, unknown[]> = {};
  for (const table of tables) {
    const name = `${quote(table.schema)}.${quote(table.table_name)}`;
    result[name] = (
      await client.query(
        `select ${table.keys.map(quote).join(",")} from ${name} order by ${table.keys.map(quote).join(",")}`,
      )
    ).rows;
  }
  return result;
}

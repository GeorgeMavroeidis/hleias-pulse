import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { assertTargetIsSafeForCI } from "./lib/env";
import { connectGuarded, endQuietly } from "./lib/pg";

assert.equal(process.env.HLEIAS_LOCAL_ONLY, "1", "Run via supabase:local or db:verify");
assertTargetIsSafeForCI();
const db = await connectGuarded("session", "db-contract");
async function count(sql: string, expected: number, label: string) {
  const result = await db.query<{ count: number }>(`select count(*)::int as count from (${sql}) q`);
  assert.equal(result.rows[0].count, expected, label);
}
try {
  const migrations = (
    await db.query<{ version: string; name: string }>(
      "select version, name from supabase_migrations.schema_migrations order by version",
    )
  ).rows.map(({ version, name }) => `${version}_${name}.sql`);
  assert.deepEqual(
    migrations,
    readdirSync("supabase/migrations")
      .filter((name) => name.endsWith(".sql"))
      .sort(),
  );
  assert.equal(new Set(migrations.map((name) => name.split("_")[0])).size, migrations.length);

  await count(
    "select id from public.meet_events where id like 'meet-%' and moderation_status='published'",
    6,
    "Six published demo Meets",
  );
  await count(
    `select id from public.meet_events e where
    going_count <> seed_going_count + (select count(*) from public.event_rsvps r where r.event_id=e.id and status='going')
    or maybe_count <> seed_maybe_count + (select count(*) from public.event_rsvps r where r.event_id=e.id and status='maybe')`,
    0,
    "RSVP counters include seeded and real attendance",
  );
  await count(
    "select id from public.stories where id like 'story-%' and expires_after_hours in (6,24) and caption<>'' and moderation_status='published'",
    11,
    "Complete editorial stories with expiry",
  );
  await count(
    "select id from public.places where cardinality(photos)=0 or photos[1] is distinct from image_url",
    0,
    "Seeded galleries mirror the primary image",
  );
  await count(
    "select id from public.cultural_events where id like 'municipal-2026-%' and place_id is not null",
    5,
    "Municipal events link after places exist",
  );
  await count(
    "select id from auth.users where id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003') and banned_until='infinity' and encrypted_password=''",
    3,
    "Inert local accounts cannot sign in",
  );
  await count(
    "select id from auth.identities where user_id::text like '00000000-0000-4000-8000-%'",
    0,
    "Seed accounts have no provider identities",
  );
  await count(
    "select user_id from public.admin_members where role='owner'",
    1,
    "Permanent inert seed owner; no leaked disposable owners",
  );
  await count(
    "select id from auth.users where id::text not like '00000000-0000-4000-8000-%'",
    0,
    "No leaked smoke accounts",
  );
  for (const table of [
    "content_reports",
    "user_blocks",
    "deal_redemptions",
    "place_business_profiles",
    "businesses",
    "event_rsvps",
    "story_views",
    "user_activity_days",
    "push_subscriptions",
    "private.push_notification_outbox",
    "private.push_notification_deliveries",
  ]) {
    const qualified = table.includes(".") ? table : `public.${table}`;
    await count(`select 1 from ${qualified}`, 0, `No leaked fixtures in ${table}`);
  }
  await count(
    "select id from public.organizers where user_id is not null",
    0,
    "No leaked organizer accounts",
  );
  await count(
    `select conname from pg_constraint where conrelid='public.admin_audit_logs'::regclass and contype='f'`,
    0,
    "Audit attribution survives deletion of the actor",
  );
  await count(
    `select conname from pg_constraint where conrelid='public.route_stops'::regclass and contype='f' and confrelid='public.routes'::regclass and confdeltype='c'`,
    1,
    "Route deletion cascades to stops",
  );
  await count(
    `select conname from pg_constraint where conrelid='public.route_stops'::regclass and contype='f' and confrelid='public.places'::regclass and confdeltype='r'`,
    1,
    "Referenced route places cannot be deleted",
  );
  await count(
    `select conname from pg_constraint where conrelid='public.event_rsvps'::regclass and contype='f' and confrelid='public.meet_events'::regclass and confdeltype='c'`,
    1,
    "Meet deletion cascades to RSVPs",
  );
  await count(
    `select conname from pg_constraint where conrelid='public.deal_redemptions'::regclass and contype='f'
     and confrelid in ('public.place_business_profiles'::regclass,'public.businesses'::regclass,'public.places'::regclass)
     and confdeltype='c'`,
    3,
    "Deal redemptions clean up with claims, businesses and places",
  );

  const buckets = (
    await db.query(
      "select id, public, file_size_limit::int, allowed_mime_types from storage.buckets order by id",
    )
  ).rows;
  assert.deepEqual(buckets, [
    {
      id: "avatars",
      public: true,
      file_size_limit: 2097152,
      allowed_mime_types: ["image/png", "image/jpeg", "image/webp"],
    },
    {
      id: "content-media",
      public: true,
      file_size_limit: 5242880,
      allowed_mime_types: ["image/png", "image/jpeg", "image/webp"],
    },
  ]);
  await count(
    `select policyname from pg_policies where schemaname='storage' and tablename='objects'`,
    14,
    "All avatar/content/poster storage policies exist",
  );
  await count(
    `select n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity`,
    0,
    "Every app table has RLS",
  );
  await count(
    `select table_name from information_schema.role_table_grants where table_schema='private' and grantee in ('anon','authenticated','service_role')`,
    0,
    "Private push queue has no direct API grants",
  );
  await count(
    `select table_name from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')`,
    0,
    "No legacy blanket privileges",
  );
  const anonFunctions = [
    "blocked_user_ids()",
    "current_admin_role()",
    "current_business_id()",
    "current_organizer_id()",
    "get_pulse_bootstrap()",
    "has_admin_role(text[])",
    "refresh_generic_stories()",
  ];
  const authenticatedFunctions = [
    ...anonFunctions,
    "issue_deal_code(text)",
    "moderate_content(text,text,text)",
    "redeem_deal_code(text)",
    "review_place_claim(uuid,text)",
    "set_place_deal(uuid,text,boolean)",
  ];
  for (const [role, allowed] of [
    ["anon", anonFunctions],
    ["authenticated", authenticatedFunctions],
  ] as const) {
    const signatures = allowed.map((signature) => `'${signature}'`).join(",");
    await count(
      `select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and has_function_privilege('${role}',p.oid,'execute')
       and p.oid::regprocedure::text not in (${signatures})`,
      0,
      `${role} cannot execute undeclared public functions`,
    );
    await count(
      `select signature from (values ${allowed.map((signature) => `('public.${signature}')`).join(",")}) expected(signature)
       where not has_function_privilege('${role}',to_regprocedure(signature),'execute')`,
      0,
      `${role} can execute every declared public function`,
    );
  }
  await count(
    `select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and not has_function_privilege('service_role',p.oid,'execute')`,
    0,
    "Service role can execute every public function explicitly",
  );
  await count(
    `select name from vault.secrets where name like 'push_worker_%'`,
    0,
    "Local reset contains no production push secrets",
  );
  await count(
    `select jobname from cron.job where jobname='push-notification-worker'`,
    1,
    "Push cron is reconstructed",
  );

  await db.query("begin");
  try {
    await db.query("set local role anon");
    for (const table of [
      "places",
      "posts",
      "stories",
      "meet_events",
      "organizers",
      "businesses",
      "place_business_profiles",
      "routes",
      "profiles",
    ]) {
      await db.query(`select * from public.${table} limit 1`);
    }
    const bootstrap = await db.query("select public.get_pulse_bootstrap() as data");
    assert(bootstrap.rows[0].data, "Anonymous bootstrap works through the real grants and RLS");
  } finally {
    await db.query("rollback");
  }
  // Replay the complete seed with a real RSVP already present. Keep the outer
  // transaction here so this acceptance check itself leaves no fixture behind.
  const seed = readFileSync("supabase/seed.sql", "utf8")
    .replace(/^begin;$/m, "")
    .replace(/^commit;$/m, "");
  await db.query("begin");
  try {
    await db.query(`insert into public.event_rsvps (event_id, user_id, status)
      values ('meet-kourouta-sunset-swim', '00000000-0000-4000-8000-000000000001', 'going')`);
    await db.query(seed);
    await count(
      `select id from public.meet_events where id='meet-kourouta-sunset-swim'
      and going_count=seed_going_count+1 and maybe_count=seed_maybe_count`,
      1,
      "Re-seeding retains RSVP counters and does not duplicate fixtures",
    );
    await count(
      "select user_id from public.admin_members where role='owner'",
      1,
      "Re-seeding preserves the single inert owner",
    );
    await count(
      "select id from public.meet_events where id like 'meet-%'",
      6,
      "Re-seeding keeps stable Meet IDs",
    );
  } finally {
    await db.query("rollback");
  }
  console.log(
    "[contract] Seed, grants, RLS, buckets, FKs, triggers' counters and cleanup invariants passed.",
  );
} finally {
  await endQuietly(db);
}

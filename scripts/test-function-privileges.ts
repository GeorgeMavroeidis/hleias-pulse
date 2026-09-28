/** Run only against a proven local Supabase Docker database. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { projectRef, readEnvValue } from "./lib/env";

const host = readEnvValue("SUPABASE_DB_HOST");
const port = Number(readEnvValue("SUPABASE_DB_PORT"));
const password = readEnvValue("SUPABASE_DB_PASSWORD");
const localProjectId = readEnvValue("SUPABASE_LOCAL_PROJECT_ID") ?? "ilia-pulse-local";
assert.equal(projectRef, "local", "Function privilege tests require SUPABASE_PROJECT_REF=local");
assert.ok(host === "127.0.0.1" || host === "localhost", "A local DB host is required");
assert.ok(Number.isInteger(port) && port > 0, "SUPABASE_DB_PORT is required");
assert.ok(password, "SUPABASE_DB_PASSWORD is required");
assert.match(localProjectId, /^[a-zA-Z0-9_-]+$/);

const client = new pg.Client({ host, port, database: "postgres", user: "postgres", password });
type FunctionRow = {
  signature: string;
  schema: string;
  name: string;
  definer: boolean;
  path: string | null;
  publicGrant: boolean;
  anon: boolean;
  authenticated: boolean;
  serviceRole: boolean;
};

const guest = ["anon", "authenticated"];
const signedIn = ["authenticated"];
const worker = ["service_role"];
const publicRpc: Record<string, string[]> = {
  "blocked_user_ids()": guest,
  "current_admin_role()": signedIn,
  "current_business_id()": signedIn,
  "current_organizer_id()": signedIn,
  "get_pulse_bootstrap()": guest,
  "has_admin_role(required_roles text[])": signedIn,
  "issue_deal_code(target_place_id text)": signedIn,
  "moderate_content(target_type text, target_id text, next_status text)": signedIn,
  "redeem_deal_code(code text)": signedIn,
  "refresh_generic_stories()": guest,
  "review_place_claim(claim_id uuid, next_status text)": signedIn,
  "set_place_deal(claim_id uuid, deal_text text, deal_active boolean)": signedIn,
};
const pushWorkerRpc: Record<string, string[]> = {
  "claim_push_delivery_batch()": worker,
  "complete_push_delivery(target_delivery_id uuid, target_claim_token uuid, outcome text, error_code text)":
    worker,
  "prepare_push_delivery(target_delivery_id uuid, target_claim_token uuid)": worker,
};
const internal = new Set([
  "enforce_push_subscription_endpoint()",
  "enforce_push_subscription_limit()",
  "enqueue_published_question_answer()",
  "handle_event_rsvp_counts()",
  "handle_new_auth_user()",
  "invoke_push_worker()",
  "is_allowed_push_endpoint(candidate text)",
  "prevent_business_self_verification()",
  "prevent_last_owner_removal()",
  "prevent_organizer_self_verification()",
  "refresh_meet_event_rsvp_counts(target_event_id text)",
  "refresh_push_outbox_status(target_outbox_id uuid)",
  "set_updated_at()",
  "write_admin_audit_log()",
  "write_admin_member_audit_log()",
  "write_route_stop_audit_log()",
  "write_verification_audit_log()",
]);

async function expectDenied(role: "anon" | "authenticated" | "service_role", sql: string) {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    await assert.rejects(client.query(sql), (error: unknown) => {
      assert.equal((error as { code?: string }).code, "42501", `${role}: ${sql}`);
      return true;
    });
  } finally {
    await client.query("rollback");
  }
}

async function expectAllowed(role: "anon" | "authenticated" | "service_role", sql: string) {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    await client.query(sql);
  } finally {
    await client.query("rollback");
  }
}

async function main() {
  await client.connect();
  try {
    const connected = (
      await client.query<{ system_identifier: string }>(
        "select system_identifier from pg_control_system()",
      )
    ).rows[0]?.system_identifier;
    const docker = execFileSync(
      "docker",
      [
        "exec",
        `supabase_db_${localProjectId}`,
        "psql",
        "-U",
        "postgres",
        "-At",
        "-c",
        "select system_identifier from pg_control_system()",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    assert.equal(connected, docker, "The loopback port is not this Supabase Docker database");

    const functions = (
      await client.query<FunctionRow>(`
        select pg_get_function_identity_arguments(p.oid) as signature,
          n.nspname as schema, p.proname as name, p.prosecdef as definer,
          (select substr(cfg, length('search_path=') + 1)
             from unnest(p.proconfig) cfg where cfg like 'search_path=%' limit 1) as path,
          exists(select 1 from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
                 where a.grantee=0 and a.privilege_type='EXECUTE') as "publicGrant",
          has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
          has_function_privilege('service_role', p.oid, 'EXECUTE') as "serviceRole"
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('public','private') and p.prokind='f'
          and pg_get_userbyid(p.proowner)='postgres'
        order by n.nspname, p.proname, signature
      `)
    ).rows;
    for (const row of functions) {
      const name = `${row.name}(${row.signature})`;
      const allowed = row.schema === "public" ? (publicRpc[name] ?? pushWorkerRpc[name]) : [];
      if (row.schema === "public") assert.ok(allowed, `Unreviewed public function: ${name}`);
      if (row.schema === "private") {
        assert.ok(internal.has(name), `Unreviewed private function: ${name}`);
      }
      assert.equal(row.publicGrant, false, `PUBLIC can execute ${row.schema}.${name}`);
      assert.equal(row.anon, allowed.includes("anon"), `anon: ${name}`);
      assert.equal(row.authenticated, allowed.includes("authenticated"), `authenticated: ${name}`);
      assert.equal(row.serviceRole, allowed.includes("service_role"), `service_role: ${name}`);
      assert.equal(row.path, '""', `Unsafe search_path: ${row.schema}.${name}`);
      if (row.schema === "public") {
        assert.equal(row.definer, name !== "get_pulse_bootstrap()", `SECURITY mode: ${name}`);
      }
      if (row.schema === "private" && internal.has(name)) {
        assert.equal(
          row.definer,
          name !== "set_updated_at()" && name !== "is_allowed_push_endpoint(candidate text)",
          `SECURITY mode: ${name}`,
        );
      }
    }
    for (const name of Object.keys(publicRpc)) {
      assert.ok(
        functions.some((f) => f.schema === "public" && `${f.name}(${f.signature})` === name),
      );
    }
    for (const name of Object.keys(pushWorkerRpc)) {
      assert.ok(
        functions.some((f) => f.schema === "public" && `${f.name}(${f.signature})` === name),
      );
    }
    for (const name of internal) {
      assert.ok(
        functions.some((f) => f.schema === "private" && `${f.name}(${f.signature})` === name),
      );
    }

    const dealInsertGrants = (
      await client.query<{ normal: boolean; worker: boolean }>(`
        select has_table_privilege('authenticated','public.deal_redemptions','INSERT') as normal,
               has_table_privilege('service_role','public.deal_redemptions','INSERT') as worker
      `)
    ).rows[0];
    assert.deepEqual(
      dealInsertGrants,
      { normal: false, worker: true },
      "Deal codes must be minted through issue_deal_code(), never a direct API insert",
    );

    await expectDenied("anon", "select public.issue_deal_code('missing')");
    await expectDenied("anon", "select public.moderate_content('post','missing','hidden')");
    await expectDenied("anon", "select * from public.claim_push_delivery_batch()");
    await expectDenied("authenticated", "select * from public.claim_push_delivery_batch()");
    await expectDenied(
      "authenticated",
      "select * from public.prepare_push_delivery(null::uuid,null::uuid)",
    );
    await expectDenied("service_role", "select public.refresh_generic_stories()");
    await expectDenied("authenticated", "select private.refresh_meet_event_rsvp_counts('missing')");
    await expectAllowed("anon", "select public.get_pulse_bootstrap()");
    await expectAllowed("anon", "select public.blocked_user_ids()");
    await expectAllowed("anon", "select public.refresh_generic_stories()");
    await expectAllowed("authenticated", "select public.current_admin_role()");
    await expectAllowed("authenticated", "select public.has_admin_role(array['owner'])");
    await expectAllowed("service_role", "select * from public.claim_push_delivery_batch()");

    // Supabase anonymous Auth tokens use role=authenticated. Verify that a
    // restrictive write guard exists on every app table and Storage objects,
    // including both sides of UPDATE, so a later permissive policy cannot
    // accidentally reopen anonymous writes.
    const writableRelations = (
      await client.query<{ schema: string; name: string }>(`
        select n.nspname as schema, c.relname as name
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where ((n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity)
               or (n.nspname='storage' and c.relname='objects'))
        order by n.nspname,c.relname
      `)
    ).rows;
    assert.ok(writableRelations.length > 20, "Expected the full application schema");
    const writeGuards = (
      await client.query<{
        schemaname: string;
        tablename: string;
        policyname: string;
        cmd: string;
        permissive: string;
        roles: string[];
        qual: string | null;
        with_check: string | null;
      }>(`
        select schemaname,tablename,policyname,cmd,permissive,roles::text[] as roles,qual,with_check
        from pg_policies
        where schemaname in ('public','storage')
          and policyname like 'Registered accounts can %'
      `)
    ).rows;
    for (const relation of writableRelations) {
      const guards = writeGuards.filter(
        (policy) => policy.schemaname === relation.schema && policy.tablename === relation.name,
      );
      assert.deepEqual(
        guards.map((policy) => policy.cmd).sort(),
        ["DELETE", "INSERT", "UPDATE"],
        `Missing anonymous write guard on ${relation.schema}.${relation.name}`,
      );
      for (const guard of guards) {
        assert.equal(guard.permissive, "RESTRICTIVE", `${relation.name}: ${guard.cmd}`);
        assert.deepEqual(guard.roles, ["authenticated"], `${relation.name}: ${guard.cmd}`);
        for (const expression of [guard.qual, guard.with_check].filter(Boolean)) {
          assert.match(expression!, /is_anonymous/, `${relation.name}: ${guard.cmd}`);
          assert.match(expression!, /uid\(/, `${relation.name}: ${guard.cmd}`);
        }
        if (guard.cmd === "INSERT") assert.ok(guard.with_check);
        if (guard.cmd === "DELETE") assert.ok(guard.qual);
        if (guard.cmd === "UPDATE") assert.ok(guard.qual && guard.with_check);
      }
    }

    // Exercise actual RLS and SECURITY DEFINER calls with anonymous, signed
    // out, normal and second-user JWT contexts. All fixtures are rolled back.
    await client.query("begin");
    try {
      const normalId = randomUUID();
      const otherId = randomUUID();
      const anonymousId = randomUUID();
      await client.query("insert into auth.users(id) values($1),($2)", [normalId, otherId]);
      await client.query(
        "insert into auth.users(id,is_anonymous,raw_user_meta_data) values($1,true,$2::jsonb)",
        [anonymousId, JSON.stringify({ display_name: "Anonymous injection" })],
      );
      assert.equal(
        Number(
          (
            await client.query("select count(*) as n from public.profiles where id=$1", [
              anonymousId,
            ])
          ).rows[0].n,
        ),
        0,
        "Anonymous Auth signup created a public profile",
      );
      assert.equal(
        Number(
          (await client.query("select count(*) as n from public.profiles where id=$1", [normalId]))
            .rows[0].n,
        ),
        1,
        "Normal Auth signup did not create a profile",
      );

      // Simulate legacy rows made before the guard; anonymous owners still
      // cannot edit or remove them after the migration.
      await client.query("insert into public.profiles(id) values($1)", [anonymousId]);
      await client.query("insert into public.user_preferences(user_id) values($1)", [anonymousId]);
      await client.query("insert into public.admin_members(user_id,role) values($1,'moderator')", [
        anonymousId,
      ]);
      await client.query(
        "insert into public.businesses(user_id,display_name,verification_status) values($1,'Anonymous fixture','verified')",
        [anonymousId],
      );
      await client.query(
        "insert into public.user_blocks(blocker_id,blocked_id,kind) values($1,$2,'block')",
        [anonymousId, otherId],
      );

      const setJwt = async (role: "anon" | "authenticated", id?: string, isAnonymous = false) => {
        await client.query(`set local role ${role}`);
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role, ...(id ? { sub: id } : {}), is_anonymous: isAnonymous }),
        ]);
      };
      const expectRlsDenied = async (sql: string, params: unknown[]) => {
        await client.query("savepoint denied_write");
        try {
          await assert.rejects(client.query(sql, params), (error: unknown) => {
            assert.equal((error as { code?: string }).code, "42501", sql);
            return true;
          });
        } finally {
          await client.query("rollback to savepoint denied_write");
          await client.query("release savepoint denied_write");
        }
      };

      await setJwt("anon");
      await expectRlsDenied(
        "insert into public.user_blocks(blocker_id,blocked_id,kind) values($1,$2,'block')",
        [normalId, otherId],
      );

      await setJwt("authenticated", anonymousId, true);
      await expectRlsDenied(
        "insert into public.user_blocks(blocker_id,blocked_id,kind) values($1,$2,'block')",
        [anonymousId, normalId],
      );
      await expectRlsDenied("insert into storage.objects(bucket_id,name) values('avatars',$1)", [
        `${anonymousId}/anonymous.png`,
      ]);
      assert.equal(
        (
          await client.query(
            "update public.profiles set bio='anonymous edit' where id=$1 returning id",
            [anonymousId],
          )
        ).rowCount,
        0,
        "Anonymous account updated its legacy profile",
      );
      assert.equal(
        (
          await client.query(
            "delete from public.user_blocks where blocker_id=$1 returning blocker_id",
            [anonymousId],
          )
        ).rowCount,
        0,
        "Anonymous account deleted its legacy block",
      );
      assert.equal(
        (await client.query("select public.current_admin_role() as role")).rows[0].role,
        null,
      );
      assert.equal(
        (await client.query("select public.has_admin_role(array['moderator']) as ok")).rows[0].ok,
        false,
      );
      assert.equal(
        (await client.query("select public.current_business_id() as id")).rows[0].id,
        null,
      );
      await client.query("savepoint denied_deal");
      try {
        await assert.rejects(
          client.query("select public.issue_deal_code('missing')"),
          /Registered account required/,
        );
      } finally {
        await client.query("rollback to savepoint denied_deal");
        await client.query("release savepoint denied_deal");
      }

      await setJwt("authenticated", normalId);
      assert.equal(
        (
          await client.query(
            "update public.profiles set bio='normal edit' where id=$1 returning id",
            [normalId],
          )
        ).rowCount,
        1,
        "Normal account could not update its own profile",
      );
      const ownPreferences = await client.query<{ user_id: string }>(
        "select user_id from public.user_preferences order by user_id",
      );
      assert.deepEqual(
        ownPreferences.rows.map((row) => row.user_id),
        [normalId],
      );
      const ownBlock = await client.query(
        "insert into public.user_blocks(blocker_id,blocked_id,kind) values($1,$2,'block') returning blocker_id",
        [normalId, otherId],
      );
      assert.equal(ownBlock.rowCount, 1);
      const ownAvatar = await client.query(
        "insert into storage.objects(bucket_id,name) values('avatars',$1) returning id",
        [`${normalId}/normal.png`],
      );
      assert.equal(ownAvatar.rowCount, 1, "Normal account could not upload its own avatar");

      await setJwt("authenticated", otherId);
      assert.equal(
        (
          await client.query(
            "update public.profiles set bio='cross-user edit' where id=$1 returning id",
            [normalId],
          )
        ).rowCount,
        0,
        "Second account updated the first account's profile",
      );
      assert.equal(
        (
          await client.query(
            "delete from public.user_blocks where blocker_id=$1 returning blocker_id",
            [normalId],
          )
        ).rowCount,
        0,
        "Second account deleted the first account's block",
      );
    } finally {
      await client.query("rollback");
    }

    // Moving trigger routines to private must not break their OID-bound
    // triggers. Exercise the auth profile trigger and all three RSVP paths in
    // one transaction, then discard every fixture with ROLLBACK.
    await client.query("begin");
    try {
      const userId = randomUUID();
      const eventId = `lp-trigger-${randomUUID()}`;
      await client.query("insert into auth.users(id) values($1)", [userId]);
      assert.equal(
        Number(
          (await client.query("select count(*) as n from public.profiles where id=$1", [userId]))
            .rows[0].n,
        ),
        1,
        "Auth trigger did not create the profile",
      );
      const place = (
        await client.query<{ id: string }>(
          "select p.id from public.places p where not exists (select 1 from public.place_business_profiles c where c.place_id=p.id and c.status<>'rejected') limit 1",
        )
      ).rows[0];
      assert.ok(place, "The local seed needs a place for the RSVP trigger test");
      await client.query(
        `insert into public.meet_events
          (id,place_id,user_id,title,host_name,host_avatar_url,starts_at,category,vibe,price,description,cover_url)
         values ($1,$2,$3,'Privilege test','Local test','',now()+interval '1 day','social','social','free','Test','')`,
        [eventId, place.id, userId],
      );
      await client.query(
        "insert into public.event_rsvps(event_id,user_id,status) values($1,$2,'going')",
        [eventId, userId],
      );
      let count = (
        await client.query("select going_count,maybe_count from public.meet_events where id=$1", [
          eventId,
        ])
      ).rows[0];
      assert.deepEqual(count, { going_count: 1, maybe_count: 0 });
      await client.query(
        "update public.event_rsvps set status='maybe' where event_id=$1 and user_id=$2",
        [eventId, userId],
      );
      count = (
        await client.query("select going_count,maybe_count from public.meet_events where id=$1", [
          eventId,
        ])
      ).rows[0];
      assert.deepEqual(count, { going_count: 0, maybe_count: 1 });
      await client.query("delete from public.event_rsvps where event_id=$1 and user_id=$2", [
        eventId,
        userId,
      ]);
      count = (
        await client.query("select going_count,maybe_count from public.meet_events where id=$1", [
          eventId,
        ])
      ).rows[0];
      assert.deepEqual(count, { going_count: 0, maybe_count: 0 });

      // The two deal RPCs must remain callable by a real authenticated user
      // after the grants are narrowed, and issuance must reuse a live code.
      const business = (
        await client.query<{ id: string }>(
          "insert into public.businesses(user_id,display_name,verification_status) values($1,'Local privilege test','verified') returning id",
          [userId],
        )
      ).rows[0];
      const claim = (
        await client.query<{ id: string }>(
          "insert into public.place_business_profiles(place_id,business_id,status,deal_text,deal_active) values($1,$2,'approved','Local deal',true) returning id",
          [place.id, business.id],
        )
      ).rows[0];
      assert.ok(claim.id);
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
      await client.query("set local role authenticated");
      const issued = (
        await client.query<{ value: { code: string } }>(
          "select public.issue_deal_code($1) as value",
          [place.id],
        )
      ).rows[0].value;
      assert.match(issued.code, /^[A-Z2-9]{6}$/);
      const repeat = (
        await client.query<{ value: { code: string } }>(
          "select public.issue_deal_code($1) as value",
          [place.id],
        )
      ).rows[0].value;
      assert.equal(repeat.code, issued.code);
      const redeemed = (
        await client.query<{ value: { deal_text: string } }>(
          "select public.redeem_deal_code($1) as value",
          [issued.code],
        )
      ).rows[0].value;
      assert.equal(redeemed.deal_text, "Local deal");
    } finally {
      await client.query("rollback");
    }

    const defaults = (
      await client.query<{ role: string }>(`
        select coalesce(gr.rolname, 'PUBLIC') as role
        from pg_default_acl d
        left join pg_namespace n on n.oid=d.defaclnamespace
        cross join lateral aclexplode(d.defaclacl) a
        left join pg_roles gr on gr.oid=a.grantee
        where pg_get_userbyid(d.defaclrole)='postgres' and d.defaclobjtype='f'
          and (d.defaclnamespace=0 or n.nspname in ('public','private'))
          and a.privilege_type='EXECUTE' and a.grantee in
            (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid, 'service_role'::regrole::oid)
      `)
    ).rows;
    assert.deepEqual(defaults, [], "New postgres functions must start without API EXECUTE grants");
    await client.query("begin");
    try {
      const probe = `lp_default_${randomUUID().replaceAll("-", "")}`;
      for (const schema of ["public", "private"]) {
        await client.query(
          `create function ${schema}.${probe}() returns integer language sql as 'select 1'`,
        );
        const grants = (
          await client.query<{
            anon: boolean;
            authenticated: boolean;
            service_role: boolean;
            public_grant: boolean;
          }>(
            `select has_function_privilege('anon',$1::regprocedure,'EXECUTE') as anon,
                    has_function_privilege('authenticated',$1::regprocedure,'EXECUTE') as authenticated,
                    has_function_privilege('service_role',$1::regprocedure,'EXECUTE') as service_role,
                    exists(select 1 from pg_proc p,
                      lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
                      where p.oid=$1::regprocedure and a.grantee=0
                        and a.privilege_type='EXECUTE') as public_grant`,
            [`${schema}.${probe}()`],
          )
        ).rows[0];
        assert.deepEqual(grants, {
          anon: false,
          authenticated: false,
          service_role: false,
          public_grant: false,
        });
      }
    } finally {
      await client.query("rollback");
    }
    console.log(
      `Function permissions, callers, search paths and defaults passed (${functions.length} functions).`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/** Old clients must not be able to refresh the age of an existing story. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { assertSmokeTargetIsLocal } from "./lib/env";
import { createPgSession } from "./lib/pg";

assertSmokeTargetIsLocal();

const previewMigration = process.argv.includes("--preview-migration");
const migrationPath = new URL(
  "../supabase/migrations/20261009110000_stop_recycling_story_timestamps.sql",
  import.meta.url,
);

const recycledStoryIds = [
  "story-kourouta",
  "story-kourouta-sunbeds",
  "story-katakolo",
  "story-olympia",
  "story-foloi",
  "story-kyllini",
  "story-zacharo",
  "story-andritsaina",
  "story-kakovatos",
  "story-kaiafas",
  "story-chlemoutsi",
];

async function main() {
  const db = createPgSession("session", "story-freshness");
  try {
    // One connection and one rollback-only transaction keep these expiry
    // fixtures private and restore them even if a compatibility call fails.
    await db.once(async (client) => {
      const rows = async () =>
        (
          await client.query<{ story: Record<string, unknown> }>(
            "select to_jsonb(s) as story from public.stories s order by id",
          )
        ).rows;
      const original = await rows();
      const functionState = async () =>
        (
          await client.query<{
            resultType: string;
            identityArguments: string;
            securityDefiner: boolean;
            searchPath: string[];
            grants: string[];
            definition: string;
          }>(`
          select pg_get_function_result(p.oid) as "resultType",
            pg_get_function_identity_arguments(p.oid) as "identityArguments",
            p.prosecdef as "securityDefiner", p.proconfig as "searchPath",
            pg_get_functiondef(p.oid) as definition,
            array(select coalesce(r.rolname::text, 'PUBLIC')
              from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              left join pg_roles r on r.oid = a.grantee
              where a.privilege_type = 'EXECUTE' order by 1) as grants
          from pg_proc p where p.oid = 'public.refresh_generic_stories()'::regprocedure
        `)
        ).rows[0];
      const originalFunction = await functionState();

      await client.query("begin");
      try {
        if (previewMigration) {
          // Preview the exact migration without committing it or relying on a
          // shared local stack having the same migration history as this branch.
          const migration = readFileSync(migrationPath, "utf8");
          assert.match(migration, /^begin;\s/);
          assert.match(migration, /\scommit;\s*$/);
          await client.query(migration.replace(/^begin;\s*/, "").replace(/\scommit;\s*$/, ""));
        }
        const { definition, ...privileges } = await functionState();
        const snapshot = JSON.parse(
          readFileSync(new URL("../supabase/policy-snapshot.json", import.meta.url), "utf8"),
        ) as { publicFunctions: { signature: string; definitionLines: string[] }[] };
        assert.deepEqual(
          definition.trimEnd().split("\n"),
          snapshot.publicFunctions.find(
            ({ signature }) => signature === "public.refresh_generic_stories()",
          )?.definitionLines,
          "The compatibility definition differs from its reviewed security baseline",
        );
        assert.deepEqual(privileges, {
          resultType: "void",
          identityArguments: "",
          securityDefiner: true,
          searchPath: ['search_path=""'],
          grants: ["anon", "authenticated", "postgres"],
        });
        assert.deepEqual(privileges.grants, originalFunction.grants);
        const expired = await client.query<{ id: string; expired: boolean }>(
          `update public.stories set created_at = '2020-01-01T00:00:00Z'
            where id = any($1::text[])
            returning id, created_at + make_interval(hours => expires_after_hours) <= now() as expired`,
          [recycledStoryIds],
        );
        assert.deepEqual(
          expired.rows.map(({ id }) => id).sort(),
          [...recycledStoryIds].sort(),
          "Local seed must contain all 11 formerly recycled stories",
        );
        assert(expired.rows.every(({ expired: isExpired }) => isExpired));

        // A non-seed row proves that the compatibility function also leaves
        // ordinary user observations untouched, including already-expired ones.
        const ordinaryId = `smoke-story-freshness-${randomUUID()}`;
        await client.query(
          `insert into public.stories
            select (jsonb_populate_record(null::public.stories,
              to_jsonb(s) || jsonb_build_object('id', $1::text,
                'position', (select max(position) + 1 from public.stories),
                'created_at', '2020-01-01T00:00:00Z',
                'expires_after_hours', 6, 'caption', 'Disposable expiry fixture'))).*
            from public.stories s where s.id = $2`,
          [ordinaryId, recycledStoryIds[0]],
        );
        const beforeCalls = await rows();
        assert.equal(beforeCalls.length, original.length + 1);

        for (const role of ["anon", "authenticated"] as const) {
          await client.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({
              role,
              ...(role === "authenticated"
                ? { sub: "00000000-0000-4000-8000-000000000002", is_anonymous: false }
                : {}),
            }),
          ]);
          await client.query(`set local role ${role}`);
          for (let attempt = 0; attempt < 3; attempt += 1) {
            await client.query("select public.refresh_generic_stories()");
          }
          await client.query("reset role");
          assert.deepEqual(
            await rows(),
            beforeCalls,
            `${role} compatibility calls changed story observations or content`,
          );
        }

        await client.query("savepoint forbidden_role");
        await client.query("set local role service_role");
        await assert.rejects(client.query("select public.refresh_generic_stories()"), {
          code: "42501",
        });
        await client.query("rollback to savepoint forbidden_role");
        await client.query("reset role");
        assert.deepEqual(await rows(), beforeCalls);
      } finally {
        await client.query("rollback");
      }
      assert.deepEqual(await rows(), original, "Expiry fixtures survived the rollback");
      assert.deepEqual(
        await functionState(),
        originalFunction,
        "Compatibility function changes survived the rollback",
      );
    });
    console.log("smoke_story_freshness_ok");
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

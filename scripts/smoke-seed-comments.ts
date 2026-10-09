/** Execute the real cleanup on disposable fixtures; always roll everything back. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { assertSmokeTargetIsLocal } from "./lib/env";
import { connectGuarded, endQuietly } from "./lib/pg";
import { readSeedCommentManifest } from "./lib/seed-comment-manifest";

// This binds both credentials and endpoints to CLI-owned local status. A
// loopback tunnel, hosted .env, missing wrapper, or mismatched key is refused.
assertSmokeTargetIsLocal();

const { migration, rows } = readSeedCommentManifest();
const db = await connectGuarded("session", "seed-comments");
const knownIds = rows.map((row) => row.id);
const userId = "00000000-0000-4000-8000-000000000001";
const protectedTables = [
  "posts",
  "places",
  "routes",
  "post_likes",
  "saved_items",
  "cultural_event_likes",
];

async function snapshot(table: string) {
  return (
    await db.query<{ rows: unknown }>(
      `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) as rows
     from public.${table} as t`,
    )
  ).rows[0].rows;
}

async function knownRows() {
  return (
    await db.query<{ id: string }>(
      "select id from public.comments where id = any($1::uuid[]) order by id",
      [knownIds],
    )
  ).rows.map((row) => row.id);
}

async function addKnownRows() {
  for (const row of rows) {
    await db.query(
      `insert into public.comments
       (id, target_type, post_id, author_id, author_name, text, sort_order, moderation_status)
       values ($1, 'post', $2, $3, $4, $5, $6, 'published')`,
      [row.id, row.postId, row.authorId, row.authorName, row.text, row.sortOrder],
    );
  }
}

let began = false;
const originalComments = await snapshot("comments");
const originalTables = await Promise.all(protectedTables.map(snapshot));
try {
  await db.query("begin");
  began = true;
  const profile = (
    await db.query<{ id: string }>("select id from public.profiles where id=$1", [userId])
  ).rows[0];
  assert(profile, "Disposable seeded reader profile is required.");
  const placeId = (
    await db.query<{ id: string }>("select id from public.places order by id limit 1")
  ).rows[0]?.id;
  const routeId = (
    await db.query<{ id: string }>("select id from public.routes order by id limit 1")
  ).rows[0]?.id;
  const culturalId = (
    await db.query<{ id: string }>("select id from public.cultural_events order by id limit 1")
  ).rows[0]?.id;
  assert(placeId && routeId && culturalId, "Complete local seed targets are required.");

  await db.query("delete from public.comments where id = any($1::uuid[])", [knownIds]);
  const controls = [
    { id: randomUUID(), owned: false, status: "published" },
    { id: randomUUID(), owned: true, status: "pending" },
    { id: randomUUID(), owned: true, status: "published" },
  ];
  // Same exact author/text/post, but an unknown UUID or real owner, is not proof
  // of a seed. Both pending and published user comments must survive intact.
  for (const control of controls) {
    const row = rows[0];
    await db.query(
      `insert into public.comments
       (id, target_type, post_id, author_id, author_name, text, user_id, profile_id, moderation_status)
       values ($1, 'post', $2, $3, $4, $5, $6, $6, $7)`,
      [
        control.id,
        row.postId,
        row.authorId,
        row.authorName,
        row.text,
        control.owned ? userId : null,
        control.status,
      ],
    );
  }
  await db.query(
    "insert into public.post_likes (user_id, post_id) values ($1, $2) on conflict do nothing",
    [userId, rows[0].postId],
  );
  await db.query(
    `insert into public.saved_items (user_id, target_type, post_id)
     values ($1, 'post', $2) on conflict do nothing`,
    [userId, rows[0].postId],
  );
  const untouchedComments = await snapshot("comments");
  const untouchedTables = await Promise.all(protectedTables.map(snapshot));

  async function assertProtected() {
    assert.deepEqual(
      await Promise.all(protectedTables.map(snapshot)),
      untouchedTables,
      "Cleanup changed posts, counters, routes, reactions, or bookmarks.",
    );
  }

  await addKnownRows();
  assert.equal((await db.query(migration)).rowCount, 23, "All 23 exact seeds must be removed.");
  assert.deepEqual(await snapshot("comments"), untouchedComments);
  assert.equal((await db.query(migration)).rowCount, 0, "Cleanup must be idempotent.");
  await assertProtected();

  // Production history backfilled editorial author_kind while fresh seed used
  // its user default. These mutable metadata fields must not strand old seeds.
  await addKnownRows();
  await db.query(
    `update public.comments set author_kind='editorial', posting_identity='TOURIST',
     moderation_status='hidden', sort_order=42 where id = any($1::uuid[])`,
    [knownIds],
  );
  assert.equal(
    (await db.query(migration)).rowCount,
    23,
    "Historical metadata seeds remain synthetic.",
  );
  assert.deepEqual(await snapshot("comments"), untouchedComments);
  await assertProtected();

  const changes: [string, string, unknown[]][] = [
    ["text", "text = $2", ["A real edit of the original reply"]],
    ["author id", "author_id = $2", ["maria"]],
    ["removed author", "author_id = null", []],
    ["author name", "author_name = $2", ["A different person"]],
    ["post", "post_id = $2", [rows[3].postId]],
    ["user ownership", "user_id = $2", [userId]],
    ["profile ownership", "profile_id = $2", [userId]],
    ["place target", "target_type='place', post_id=null, place_id=$2", [placeId]],
    ["route target", "target_type='route', post_id=null, route_id=$2", [routeId]],
    [
      "cultural event target",
      "target_type='cultural_event', post_id=null, cultural_event_id=$2",
      [culturalId],
    ],
  ];
  for (const [label, assignment, values] of changes) {
    await db.query("savepoint modified_seed");
    await addKnownRows();
    await db.query(`update public.comments set ${assignment} where id=$1`, [rows[0].id, ...values]);
    const modified = (
      await db.query("select to_jsonb(c) as row from public.comments c where id=$1", [rows[0].id])
    ).rows[0].row;
    assert.equal(
      (await db.query(migration)).rowCount,
      22,
      `${label}: cleanup removed modified content.`,
    );
    assert.deepEqual(
      await knownRows(),
      [rows[0].id],
      `${label}: the modified known UUID must survive.`,
    );
    assert.deepEqual(
      (await db.query("select to_jsonb(c) as row from public.comments c where id=$1", [rows[0].id]))
        .rows[0].row,
      modified,
      `${label}: cleanup rewrote retained content.`,
    );
    assert.equal(
      (await db.query(migration)).rowCount,
      0,
      `${label}: repeated cleanup must be safe.`,
    );
    await assertProtected();
    await db.query("rollback to savepoint modified_seed");
    await db.query("release savepoint modified_seed");
  }

  // Replay the real generated seed inside our outer rollback transaction.
  await db.query("savepoint regeneration");
  await db.query(
    readFileSync("supabase/seed.sql", "utf8")
      .replace(/^begin;\s*$/m, "")
      .replace(/^commit;\s*$/m, ""),
  );
  assert.deepEqual(await knownRows(), [], "Regeneration recreated removed seed comments.");
  assert.deepEqual(
    await snapshot("comments"),
    untouchedComments,
    "Regeneration changed real comments.",
  );
  await db.query("rollback to savepoint regeneration");
  await db.query("release savepoint regeneration");
  console.log(
    "smoke_seed_comments_ok: 23 seeds, historical variants, real/modified rows, idempotence, regeneration",
  );
} finally {
  try {
    if (began) await db.query("rollback");
    assert.deepEqual(
      await snapshot("comments"),
      originalComments,
      "Smoke leaked comment fixtures.",
    );
    assert.deepEqual(
      await Promise.all(protectedTables.map(snapshot)),
      originalTables,
      "Smoke changed unrelated data after rollback.",
    );
  } finally {
    await endQuietly(db);
  }
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { POSTS } from "./hp-seed-data";
import { readSeedCommentManifest } from "./lib/seed-comment-manifest";

test("cleanup retains the complete immutable 2597d97 comment manifest", () => {
  const { rows } = readSeedCommentManifest();
  const tuples = rows.map((row) => [
    row.id,
    row.postId,
    row.authorId,
    row.authorName,
    row.text,
    row.sortOrder,
  ]);
  // Hash of the actual 23 INSERT tuples in the baseline committed seed.sql.
  assert.equal(
    createHash("sha256").update(JSON.stringify(tuples)).digest("hex"),
    "73c92d04acba3a9498a1c2252016a253ebf048c74266ddf7b1b1ae468a81b083",
  );
  assert.equal(new Set(rows.map((row) => row.id)).size, 23);
  assert.deepEqual(
    [...new Set(rows.map((row) => row.postId))],
    POSTS.map((post) => post.id),
  );
});

test("cleanup has only the reviewed exact provenance guards and one comments delete", () => {
  const { migration } = readSeedCommentManifest();
  const sql = migration.replace(/--[^\n]*/g, "");
  const predicates = sql
    .split("where ")[1]
    .replace(/;\s*$/, "")
    .split(/\s+and\s+/)
    .map((predicate) => predicate.trim());
  assert.deepEqual(predicates, [
    "comment.id = seed.id",
    "comment.target_type = 'post'",
    "comment.post_id = seed.post_id",
    "comment.author_id = seed.author_id",
    "comment.author_name = seed.author_name",
    "comment.text = seed.text",
    "comment.user_id is null",
    "comment.profile_id is null",
    "comment.place_id is null",
    "comment.route_id is null",
    "comment.cultural_event_id is null",
  ]);
  assert.deepEqual(sql.match(/\b(?:delete from|update|insert into|truncate|alter|drop)\b/g), [
    "delete from",
  ]);
  assert.match(sql, /delete from public\.comments as comment/);
  assert.equal(sql.split(";").filter((statement) => statement.trim()).length, 1);
});

test("regeneration is deterministic and cannot create, overwrite, or delete comments", () => {
  const generated = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/generate-supabase-seed.ts"],
    { encoding: "utf8" },
  );
  assert.equal(generated.status, 0, generated.stderr);
  assert.equal(generated.stdout, readFileSync("supabase/seed.sql", "utf8"));
  assert.doesNotMatch(
    generated.stdout,
    /\b(?:insert into|delete from|update|truncate)\s+public\.comments\b/i,
  );
  assert(POSTS.every((post) => !Object.hasOwn(post, "comments")));
  assert.equal(POSTS.length, 8, "Removing fabricated replies must retain the posts.");
});

test("migration acceptance refuses to start without the disposable local wrapper", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/smoke-seed-comments.ts"],
    {
      encoding: "utf8",
      env: { PATH: process.env.PATH, HLEIAS_LOCAL_ONLY: "0" },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Smoke tests require the disposable local stack/);
});

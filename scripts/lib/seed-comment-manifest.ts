import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const SEED_COMMENT_MIGRATION =
  "supabase/migrations/20261008140000_remove_synthetic_seed_comments.sql";

export type SeedComment = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  text: string;
  sortOrder: number;
};

/** Test fixtures come from the frozen migration, never from changing seed data. */
export function readSeedCommentManifest() {
  const migration = readFileSync(SEED_COMMENT_MIGRATION, "utf8");
  const rows: SeedComment[] = [
    ...migration.matchAll(
      /\('([^']+)'::uuid, '([^']+)', '([^']+)', '([^']+)', '([^']+)', (\d+)\)/g,
    ),
  ].map(([, id, postId, authorId, authorName, text, sortOrder]) => ({
    id,
    postId,
    authorId,
    authorName,
    text,
    sortOrder: Number(sortOrder),
  }));
  assert.equal(rows.length, 23, "Frozen pre-removal manifest must contain all 23 comments.");
  return { migration, rows };
}

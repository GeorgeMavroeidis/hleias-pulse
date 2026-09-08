begin;

-- "Ask a local" (FEATURES.md): a question is a Post of kind 'question';
-- answers reuse the existing comments table (post_id already links them).
-- No new table, no new RLS policy — every write/read path, moderation queue,
-- report/block enforcement that already covers posts and comments covers
-- this for free. Widening a CHECK constraint is the only schema change.
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts
  add constraint posts_kind_check
  check (kind in ('spot', 'tip', 'event', 'photo', 'question'));

commit;

-- Let authors read their own content, whatever its moderation status.
--
-- ROOT CAUSE
-- 20260824090000_add_admin_dashboard.sql narrowed the public SELECT policies to
-- published rows only ("Public can read published posts") and added an admin
-- escape hatch ("Admins can read all posts"). No policy was added for the one
-- case in between: an ordinary user reading a row they just created. New rows
-- default to moderation_status = 'pending', so an author cannot see their own
-- submission.
--
-- Writes were never blocked. hp-api.ts creates rows with
-- .insert(...).select(...).single(), and that RETURNING clause makes Postgres
-- read the new row back under the SELECT policies. With no policy matching, the
-- statement aborts with:
--   [42501] new row violates row-level security policy for table "posts"
-- which reads like a write rejection and is why this was mis-diagnosed.
--
-- EVIDENCE (live project, 2026-09-04, freshly signed-up user)
--   INSERT with Prefer: return=minimal         -> HTTP 201  succeeded
--   INSERT with Prefer: return=representation  -> HTTP 403  42501
--   SELECT of that same row by its author      -> HTTP 200  rows=[]
--
-- FIX
-- Add an own-row SELECT policy to each table that carries moderation_status.
-- Permissive, so it ORs with the existing published/admin policies and widens
-- visibility only to the row's own author. No existing policy is modified.

drop policy if exists "Users can read own posts" on public.posts;
create policy "Users can read own posts"
on public.posts for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can read own comments" on public.comments;
create policy "Users can read own comments"
on public.comments for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can read own places" on public.places;
create policy "Users can read own places"
on public.places for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can read own stories" on public.stories;
create policy "Users can read own stories"
on public.stories for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can read own meet events" on public.meet_events;
create policy "Users can read own meet events"
on public.meet_events for select to authenticated
using (user_id = (select auth.uid()));

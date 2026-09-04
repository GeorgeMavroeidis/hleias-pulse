-- Restore the user-submission RLS policies.
--
-- ROOT CAUSE
-- 20260824090000_add_admin_dashboard.sql renamed the per-table INSERT/UPDATE
-- policies, e.g. "Authenticated users can create posts" was dropped and
-- "Authenticated users can submit posts" created in its place. On the live
-- project the ALTER TABLE statements from that migration did apply --
-- posts.moderation_status and comments.moderation_status both exist -- but the
-- policy statements did not. The old policies were removed and the new ones
-- were never created, leaving these five tables with NO permissive INSERT
-- policy for the `authenticated` role.
--
-- SYMPTOM
-- Every authenticated insert fails with:
--   [42501] new row violates row-level security policy for table "posts"
-- Verified 2026-09-04 against a freshly signed-up user holding a valid
-- public.profiles row. Posting, commenting, adding a place, posting a story and
-- creating a meet event are all impossible in production.
--
-- FIX
-- Recreate the intended policies exactly as 20260824090000 defined them. Every
-- statement is idempotent: both the pre-rename and post-rename policy names are
-- dropped first, so this migration is safe to run whatever state a given
-- environment is in.
--
-- Reads are unaffected; this migration only touches INSERT and UPDATE.

-- Table privileges are a prerequisite for the policies to matter at all.
grant insert, update on public.posts, public.comments, public.places to authenticated;
grant insert, update on public.stories, public.meet_events to authenticated;

-- ---------------------------------------------------------------- posts -----
drop policy if exists "Authenticated users can create posts" on public.posts;
drop policy if exists "Authenticated users can submit posts" on public.posts;
create policy "Authenticated users can submit posts"
on public.posts for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

drop policy if exists "Users can update own posts" on public.posts;
drop policy if exists "Users can update own pending posts" on public.posts;
create policy "Users can update own pending posts"
on public.posts for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

-- ------------------------------------------------------------- comments -----
drop policy if exists "Authenticated users can create comments" on public.comments;
drop policy if exists "Authenticated users can submit comments" on public.comments;
create policy "Authenticated users can submit comments"
on public.comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

drop policy if exists "Users can update own comments" on public.comments;
drop policy if exists "Users can update own pending comments" on public.comments;
create policy "Users can update own pending comments"
on public.comments for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

-- --------------------------------------------------------------- places -----
drop policy if exists "Authenticated users can create places" on public.places;
drop policy if exists "Authenticated users can submit places" on public.places;
create policy "Authenticated users can submit places"
on public.places for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

drop policy if exists "Users can update own places" on public.places;
drop policy if exists "Users can update own pending places" on public.places;
create policy "Users can update own pending places"
on public.places for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

-- -------------------------------------------------------------- stories -----
drop policy if exists "Authenticated users can create own stories" on public.stories;
drop policy if exists "Authenticated users can submit stories" on public.stories;
create policy "Authenticated users can submit stories"
on public.stories for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

drop policy if exists "Users can update own stories" on public.stories;
drop policy if exists "Users can update own pending stories" on public.stories;
create policy "Users can update own pending stories"
on public.stories for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

-- ---------------------------------------------------------- meet_events -----
drop policy if exists "Authenticated users can create meet events" on public.meet_events;
drop policy if exists "Authenticated users can submit meet events" on public.meet_events;
create policy "Authenticated users can submit meet events"
on public.meet_events for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

drop policy if exists "Users can update own meet events" on public.meet_events;
drop policy if exists "Users can update own pending meet events" on public.meet_events;
create policy "Users can update own pending meet events"
on public.meet_events for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

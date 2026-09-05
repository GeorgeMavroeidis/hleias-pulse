-- Close the two RLS gaps found by the 2026-09-05 full-schema audit.
--
-- Both are policy bugs on tables that already have RLS enabled. Neither adds a
-- capability; each removes one that was never intended. The third finding from
-- that audit — deal visibility not being tied to business verification — is a
-- product behaviour change and ships separately.
--
-- Policy counts after this migration, per table per command. Both tables also
-- keep every policy not named here unchanged.
--
--   meet_events      INSERT 1  ("Authenticated users can submit meet events")
--                    SELECT 3  (public-published, own, admin)
--                    UPDATE 1  ("Users can update own pending meet events")
--                    DELETE 1  ("Users can delete own meet events")
--                    plus "Editors can manage meet events", a FOR ALL policy
--                    that adds an owner/editor branch to all four commands.
--
--   content_reports  INSERT 1  (content_reports_insert_own)
--                    SELECT 2  (content_reports_select_own, _admin_read)
--                    UPDATE 2  (content_reports_update_own, _admin_write)
--                    DELETE 0  (nobody may delete a report — deliberate)

-- ---------------------------------------------------------------------------
-- 1. meet_events: a stale policy lets a user publish straight to the feed
-- ---------------------------------------------------------------------------
--
-- 20260617161000_make_live_surfaces_supabase.sql created:
--
--   "Authenticated users can create own meet events"   <- note the "own"
--       with check (... and moderation_status = 'published')
--
-- Moderation arrived in 20260824090000_add_admin_dashboard.sql, which tried to
-- retire it at line 261 — but dropped "Authenticated users can create meet
-- events", without the "own". 20260904120000_restore_user_submission_policies
-- repeated the same wrong name at line 121. Both drops were silent no-ops, so
-- the June policy is still live today.
--
-- Permissive policies OR together, so meet_events currently has two INSERT
-- policies: the intended pending-only one, and this one that requires
-- 'published'. Any authenticated user can therefore insert a meet event that is
-- immediately visible to anon through "Public can read published meet events",
-- with no moderator ever seeing it. posts, places, stories and comments each
-- have exactly one INSERT policy and are not affected — meet_events is the only
-- surface with this hole.
--
-- hp-api.ts always sends moderation_status: "pending", so nothing in the app
-- exercises this. That is precisely why it survived two passes: RLS is the
-- boundary, not the client.
--
-- Contradicts ADMIN_SETUP.md ("All new user posts, comments, places, stories,
-- and Meet events start as `pending`") and the Apple Guideline 1.2 moderation
-- requirement in CLAUDE.md.
--
-- The correct pending-only policy, "Authenticated users can submit meet
-- events", already exists and is unchanged. This drop is the whole fix.

drop policy if exists "Authenticated users can create own meet events" on public.meet_events;

-- ---------------------------------------------------------------------------
-- 2. content_reports: a reporter can reopen or rewrite an actioned report
-- ---------------------------------------------------------------------------
--
-- 20260905130000_add_user_moderation.sql put the status guard only in the CHECK
-- clause:
--
--   using       (reporter_id = (select auth.uid()))
--   with check  (reporter_id = (select auth.uid()) and status = 'open')
--
-- USING decides which rows may be updated; CHECK decides what they may become.
-- With no status test in USING, a reporter can pick up a report a moderator has
-- already moved to 'reviewing', 'actioned' or 'dismissed' and write it back to
-- 'open' — re-queueing a dismissed report as often as they like.
--
-- It also undoes that migration's own stated intent. Its comment says reports
-- are deliberately not deletable by the reporter, "not a button an aggressor
-- can pressure someone into pressing". But target_type, target_id, reason and
-- note are all freely updatable, so rewriting a harassment report into a spam
-- report against an unrelated post is a functional withdrawal by another name —
-- and retargeting the row is also how a reporter would step around the
-- unique (reporter_id, target_type, target_id) dedupe.
--
-- Narrowing USING to open reports leaves the intended behaviour intact: you may
-- still correct a report you just filed, until a moderator picks it up.
-- Moderators are unaffected — "content_reports_admin_write" is a separate
-- permissive UPDATE policy and still matches every row.

drop policy if exists "content_reports_update_own" on public.content_reports;
create policy "content_reports_update_own" on public.content_reports
  for update to authenticated
  using (reporter_id = (select auth.uid()) and status = 'open')
  with check (reporter_id = (select auth.uid()) and status = 'open');

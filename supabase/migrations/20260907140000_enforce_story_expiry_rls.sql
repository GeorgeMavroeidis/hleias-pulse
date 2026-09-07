begin;

-- Close the gap flagged in ROADMAP.md / IDEAS.md ("Story expiry"): the 6h/24h
-- cutoff on stories has only ever been enforced inside get_pulse_bootstrap(),
-- never in the table's own row-security policy. Anyone holding the public
-- (publishable) API key can call `from("stories").select()` directly and
-- read every story that has "expired" in the UI's eyes — the policy only
-- ever checked moderation_status and blocks, not expiry. This is real user
-- media tied to a location, so it's a live GDPR exposure, not just a display
-- quirk.
--
-- Same predicate the RPC already uses (expires_after_hours is null means
-- "doesn't expire" — the evergreen editorial pool from
-- 20260617161000_make_live_surfaces_supabase.sql / 20260907130000), so this
-- doesn't change what anyone sees through the app; it only stops a
-- workaround that skips the app entirely.
drop policy if exists "Public can read published stories" on public.stories;
create policy "Public can read published stories"
on public.stories for select to anon, authenticated
using (
  moderation_status = 'published'
  and (user_id is null or not (user_id = any (public.blocked_user_ids())))
  and (
    expires_after_hours is null
    or created_at > now() - make_interval(hours => expires_after_hours)
  )
);

commit;

begin;

-- Give the app content while there are no real users yet, without inventing
-- fake people or fake activity: the 11 editorial/report stories seeded in
-- 20260617161000_make_live_surfaces_supabase.sql are real, specific,
-- already-written copy tied to real places — they were just set to never
-- expire (expires_after_hours is null), so they sit there statically forever
-- instead of behaving like a real story does (live for a while, then gone).
--
-- This gives them a real 6h/24h expiry matching their own `kind` (a crowd/
-- beach report is time-sensitive; an editor_note or photo is more evergreen),
-- and a narrowly-scoped function that "reposts" one (refreshes created_at)
-- once it has actually expired — so the Stories rail keeps cycling through
-- real content instead of freezing solid. No new table, no fabricated
-- authors, no cron job: the refresh is driven by the app's own bootstrap
-- load, which already runs on every session.

update public.stories
set expires_after_hours = case kind
  when 'report' then 6
  when 'beach_status' then 6
  else 24
end
where id in (
  'story-kourouta', 'story-kourouta-sunbeds', 'story-katakolo', 'story-olympia',
  'story-foloi', 'story-kyllini', 'story-zacharo', 'story-andritsaina',
  'story-kakovatos', 'story-kaiafas', 'story-chlemoutsi'
)
and expires_after_hours is null;

-- Deliberately narrow: touches only this fixed, known list of ids, and only
-- when they're actually past their own expiry — it can't be pointed at any
-- other row, can't insert or delete, and calling it early or repeatedly is a
-- no-op. That's why it's safe to grant to anon/authenticated directly rather
-- than routing through an admin check like the moderation functions do.
create or replace function public.refresh_generic_stories()
returns void
language sql
security definer
set search_path = public
as $$
  update public.stories
  set created_at = now()
  where id = any (array[
    'story-kourouta', 'story-kourouta-sunbeds', 'story-katakolo', 'story-olympia',
    'story-foloi', 'story-kyllini', 'story-zacharo', 'story-andritsaina',
    'story-kakovatos', 'story-kaiafas', 'story-chlemoutsi'
  ])
    and expires_after_hours is not null
    and created_at <= now() - make_interval(hours => expires_after_hours);
$$;

grant execute on function public.refresh_generic_stories() to anon, authenticated;

commit;

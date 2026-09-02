-- Phase 2 of the "Έχεις πάει;" exploration feature: an explicit per-user
-- "I have visited this place" check-in, replacing the v1 posts-as-proxy.
-- Mirrors public.saved_items / public.story_views: own-rows-only RLS,
-- select/insert/delete for authenticated, toggled from the client.

create table if not exists public.user_place_visits (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null references public.places(id) on update cascade on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create index if not exists user_place_visits_user_visited_idx
  on public.user_place_visits (user_id, visited_at desc);

alter table public.user_place_visits enable row level security;

grant select, insert, delete on public.user_place_visits to authenticated;

drop policy if exists "Users can read own place visits" on public.user_place_visits;
create policy "Users can read own place visits"
on public.user_place_visits for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can create own place visits" on public.user_place_visits;
create policy "Users can create own place visits"
on public.user_place_visits for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own place visits" on public.user_place_visits;
create policy "Users can delete own place visits"
on public.user_place_visits for delete to authenticated
using (user_id = (select auth.uid()));

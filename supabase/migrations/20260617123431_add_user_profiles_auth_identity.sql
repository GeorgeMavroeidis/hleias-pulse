create extension if not exists pgcrypto with schema extensions;

alter table public.authors
  drop constraint if exists authors_type_check;

alter table public.authors
  add constraint authors_type_check
  check (type in ('LOCAL EDITOR', 'LOCAL', 'TOURIST', 'GUIDE', 'BUSINESS', 'EVENT', 'EDITOR'));

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text,
  display_name text,
  avatar_url text,
  avatar_path text,
  bio text,
  home_area text,
  default_identity text not null default 'LOCAL',
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_default_identity_check
    check (default_identity in ('LOCAL', 'TOURIST', 'GUIDE', 'BUSINESS')),
  constraint profiles_handle_format_check
    check (handle is null or handle ~ '^[a-z0-9_.]{3,30}$'),
  constraint profiles_display_name_length_check
    check (display_name is null or char_length(display_name) between 2 and 40),
  constraint profiles_bio_length_check
    check (bio is null or char_length(bio) <= 240),
  constraint profiles_completed_required_fields_check
    check (
      profile_completed_at is null
      or (handle is not null and display_name is not null and default_identity is not null)
    )
);

create unique index if not exists profiles_handle_lower_unique
  on public.profiles (lower(handle))
  where handle is not null;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'GR',
  vibe_chips text[] not null default '{}',
  home_map_area text,
  location_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_language_check check (language in ('GR', 'EN'))
);

create table if not exists public.user_security_events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_security_events_user_created_idx
  on public.user_security_events (user_id, created_at desc);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name_value text;
  avatar_url_value text;
  default_identity_value text;
begin
  display_name_value := nullif(
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    ''
  );

  avatar_url_value := nullif(
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    ),
    ''
  );

  default_identity_value := upper(nullif(new.raw_user_meta_data->>'default_identity', ''));
  if default_identity_value not in ('LOCAL', 'TOURIST', 'GUIDE', 'BUSINESS') then
    default_identity_value := 'LOCAL';
  end if;

  insert into public.profiles (id, display_name, avatar_url, default_identity)
  values (new.id, display_name_value, avatar_url_value, default_identity_value)
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_security_events (user_id, event_type, metadata)
  values (new.id, 'profile_created', jsonb_build_object('source', 'auth.users trigger'))
  on conflict do nothing;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created_profile'
  ) then
    execute 'create trigger on_auth_user_created_profile
      after insert on auth.users
      for each row execute function public.handle_new_auth_user()';
  end if;
end $$;

insert into public.profiles (id, display_name, avatar_url, default_identity)
select
  auth_users.id,
  nullif(
    coalesce(
      auth_users.raw_user_meta_data->>'display_name',
      auth_users.raw_user_meta_data->>'full_name',
      auth_users.raw_user_meta_data->>'name'
    ),
    ''
  ) as display_name,
  nullif(
    coalesce(
      auth_users.raw_user_meta_data->>'avatar_url',
      auth_users.raw_user_meta_data->>'picture'
    ),
    ''
  ) as avatar_url,
  case
    when upper(auth_users.raw_user_meta_data->>'default_identity') in ('LOCAL', 'TOURIST', 'GUIDE', 'BUSINESS')
      then upper(auth_users.raw_user_meta_data->>'default_identity')
    else 'LOCAL'
  end as default_identity
from auth.users as auth_users
on conflict (id) do nothing;

insert into public.user_preferences (user_id)
select auth_users.id
from auth.users as auth_users
on conflict (user_id) do nothing;

alter table public.posts
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists posting_identity text not null default 'LOCAL',
  add column if not exists author_kind text not null default 'user';

alter table public.comments
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists posting_identity text not null default 'LOCAL',
  add column if not exists author_kind text not null default 'user';

alter table public.places
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by_identity text not null default 'LOCAL',
  add column if not exists moderation_status text not null default 'published';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_posting_identity_check'
  ) then
    alter table public.posts
      add constraint posts_posting_identity_check
      check (posting_identity in ('LOCAL', 'TOURIST', 'GUIDE', 'BUSINESS'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'posts_author_kind_check'
  ) then
    alter table public.posts
      add constraint posts_author_kind_check
      check (author_kind in ('editorial', 'user'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'comments_posting_identity_check'
  ) then
    alter table public.comments
      add constraint comments_posting_identity_check
      check (posting_identity in ('LOCAL', 'TOURIST', 'GUIDE', 'BUSINESS'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'comments_author_kind_check'
  ) then
    alter table public.comments
      add constraint comments_author_kind_check
      check (author_kind in ('editorial', 'user'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'places_created_by_identity_check'
  ) then
    alter table public.places
      add constraint places_created_by_identity_check
      check (created_by_identity in ('LOCAL', 'TOURIST', 'GUIDE', 'BUSINESS'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'places_moderation_status_check'
  ) then
    alter table public.places
      add constraint places_moderation_status_check
      check (moderation_status in ('published', 'pending', 'hidden', 'rejected'));
  end if;
end $$;

update public.posts
set
  author_kind = case when user_id is null then 'editorial' else 'user' end,
  profile_id = case
    when user_id is not null and profile_id is null and exists (
      select 1 from public.profiles where profiles.id = posts.user_id
    ) then user_id
    else profile_id
  end,
  posting_identity = case
    when tags @> array['guide']::text[] then 'GUIDE'
    when tags @> array['tourist']::text[] then 'TOURIST'
    when tags @> array['business']::text[] then 'BUSINESS'
    else 'LOCAL'
  end;

update public.comments
set
  author_kind = case when user_id is null then 'editorial' else 'user' end,
  profile_id = case
    when user_id is not null and profile_id is null and exists (
      select 1 from public.profiles where profiles.id = comments.user_id
    ) then user_id
    else profile_id
  end;

update public.places
set
  profile_id = case
    when user_id is not null and profile_id is null and exists (
      select 1 from public.profiles where profiles.id = places.user_id
    ) then user_id
    else profile_id
  end;

create index if not exists posts_profile_id_idx on public.posts (profile_id);
create index if not exists comments_profile_id_idx on public.comments (profile_id);
create index if not exists places_profile_id_idx on public.places (profile_id);
create index if not exists profiles_completed_idx on public.profiles (profile_completed_at)
  where profile_completed_at is not null;

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.user_security_events enable row level security;

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select on public.user_security_events to authenticated;

drop policy if exists "Public can read profiles" on public.profiles;
create policy "Public can read profiles"
on public.profiles for select to anon, authenticated
using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert to authenticated
with check (id = (select auth.uid()));

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Users can read own preferences" on public.user_preferences;
create policy "Users can read own preferences"
on public.user_preferences for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can insert own preferences" on public.user_preferences;
create policy "Users can insert own preferences"
on public.user_preferences for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences"
on public.user_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own preferences" on public.user_preferences;
create policy "Users can delete own preferences"
on public.user_preferences for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can read own security events" on public.user_security_events;
create policy "Users can read own security events"
on public.user_security_events for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
on public.posts for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
);

drop policy if exists "Users can update own posts" on public.posts;
create policy "Users can update own posts"
on public.posts for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
);

drop policy if exists "Authenticated users can create comments" on public.comments;
create policy "Authenticated users can create comments"
on public.comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
);

drop policy if exists "Users can update own comments" on public.comments;
create policy "Users can update own comments"
on public.comments for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
);

drop policy if exists "Authenticated users can create places" on public.places;
create policy "Authenticated users can create places"
on public.places for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
);

drop policy if exists "Users can update own places" on public.places;
create policy "Users can update own places"
on public.places for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable"
on storage.objects for select to anon, authenticated
using (bucket_id = 'avatars');

drop policy if exists "Users can upload own avatar objects" on storage.objects;
create policy "Users can upload own avatar objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and name like (select auth.uid())::text || '/%'
);

drop policy if exists "Users can update own avatar objects" on storage.objects;
create policy "Users can update own avatar objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and name like (select auth.uid())::text || '/%'
)
with check (
  bucket_id = 'avatars'
  and name like (select auth.uid())::text || '/%'
);

drop policy if exists "Users can delete own avatar objects" on storage.objects;
create policy "Users can delete own avatar objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and name like (select auth.uid())::text || '/%'
);

create or replace function public.get_pulse_bootstrap()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'authors',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.id)
        from (
          select id, name, type, avatar_url
          from public.authors
        ) as row_data
      ), '[]'::jsonb),
    'profiles',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.display_name nulls last, row_data.id)
        from (
          select id, handle, display_name, avatar_url, avatar_path, default_identity, home_area,
            profile_completed_at
          from public.profiles
        ) as row_data
      ), '[]'::jsonb),
    'places',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.sort_order)
        from (
          select id, name, greek_name, type, area, x, y, lat, lng, pulse, mood, crowd, budget,
            best_time, tags, short, image_url, hotness, comment_count, recent_post_count, status,
            sort_order, user_id, profile_id, created_by_identity, moderation_status
          from public.places
        ) as row_data
      ), '[]'::jsonb),
    'place_avatars',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.place_id, row_data.position)
        from (
          select place_id, position, avatar_url
          from public.place_avatars
        ) as row_data
      ), '[]'::jsonb),
    'posts',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.sort_order)
        from (
          select id, author_id, author_kind, user_id, profile_id, posting_identity, place_id, kind,
            display_time, text, tags, likes_count, image_url, sort_order
          from public.posts
        ) as row_data
      ), '[]'::jsonb),
    'comments',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.sort_order)
        from (
          select target_type, place_id, post_id, route_id, author_name, author_kind, user_id,
            profile_id, posting_identity, text, sort_order
          from public.comments
        ) as row_data
      ), '[]'::jsonb),
    'events',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.sort_order)
        from (
          select id, title, place_id, display_time, price, vibe, tags, sort_order
          from public.events
        ) as row_data
      ), '[]'::jsonb),
    'routes',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.sort_order)
        from (
          select id, title, author_id, lede, duration, budget, tags, image_url, comment_count,
            saves_count, sort_order
          from public.routes
        ) as row_data
      ), '[]'::jsonb),
    'route_stops',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.route_id, row_data.position)
        from (
          select route_id, position, display_time, place_id, title, body
          from public.route_stops
        ) as row_data
      ), '[]'::jsonb),
    'stories',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.position)
        from (
          select id, label, place_id, position
          from public.stories
        ) as row_data
      ), '[]'::jsonb),
    'vibe_chips',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.position)
        from (
          select id, label, position
          from public.vibe_chips
        ) as row_data
      ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_pulse_bootstrap() to anon, authenticated;

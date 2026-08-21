begin;

alter table public.stories
  drop constraint if exists stories_position_key;

alter table public.stories
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists kind text not null default 'photo',
  add column if not exists author_name text not null default 'Local',
  add column if not exists author_type text not null default 'LOCAL',
  add column if not exists author_avatar_url text not null default 'https://i.pravatar.cc/120?img=22',
  add column if not exists media_url text,
  add column if not exists caption text not null default '',
  add column if not exists expires_after_hours integer,
  add column if not exists crowd text,
  add column if not exists parking text,
  add column if not exists condition text[] not null default '{}',
  add column if not exists moderation_status text not null default 'published';

update public.stories
set media_url = coalesce(
  media_url,
  (
    select places.image_url
    from public.places
    where places.id = stories.place_id
  ),
  '/story-feature/kourouta-online-story.jpg'
)
where media_url is null;

alter table public.stories
  alter column media_url set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stories_kind_check'
  ) then
    alter table public.stories
      add constraint stories_kind_check
      check (kind in ('photo', 'report', 'beach_status', 'business_status', 'editor_note', 'event', 'route_tease'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'stories_author_type_check'
  ) then
    alter table public.stories
      add constraint stories_author_type_check
      check (author_type in ('LOCAL', 'TOURIST', 'BUSINESS', 'EDITOR', 'GUIDE'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'stories_crowd_check'
  ) then
    alter table public.stories
      add constraint stories_crowd_check
      check (crowd is null or crowd in ('low', 'medium', 'high'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'stories_parking_check'
  ) then
    alter table public.stories
      add constraint stories_parking_check
      check (parking is null or parking in ('easy', 'tight', 'full'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'stories_expires_after_hours_check'
  ) then
    alter table public.stories
      add constraint stories_expires_after_hours_check
      check (expires_after_hours is null or expires_after_hours in (6, 24));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'stories_moderation_status_check'
  ) then
    alter table public.stories
      add constraint stories_moderation_status_check
      check (moderation_status in ('published', 'pending', 'hidden', 'rejected'));
  end if;
end $$;

create index if not exists stories_place_position_idx
  on public.stories (place_id, position, created_at desc);
create index if not exists stories_profile_created_idx
  on public.stories (profile_id, created_at desc);

create table if not exists public.meet_events (
  id text primary key,
  place_id text not null references public.places(id) on update cascade on delete restrict,
  user_id uuid references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  title text not null,
  host_name text not null,
  host_avatar_url text not null,
  host_type text not null default 'LOCAL',
  starts_at timestamptz not null,
  duration_min integer not null default 120 check (duration_min between 15 and 1440),
  category text not null,
  vibe text not null,
  price text not null,
  capacity integer check (capacity is null or capacity > 0),
  description text not null,
  cover_url text not null,
  tags text[] not null default '{}',
  seed_going_count integer not null default 0 check (seed_going_count >= 0),
  seed_maybe_count integer not null default 0 check (seed_maybe_count >= 0),
  going_count integer not null default 0 check (going_count >= 0),
  maybe_count integer not null default 0 check (maybe_count >= 0),
  hot boolean not null default false,
  attendee_avatar_urls text[] not null default '{}',
  moderation_status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meet_events_category_check
    check (category in ('panigyri', 'beach', 'music', 'sunset', 'sport', 'cleanup', 'food', 'social')),
  constraint meet_events_host_type_check
    check (host_type in ('LOCAL', 'GUIDE', 'BUSINESS', 'TOURIST')),
  constraint meet_events_moderation_status_check
    check (moderation_status in ('published', 'pending', 'hidden', 'rejected'))
);

create table if not exists public.event_rsvps (
  event_id text not null references public.meet_events(id) on update cascade on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  status text not null check (status in ('going', 'maybe')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.story_views (
  story_id text not null references public.stories(id) on update cascade on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.user_activity_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, activity_day)
);

create index if not exists meet_events_place_starts_idx
  on public.meet_events (place_id, starts_at);
create index if not exists meet_events_profile_created_idx
  on public.meet_events (profile_id, created_at desc);
create index if not exists event_rsvps_user_status_idx
  on public.event_rsvps (user_id, status);
create index if not exists story_views_user_seen_idx
  on public.story_views (user_id, seen_at desc);
create index if not exists user_activity_days_user_day_idx
  on public.user_activity_days (user_id, activity_day desc);

drop trigger if exists set_meet_events_updated_at on public.meet_events;
create trigger set_meet_events_updated_at
before update on public.meet_events
for each row execute function public.set_updated_at();

drop trigger if exists set_event_rsvps_updated_at on public.event_rsvps;
create trigger set_event_rsvps_updated_at
before update on public.event_rsvps
for each row execute function public.set_updated_at();

create or replace function public.refresh_meet_event_rsvp_counts(target_event_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.meet_events
  set
    going_count = seed_going_count + (
      select count(*)::integer
      from public.event_rsvps
      where event_id = target_event_id
        and status = 'going'
    ),
    maybe_count = seed_maybe_count + (
      select count(*)::integer
      from public.event_rsvps
      where event_id = target_event_id
        and status = 'maybe'
    ),
    updated_at = now()
  where id = target_event_id;
end;
$$;

create or replace function public.handle_event_rsvp_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_meet_event_rsvp_counts(old.event_id);
    return old;
  end if;

  perform public.refresh_meet_event_rsvp_counts(new.event_id);
  if tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
    perform public.refresh_meet_event_rsvp_counts(old.event_id);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_meet_event_rsvp_counts on public.event_rsvps;
create trigger refresh_meet_event_rsvp_counts
after insert or update or delete on public.event_rsvps
for each row execute function public.handle_event_rsvp_counts();

alter table public.meet_events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.story_views enable row level security;
alter table public.user_activity_days enable row level security;

grant select on public.meet_events to anon, authenticated;
grant insert, update, delete on public.meet_events to authenticated;
grant select, insert, update, delete on public.event_rsvps to authenticated;
grant select, insert, delete on public.story_views to authenticated;
grant select, insert on public.user_activity_days to authenticated;
grant insert, update, delete on public.stories to authenticated;

drop policy if exists "Public can read stories" on public.stories;
create policy "Public can read stories"
on public.stories for select to anon, authenticated
using (moderation_status = 'published');

drop policy if exists "Authenticated users can create own stories" on public.stories;
create policy "Authenticated users can create own stories"
on public.stories for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'published'
);

drop policy if exists "Users can update own stories" on public.stories;
create policy "Users can update own stories"
on public.stories for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
);

drop policy if exists "Users can delete own stories" on public.stories;
create policy "Users can delete own stories"
on public.stories for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Public can read meet events" on public.meet_events;
create policy "Public can read meet events"
on public.meet_events for select to anon, authenticated
using (moderation_status = 'published');

drop policy if exists "Authenticated users can create own meet events" on public.meet_events;
create policy "Authenticated users can create own meet events"
on public.meet_events for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'published'
);

drop policy if exists "Users can update own meet events" on public.meet_events;
create policy "Users can update own meet events"
on public.meet_events for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
);

drop policy if exists "Users can delete own meet events" on public.meet_events;
create policy "Users can delete own meet events"
on public.meet_events for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can read own event RSVPs" on public.event_rsvps;
create policy "Users can read own event RSVPs"
on public.event_rsvps for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can create own event RSVPs" on public.event_rsvps;
create policy "Users can create own event RSVPs"
on public.event_rsvps for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
);

drop policy if exists "Users can update own event RSVPs" on public.event_rsvps;
create policy "Users can update own event RSVPs"
on public.event_rsvps for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
);

drop policy if exists "Users can delete own event RSVPs" on public.event_rsvps;
create policy "Users can delete own event RSVPs"
on public.event_rsvps for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can read own story views" on public.story_views;
create policy "Users can read own story views"
on public.story_views for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can create own story views" on public.story_views;
create policy "Users can create own story views"
on public.story_views for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own story views" on public.story_views;
create policy "Users can delete own story views"
on public.story_views for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can read own activity days" on public.user_activity_days;
create policy "Users can read own activity days"
on public.user_activity_days for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can create own activity days" on public.user_activity_days;
create policy "Users can create own activity days"
on public.user_activity_days for insert to authenticated
with check (user_id = (select auth.uid()));

insert into public.stories (
  id, label, place_id, position, kind, author_name, author_type, author_avatar_url,
  media_url, caption, expires_after_hours, crowd, parking, condition, created_at, moderation_status
)
values
  (
    'story-kourouta', 'Kourouta', 'kourouta-beach', 0, 'report', 'Nikos', 'LOCAL',
    'https://i.pravatar.cc/120?img=12', '/story-feature/kourouta-online-story.jpg',
    'Filling up fast. Wind dropped, water is glassy. Parking already tight near the bars.',
    null, 'high', 'tight', array['clean', 'calm']::text[], now() - interval '14 minutes', 'published'
  ),
  (
    'story-kourouta-sunbeds', 'Kourouta', 'kourouta-beach', 1, 'beach_status', 'Maria', 'TOURIST',
    'https://i.pravatar.cc/120?img=32', '/story-feature/kourouta-online-story.jpg',
    'Sunbeds gone by 16:00. Free patch of sand left of the lifeguard tower.',
    null, 'high', 'full', array[]::text[], now() - interval '52 minutes', 'published'
  ),
  (
    'story-katakolo', 'Katakolo', 'katakolo-sunset', 2, 'photo', 'Eleni', 'EDITOR',
    'https://i.pravatar.cc/120?img=47', '/story-feature/katakolo-sunset-online-story.jpg',
    'Golden hour hitting the port lights. Walk the mole, not the promenade.',
    null, null, null, array[]::text[], now() - interval '22 minutes', 'published'
  ),
  (
    'story-olympia', 'Olympia', 'ancient-olympia', 3, 'editor_note', 'Eleni', 'EDITOR',
    'https://i.pravatar.cc/120?img=47', '/story-feature/ancient-olympia-online-story.jpg',
    'Go late afternoon. The light on the columns is the whole point. Skip midday.',
    null, null, null, array[]::text[], now() - interval '35 minutes', 'published'
  ),
  (
    'story-foloi', 'Foloi', 'foloi-forest', 4, 'editor_note', 'Nikos', 'LOCAL',
    'https://i.pravatar.cc/120?img=12', '/story-feature/foloi-oak-forest-online-story.jpg',
    'Bring water. No bins up here. Shade is unreal right now.',
    null, null, null, array[]::text[], now() - interval '40 minutes', 'published'
  ),
  (
    'story-kyllini', 'Kyllini', 'kyllini-beach', 5, 'beach_status', 'Andreas', 'BUSINESS',
    'https://i.pravatar.cc/120?img=58', '/story-feature/kyllini-beach-online-story.jpg',
    'Long open stretch, never feels packed. North end is the quieter bit.',
    null, 'medium', 'easy', array['clean']::text[], now() - interval '70 minutes', 'published'
  ),
  (
    'story-zacharo', 'Zacharo', 'zacharo-beach', 6, 'report', 'Nikos', 'LOCAL',
    'https://i.pravatar.cc/120?img=12', '/story-feature/zacharo-sunset-online-story.jpg',
    'Big sky, almost empty. Sand is hot, bring shoes. Sunset is the move.',
    null, 'low', 'easy', array['quiet', 'clean']::text[], now() - interval '18 minutes', 'published'
  ),
  (
    'story-andritsaina', 'Andritsaina', 'andritsaina', 7, 'editor_note', 'Eleni', 'EDITOR',
    'https://i.pravatar.cc/120?img=47', '/story-feature/andritsaina-online-story.jpg',
    'Cooler up here by evening. Stone lanes, slow food, cold beer.',
    null, null, null, array[]::text[], now() - interval '95 minutes', 'published'
  ),
  (
    'story-kakovatos', 'Kakovatos', 'kakovatos-beach', 8, 'report', 'Maria', 'TOURIST',
    'https://i.pravatar.cc/120?img=32', '/story-feature/kakovatos-beach-online-story.jpg',
    'Endless sand, barely anyone. The not-obvious-scene beach.',
    null, 'low', 'easy', array['quiet']::text[], now() - interval '28 minutes', 'published'
  ),
  (
    'story-kaiafas', 'Kaiafas', 'kaiafas-lake', 9, 'editor_note', 'Eleni', 'EDITOR',
    'https://i.pravatar.cc/120?img=47', '/story-feature/kaiafas-lake-sunset-online-story.jpg',
    'Pine, lake, and weird calm. Do the loop, then sunset ten minutes south.',
    null, null, null, array[]::text[], now() - interval '110 minutes', 'published'
  ),
  (
    'story-chlemoutsi', 'Chlemoutsi', 'chlemoutsi', 10, 'photo', 'Maria', 'TOURIST',
    'https://i.pravatar.cc/120?img=32', '/story-feature/chlemoutsi-castle-online-story.jpg',
    'Castle on the hill, Ionian on the horizon. Best at golden hour.',
    null, null, null, array[]::text[], now() - interval '160 minutes', 'published'
  )
on conflict (id) do update set
  label = excluded.label,
  place_id = excluded.place_id,
  position = excluded.position,
  kind = excluded.kind,
  author_name = excluded.author_name,
  author_type = excluded.author_type,
  author_avatar_url = excluded.author_avatar_url,
  media_url = excluded.media_url,
  caption = excluded.caption,
  expires_after_hours = excluded.expires_after_hours,
  crowd = excluded.crowd,
  parking = excluded.parking,
  condition = excluded.condition,
  created_at = excluded.created_at,
  moderation_status = excluded.moderation_status,
  updated_at = now();

with seed_events (
  id, place_id, title, host_name, host_avatar_url, host_type, starts_offset,
  duration_min, category, vibe, price, capacity, description, tags,
  seed_going_count, seed_maybe_count, hot, attendee_avatar_urls
) as (
  values
    (
      'meet-kourouta-sunset-swim', 'kourouta-beach', 'Sunset swim + paddleboards',
      'Nikos P.', 'https://i.pravatar.cc/120?img=12', 'GUIDE', interval '2 hours',
      120, 'beach', 'Chill & social', 'Free', null,
      'Meet at the rocks, swim until golden hour, then beach snacks.',
      array['beach', 'sunset', 'social']::text[], 12, 3, true,
      array['https://i.pravatar.cc/80?img=20', 'https://i.pravatar.cc/80?img=21', 'https://i.pravatar.cc/80?img=22']::text[]
    ),
    (
      'meet-amaliada-panigyri', 'amaliada-square', 'Village panigyri - live music till late',
      'Eleni K.', 'https://i.pravatar.cc/120?img=5', 'LOCAL', interval '5 hours',
      300, 'panigyri', 'Traditional & loud', 'Free', null,
      'Annual feast in the square. Food, dancing, and a late local crowd.',
      array['panigyri', 'music', 'village']::text[], 18, 4, true,
      array['https://i.pravatar.cc/80?img=24', 'https://i.pravatar.cc/80?img=25', 'https://i.pravatar.cc/80?img=26']::text[]
    ),
    (
      'meet-zacharo-sunset', 'zacharo-beach', 'Sunset watch + wine',
      'Maria D.', 'https://i.pravatar.cc/120?img=32', 'LOCAL', interval '1 day 3 hours',
      75, 'sunset', 'Quiet & warm', 'Free', 18,
      'Bring something small to share. North access, quieter sand.',
      array['sunset', 'quiet', 'beach']::text[], 7, 2, false,
      array['https://i.pravatar.cc/80?img=27', 'https://i.pravatar.cc/80?img=28']::text[]
    ),
    (
      'meet-foloi-cleanup', 'foloi-forest', 'Morning forest walk + cleanup',
      'Sofia V.', 'https://i.pravatar.cc/120?img=45', 'LOCAL', interval '2 days 16 hours',
      90, 'cleanup', 'Useful & calm', 'Free', null,
      'Easy shaded loop. Bring water; bags are provided.',
      array['forest', 'cleanup', 'walk']::text[], 5, 1, false,
      array['https://i.pravatar.cc/80?img=29', 'https://i.pravatar.cc/80?img=30']::text[]
    ),
    (
      'meet-katakolo-coffee', 'katakolo-port', 'Coffee & tips - new in town?',
      'Lucas', 'https://i.pravatar.cc/120?img=14', 'TOURIST', interval '3 days 10 hours',
      60, 'social', 'Friendly', 'Coffee', 16,
      'Locals answer questions, visitors swap plans, no pressure.',
      array['coffee', 'tips', 'port']::text[], 4, 3, false,
      array['https://i.pravatar.cc/80?img=31', 'https://i.pravatar.cc/80?img=32']::text[]
    ),
    (
      'meet-pyrgos-night', 'pyrgos-night', 'Live DJ set on the deck',
      'Taverna Kostas', 'https://i.pravatar.cc/120?img=51', 'BUSINESS', interval '4 days 4 hours',
      240, 'music', 'Dancey', 'EUR 5', 36,
      'Local selectors, sundown to midnight. Kitchen open late.',
      array['music', 'night', 'local']::text[], 16, 5, true,
      array['https://i.pravatar.cc/80?img=33', 'https://i.pravatar.cc/80?img=34', 'https://i.pravatar.cc/80?img=35']::text[]
    )
)
insert into public.meet_events (
  id, place_id, title, host_name, host_avatar_url, host_type, starts_at, duration_min,
  category, vibe, price, capacity, description, cover_url, tags, seed_going_count,
  seed_maybe_count, going_count, maybe_count, hot, attendee_avatar_urls, moderation_status
)
select
  seed_events.id,
  seed_events.place_id,
  seed_events.title,
  seed_events.host_name,
  seed_events.host_avatar_url,
  seed_events.host_type,
  now() + seed_events.starts_offset,
  seed_events.duration_min,
  seed_events.category,
  seed_events.vibe,
  seed_events.price,
  seed_events.capacity,
  seed_events.description,
  places.image_url,
  seed_events.tags,
  seed_events.seed_going_count,
  seed_events.seed_maybe_count,
  seed_events.seed_going_count,
  seed_events.seed_maybe_count,
  seed_events.hot,
  seed_events.attendee_avatar_urls,
  'published'
from seed_events
join public.places on places.id = seed_events.place_id
on conflict (id) do update set
  place_id = excluded.place_id,
  title = excluded.title,
  host_name = excluded.host_name,
  host_avatar_url = excluded.host_avatar_url,
  host_type = excluded.host_type,
  starts_at = excluded.starts_at,
  duration_min = excluded.duration_min,
  category = excluded.category,
  vibe = excluded.vibe,
  price = excluded.price,
  capacity = excluded.capacity,
  description = excluded.description,
  cover_url = excluded.cover_url,
  tags = excluded.tags,
  seed_going_count = excluded.seed_going_count,
  seed_maybe_count = excluded.seed_maybe_count,
  going_count = excluded.going_count,
  maybe_count = excluded.maybe_count,
  hot = excluded.hot,
  attendee_avatar_urls = excluded.attendee_avatar_urls,
  moderation_status = excluded.moderation_status,
  updated_at = now();

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
        select jsonb_agg(to_jsonb(row_data) order by row_data.updated_at desc)
        from (
          select id, handle, display_name, avatar_url, avatar_path, default_identity, home_area,
            profile_completed_at, updated_at
          from public.profiles
          where profile_completed_at is not null
        ) as row_data
      ), '[]'::jsonb),
    'places',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.sort_order)
        from (
          select id, name, greek_name, type, area, x, y, lat, lng, pulse, mood, crowd,
            budget, best_time, tags, short, image_url, hotness, comment_count,
            recent_post_count, status, user_id, profile_id, created_by_identity,
            moderation_status, sort_order
          from public.places
          where moderation_status = 'published'
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
    'meet_events',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.starts_at)
        from (
          select id, place_id, user_id, profile_id, title, host_name, host_avatar_url, host_type,
            starts_at, duration_min, category, vibe, price, capacity, description, cover_url,
            tags, going_count, maybe_count, hot, attendee_avatar_urls, created_at
          from public.meet_events
          where moderation_status = 'published'
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
        select jsonb_agg(to_jsonb(row_data) order by row_data.position, row_data.created_at desc)
        from (
          select id, label, place_id, position, user_id, profile_id, kind, author_name,
            author_type, author_avatar_url, media_url, caption, expires_after_hours,
            crowd, parking, condition, created_at
          from public.stories
          where moderation_status = 'published'
            and (
              expires_after_hours is null
              or created_at > now() - make_interval(hours => expires_after_hours)
            )
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

commit;

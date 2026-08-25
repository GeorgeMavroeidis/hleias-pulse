begin;

-- Cultural events are a distinct content type from Meet gatherings: theater,
-- concerts, and festivals in Ilia, created either by the admin team or by a
-- verified "Organizer" account. Ticketing stays external (redirect only) --
-- no payment processing lives in this schema.

create table if not exists public.organizers (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  bio text not null default 'Cultural events organizer in Ilia.',
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cultural_events (
  id text primary key,
  title text not null,
  greek_title text not null,
  event_type text not null check (event_type in ('theater', 'concert', 'festival', 'other')),
  venue_name text not null,
  area text not null,
  place_id text references public.places(id) on update cascade on delete set null,
  lat double precision,
  lng double precision,
  event_date timestamptz not null,
  organizer_name text not null,
  organizer_id uuid references public.organizers(id) on delete set null,
  description_el text not null,
  description_en text,
  poster_url text not null,
  ticket_url text,
  is_past_event boolean not null default false,
  is_official boolean not null default false,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'published', 'hidden')),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cultural_events_status_date_idx
  on public.cultural_events (moderation_status, event_date);
create index if not exists cultural_events_place_id_idx
  on public.cultural_events (place_id) where place_id is not null;
create index if not exists cultural_events_organizer_id_idx
  on public.cultural_events (organizer_id) where organizer_id is not null;
create index if not exists organizers_verification_status_idx
  on public.organizers (verification_status);

drop trigger if exists set_organizers_updated_at on public.organizers;
create trigger set_organizers_updated_at
before update on public.organizers
for each row execute function public.set_updated_at();

drop trigger if exists set_cultural_events_updated_at on public.cultural_events;
create trigger set_cultural_events_updated_at
before update on public.cultural_events
for each row execute function public.set_updated_at();

-- Mirrors current_admin_role(): lets RLS check "is this caller a verified
-- organizer" without exposing the organizers table to the client.
create or replace function public.current_organizer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.organizers
  where user_id = auth.uid()
    and verification_status = 'verified'
  limit 1;
$$;

grant execute on function public.current_organizer_id() to authenticated;

-- A self-service applicant must never be able to flip their own
-- verification_status; only an Owner/Editor updating the row can.
create or replace function public.prevent_organizer_self_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verification_status is distinct from old.verification_status
    and not public.has_admin_role(array['owner', 'editor']) then
    raise exception 'Only an Owner or Editor can change verification status';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_organizer_self_verification on public.organizers;
create trigger guard_organizer_self_verification
before update on public.organizers
for each row execute function public.prevent_organizer_self_verification();

alter table public.organizers enable row level security;
alter table public.cultural_events enable row level security;

grant select, insert, update on public.organizers to authenticated;
grant select on public.cultural_events to anon, authenticated;
grant insert, update, delete on public.cultural_events to authenticated;

drop policy if exists "Users can read own organizer application" on public.organizers;
create policy "Users can read own organizer application"
on public.organizers for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Public can read verified organizers" on public.organizers;
create policy "Public can read verified organizers"
on public.organizers for select to anon, authenticated
using (verification_status = 'verified');

drop policy if exists "Admins can read all organizers" on public.organizers;
create policy "Admins can read all organizers"
on public.organizers for select to authenticated
using (public.has_admin_role(array['owner', 'editor', 'moderator']));

drop policy if exists "Users can apply to become an organizer" on public.organizers;
create policy "Users can apply to become an organizer"
on public.organizers for insert to authenticated
with check (user_id = (select auth.uid()) and verification_status = 'pending');

drop policy if exists "Users can update own organizer profile" on public.organizers;
create policy "Users can update own organizer profile"
on public.organizers for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Editors can manage organizers" on public.organizers;
create policy "Editors can manage organizers"
on public.organizers for all to authenticated
using (public.has_admin_role(array['owner', 'editor']))
with check (public.has_admin_role(array['owner', 'editor']));

drop policy if exists "Public can read published cultural events" on public.cultural_events;
create policy "Public can read published cultural events"
on public.cultural_events for select to anon, authenticated
using (moderation_status = 'published');

drop policy if exists "Users can read own cultural event submissions" on public.cultural_events;
create policy "Users can read own cultural event submissions"
on public.cultural_events for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Admins can read all cultural events" on public.cultural_events;
create policy "Admins can read all cultural events"
on public.cultural_events for select to authenticated
using (public.has_admin_role(array['owner', 'editor', 'moderator']));

drop policy if exists "Verified organizers can submit cultural events" on public.cultural_events;
create policy "Verified organizers can submit cultural events"
on public.cultural_events for insert to authenticated
with check (
  user_id = (select auth.uid())
  and organizer_id = public.current_organizer_id()
  and is_official = true
  and moderation_status = 'pending'
);

drop policy if exists "Organizers can update own pending cultural events" on public.cultural_events;
create policy "Organizers can update own pending cultural events"
on public.cultural_events for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and organizer_id = public.current_organizer_id()
  and moderation_status = 'pending'
);

drop policy if exists "Organizers can delete own pending cultural events" on public.cultural_events;
create policy "Organizers can delete own pending cultural events"
on public.cultural_events for delete to authenticated
using (user_id = (select auth.uid()) and moderation_status = 'pending');

drop policy if exists "Editors can manage cultural events" on public.cultural_events;
create policy "Editors can manage cultural events"
on public.cultural_events for all to authenticated
using (public.has_admin_role(array['owner', 'editor']))
with check (public.has_admin_role(array['owner', 'editor']));

drop trigger if exists audit_admin_cultural_events on public.cultural_events;
create trigger audit_admin_cultural_events after insert or update or delete on public.cultural_events
for each row execute function public.write_admin_audit_log();

-- Storage: organizers upload posters into their own folder of the existing
-- content-media bucket; admins already have bucket-wide access.
drop policy if exists "Organizers can upload cultural event posters" on storage.objects;
create policy "Organizers can upload cultural event posters"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'content-media'
  and name like 'cultural-events/' || (select auth.uid())::text || '/%'
  and public.current_organizer_id() is not null
);

drop policy if exists "Organizers can update own cultural event posters" on storage.objects;
create policy "Organizers can update own cultural event posters"
on storage.objects for update to authenticated
using (
  bucket_id = 'content-media'
  and name like 'cultural-events/' || (select auth.uid())::text || '/%'
)
with check (
  bucket_id = 'content-media'
  and name like 'cultural-events/' || (select auth.uid())::text || '/%'
);

drop policy if exists "Organizers can delete own cultural event posters" on storage.objects;
create policy "Organizers can delete own cultural event posters"
on storage.objects for delete to authenticated
using (
  bucket_id = 'content-media'
  and name like 'cultural-events/' || (select auth.uid())::text || '/%'
);

create or replace function public.moderate_content(
  target_type text,
  target_id text,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_role(array['owner', 'editor', 'moderator']) then
    raise exception 'Not authorized to moderate content';
  end if;
  if next_status not in ('published', 'hidden') then
    raise exception 'Invalid moderation status';
  end if;

  case target_type
    when 'place' then update public.places set moderation_status = next_status where id = target_id;
    when 'post' then update public.posts set moderation_status = next_status where id = target_id;
    when 'comment' then update public.comments set moderation_status = next_status where id = target_id::uuid;
    when 'story' then update public.stories set moderation_status = next_status where id = target_id;
    when 'meet_event' then update public.meet_events set moderation_status = next_status where id = target_id;
    when 'cultural_event' then update public.cultural_events set moderation_status = next_status where id = target_id;
    else raise exception 'Unsupported moderation target';
  end case;

  if not found then raise exception 'Content item not found'; end if;

  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'moderation_status_changed', target_type, target_id,
    jsonb_build_object('moderation_status', next_status));
end;
$$;

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
    'cultural_events',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.event_date)
        from (
          select id, title, greek_title, event_type, venue_name, area, place_id, lat, lng,
            event_date, organizer_name, organizer_id, description_el, description_en,
            poster_url, ticket_url, is_past_event, is_official, created_at
          from public.cultural_events
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

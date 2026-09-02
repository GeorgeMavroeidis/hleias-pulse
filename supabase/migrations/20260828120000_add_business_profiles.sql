begin;

-- Business Profile foundation (stage B1). Mirrors the "Organizer" pattern:
--   * businesses            -- a self-service applicant row an Owner/Editor
--                              verifies before it gains any capability.
--   * place_business_profiles -- a verified business "claims" an EXISTING place
--                              (never creates one) and enriches its public
--                              profile: opening hours (free text v1), a menu
--                              link, a phone number, a website, and photos.
-- No commerce lives here -- static deals and trackable coupons are later,
-- separate stages (B2 / B3).

create table if not exists public.businesses (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  bio text not null default 'Local business in Ilia.',
  contact_phone text,
  contact_email text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One claim row per (place, business). status drives visibility:
--   pending  -> awaiting admin review; editable by the owning business
--   approved -> public, shown on the place; locked to the business (admin edits)
--   rejected -> kept for history; does NOT block a fresh claim
create table if not exists public.place_business_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  place_id text not null references public.places(id) on update cascade on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  hours_text text,
  phone text,
  website_url text,
  menu_url text,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one live (pending OR approved) claim per place. A rejected claim is
-- excluded, so a place stays re-claimable after a rejection. This is what
-- blocks a second business from claiming an already-pending place.
create unique index if not exists place_business_profiles_active_place_idx
  on public.place_business_profiles (place_id)
  where status <> 'rejected';
create index if not exists place_business_profiles_business_idx
  on public.place_business_profiles (business_id);
create index if not exists place_business_profiles_status_idx
  on public.place_business_profiles (status);
create index if not exists businesses_verification_status_idx
  on public.businesses (verification_status);

drop trigger if exists set_businesses_updated_at on public.businesses;
create trigger set_businesses_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

drop trigger if exists set_place_business_profiles_updated_at on public.place_business_profiles;
create trigger set_place_business_profiles_updated_at
before update on public.place_business_profiles
for each row execute function public.set_updated_at();

-- Mirrors current_organizer_id(): lets RLS check "is this caller a verified
-- business" without exposing the businesses table to the client.
create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.businesses
  where user_id = auth.uid()
    and verification_status = 'verified'
  limit 1;
$$;

grant execute on function public.current_business_id() to authenticated;

-- A self-service applicant must never be able to flip their own
-- verification_status; only an Owner/Editor updating the row can.
create or replace function public.prevent_business_self_verification()
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

drop trigger if exists guard_business_self_verification on public.businesses;
create trigger guard_business_self_verification
before update on public.businesses
for each row execute function public.prevent_business_self_verification();

alter table public.businesses enable row level security;
alter table public.place_business_profiles enable row level security;

grant select, insert, update on public.businesses to authenticated;
grant select, insert, update on public.place_business_profiles to authenticated;
grant select on public.place_business_profiles to anon;

-- businesses policies (mirror organizers) ------------------------------------
drop policy if exists "Users can read own business application" on public.businesses;
create policy "Users can read own business application"
on public.businesses for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Public can read verified businesses" on public.businesses;
create policy "Public can read verified businesses"
on public.businesses for select to anon, authenticated
using (verification_status = 'verified');

drop policy if exists "Admins can read all businesses" on public.businesses;
create policy "Admins can read all businesses"
on public.businesses for select to authenticated
using (public.has_admin_role(array['owner', 'editor', 'moderator']));

drop policy if exists "Users can apply to become a business" on public.businesses;
create policy "Users can apply to become a business"
on public.businesses for insert to authenticated
with check (user_id = (select auth.uid()) and verification_status = 'pending');

drop policy if exists "Users can update own business profile" on public.businesses;
create policy "Users can update own business profile"
on public.businesses for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Editors can manage businesses" on public.businesses;
create policy "Editors can manage businesses"
on public.businesses for all to authenticated
using (public.has_admin_role(array['owner', 'editor']))
with check (public.has_admin_role(array['owner', 'editor']));

-- place_business_profiles policies -----------------------------------------
drop policy if exists "Public can read approved place business profiles"
  on public.place_business_profiles;
create policy "Public can read approved place business profiles"
on public.place_business_profiles for select to anon, authenticated
using (status = 'approved');

drop policy if exists "Business can read own claims" on public.place_business_profiles;
create policy "Business can read own claims"
on public.place_business_profiles for select to authenticated
using (business_id = public.current_business_id());

drop policy if exists "Admins can read all place business profiles"
  on public.place_business_profiles;
create policy "Admins can read all place business profiles"
on public.place_business_profiles for select to authenticated
using (public.has_admin_role(array['owner', 'editor', 'moderator']));

drop policy if exists "Business can submit a place claim" on public.place_business_profiles;
create policy "Business can submit a place claim"
on public.place_business_profiles for insert to authenticated
with check (business_id = public.current_business_id() and status = 'pending');

drop policy if exists "Business can edit own pending claim" on public.place_business_profiles;
create policy "Business can edit own pending claim"
on public.place_business_profiles for update to authenticated
using (business_id = public.current_business_id() and status = 'pending')
with check (business_id = public.current_business_id() and status = 'pending');

drop policy if exists "Editors can manage place business profiles"
  on public.place_business_profiles;
create policy "Editors can manage place business profiles"
on public.place_business_profiles for all to authenticated
using (public.has_admin_role(array['owner', 'editor']))
with check (public.has_admin_role(array['owner', 'editor']));

-- Admin review of a claim. Kept separate from moderate_content() so its status
-- vocabulary (pending/approved/rejected) stays independent of content
-- moderation (pending/published/hidden).
create or replace function public.review_place_claim(claim_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_role(array['owner', 'editor']) then
    raise exception 'Not authorized to review place claims';
  end if;
  if next_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid claim status';
  end if;

  update public.place_business_profiles
  set status = next_status
  where id = claim_id;

  if not found then raise exception 'Claim not found'; end if;

  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'place_claim_reviewed', 'place_business_profile', claim_id::text,
    jsonb_build_object('status', next_status));
end;
$$;

grant execute on function public.review_place_claim(uuid, text) to authenticated;

drop trigger if exists audit_admin_place_business_profiles on public.place_business_profiles;
create trigger audit_admin_place_business_profiles
after insert or update or delete on public.place_business_profiles
for each row execute function public.write_admin_audit_log();

-- Storage: business photos live in their own folder of the shared content-media
-- bucket; admins already have bucket-wide access (add_admin_dashboard).
drop policy if exists "Businesses can upload place photos" on storage.objects;
create policy "Businesses can upload place photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'content-media'
  and name like 'business-profiles/' || (select auth.uid())::text || '/%'
  and public.current_business_id() is not null
);

drop policy if exists "Businesses can update own place photos" on storage.objects;
create policy "Businesses can update own place photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'content-media'
  and name like 'business-profiles/' || (select auth.uid())::text || '/%'
)
with check (
  bucket_id = 'content-media'
  and name like 'business-profiles/' || (select auth.uid())::text || '/%'
);

drop policy if exists "Businesses can delete own place photos" on storage.objects;
create policy "Businesses can delete own place photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'content-media'
  and name like 'business-profiles/' || (select auth.uid())::text || '/%'
);

-- Extend the bootstrap payload with a lightweight list of place ids that carry
-- an approved business claim, so place cards can show a "claimed" badge without
-- an extra request per card. The full enrichment (hours / menu / phone /
-- photos / business name) is lazy-fetched only when a place detail opens.
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
          select target_type, place_id, post_id, route_id, cultural_event_id, author_name,
            author_kind, user_id, profile_id, posting_identity, text, sort_order
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
            poster_url, ticket_url, is_past_event, is_official, likes_count, created_at
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
      ), '[]'::jsonb),
    'claimed_place_ids',
      coalesce((
        select jsonb_agg(distinct pbp.place_id)
        from public.place_business_profiles pbp
        join public.places p on p.id = pbp.place_id
        where pbp.status = 'approved'
          and p.moderation_status = 'published'
      ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_pulse_bootstrap() to anon, authenticated;

commit;

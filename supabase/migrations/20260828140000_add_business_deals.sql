begin;

-- Stage B2: a single free-text "static deal" per claimed place. A verified
-- business with an APPROVED claim writes deal_text / deal_active; it shows as a
-- badge on the place card and a callout in the place detail. No commerce, no
-- redemption tracking -- the owner checks it manually ("show me your phone").
-- Multiple deals, expiry, categories, and coupon codes are B3, a separate table.

alter table public.place_business_profiles
  add column if not exists deal_text text,
  add column if not exists deal_active boolean not null default false;

-- 140-char cap, named so the migration is safely re-runnable.
alter table public.place_business_profiles
  drop constraint if exists place_business_profiles_deal_text_len;
alter table public.place_business_profiles
  add constraint place_business_profiles_deal_text_len
  check (deal_text is null or char_length(deal_text) <= 140);

-- The owning business manages the deal on its OWN approved claim, bypassing the
-- "pending only" lock that governs the rest of the row. Touches deal_text /
-- deal_active only; re-checks the 140-char cap (defence in depth alongside the
-- table CHECK).
create or replace function public.set_place_deal(
  claim_id uuid,
  deal_text text,
  deal_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_business uuid;
  claim_status text;
  cleaned text;
begin
  select business_id, status
    into owner_business, claim_status
  from public.place_business_profiles
  where id = claim_id;

  if not found then
    raise exception 'Claim not found';
  end if;
  if owner_business is distinct from public.current_business_id() then
    raise exception 'Not authorized to manage this deal';
  end if;
  if claim_status <> 'approved' then
    raise exception 'The place claim must be approved before adding a deal';
  end if;

  cleaned := nullif(btrim(set_place_deal.deal_text), '');
  if cleaned is not null and char_length(cleaned) > 140 then
    raise exception 'Deal text must be 140 characters or fewer';
  end if;

  update public.place_business_profiles
  set deal_text = cleaned,
      deal_active = set_place_deal.deal_active
  where id = claim_id;
end;
$$;

grant execute on function public.set_place_deal(uuid, text, boolean) to authenticated;

-- Bootstrap: a lightweight list of place ids that carry an ACTIVE deal, parallel
-- to claimed_place_ids, so place cards can badge a deal without a per-card
-- request. The deal text itself is lazy-fetched with the rest of the business
-- profile when a place detail opens.
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
      ), '[]'::jsonb),
    'deal_place_ids',
      coalesce((
        select jsonb_agg(distinct pbp.place_id)
        from public.place_business_profiles pbp
        join public.places p on p.id = pbp.place_id
        where pbp.status = 'approved'
          and pbp.deal_active
          and pbp.deal_text is not null
          and p.moderation_status = 'published'
      ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_pulse_bootstrap() to anon, authenticated;

commit;

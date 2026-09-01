begin;

-- Backward-compatible extension of the public bootstrap payload. Existing
-- clients ignore these extra JSON fields; Phase A uses them for freshness and
-- momentum without introducing a second data request.
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
            display_time, text, tags, likes_count, image_url, created_at, sort_order
          from public.posts
        ) as row_data
      ), '[]'::jsonb),
    'comments',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.sort_order)
        from (
          select target_type, place_id, post_id, route_id, author_name, author_kind, user_id,
            profile_id, posting_identity, text, created_at, sort_order
          from public.comments
        ) as row_data
      ), '[]'::jsonb),
    'events',
      coalesce((
        select jsonb_agg(to_jsonb(row_data) order by row_data.sort_order)
        from (
          select id, title, place_id, display_time, price, vibe, tags, created_at, sort_order
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

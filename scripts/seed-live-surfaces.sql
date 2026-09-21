-- Development/demo fixtures, rendered into supabase/seed.sql after places.
-- Source: 20260617161000; expiry contract: 20260907130000.
-- Relative times intentionally keep local demo content visible after each reset.

insert into public.stories (
  id, label, place_id, position, kind, author_name, author_type, author_avatar_url,
  media_url, caption, expires_after_hours, crowd, parking, condition, created_at, moderation_status
)
values
  (
    'story-kourouta', 'Kourouta', 'kourouta-beach', 0, 'report', 'Nikos', 'LOCAL',
    'https://i.pravatar.cc/120?img=12', '/story-feature/kourouta-online-story.jpg',
    'Filling up fast. Wind dropped, water is glassy. Parking already tight near the bars.',
    6, 'high', 'tight', array['clean', 'calm']::text[], now() - interval '14 minutes', 'published'
  ),
  (
    'story-kourouta-sunbeds', 'Kourouta', 'kourouta-beach', 1, 'beach_status', 'Maria', 'TOURIST',
    'https://i.pravatar.cc/120?img=32', '/story-feature/kourouta-online-story.jpg',
    'Sunbeds gone by 16:00. Free patch of sand left of the lifeguard tower.',
    6, 'high', 'full', array[]::text[], now() - interval '52 minutes', 'published'
  ),
  (
    'story-katakolo', 'Katakolo', 'katakolo-sunset', 2, 'photo', 'Eleni', 'EDITOR',
    'https://i.pravatar.cc/120?img=47', '/story-feature/katakolo-sunset-online-story.jpg',
    'Golden hour hitting the port lights. Walk the mole, not the promenade.',
    24, null, null, array[]::text[], now() - interval '22 minutes', 'published'
  ),
  (
    'story-olympia', 'Olympia', 'ancient-olympia', 3, 'editor_note', 'Eleni', 'EDITOR',
    'https://i.pravatar.cc/120?img=47', '/story-feature/ancient-olympia-online-story.jpg',
    'Go late afternoon. The light on the columns is the whole point. Skip midday.',
    24, null, null, array[]::text[], now() - interval '35 minutes', 'published'
  ),
  (
    'story-foloi', 'Foloi', 'foloi-forest', 4, 'editor_note', 'Nikos', 'LOCAL',
    'https://i.pravatar.cc/120?img=12', '/story-feature/foloi-oak-forest-online-story.jpg',
    'Bring water. No bins up here. Shade is unreal right now.',
    24, null, null, array[]::text[], now() - interval '40 minutes', 'published'
  ),
  (
    'story-kyllini', 'Kyllini', 'kyllini-beach', 5, 'beach_status', 'Andreas', 'BUSINESS',
    'https://i.pravatar.cc/120?img=58', '/story-feature/kyllini-beach-online-story.jpg',
    'Long open stretch, never feels packed. North end is the quieter bit.',
    6, 'medium', 'easy', array['clean']::text[], now() - interval '70 minutes', 'published'
  ),
  (
    'story-zacharo', 'Zacharo', 'zacharo-beach', 6, 'report', 'Nikos', 'LOCAL',
    'https://i.pravatar.cc/120?img=12', '/story-feature/zacharo-sunset-online-story.jpg',
    'Big sky, almost empty. Sand is hot, bring shoes. Sunset is the move.',
    6, 'low', 'easy', array['quiet', 'clean']::text[], now() - interval '18 minutes', 'published'
  ),
  (
    'story-andritsaina', 'Andritsaina', 'andritsaina', 7, 'editor_note', 'Eleni', 'EDITOR',
    'https://i.pravatar.cc/120?img=47', '/story-feature/andritsaina-online-story.jpg',
    'Cooler up here by evening. Stone lanes, slow food, cold beer.',
    24, null, null, array[]::text[], now() - interval '95 minutes', 'published'
  ),
  (
    'story-kakovatos', 'Kakovatos', 'kakovatos-beach', 8, 'report', 'Maria', 'TOURIST',
    'https://i.pravatar.cc/120?img=32', '/story-feature/kakovatos-beach-online-story.jpg',
    'Endless sand, barely anyone. The not-obvious-scene beach.',
    6, 'low', 'easy', array['quiet']::text[], now() - interval '28 minutes', 'published'
  ),
  (
    'story-kaiafas', 'Kaiafas', 'kaiafas-lake', 9, 'editor_note', 'Eleni', 'EDITOR',
    'https://i.pravatar.cc/120?img=47', '/story-feature/kaiafas-lake-sunset-online-story.jpg',
    'Pine, lake, and weird calm. Do the loop, then sunset ten minutes south.',
    24, null, null, array[]::text[], now() - interval '110 minutes', 'published'
  ),
  (
    'story-chlemoutsi', 'Chlemoutsi', 'chlemoutsi', 10, 'photo', 'Maria', 'TOURIST',
    'https://i.pravatar.cc/120?img=32', '/story-feature/chlemoutsi-castle-online-story.jpg',
    'Castle on the hill, Ionian on the horizon. Best at golden hour.',
    24, null, null, array[]::text[], now() - interval '160 minutes', 'published'
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
  going_count = excluded.seed_going_count + (select count(*) from public.event_rsvps where event_id = excluded.id and status = 'going'),
  maybe_count = excluded.seed_maybe_count + (select count(*) from public.event_rsvps where event_id = excluded.id and status = 'maybe'),
  hot = excluded.hot,
  attendee_avatar_urls = excluded.attendee_avatar_urls,
  moderation_status = excluded.moderation_status,
  updated_at = now();

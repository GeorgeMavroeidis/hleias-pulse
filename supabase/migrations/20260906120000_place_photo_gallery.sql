-- Place photo galleries.
--
-- Until now a place carried exactly one photo in `image_url`, so the admin had no
-- way to attach the several shots a location usually deserves. This adds an
-- ordered gallery alongside it.
--
-- `image_url` stays authoritative as the primary photo for every existing reader
-- (map markers, cards, the public app) — nothing outside the admin has to change.
-- The admin keeps `photos[1]` and `image_url` in step, so "make primary" is just a
-- reorder. Backfilling the existing single photo means no place starts out empty.
--
-- No policy is added or altered here: `places` already has its RLS policies and a
-- new column inherits them, so the per-table per-command policy counts are
-- unchanged by this migration.

alter table public.places
  add column if not exists photos text[] not null default '{}';

update public.places
   set photos = array[image_url]
 where cardinality(photos) = 0
   and coalesce(image_url, '') <> '';

comment on column public.places.photos is
  'Ordered gallery. photos[1] mirrors image_url, which stays the primary photo for all non-admin readers.';

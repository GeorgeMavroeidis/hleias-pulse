-- Follow-up to 20260827130000: correct the Traganos Carnival record and link
-- municipal cultural events to existing places. Written as guarded UPDATEs so it
-- also repairs a database where an earlier version of that seed (Traganos "27th"
-- / 2026-03-17, no place_id) was already applied. Every statement is re-run safe
-- and no new places are created.

begin;

-- 1. Traganos Carnival: 27th / 17 Mar -> 30th / 22 Feb 2026 (independently
--    confirmed). No-op once the corrected title is in place.
update public.cultural_events
set title = '30th Traganos Carnival Parade',
    greek_title = '30ό Τραγανέικο Καρναβάλι',
    event_date = (date '2026-02-22' + time '20:00') at time zone 'Europe/Athens'
where id = 'municipal-2026-traganos-carnival'
  and greek_title is distinct from '30ό Τραγανέικο Καρναβάλι';

-- 2. Link municipal events to a place that already exists (skips if the place is
--    absent or the event is already linked).
update public.cultural_events c
set place_id = 'kyllini-harbor'
where c.id = 'municipal-2026-saske-kyllini'
  and c.place_id is null
  and exists (select 1 from public.places p where p.id = 'kyllini-harbor');

update public.cultural_events c
set place_id = 'gastouni'
where c.id = 'municipal-2026-anthestiria-gastouni'
  and c.place_id is null
  and exists (select 1 from public.places p where p.id = 'gastouni');

update public.cultural_events c
set place_id = 'ancient-elis'
where c.id in (
    'municipal-2026-ilida-revue',
    'municipal-2026-ilida-antigone',
    'municipal-2026-ilida-full-moon'
  )
  and c.place_id is null
  and exists (select 1 from public.places p where p.id = 'ancient-elis');

-- 3. The older, pre-existing Ancient Ilida "Πλούτος" event (not a
--    municipal-2026-* id). Matches nothing if that event was never seeded.
update public.cultural_events c
set place_id = 'ancient-elis'
where c.id not like 'municipal-2026-%'
  and c.place_id is null
  and (
    c.greek_title ilike '%πλούτ%'
    or c.title ilike '%wealth%'
    or c.title ilike '%ploutos%'
    or c.title ilike '%plutus%'
  )
  and exists (select 1 from public.places p where p.id = 'ancient-elis');

commit;

-- Remove only the known synthetic post comments emitted before this change.
-- This is a frozen manifest from the 2597d97 seed, never derived from current
-- seed data or broad text/author matching. Unknown and user-owned rows survive.
-- Historical backfills changed author_kind and moderation metadata; these are
-- not provenance and deliberately do not limit the exact content fingerprint.
-- Do not rewrite counters: seeded place counts are not a tally of these rows.
-- Do not restore these fabricated public discussions on rollback.
with known_seed_comments(id, post_id, author_id, author_name, text, sort_order) as (
  values
    ('cd325a83-3669-4823-a33e-5e46cef562c9'::uuid, 'post-1', 'nikos', 'Nikos', 'parking is chaos after 21:00', 0),
    ('27dbbc79-7aab-47fc-abca-7f1c9938da1f'::uuid, 'post-1', 'maria', 'Maria', 'worth it tho', 1),
    ('e2c8d4a5-a035-4b36-9ef6-f2e8c188dab0'::uuid, 'post-1', 'eleni', 'Eleni', 'go before sunset, way calmer', 2),
    ('ef0e19f2-d414-400f-8a75-82c8f24aa3c8'::uuid, 'post-2', 'nikos', 'Nikos', 'parking is chaos after 21:00', 0),
    ('542d19ca-a605-474a-be05-12d858a8fdab'::uuid, 'post-2', 'maria', 'Maria', 'worth it tho', 1),
    ('9ff896f4-2c55-4e55-ac3a-f9eeaee18650'::uuid, 'post-2', 'eleni', 'Eleni', 'go before sunset, way calmer', 2),
    ('e7961ccf-70f1-4448-89e1-97f0701403c4'::uuid, 'post-3', 'nikos', 'Nikos', 'parking is chaos after 21:00', 0),
    ('db440b55-6794-47e2-9ce4-ba5c94134e53'::uuid, 'post-3', 'maria', 'Maria', 'worth it tho', 1),
    ('ac6a7e8c-0359-41f8-a14c-f04ebcf82ab6'::uuid, 'post-3', 'eleni', 'Eleni', 'go before sunset, way calmer', 2),
    ('f7b6d22d-0f3c-4647-899e-2b20251d154a'::uuid, 'post-4', 'nikos', 'Nikos', 'parking is chaos after 21:00', 0),
    ('fdd422c2-f431-46c0-a9b0-d0f51029a6bf'::uuid, 'post-4', 'maria', 'Maria', 'worth it tho', 1),
    ('e2ad7111-92c1-44af-91e1-e6c45f1bf95d'::uuid, 'post-4', 'eleni', 'Eleni', 'go before sunset, way calmer', 2),
    ('2b918237-43e4-4468-bcec-28366222fedb'::uuid, 'post-5', 'nikos', 'Nikos', 'parking is chaos after 21:00', 0),
    ('b42a81f3-2f34-4629-9f21-aeb56ce020d3'::uuid, 'post-5', 'maria', 'Maria', 'worth it tho', 1),
    ('16ecd7bd-09ab-4e06-b90a-47108a443e0f'::uuid, 'post-5', 'eleni', 'Eleni', 'go before sunset, way calmer', 2),
    ('77b6591e-9091-475d-aaa5-f93588e4fba1'::uuid, 'post-6', 'nikos', 'Nikos', 'parking is chaos after 21:00', 0),
    ('18eb1189-9ca3-4f25-a329-476199366533'::uuid, 'post-6', 'maria', 'Maria', 'worth it tho', 1),
    ('7f33e7df-b73a-4e2f-ac6e-5c90fd7dced1'::uuid, 'post-7', 'nikos', 'Nikos', 'parking is chaos after 21:00', 0),
    ('d37cada1-83f7-483e-a5f5-d2649f46cceb'::uuid, 'post-7', 'maria', 'Maria', 'worth it tho', 1),
    ('69070050-93ac-4ea8-a289-652727f3381b'::uuid, 'post-7', 'eleni', 'Eleni', 'go before sunset, way calmer', 2),
    ('52a3f469-97ff-4da0-a288-0118babd0105'::uuid, 'post-8', 'nikos', 'Nikos', 'parking is chaos after 21:00', 0),
    ('b2d8fbfe-c31e-48f3-8653-dbbe0a94638e'::uuid, 'post-8', 'maria', 'Maria', 'worth it tho', 1),
    ('fd8c6ce8-c3a1-4620-9a77-456af0f26990'::uuid, 'post-8', 'eleni', 'Eleni', 'go before sunset, way calmer', 2)
)
delete from public.comments as comment
using known_seed_comments as seed
where comment.id = seed.id
  and comment.target_type = 'post'
  and comment.post_id = seed.post_id
  and comment.author_id = seed.author_id
  and comment.author_name = seed.author_name
  and comment.text = seed.text
  and comment.user_id is null
  and comment.profile_id is null
  and comment.place_id is null
  and comment.route_id is null
  and comment.cultural_event_id is null;

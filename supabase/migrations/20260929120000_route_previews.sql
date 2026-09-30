alter table public.routes
  add column routing_profile text not null default 'driving-car' check (routing_profile in ('driving-car', 'foot-walking')),
  add column route_geometry jsonb,
  add column route_distance_m integer check (route_distance_m is null or route_distance_m >= 0),
  add column route_duration_s integer check (route_duration_s is null or route_duration_s >= 0),
  add column route_input_hash text,
  add column route_generated_at timestamptz;

comment on column public.routes.route_geometry is 'Cached GeoJSON LineString returned by the authenticated route-preview Edge Function.';

-- Keep a preview internally consistent. Existing routes have all five values
-- NULL, so this does not change the historical rows.
alter table public.routes add constraint routes_preview_complete_check check (
  (route_geometry is null and route_distance_m is null and route_duration_s is null
    and route_input_hash is null and route_generated_at is null)
  or
  ((route_geometry is not null and route_distance_m is not null and route_duration_s is not null
    and route_input_hash ~ '^[0-9a-f]{16}$' and route_generated_at is not null
    and route_geometry->>'type' = 'LineString'
    and jsonb_typeof(route_geometry->'coordinates') = 'array'
    and jsonb_array_length(route_geometry->'coordinates') between 2 and 20000) is true)
);

-- A route preview can contain 20,000 coordinates. The existing admin audit
-- trigger stores complete before/after rows; copying derived geometry into
-- each audit entry would multiply storage on save and invalidation. Keep every
-- editorial field, actor, action, and the preview's hash/metrics/timestamp.
create or replace function private.write_admin_audit_log()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  row_id text;
  before_row jsonb;
  after_row jsonb;
begin
  if not public.has_admin_role(array['owner', 'editor']) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    row_id := old.id::text;
    before_row := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    row_id := new.id::text;
    after_row := to_jsonb(new);
  else
    row_id := new.id::text;
    before_row := to_jsonb(old);
    after_row := to_jsonb(new);
  end if;
  if tg_table_name = 'routes' then
    before_row := before_row - 'route_geometry';
    after_row := after_row - 'route_geometry';
  end if;
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), lower(tg_op), tg_table_name, row_id,
    jsonb_build_object('before', before_row, 'after', after_row)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Direct Data API edits can change the travel mode without going through the
-- atomic route RPC. A preview built for the previous mode must not survive.
-- The RPC restores a matching new preview in its final UPDATE statement.
create or replace function private.invalidate_route_preview_from_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.route_geometry := null;
  new.route_distance_m := null;
  new.route_duration_s := null;
  new.route_input_hash := null;
  new.route_generated_at := null;
  return new;
end;
$$;

create trigger invalidate_route_preview_on_profile_change
before update of routing_profile on public.routes
for each row
when (old.routing_profile is distinct from new.routing_profile)
execute function private.invalidate_route_preview_from_profile();

revoke execute on function private.invalidate_route_preview_from_profile()
  from public, anon, authenticated, service_role;

-- A caller may still use the older direct route_stops API. Any such edit must
-- discard geometry computed against the previous ordered list. The atomic RPC
-- below restores its new preview after replacing the stops in the same call.
create or replace function private.invalidate_route_preview_from_stop()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.routes
    set route_geometry = null, route_distance_m = null, route_duration_s = null,
        route_input_hash = null, route_generated_at = null
    where id = new.route_id and route_input_hash is not null;
    return new;
  elsif tg_op = 'DELETE' then
    update public.routes
    set route_geometry = null, route_distance_m = null, route_duration_s = null,
        route_input_hash = null, route_generated_at = null
    where id = old.route_id and route_input_hash is not null;
    return old;
  end if;
  update public.routes
  set route_geometry = null, route_distance_m = null, route_duration_s = null,
      route_input_hash = null, route_generated_at = null
  where id in (old.route_id, new.route_id) and route_input_hash is not null;
  return new;
end;
$$;

create trigger invalidate_route_preview_on_stop_change
after insert or delete or update of route_id, position, place_id on public.route_stops
for each row execute function private.invalidate_route_preview_from_stop();

-- A moved place changes the actual route inputs even if the editor never opens
-- that route. Invalidate every itinerary referring to the place immediately.
create or replace function private.invalidate_route_preview_from_place()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.routes
  set route_geometry = null,
      route_distance_m = null,
      route_duration_s = null,
      route_input_hash = null,
      route_generated_at = null
  where id in (select route_id from public.route_stops where place_id = new.id)
    and route_input_hash is not null;
  return new;
end;
$$;

create trigger invalidate_route_preview_on_place_move
after update of lat, lng on public.places
for each row
when (old.lat is distinct from new.lat or old.lng is distinct from new.lng)
execute function private.invalidate_route_preview_from_place();

revoke execute on function private.invalidate_route_preview_from_stop(),
  private.invalidate_route_preview_from_place() from public, anon, authenticated, service_role;

-- This RPC runs as its caller: ordinary table grants, RLS, restrictive
-- real-account policies, and the admin audit triggers all still apply. A
-- rejected stop rolls the route upsert back because one RPC is one statement.
create or replace function public.save_admin_route_with_stops(
  route_payload jsonb, stops_payload jsonb,
  preview_coordinates jsonb, preview_profile text
)
returns public.routes
language plpgsql security invoker set search_path = ''
as $$
declare
  v_route_id text;
  stop jsonb;
  expected_position integer := 0;
  saved public.routes%rowtype;
  preview_geometry jsonb;
  actual_coordinates jsonb;
begin
  if auth.uid() is null
    or (auth.jwt()->>'is_anonymous') = 'true'
    or not public.has_admin_role(array['owner', 'editor']) then
    raise exception 'Owner or editor account required' using errcode = '42501';
  end if;
  if jsonb_typeof(route_payload) is distinct from 'object'
    or jsonb_typeof(stops_payload) is distinct from 'array' then
    raise exception 'Route and stops must be JSON objects/arrays' using errcode = '22023';
  end if;
  v_route_id := route_payload->>'id';
  if v_route_id is null or btrim(v_route_id) = '' then
    raise exception 'Route id is required' using errcode = '22023';
  end if;
  if jsonb_array_length(stops_payload) > 50 then
    raise exception 'A route may have at most 50 stops' using errcode = '22023';
  end if;

  -- FOR SHARE conflicts with a concurrent coordinate UPDATE, so a move that
  -- lands after these locks invalidates the saved preview after commit.
  perform p.id
  from public.places p
  join (
    select distinct item->>'place_id' as place_id
    from jsonb_array_elements(stops_payload) as elements(item)
  ) s on s.place_id = p.id
  order by p.id
  for share of p;

  preview_geometry := nullif(route_payload->'route_geometry', 'null'::jsonb);
  if preview_geometry is not null then
    if preview_profile is distinct from coalesce(route_payload->>'routing_profile', 'driving-car')
      or jsonb_typeof(preview_coordinates) is distinct from 'array' then
      raise exception 'Route preview profile or coordinates are missing'
        using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(jsonb_build_array(p.lng, p.lat) order by s.position), '[]'::jsonb)
      into actual_coordinates
    from jsonb_to_recordset(stops_payload) as s(position integer, place_id text)
    join public.places p on p.id = s.place_id;
    if preview_coordinates is distinct from actual_coordinates then
      raise exception 'Route preview inputs changed; reload places and retry'
        using errcode = '22023';
    end if;
  end if;

  -- Only these editorial fields are writable through the RPC. Existing author
  -- and engagement counts are never replaced with potentially stale UI data.
  insert into public.routes as r (
    id, title, author_id, lede, duration, budget, tags, image_url,
    sort_order, routing_profile
  ) values (
    v_route_id,
    route_payload->>'title',
    route_payload->>'author_id',
    route_payload->>'lede',
    route_payload->>'duration',
    route_payload->>'budget',
    array(select jsonb_array_elements_text(coalesce(route_payload->'tags', '[]'::jsonb))),
    route_payload->>'image_url',
    coalesce((route_payload->>'sort_order')::integer, 0),
    coalesce(route_payload->>'routing_profile', 'driving-car')
  )
  on conflict (id) do update set
    title = excluded.title,
    lede = excluded.lede,
    duration = excluded.duration,
    budget = excluded.budget,
    tags = excluded.tags,
    image_url = excluded.image_url,
    sort_order = excluded.sort_order,
    routing_profile = excluded.routing_profile;

  delete from public.route_stops where route_id = v_route_id;
  for stop in
    select item from jsonb_array_elements(stops_payload) as elements(item)
    order by (item->>'position')::integer
  loop
    if jsonb_typeof(stop) is distinct from 'object'
      or (stop->>'position')::integer is distinct from expected_position
      or coalesce(stop->>'route_id', v_route_id) <> v_route_id then
      raise exception 'Stops must have unique contiguous positions for this route'
        using errcode = '22023';
    end if;
    insert into public.route_stops (route_id, position, display_time, place_id, title, body)
    values (
      v_route_id, expected_position, stop->>'display_time', stop->>'place_id',
      stop->>'title', stop->>'body'
    );
    expected_position := expected_position + 1;
  end loop;

  if preview_geometry is not null and expected_position < 2 then
    raise exception 'A preview requires at least two stops' using errcode = '22023';
  end if;
  update public.routes r
  set route_geometry = preview_geometry,
      route_distance_m = (route_payload->>'route_distance_m')::integer,
      route_duration_s = (route_payload->>'route_duration_s')::integer,
      route_input_hash = route_payload->>'route_input_hash',
      route_generated_at = (route_payload->>'route_generated_at')::timestamptz
  where r.id = v_route_id
  returning r.* into saved;
  return saved;
end;
$$;

revoke execute on function public.save_admin_route_with_stops(jsonb, jsonb, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_admin_route_with_stops(jsonb, jsonb, jsonb, text) to authenticated;

-- One global ledger covers every editor. The function serializes claims, prunes
-- entries older than 24 hours, and never holds more than 500 current rows.
create table private.route_preview_requests (
  id bigint generated always as identity primary key,
  requested_at timestamptz not null default clock_timestamp()
);
create index route_preview_requests_requested_at_idx
  on private.route_preview_requests (requested_at);
alter table private.route_preview_requests enable row level security;
revoke all on table private.route_preview_requests
  from public, anon, authenticated, service_role;
revoke all on sequence private.route_preview_requests_id_seq
  from public, anon, authenticated, service_role;

create or replace function public.claim_route_preview_quota()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  claimed_at timestamptz;
  recent_minute bigint;
  recent_day bigint;
begin
  if auth.uid() is null
    or (auth.jwt()->>'is_anonymous') = 'true'
    or not public.has_admin_role(array['owner', 'editor']) then
    raise exception 'Owner or editor account required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20260929, 9173);
  claimed_at := clock_timestamp();
  delete from private.route_preview_requests
  where requested_at <= claimed_at - interval '24 hours';
  select count(*) filter (where requested_at > claimed_at - interval '1 minute'),
         count(*)
    into recent_minute, recent_day
  from private.route_preview_requests;
  if recent_minute >= 20 or recent_day >= 500 then
    return false;
  end if;
  insert into private.route_preview_requests (requested_at) values (claimed_at);
  return true;
end;
$$;

revoke execute on function public.claim_route_preview_quota()
  from public, anon, authenticated, service_role;
grant execute on function public.claim_route_preview_quota() to authenticated;

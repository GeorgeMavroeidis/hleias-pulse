alter table public.routes
  add column routing_profile text not null default 'driving-car' check (routing_profile in ('driving-car', 'foot-walking')),
  add column route_geometry jsonb,
  add column route_distance_m integer check (route_distance_m is null or route_distance_m >= 0),
  add column route_duration_s integer check (route_duration_s is null or route_duration_s >= 0),
  add column route_input_hash text,
  add column route_generated_at timestamptz;

comment on column public.routes.route_geometry is 'Cached GeoJSON LineString returned by the authenticated route-preview Edge Function.';

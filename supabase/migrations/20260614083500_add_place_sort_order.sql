alter table public.places
add column sort_order integer not null default 0;

create index places_sort_order_idx on public.places (sort_order);


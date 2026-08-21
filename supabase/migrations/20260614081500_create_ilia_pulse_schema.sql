create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.authors (
  id text primary key,
  name text not null,
  type text not null check (type in ('LOCAL EDITOR', 'LOCAL', 'TOURIST', 'BUSINESS', 'EVENT', 'EDITOR')),
  avatar_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.places (
  id text primary key,
  name text not null,
  greek_name text not null,
  type text not null check (type in ('beach', 'culture', 'nature', 'food', 'local', 'village', 'night', 'sunset')),
  area text not null,
  x double precision not null,
  y double precision not null,
  lat double precision not null,
  lng double precision not null,
  pulse integer not null check (pulse >= 0 and pulse <= 10),
  mood text not null,
  crowd text not null,
  budget text not null,
  best_time text not null,
  tags text[] not null default '{}',
  short text not null,
  image_url text not null,
  hotness integer not null check (hotness >= 0 and hotness <= 10),
  comment_count integer not null default 0 check (comment_count >= 0),
  recent_post_count integer not null default 0 check (recent_post_count >= 0),
  status text not null check (status in ('quiet', 'active', 'popular', 'busy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.place_avatars (
  place_id text not null references public.places(id) on delete cascade,
  position integer not null check (position >= 0),
  avatar_url text not null,
  primary key (place_id, position)
);

create table public.posts (
  id text primary key,
  author_id text not null references public.authors(id) on update cascade,
  place_id text not null references public.places(id) on update cascade on delete restrict,
  kind text not null check (kind in ('spot', 'tip', 'event', 'photo')),
  display_time text not null,
  text text not null,
  tags text[] not null default '{}',
  likes_count integer not null default 0 check (likes_count >= 0),
  image_url text not null,
  user_id uuid references auth.users(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id text primary key,
  title text not null,
  place_id text not null references public.places(id) on update cascade on delete restrict,
  display_time text not null,
  price text not null,
  vibe text not null,
  tags text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routes (
  id text primary key,
  title text not null,
  author_id text not null references public.authors(id) on update cascade,
  lede text not null,
  duration text not null,
  budget text not null,
  tags text[] not null default '{}',
  image_url text not null,
  comment_count integer not null default 0 check (comment_count >= 0),
  saves_count integer not null default 0 check (saves_count >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.route_stops (
  route_id text not null references public.routes(id) on update cascade on delete cascade,
  position integer not null check (position >= 0),
  display_time text not null,
  place_id text not null references public.places(id) on update cascade on delete restrict,
  title text not null,
  body text not null,
  primary key (route_id, position)
);

create table public.comments (
  id uuid primary key default extensions.gen_random_uuid(),
  target_type text not null check (target_type in ('place', 'post', 'route')),
  place_id text references public.places(id) on update cascade on delete cascade,
  post_id text references public.posts(id) on update cascade on delete cascade,
  route_id text references public.routes(id) on update cascade on delete cascade,
  author_id text references public.authors(id) on update cascade on delete set null,
  author_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_one_target check (
    (target_type = 'place' and place_id is not null and post_id is null and route_id is null)
    or (target_type = 'post' and post_id is not null and place_id is null and route_id is null)
    or (target_type = 'route' and route_id is not null and place_id is null and post_id is null)
  )
);

create table public.stories (
  id text primary key,
  label text not null,
  place_id text not null references public.places(id) on update cascade on delete cascade,
  position integer not null unique check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vibe_chips (
  id text primary key,
  label text not null,
  position integer not null unique check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.saved_items (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('place', 'post', 'route')),
  place_id text references public.places(id) on update cascade on delete cascade,
  post_id text references public.posts(id) on update cascade on delete cascade,
  route_id text references public.routes(id) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_items_one_target check (
    (target_type = 'place' and place_id is not null and post_id is null and route_id is null)
    or (target_type = 'post' and post_id is not null and place_id is null and route_id is null)
    or (target_type = 'route' and route_id is not null and place_id is null and post_id is null)
  )
);

create table public.post_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id text not null references public.posts(id) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create unique index saved_items_user_place_unique
  on public.saved_items (user_id, place_id)
  where target_type = 'place';

create unique index saved_items_user_post_unique
  on public.saved_items (user_id, post_id)
  where target_type = 'post';

create unique index saved_items_user_route_unique
  on public.saved_items (user_id, route_id)
  where target_type = 'route';

create index posts_place_id_idx on public.posts (place_id);
create index posts_author_id_idx on public.posts (author_id);
create index posts_created_at_idx on public.posts (created_at desc);
create index comments_place_id_idx on public.comments (place_id) where place_id is not null;
create index comments_post_id_idx on public.comments (post_id) where post_id is not null;
create index comments_route_id_idx on public.comments (route_id) where route_id is not null;
create index events_place_id_idx on public.events (place_id);
create index route_stops_place_id_idx on public.route_stops (place_id);
create index post_likes_post_id_idx on public.post_likes (post_id);

create trigger set_authors_updated_at
before update on public.authors
for each row execute function public.set_updated_at();

create trigger set_places_updated_at
before update on public.places
for each row execute function public.set_updated_at();

create trigger set_posts_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

create trigger set_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger set_routes_updated_at
before update on public.routes
for each row execute function public.set_updated_at();

create trigger set_comments_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

create trigger set_stories_updated_at
before update on public.stories
for each row execute function public.set_updated_at();

create trigger set_vibe_chips_updated_at
before update on public.vibe_chips
for each row execute function public.set_updated_at();

alter table public.authors enable row level security;
alter table public.places enable row level security;
alter table public.place_avatars enable row level security;
alter table public.posts enable row level security;
alter table public.events enable row level security;
alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.comments enable row level security;
alter table public.stories enable row level security;
alter table public.vibe_chips enable row level security;
alter table public.saved_items enable row level security;
alter table public.post_likes enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.authors, public.places, public.place_avatars, public.posts, public.events,
  public.routes, public.route_stops, public.comments, public.stories, public.vibe_chips
  to anon, authenticated;
grant insert, update, delete on public.posts, public.comments to authenticated;
grant select, insert, delete on public.saved_items, public.post_likes to authenticated;

create policy "Public can read authors"
on public.authors for select to anon, authenticated
using (true);

create policy "Public can read places"
on public.places for select to anon, authenticated
using (true);

create policy "Public can read place avatars"
on public.place_avatars for select to anon, authenticated
using (true);

create policy "Public can read posts"
on public.posts for select to anon, authenticated
using (true);

create policy "Authenticated users can create posts"
on public.posts for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update own posts"
on public.posts for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete own posts"
on public.posts for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Public can read events"
on public.events for select to anon, authenticated
using (true);

create policy "Public can read routes"
on public.routes for select to anon, authenticated
using (true);

create policy "Public can read route stops"
on public.route_stops for select to anon, authenticated
using (true);

create policy "Public can read comments"
on public.comments for select to anon, authenticated
using (true);

create policy "Authenticated users can create comments"
on public.comments for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update own comments"
on public.comments for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete own comments"
on public.comments for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Public can read stories"
on public.stories for select to anon, authenticated
using (true);

create policy "Public can read vibe chips"
on public.vibe_chips for select to anon, authenticated
using (true);

create policy "Users can read own saved items"
on public.saved_items for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create own saved items"
on public.saved_items for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can delete own saved items"
on public.saved_items for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Users can read own post likes"
on public.post_likes for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create own post likes"
on public.post_likes for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can delete own post likes"
on public.post_likes for delete to authenticated
using (user_id = (select auth.uid()));


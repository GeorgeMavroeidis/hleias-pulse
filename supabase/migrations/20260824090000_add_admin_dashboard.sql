begin;

-- Team membership is intentionally separate from public profiles. A signed-in
-- user must be explicitly promoted by an existing owner before gaining access.
create table if not exists public.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'moderator')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_entity_idx
  on public.admin_audit_logs (entity_type, entity_id);

drop trigger if exists set_admin_members_updated_at on public.admin_members;
create trigger set_admin_members_updated_at
before update on public.admin_members
for each row execute function public.set_updated_at();

-- These functions bypass RLS only to read the caller's own membership. They do
-- not expose membership data to the client and are safe to use inside policies.
create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.admin_members
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.has_admin_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_members
    where user_id = auth.uid()
      and role = any(required_roles)
  );
$$;

grant execute on function public.current_admin_role() to authenticated;
grant execute on function public.has_admin_role(text[]) to authenticated;

create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner'
    and (tg_op = 'DELETE' or new.role <> 'owner')
    and (select count(*) from public.admin_members where role = 'owner') <= 1 then
    raise exception 'At least one owner must remain on the admin team';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists prevent_last_admin_owner on public.admin_members;
create trigger prevent_last_admin_owner
before update or delete on public.admin_members
for each row execute function public.prevent_last_owner_removal();

alter table public.admin_members enable row level security;
alter table public.admin_audit_logs enable row level security;

grant select on public.admin_members to authenticated;
grant insert, update, delete on public.admin_members to authenticated;
grant select on public.admin_audit_logs to authenticated;

create policy "Admin members can read their membership"
on public.admin_members for select to authenticated
using (user_id = (select auth.uid()) or public.has_admin_role(array['owner']));

create policy "Owners can add team members"
on public.admin_members for insert to authenticated
with check (public.has_admin_role(array['owner']));

create policy "Owners can update team members"
on public.admin_members for update to authenticated
using (public.has_admin_role(array['owner']))
with check (public.has_admin_role(array['owner']));

create policy "Owners can remove team members"
on public.admin_members for delete to authenticated
using (public.has_admin_role(array['owner']));

create policy "Admins can read audit logs"
on public.admin_audit_logs for select to authenticated
using (public.has_admin_role(array['owner', 'editor', 'moderator']));

-- Content supplied by normal users is reviewable before it is public. Existing
-- records are retained as published content during the migration.
alter table public.posts add column if not exists moderation_status text;
alter table public.comments add column if not exists moderation_status text;
update public.posts set moderation_status = 'published' where moderation_status is null;
update public.comments set moderation_status = 'published' where moderation_status is null;
alter table public.posts alter column moderation_status set default 'pending';
alter table public.comments alter column moderation_status set default 'pending';
alter table public.posts alter column moderation_status set not null;
alter table public.comments alter column moderation_status set not null;
alter table public.places alter column moderation_status set default 'pending';
alter table public.stories alter column moderation_status set default 'pending';
alter table public.meet_events alter column moderation_status set default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_moderation_status_check') then
    alter table public.posts add constraint posts_moderation_status_check
      check (moderation_status in ('pending', 'published', 'hidden'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comments_moderation_status_check') then
    alter table public.comments add constraint comments_moderation_status_check
      check (moderation_status in ('pending', 'published', 'hidden'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'places_moderation_status_check') then
    alter table public.places add constraint places_moderation_status_check
      check (moderation_status in ('pending', 'published', 'hidden'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stories_moderation_status_check') then
    alter table public.stories add constraint stories_moderation_status_check
      check (moderation_status in ('pending', 'published', 'hidden'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'meet_events_moderation_status_check') then
    alter table public.meet_events add constraint meet_events_moderation_status_check
      check (moderation_status in ('pending', 'published', 'hidden'));
  end if;
end;
$$;

create index if not exists posts_moderation_status_idx on public.posts (moderation_status, created_at desc);
create index if not exists comments_moderation_status_idx on public.comments (moderation_status, created_at desc);
create index if not exists places_moderation_status_idx on public.places (moderation_status, updated_at desc);
create index if not exists stories_moderation_status_idx on public.stories (moderation_status, created_at desc);
create index if not exists meet_events_moderation_status_idx on public.meet_events (moderation_status, starts_at);

-- Public readers receive only published material. Administrators get a separate
-- policy for their workspace; the public bootstrap RPC will still filter by
-- status explicitly in a follow-up function replacement.
drop policy if exists "Public can read places" on public.places;
create policy "Public can read published places"
on public.places for select to anon, authenticated
using (moderation_status = 'published');

drop policy if exists "Public can read posts" on public.posts;
create policy "Public can read published posts"
on public.posts for select to anon, authenticated
using (moderation_status = 'published');

drop policy if exists "Public can read comments" on public.comments;
create policy "Public can read published comments"
on public.comments for select to anon, authenticated
using (moderation_status = 'published');

drop policy if exists "Public can read stories" on public.stories;
create policy "Public can read published stories"
on public.stories for select to anon, authenticated
using (moderation_status = 'published');

drop policy if exists "Public can read meet events" on public.meet_events;
create policy "Public can read published meet events"
on public.meet_events for select to anon, authenticated
using (moderation_status = 'published');

-- Users can keep working on their own submissions but can never publish or
-- unhide them by choosing a value in a browser request.
drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can submit posts"
on public.posts for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);
drop policy if exists "Users can update own posts" on public.posts;
create policy "Users can update own pending posts"
on public.posts for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

drop policy if exists "Authenticated users can create comments" on public.comments;
create policy "Authenticated users can submit comments"
on public.comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);
drop policy if exists "Users can update own comments" on public.comments;
create policy "Users can update own pending comments"
on public.comments for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

drop policy if exists "Authenticated users can create places" on public.places;
create policy "Authenticated users can submit places"
on public.places for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);
drop policy if exists "Users can update own places" on public.places;
create policy "Users can update own pending places"
on public.places for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

drop policy if exists "Authenticated users can create own stories" on public.stories;
create policy "Authenticated users can submit stories"
on public.stories for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);
drop policy if exists "Users can update own stories" on public.stories;
create policy "Users can update own pending stories"
on public.stories for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

drop policy if exists "Authenticated users can create meet events" on public.meet_events;
create policy "Authenticated users can submit meet events"
on public.meet_events for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);
drop policy if exists "Users can update own meet events" on public.meet_events;
create policy "Users can update own pending meet events"
on public.meet_events for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (profile_id is null or profile_id = (select auth.uid()))
  and moderation_status = 'pending'
);

-- Owner/editor can manage editorial data. Moderator actions deliberately go
-- through the RPC below so their database permission is limited to status
-- changes, not arbitrary edits.
create policy "Admins can read all places"
on public.places for select to authenticated
using (public.has_admin_role(array['owner', 'editor', 'moderator']));
create policy "Admins can read all posts"
on public.posts for select to authenticated
using (public.has_admin_role(array['owner', 'editor', 'moderator']));
create policy "Admins can read all comments"
on public.comments for select to authenticated
using (public.has_admin_role(array['owner', 'editor', 'moderator']));
create policy "Admins can read all stories"
on public.stories for select to authenticated
using (public.has_admin_role(array['owner', 'editor', 'moderator']));
create policy "Admins can read all meet events"
on public.meet_events for select to authenticated
using (public.has_admin_role(array['owner', 'editor', 'moderator']));

create policy "Editors can manage places"
on public.places for all to authenticated
using (public.has_admin_role(array['owner', 'editor']))
with check (public.has_admin_role(array['owner', 'editor']));
create policy "Editors can manage posts"
on public.posts for all to authenticated
using (public.has_admin_role(array['owner', 'editor']))
with check (public.has_admin_role(array['owner', 'editor']));
create policy "Editors can manage comments"
on public.comments for all to authenticated
using (public.has_admin_role(array['owner', 'editor']))
with check (public.has_admin_role(array['owner', 'editor']));
create policy "Editors can manage stories"
on public.stories for all to authenticated
using (public.has_admin_role(array['owner', 'editor']))
with check (public.has_admin_role(array['owner', 'editor']));
create policy "Editors can manage meet events"
on public.meet_events for all to authenticated
using (public.has_admin_role(array['owner', 'editor']))
with check (public.has_admin_role(array['owner', 'editor']));
create policy "Editors can manage routes"
on public.routes for all to authenticated
using (public.has_admin_role(array['owner', 'editor']))
with check (public.has_admin_role(array['owner', 'editor']));
create policy "Editors can manage route stops"
on public.route_stops for all to authenticated
using (public.has_admin_role(array['owner', 'editor']))
with check (public.has_admin_role(array['owner', 'editor']));

grant insert, update, delete on public.routes, public.route_stops to authenticated;

create or replace function public.moderate_content(
  target_type text,
  target_id text,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_role(array['owner', 'editor', 'moderator']) then
    raise exception 'Not authorized to moderate content';
  end if;
  if next_status not in ('published', 'hidden') then
    raise exception 'Invalid moderation status';
  end if;

  case target_type
    when 'place' then update public.places set moderation_status = next_status where id = target_id;
    when 'post' then update public.posts set moderation_status = next_status where id = target_id;
    when 'comment' then update public.comments set moderation_status = next_status where id = target_id::uuid;
    when 'story' then update public.stories set moderation_status = next_status where id = target_id;
    when 'meet_event' then update public.meet_events set moderation_status = next_status where id = target_id;
    else raise exception 'Unsupported moderation target';
  end case;

  if not found then raise exception 'Content item not found'; end if;

  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'moderation_status_changed', target_type, target_id,
    jsonb_build_object('moderation_status', next_status));
end;
$$;

grant execute on function public.moderate_content(text, text, text) to authenticated;

create or replace function public.write_admin_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id text;
begin
  if not public.has_admin_role(array['owner', 'editor']) then
    return coalesce(new, old);
  end if;
  row_id := coalesce(new.id::text, old.id::text);
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    row_id,
    jsonb_build_object('before', case when tg_op = 'INSERT' then null else to_jsonb(old) end,
                       'after', case when tg_op = 'DELETE' then null else to_jsonb(new) end)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_admin_places on public.places;
create trigger audit_admin_places after insert or update or delete on public.places
for each row execute function public.write_admin_audit_log();
drop trigger if exists audit_admin_posts on public.posts;
create trigger audit_admin_posts after insert or update or delete on public.posts
for each row execute function public.write_admin_audit_log();
drop trigger if exists audit_admin_comments on public.comments;
create trigger audit_admin_comments after insert or update or delete on public.comments
for each row execute function public.write_admin_audit_log();
drop trigger if exists audit_admin_stories on public.stories;
create trigger audit_admin_stories after insert or update or delete on public.stories
for each row execute function public.write_admin_audit_log();
drop trigger if exists audit_admin_meet_events on public.meet_events;
create trigger audit_admin_meet_events after insert or update or delete on public.meet_events
for each row execute function public.write_admin_audit_log();
drop trigger if exists audit_admin_routes on public.routes;
create trigger audit_admin_routes after insert or update or delete on public.routes
for each row execute function public.write_admin_audit_log();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-media',
  'content-media',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

drop policy if exists "Content media is publicly readable" on storage.objects;
create policy "Content media is publicly readable"
on storage.objects for select to anon, authenticated
using (bucket_id = 'content-media');
drop policy if exists "Editors can upload content media" on storage.objects;
create policy "Editors can upload content media"
on storage.objects for insert to authenticated
with check (bucket_id = 'content-media' and public.has_admin_role(array['owner', 'editor']));
drop policy if exists "Editors can update content media" on storage.objects;
create policy "Editors can update content media"
on storage.objects for update to authenticated
using (bucket_id = 'content-media' and public.has_admin_role(array['owner', 'editor']))
with check (bucket_id = 'content-media' and public.has_admin_role(array['owner', 'editor']));
drop policy if exists "Editors can remove content media" on storage.objects;
create policy "Editors can remove content media"
on storage.objects for delete to authenticated
using (bucket_id = 'content-media' and public.has_admin_role(array['owner', 'editor']));

commit;

begin;

-- Only issue_deal_code() may mint a redemption row. The earlier privilege
-- migration accidentally added a direct INSERT grant to authenticated;
-- editors retain their intended UPDATE/DELETE kill switch.
revoke insert on public.deal_redemptions from authenticated;

-- Supabase anonymous Auth sessions use the authenticated database role and
-- have an auth.uid(). Ownership checks alone therefore do not enforce the
-- application's real-account requirement. A restrictive policy is ANDed with
-- every existing permissive write policy, including future policy additions.
-- Reads remain governed by the existing publication, ownership and block rules.
do $$
declare
  relation_name text;
begin
  for relation_name in
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('drop policy if exists "Registered accounts can insert" on public.%I', relation_name);
    execute format(
      'create policy "Registered accounts can insert" on public.%I as restrictive for insert to authenticated with check ((select auth.uid()) is not null and ((select auth.jwt())->>''is_anonymous'') is distinct from ''true'')',
      relation_name
    );
    execute format('drop policy if exists "Registered accounts can update" on public.%I', relation_name);
    execute format(
      'create policy "Registered accounts can update" on public.%I as restrictive for update to authenticated using ((select auth.uid()) is not null and ((select auth.jwt())->>''is_anonymous'') is distinct from ''true'') with check ((select auth.uid()) is not null and ((select auth.jwt())->>''is_anonymous'') is distinct from ''true'')',
      relation_name
    );
    execute format('drop policy if exists "Registered accounts can delete" on public.%I', relation_name);
    execute format(
      'create policy "Registered accounts can delete" on public.%I as restrictive for delete to authenticated using ((select auth.uid()) is not null and ((select auth.jwt())->>''is_anonymous'') is distinct from ''true'')',
      relation_name
    );
  end loop;
end;
$$;

-- Storage has its own schema and policies. Anonymous sessions must not be
-- able to upload an avatar or media through the Storage API either.
drop policy if exists "Registered accounts can insert objects" on storage.objects;
create policy "Registered accounts can insert objects" on storage.objects
  as restrictive for insert to authenticated
  with check ((select auth.uid()) is not null
    and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');

drop policy if exists "Registered accounts can update objects" on storage.objects;
create policy "Registered accounts can update objects" on storage.objects
  as restrictive for update to authenticated
  using ((select auth.uid()) is not null
    and ((select auth.jwt())->>'is_anonymous') is distinct from 'true')
  with check ((select auth.uid()) is not null
    and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');

drop policy if exists "Registered accounts can delete objects" on storage.objects;
create policy "Registered accounts can delete objects" on storage.objects
  as restrictive for delete to authenticated
  using ((select auth.uid()) is not null
    and ((select auth.jwt())->>'is_anonymous') is distinct from 'true');

-- Auth's profile trigger runs as its owner, bypassing client RLS. Anonymous
-- signup metadata must not create a public profile via that indirect route.
-- A later account upgrade can use the existing profile/preferences UPSERTs.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name_value text;
  avatar_url_value text;
  default_identity_value text;
begin
  if new.is_anonymous then
    return new;
  end if;

  display_name_value := nullif(
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    ''
  );

  avatar_url_value := nullif(
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    ),
    ''
  );

  default_identity_value := upper(nullif(new.raw_user_meta_data->>'default_identity', ''));
  if default_identity_value is null
    or default_identity_value not in ('LOCAL', 'TOURIST', 'GUIDE', 'BUSINESS')
  then
    default_identity_value := 'LOCAL';
  end if;

  insert into public.profiles (id, display_name, avatar_url, default_identity)
  values (new.id, display_name_value, avatar_url_value, default_identity_value)
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_security_events (user_id, event_type, metadata)
  values (new.id, 'profile_created', jsonb_build_object('source', 'auth.users trigger'))
  on conflict do nothing;

  return new;
end;
$$;

-- These SECURITY DEFINER helpers bypass table RLS. Denying an anonymous JWT
-- here closes the admin, organizer and business RPCs that use them as guards.
create or replace function public.current_admin_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select role from public.admin_members
  where user_id = auth.uid()
    and (auth.jwt()->>'is_anonymous') is distinct from 'true'
  limit 1;
$$;

create or replace function public.has_admin_role(required_roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.admin_members
    where user_id = auth.uid()
      and role = any(required_roles)
      and (auth.jwt()->>'is_anonymous') is distinct from 'true'
  );
$$;

create or replace function public.current_organizer_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.organizers
  where user_id = auth.uid()
    and verification_status = 'verified'
    and (auth.jwt()->>'is_anonymous') is distinct from 'true'
  limit 1;
$$;

create or replace function public.current_business_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.businesses
  where user_id = auth.uid()
    and verification_status = 'verified'
    and (auth.jwt()->>'is_anonymous') is distinct from 'true'
  limit 1;
$$;

-- The issue RPC only used auth.uid(), which anonymous sessions also have.
-- Keep the serialized issuance and quotas from the preceding migration.
create or replace function public.issue_deal_code(target_place_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim record;
  v_existing record;
  v_hourly_count bigint;
  v_daily_count bigint;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_expires timestamptz;
  v_char int;
begin
  if v_user_id is null or (auth.jwt()->>'is_anonymous') = 'true' then
    raise exception 'Registered account required to get a code';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    76218811,
    pg_catalog.hashtext(v_user_id::text)
  );

  select pbp.id, pbp.business_id, pbp.place_id, pbp.deal_text, pbp.deal_active
    into v_claim
  from public.place_business_profiles pbp
  join public.businesses b
    on b.id = pbp.business_id
   and b.verification_status = 'verified'
  where pbp.place_id = target_place_id
    and pbp.status = 'approved'
  for share of pbp, b;

  if not found then
    raise exception 'No approved business claim for this place';
  end if;
  if not v_claim.deal_active or v_claim.deal_text is null then
    raise exception 'This place has no active deal';
  end if;

  select code, expires_at
    into v_existing
  from public.deal_redemptions
  where profile_claim_id = v_claim.id
    and user_id = v_user_id
    and status = 'issued'
    and expires_at > now()
  order by issued_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'code', v_existing.code,
      'expires_at', v_existing.expires_at,
      'deal_text', v_claim.deal_text
    );
  end if;

  select
    count(*) filter (where issued_at > now() - interval '1 hour'),
    count(*)
  into v_hourly_count, v_daily_count
  from public.deal_redemptions
  where user_id = v_user_id
    and issued_at > now() - interval '24 hours';

  if v_hourly_count >= 10 or v_daily_count >= 30 then
    raise exception 'Deal code limit reached; try again later';
  end if;

  v_expires := now() + interval '24 hours';
  for attempt in 1..10 loop
    v_code := '';
    for v_char in 1..6 loop
      v_code := v_code
        || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into public.deal_redemptions
        (profile_claim_id, place_id, business_id, code, user_id, expires_at)
      values
        (v_claim.id, v_claim.place_id, v_claim.business_id, v_code, v_user_id, v_expires);
      return jsonb_build_object(
        'code', v_code,
        'expires_at', v_expires,
        'deal_text', v_claim.deal_text
      );
    exception when unique_violation then
      -- Retry a short-code collision while keeping the user's lock.
    end;
  end loop;

  raise exception 'Could not allocate a code, please retry';
end;
$$;

commit;

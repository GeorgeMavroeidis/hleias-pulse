begin;

-- Stage B3: trackable coupons. Each "use" of a B2 static deal mints one
-- deal_redemptions row with a short human-readable code. The user shows/says the
-- code; the owning business types it into a "verify code" field to mark it
-- redeemed. No POS integration, no QR scanner, no cron -- code liveness is
-- computed from expires_at.

create table public.deal_redemptions (
  id uuid primary key default extensions.gen_random_uuid(),
  profile_claim_id uuid not null
    references public.place_business_profiles(id) on delete cascade,
  -- Denormalized from the claim at issue time so the verify RPC / analytics
  -- never need a join.
  place_id text not null references public.places(id),
  business_id uuid not null references public.businesses(id),
  code text not null,
  status text not null default 'issued'
    check (status in ('issued', 'redeemed')),
  user_id uuid references auth.users(id) on delete set null,
  redeemed_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  redeemed_at timestamptz
);

create unique index deal_redemptions_code_key
  on public.deal_redemptions (code);
create index deal_redemptions_business_status_idx
  on public.deal_redemptions (business_id, status);
create index deal_redemptions_claim_status_idx
  on public.deal_redemptions (profile_claim_id, status);
-- rate-limit lookup: does this user already hold a live code for this deal?
create index deal_redemptions_user_live_idx
  on public.deal_redemptions (user_id, profile_claim_id)
  where status = 'issued';

-- Any signed-in session (incl. anonymous) can take a code for an active deal.
-- One live code per user per deal: a repeat request returns the existing one.
create or replace function public.issue_deal_code(target_place_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim record;
  v_existing record;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0 O 1 I L
  v_code text;
  v_expires timestamptz;
  v_char int;
begin
  if auth.uid() is null then
    raise exception 'Sign-in required to get a code';
  end if;

  select id, business_id, place_id, deal_text, deal_active
    into v_claim
  from public.place_business_profiles
  where place_id = target_place_id
    and status = 'approved';

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
    and user_id = auth.uid()
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
        (v_claim.id, v_claim.place_id, v_claim.business_id, v_code, auth.uid(), v_expires);
      return jsonb_build_object(
        'code', v_code,
        'expires_at', v_expires,
        'deal_text', v_claim.deal_text
      );
    exception when unique_violation then
      -- collision (practically never) -- loop and try another code
    end;
  end loop;

  raise exception 'Could not allocate a code, please retry';
end;
$$;

grant execute on function public.issue_deal_code(text) to authenticated;

-- Only the business that owns the claim can redeem. A code that belongs to
-- another business (or is expired / already used) returns the same generic
-- "not found" so nothing leaks across businesses.
create or replace function public.redeem_deal_code(code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
  v_row record;
begin
  v_business := public.current_business_id();
  if v_business is null then
    raise exception 'Only a verified business can redeem codes';
  end if;

  select r.id, r.issued_at, pbp.deal_text
    into v_row
  from public.deal_redemptions r
  join public.place_business_profiles pbp on pbp.id = r.profile_claim_id
  where upper(r.code) = upper(btrim(redeem_deal_code.code))
    and r.business_id = v_business
    and r.status = 'issued'
    and r.expires_at > now()
  limit 1;

  if not found then
    raise exception 'Code not found or already used';
  end if;

  update public.deal_redemptions
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_by = auth.uid()
  where id = v_row.id;

  return jsonb_build_object('deal_text', v_row.deal_text, 'issued_at', v_row.issued_at);
end;
$$;

grant execute on function public.redeem_deal_code(text) to authenticated;

alter table public.deal_redemptions enable row level security;

-- Writes go through the SECURITY DEFINER RPCs only. Editors keep a direct
-- update/delete grant for the kill-switch; nobody gets a direct insert grant.
grant select on public.deal_redemptions to authenticated;
grant update, delete on public.deal_redemptions to authenticated;

drop policy if exists "Users can read own deal redemptions" on public.deal_redemptions;
create policy "Users can read own deal redemptions"
on public.deal_redemptions for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Business can read redemptions for its claims" on public.deal_redemptions;
create policy "Business can read redemptions for its claims"
on public.deal_redemptions for select to authenticated
using (business_id = public.current_business_id());

drop policy if exists "Admins can read all deal redemptions" on public.deal_redemptions;
create policy "Admins can read all deal redemptions"
on public.deal_redemptions for select to authenticated
using (public.has_admin_role(array['owner', 'editor', 'moderator']));

drop policy if exists "Editors can manage deal redemptions" on public.deal_redemptions;
create policy "Editors can manage deal redemptions"
on public.deal_redemptions for all to authenticated
using (public.has_admin_role(array['owner', 'editor']))
with check (public.has_admin_role(array['owner', 'editor']));

commit;

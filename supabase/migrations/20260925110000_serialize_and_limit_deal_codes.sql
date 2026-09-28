begin;

-- Count issuance attempts efficiently across every deal a user claims. The
-- index includes redeemed and expired codes: those must still count toward a
-- rate limit or redemption would immediately reset the quota.
create index if not exists deal_redemptions_user_issued_idx
  on public.deal_redemptions (user_id, issued_at desc);

-- A per-user transaction advisory lock makes the existing-code check, hourly
-- and daily quota checks, and insert one serialized operation. Hash collisions
-- can only serialize two unrelated users; they cannot grant extra codes.
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
  if v_user_id is null then
    raise exception 'Sign-in required to get a code';
  end if;

  -- Serialize issuance before checking deal eligibility. Lock the current
  -- claim and business rows so an admin cannot revoke either between this check
  -- and the returned code or insert.
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
      -- The six-character code collided with an existing code. Retry with a
      -- fresh random value without releasing the user's advisory lock.
    end;
  end loop;

  raise exception 'Could not allocate a code, please retry';
end;
$$;

revoke execute on function public.issue_deal_code(text)
  from public, anon, service_role;
grant execute on function public.issue_deal_code(text) to authenticated;

commit;

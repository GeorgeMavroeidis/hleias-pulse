-- redeem_deal_code(): make redemption atomic.
--
-- Noted but deliberately left alone by the 2026-09-05 RLS audit, because it is
-- an RPC correctness bug rather than an RLS one and belongs on its own. This is
-- that PR.
--
-- The bug: 20260829120000 read the code with a plain SELECT, checked it, then
-- updated by primary key:
--
--   select r.id, r.issued_at, pbp.deal_text into v_row
--   from public.deal_redemptions r ... where r.status = 'issued' ...;
--   if not found then raise exception 'Code not found or already used'; end if;
--   update public.deal_redemptions
--     set status = 'redeemed', ...
--   where id = v_row.id;                      -- no status test, no row lock
--
-- Nothing holds a lock between the SELECT and the UPDATE, and the UPDATE's
-- WHERE does not re-test status. Two sessions redeeming the same code can both
-- pass the SELECT, both run the UPDATE, and both return success — the second
-- one overwriting redeemed_at and redeemed_by. One coupon, honoured twice, with
-- the audit trail pointing only at whoever committed last. This is the money
-- path, and a busy counter with two staff on two devices is exactly where it
-- would show up.
--
-- The fix is to make the read and the write a single statement whose WHERE
-- carries every predicate, including status = 'issued'.
--
-- Why that is sufficient, rather than needing an explicit `for update`: under
-- READ COMMITTED an UPDATE takes a row lock as it goes. The second session
-- blocks on that lock, and when the first commits, Postgres re-evaluates the
-- second statement's WHERE against the *updated* row (EvalPlanQual). status is
-- 'redeemed' by then, the predicate no longer matches, and the UPDATE affects
-- zero rows — so `not found` is true and the caller gets the existing
-- 'Code not found or already used'. No new error path, no client change.
--
-- The join to place_business_profiles moves into the UPDATE's FROM clause so
-- deal_text still comes back in the same round trip. That table is not being
-- updated, so it takes no lock.
--
-- No RLS change: this migration creates and drops no policies. Grants are
-- unchanged (`grant execute ... to authenticated` from 20260829120000 stands).
-- The function remains SECURITY DEFINER with an explicit search_path, and still
-- refuses any caller without current_business_id(), which is verified-only.

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

  -- Single guarded statement. `and r.status = 'issued'` is what makes a second
  -- concurrent redemption match zero rows instead of succeeding.
  --
  -- deal_redemptions_code_key is unique on (code), so at most one row can ever
  -- match and no LIMIT is needed. A code belonging to another business, or
  -- expired, or already redeemed, all fall through to the same generic
  -- 'not found' below, so nothing leaks across businesses.
  update public.deal_redemptions r
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_by = auth.uid()
  from public.place_business_profiles pbp
  where pbp.id = r.profile_claim_id
    and upper(r.code) = upper(btrim(redeem_deal_code.code))
    and r.business_id = v_business
    and r.status = 'issued'
    and r.expires_at > now()
  returning r.issued_at, pbp.deal_text into v_row;

  if not found then
    raise exception 'Code not found or already used';
  end if;

  return jsonb_build_object('deal_text', v_row.deal_text, 'issued_at', v_row.issued_at);
end;
$$;

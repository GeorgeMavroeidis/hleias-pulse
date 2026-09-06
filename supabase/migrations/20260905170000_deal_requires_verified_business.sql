-- A deal is only live while the business behind it is still verified.
--
-- Finding #3 of the 2026-09-05 full-schema RLS audit. Unlike the two policy
-- bugs in 20260905160000, this one changes product behaviour, so it ships on
-- its own: an approved claim under a business that is not verified goes dark.
--
-- The gap: place_business_profiles.status (claim approval) and
-- businesses.verification_status are independent columns, and nothing
-- downstream re-checks the business.
--
--   - "Public can read approved place business profiles" showed a claim to anon
--     on claim status alone — deal text, phone, website, photos.
--   - issue_deal_code() validated the claim's status and deal_active, never the
--     owning business.
--   - redeem_deal_code() DOES require current_business_id(), which is
--     verified-only. So codes kept being minted for a de-verified business and
--     could never be redeemed — a coupon that fails at the counter.
--
-- This was live, not hypothetical. On 2026-09-05 an anonymous request to
-- /rest/v1/place_business_profiles returned claim 07d272ed-0d20-48d8-bfa7-
-- 16aad595c93e on place 'lechaina': status 'approved', deal_active true, an
-- active deal and a phone number — while its business ("gm") was 'rejected'.
-- It was the only row in the table.
--
-- Policy counts on place_business_profiles after this migration:
--   SELECT 3  (public-approved, business-own, admin-read)
--   INSERT 1  ("Business can submit a place claim")
--   UPDATE 1  ("Business can edit own pending claim")
--   DELETE 0
--   plus "Editors can manage place business profiles", a FOR ALL policy adding
--   an owner/editor branch to all four commands. Counts are unchanged from
--   before — this migration replaces one SELECT policy, it does not add one.

-- ---------------------------------------------------------------------------
-- 1. Public read now requires a verified business
-- ---------------------------------------------------------------------------
--
-- The exists() subquery runs with the caller's privileges, so businesses' own
-- RLS applies inside it. That is deliberate and safe:
--
--   - "Public can read verified businesses" grants anon exactly the verified
--     rows this test needs, so the subquery resolves for anonymous readers.
--   - No policy on businesses references place_business_profiles, so there is
--     no mutual recursion.
--
-- Admins are unaffected: "Admins can read all place business profiles" and
-- "Editors can manage place business profiles" are separate permissive
-- policies, so a rejected business's claim is still fully visible in the admin
-- dashboard for review. A business reading its own claim is likewise unchanged
-- — "Business can read own claims" already keyed on current_business_id(),
-- which has always been verified-only.

drop policy if exists "Public can read approved place business profiles"
  on public.place_business_profiles;
create policy "Public can read approved place business profiles"
on public.place_business_profiles for select to anon, authenticated
using (
  status = 'approved'
  and exists (
    select 1
    from public.businesses b
    where b.id = place_business_profiles.business_id
      and b.verification_status = 'verified'
  )
);

-- ---------------------------------------------------------------------------
-- 2. Stop minting codes for a business that cannot redeem them
-- ---------------------------------------------------------------------------
--
-- Body is unchanged from 20260829120000 except for the join marked below. The
-- function is SECURITY DEFINER, so this join reads businesses directly and is
-- not itself subject to the RLS policy above — the check is on the real
-- verification_status, not on what the caller happens to be allowed to see.
--
-- The existing 'No approved business claim for this place' message is reused
-- rather than adding a new one: a caller has no business learning whether a
-- place has a claim that is merely unverified.

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

  select pbp.id, pbp.business_id, pbp.place_id, pbp.deal_text, pbp.deal_active
    into v_claim
  from public.place_business_profiles pbp
  -- ADDED: a deal is only live while the business behind it is still verified.
  join public.businesses b
    on b.id = pbp.business_id
   and b.verification_status = 'verified'
  where pbp.place_id = target_place_id
    and pbp.status = 'approved';

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

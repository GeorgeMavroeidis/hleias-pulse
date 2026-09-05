-- ############################################################################
-- ##  DRAFT - NOT APPLIED.  Do not run without George's explicit approval.  ##
-- ##  Written by the 2026-09-05 full-schema RLS audit. `supabase db push`   ##
-- ##  has NOT been run for this file. The live database still has all three ##
-- ##  gaps below open.                                                      ##
-- ############################################################################
--
-- The audit read live state via the Management API read-only role and
-- cross-checked it against every migration in this directory. All 30 public
-- tables have RLS enabled, no live policy exists that a migration does not
-- declare, and verification/role escalation is correctly closed (the
-- guard_business_self_verification / guard_organizer_self_verification triggers
-- do their job, and roles live in admin_members, never in user_metadata).
--
-- These are the three real gaps it found.

-- ---------------------------------------------------------------------------
-- 1. meet_events: a stale policy lets a user publish straight to the feed
-- ---------------------------------------------------------------------------
--
-- 20260617161000_make_live_surfaces_supabase.sql created:
--
--   "Authenticated users can create own meet events"   <- note the "own"
--       with check (... and moderation_status = 'published')
--
-- Moderation arrived in 20260824090000_add_admin_dashboard.sql, which tried to
-- retire it at line 261 - but dropped "Authenticated users can create meet
-- events", without the "own". 20260904120000_restore_user_submission_policies
-- repeated the same wrong name at line 121. Both drops were silent no-ops, so
-- the June policy is still live today.
--
-- Permissive policies OR together, so meet_events currently has two INSERT
-- policies: the intended pending-only one, and this one that requires
-- 'published'. Any authenticated user can therefore insert a meet event that is
-- immediately visible to anon through "Public can read published meet events",
-- with no moderator ever seeing it. posts, places, stories and comments each
-- have exactly one INSERT policy and are not affected - meet_events is the only
-- surface with this hole.
--
-- hp-api.ts always sends moderation_status: "pending", so nothing in the app
-- exercises this. That is precisely why it survived two passes: RLS is the
-- boundary, not the client.
--
-- Contradicts ADMIN_SETUP.md ("All new user posts, comments, places, stories,
-- and Meet events start as `pending`") and the Apple Guideline 1.2 moderation
-- requirement in CLAUDE.md.
--
-- The correct pending-only policy, "Authenticated users can submit meet
-- events", already exists and is unchanged. This drop is the whole fix.

drop policy if exists "Authenticated users can create own meet events" on public.meet_events;

-- ---------------------------------------------------------------------------
-- 2. content_reports: a reporter can reopen or rewrite an actioned report
-- ---------------------------------------------------------------------------
--
-- 20260905130000_add_user_moderation.sql put the status guard only in the CHECK
-- clause:
--
--   using       (reporter_id = (select auth.uid()))
--   with check  (reporter_id = (select auth.uid()) and status = 'open')
--
-- USING decides which rows may be updated; CHECK decides what they may become.
-- With no status test in USING, a reporter can pick up a report a moderator has
-- already moved to 'reviewing', 'actioned' or 'dismissed' and write it back to
-- 'open' - re-queueing a dismissed report as often as they like.
--
-- It also undoes that migration's own stated intent. Its comment (lines 65-68)
-- says reports are deliberately not deletable by the reporter, "not a button an
-- aggressor can pressure someone into pressing". But target_type, target_id,
-- reason and note are all freely updatable, so rewriting a harassment report
-- into a spam report against an unrelated post is a functional withdrawal by
-- another name - and retargeting the row is also how a reporter would step
-- around the unique (reporter_id, target_type, target_id) dedupe.
--
-- Narrowing USING to open reports leaves the intended behaviour intact: you may
-- still correct a report you just filed, until a moderator picks it up.

drop policy if exists "content_reports_update_own" on public.content_reports;
create policy "content_reports_update_own" on public.content_reports
  for update to authenticated
  using (reporter_id = (select auth.uid()) and status = 'open')
  with check (reporter_id = (select auth.uid()) and status = 'open');

-- ---------------------------------------------------------------------------
-- 3. De-verifying a business does not take down its live deal
-- ---------------------------------------------------------------------------
--
-- place_business_profiles.status and businesses.verification_status are
-- independent. Rejecting a business leaves any approved claim approved, and
-- nothing downstream re-checks the business:
--
--   - "Public can read approved place business profiles" shows the claim to
--     anon on status alone - deal text, phone, website.
--   - issue_deal_code() validates the claim's status and deal_active, never the
--     owning business.
--   - redeem_deal_code() DOES require current_business_id(), which is
--     verified-only. So codes keep being minted and can never be redeemed.
--
-- This is live right now, not hypothetical: claim 07d272ed-0d20-48d8-bfa7-
-- 16aad595c93e on place 'lechaina' is approved with deal_active = true and the
-- deal text "Free drink at 9:00 PM, only for roday!", while its business ("gm")
-- is rejected. It is the only claim in the table. Note this also corrects
-- CLAUDE.md known issue #5, which says no deal is currently live - one is, and
-- anonymous visitors can see it.
--
-- Both halves below change product behaviour: an approved claim under a
-- non-verified business goes dark. That is the intent, but it is a decision,
-- not a typo fix - George should confirm before this runs.

-- The EXISTS subquery runs with the caller's privileges, so businesses' own RLS
-- applies inside it. That is fine and deliberate: "Public can read verified
-- businesses" grants anon exactly the verified rows this test needs, and
-- businesses has no policy referencing place_business_profiles, so there is no
-- recursion.
drop policy if exists "Public can read approved place business profiles" on public.place_business_profiles;
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

-- issue_deal_code: body is unchanged from live except for the added
-- verification test on the claim lookup, marked below.
create or replace function public.issue_deal_code(target_place_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_claim record;
  v_existing record;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_expires timestamptz;
  v_char int;
  attempt int;
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

  select code, expires_at into v_existing
  from public.deal_redemptions
  where profile_claim_id = v_claim.id
    and user_id = auth.uid()
    and status = 'issued'
    and expires_at > now()
  order by issued_at desc
  limit 1;

  if found then
    return jsonb_build_object('code', v_existing.code, 'expires_at', v_existing.expires_at,
      'deal_text', v_claim.deal_text);
  end if;

  v_expires := now() + interval '24 hours';

  for attempt in 1..10 loop
    v_code := '';
    for v_char in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into public.deal_redemptions
        (profile_claim_id, place_id, business_id, code, user_id, expires_at)
      values (v_claim.id, v_claim.place_id, v_claim.business_id, v_code, auth.uid(), v_expires);
      return jsonb_build_object('code', v_code, 'expires_at', v_expires,
        'deal_text', v_claim.deal_text);
    exception when unique_violation then
    end;
  end loop;

  raise exception 'Could not allocate a code, please retry';
end;
$function$;

-- ---------------------------------------------------------------------------
-- Deliberately NOT changed here
-- ---------------------------------------------------------------------------
--
-- redeem_deal_code() reads the code with a plain SELECT and then updates by id,
-- with no `for update` and no `and status = 'issued'` on the UPDATE's WHERE.
-- Two concurrent redemptions of the same code can therefore both succeed. It is
-- a real double-redemption race on the money path, but fixing it is a change to
-- the redemption RPC rather than to RLS, and it belongs in its own PR with its
-- own test. Left alone on purpose.

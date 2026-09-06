-- Server-side block enforcement.
--
-- 20260905130000_add_user_moderation.sql created user_blocks and, alongside it,
-- an index:
--
--   -- Needed to hide a blocker's content from the person they blocked, which
--   -- is the half of blocking that is not just a client-side filter.
--   create index if not exists user_blocks_blocked_idx
--     on public.user_blocks (blocked_id);
--
-- That half was never implemented. No policy anywhere references user_blocks,
-- and the index has been unused since the day it was created. Blocking is a
-- client-side filter over data the API still serves: if A blocks B, B's app
-- keeps receiving A's posts and B can keep replying to them. Apple Guideline
-- 1.2 wants blocking that works, and this is the half a client cannot do.
--
-- This migration implements it, and uses that index.
--
-- ---------------------------------------------------------------------------
-- Why a SECURITY DEFINER helper rather than a subquery in the policy
-- ---------------------------------------------------------------------------
--
-- The obvious version does not work, and fails silently, which is the failure
-- mode this whole audit exists to stop:
--
--   not exists (select 1 from public.user_blocks ub
--               where ub.blocker_id = posts.user_id
--                 and ub.blocked_id = (select auth.uid()))
--
-- A policy expression is evaluated with the reading user's privileges, so the
-- referenced table's own RLS still applies. user_blocks' only policy is
-- user_blocks_all_own (blocker_id = auth.uid()), so a reader can see only rows
-- where THEY are the blocker. The rows this test needs — where someone else is
-- the blocker and the reader is the blocked party — are invisible to it. The
-- subquery would match nothing, always, and the policy would look correct while
-- enforcing nothing.
--
-- blocked_user_ids() is SECURITY DEFINER so it reads user_blocks directly. It
-- takes no arguments and derives the reader from auth.uid() internally, so it
-- cannot be pointed at anyone else — a caller can only ever learn about their
-- own block relationships. Returning uuid[] rather than a set matters for cost:
-- a stable zero-argument function is uncorrelated, so the planner evaluates it
-- once per query instead of once per row.
--
-- ---------------------------------------------------------------------------
-- Disclosure trade-off — deliberate, flagged for George
-- ---------------------------------------------------------------------------
--
-- 20260905130000's comment says "Nobody can see that they have been blocked,
-- which is the whole point." Server-side enforcement cannot fully preserve
-- that: the moment A's content stops being served to B, B can infer it, and
-- blocked_user_ids() lets B read the set directly rather than infer it.
--
-- Those two goals are in genuine conflict and the safety one wins. The
-- direction that matters is hiding the blocker's content from the blocked
-- party: if a harassment victim blocks their harasser, the victim stopping
-- seeing them is not the protection — the harasser losing the feed they were
-- using is. That is exactly the direction that requires the disclosure. The
-- alternative, enforcing only "the blocker stops seeing the blocked user",
-- leaks nothing but is also the half the client already does, so it would add
-- no protection at all.
--
-- ---------------------------------------------------------------------------
-- Policy counts — unchanged on all four tables
-- ---------------------------------------------------------------------------
--
-- Each of posts, comments, stories and meet_events keeps exactly:
--   SELECT 3  (public-published, own, admin)  + "Editors can manage <t>" FOR ALL
-- This migration REPLACES "Public can read published <t>" on each. It creates
-- no new policy and drops no other one, so no count changes anywhere.
--
-- Only the public policy needs the predicate. Permissive policies OR together,
-- and the other three are already narrow enough:
--   - "Users can read own <t>" matches only the reader's own rows, and
--     user_blocks_no_self makes a self-block impossible.
--   - "Admins can read all <t>" and "Editors can manage <t>" are role-gated.
--     Moderators must keep seeing everything, so leaving them alone is correct.
--
-- places is deliberately NOT included. A place is a location, not an utterance;
-- dropping pins off the map over an interpersonal block would break the map for
-- everyone. Blocking hides what someone says, not where things are.

-- ---------------------------------------------------------------------------
-- The helper
-- ---------------------------------------------------------------------------

create or replace function public.blocked_user_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(
      case
        when ub.blocker_id = (select auth.uid()) then ub.blocked_id
        else ub.blocker_id
      end
    ),
    '{}'::uuid[]
  )
  from public.user_blocks ub
  where ub.kind = 'block'
    and (
      ub.blocker_id = (select auth.uid())
      or ub.blocked_id = (select auth.uid())
    );
$$;

comment on function public.blocked_user_ids() is
  'Every user id the caller is in a block relationship with, in either '
  'direction. SECURITY DEFINER because user_blocks RLS hides the "someone '
  'blocked me" rows from the person who needs them. Takes no argument and '
  'reads auth.uid() itself, so it cannot be aimed at another user.';

-- anon needs EXECUTE too: the policies below are granted `to anon,
-- authenticated`, and for a signed-out reader the function returns '{}'.
grant execute on function public.blocked_user_ids() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The four content policies
-- ---------------------------------------------------------------------------
--
-- The `user_id is null` arm keeps editorial and seeded content visible — posts
-- carry a nullable user_id and the seed rows have none. It also matters that
-- this is `not (... = any (...))` and not `not in (...)`: with a NULL user_id,
-- NOT IN over a non-empty set evaluates to NULL and would silently hide every
-- seeded row.

drop policy if exists "Public can read published posts" on public.posts;
create policy "Public can read published posts"
on public.posts for select to anon, authenticated
using (
  moderation_status = 'published'
  and (user_id is null or not (user_id = any (public.blocked_user_ids())))
);

drop policy if exists "Public can read published comments" on public.comments;
create policy "Public can read published comments"
on public.comments for select to anon, authenticated
using (
  moderation_status = 'published'
  and (user_id is null or not (user_id = any (public.blocked_user_ids())))
);

drop policy if exists "Public can read published stories" on public.stories;
create policy "Public can read published stories"
on public.stories for select to anon, authenticated
using (
  moderation_status = 'published'
  and (user_id is null or not (user_id = any (public.blocked_user_ids())))
);

drop policy if exists "Public can read published meet events" on public.meet_events;
create policy "Public can read published meet events"
on public.meet_events for select to anon, authenticated
using (
  moderation_status = 'published'
  and (user_id is null or not (user_id = any (public.blocked_user_ids())))
);

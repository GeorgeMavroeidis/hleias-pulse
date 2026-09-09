begin;

-- Give anon the table privilege its own policy already assumes.
--
-- 20260828120000 created public.businesses with RLS enabled and three select
-- policies, one of them:
--
--   "Public can read verified businesses" ... to anon, authenticated
--   using (verification_status = 'verified')
--
-- but granted the table only to authenticated:
--
--   grant select, insert, update on public.businesses to authenticated;
--   grant select, insert, update on public.place_business_profiles to authenticated;
--   grant select on public.place_business_profiles to anon;   <- sibling got it
--
-- In Postgres, RLS is evaluated only AFTER table privileges, so a policy naming
-- a role that holds no SELECT privilege never runs at all. The anon half of
-- that policy has been dead since the table was created, and the sibling table
-- one line below shows the grant was missed rather than deliberately withheld.
--
-- This is not tidiness. Two things already depend on it being true:
--
--   * 20260905170000 reasons explicitly that "Public can read verified
--     businesses grants anon exactly the verified rows this test needs, so the
--     subquery resolves for anonymous readers." That is false on any database
--     built from this migration list.
--   * loadPulseData() embeds businesses(display_name) through
--     place_business_profiles, so an anonymous reader -- a tourist, which is
--     half the app's audience -- gets "permission denied for table businesses"
--     (42501) instead of a feed.
--
-- Found by the first CI run to build the schema from empty. The live database
-- does not have this problem, which is why nobody hit it: an anonymous
-- loadPulseData() against production succeeds today. So this migration makes
-- the migration list reproduce the database that already exists, rather than
-- changing behaviour anywhere.
--
-- It does not widen what anon may see. RLS stays enabled (20260828120000:109)
-- and remains the only thing choosing rows: anon still matches exactly one
-- policy and is still confined to verification_status = 'verified'. Select
-- only -- no insert, update or delete.
grant select on public.businesses to anon;

commit;

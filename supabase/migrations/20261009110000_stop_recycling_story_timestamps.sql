begin;

-- Older app versions call this RPC before loading their public data. Preserve
-- that call's signature and permissions, but never turn an old observation
-- into a new one. Story visibility still follows its original 6h/24h expiry.
-- CREATE OR REPLACE retains the existing execute grants.
create or replace function public.refresh_generic_stories()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  return;
end;
$$;

commit;

-- Schema-level REVOKE cannot cancel PostgreSQL's global default EXECUTE for
-- new functions. All application migrations create functions as postgres.
-- Keep future RPC exposure explicit, even when a new function is added later.
alter default privileges for role postgres
  revoke execute on functions from public;

begin;

-- All application RPCs are reviewed below. Trigger functions are moved out of
-- the exposed public schema; PostgreSQL triggers retain their function OIDs.
create schema if not exists private;

revoke execute on all functions in schema public from public, anon, authenticated, service_role;

alter function public.set_updated_at() set schema private;
alter function public.handle_new_auth_user() set schema private;
alter function public.refresh_meet_event_rsvp_counts(text) set schema private;
alter function public.handle_event_rsvp_counts() set schema private;
alter function public.prevent_last_owner_removal() set schema private;
alter function public.prevent_organizer_self_verification() set schema private;
alter function public.prevent_business_self_verification() set schema private;
alter function public.write_admin_audit_log() set schema private;
alter function public.write_admin_member_audit_log() set schema private;
alter function public.write_verification_audit_log() set schema private;

-- This is the only function-to-function reference to a moved routine. Trigger
-- execution itself does not require an EXECUTE grant to the table writer.
create or replace function private.handle_event_rsvp_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_meet_event_rsvp_counts(old.event_id);
    return old;
  end if;

  perform private.refresh_meet_event_rsvp_counts(new.event_id);
  if tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
    perform private.refresh_meet_event_rsvp_counts(old.event_id);
  end if;
  return new;
end;
$$;

-- Every table/function reference in these routines is schema qualified. The
-- empty path leaves pg_catalog builtins available without resolving objects
-- from public or a caller-controlled temporary schema.
alter function public.blocked_user_ids() set search_path = '';
alter function public.current_admin_role() set search_path = '';
alter function public.current_business_id() set search_path = '';
alter function public.current_organizer_id() set search_path = '';
alter function public.get_pulse_bootstrap() set search_path = '';
alter function public.has_admin_role(text[]) set search_path = '';
alter function public.issue_deal_code(text) set search_path = '';
alter function public.moderate_content(text, text, text) set search_path = '';
alter function public.redeem_deal_code(text) set search_path = '';
alter function public.refresh_generic_stories() set search_path = '';
alter function public.review_place_claim(uuid, text) set search_path = '';
alter function public.set_place_deal(uuid, text, boolean) set search_path = '';

alter function private.set_updated_at() set search_path = '';
alter function private.handle_new_auth_user() set search_path = '';
alter function private.refresh_meet_event_rsvp_counts(text) set search_path = '';
alter function private.prevent_last_owner_removal() set search_path = '';
alter function private.prevent_organizer_self_verification() set search_path = '';
alter function private.prevent_business_self_verification() set search_path = '';
alter function private.write_admin_audit_log() set search_path = '';
alter function private.write_admin_member_audit_log() set search_path = '';
alter function private.write_verification_audit_log() set search_path = '';
alter function private.write_route_stop_audit_log() set search_path = '';

-- Trigger-only routines and the RSVP counter have no Data API caller. Keep
-- their owner privilege, but remove any inherited/legacy API grants.
revoke execute on all functions in schema private from public, anon, authenticated, service_role;

-- Public bootstrap and block policy must work for signed-out visitors. The
-- editorial refresh is intentionally called by the guest bootstrap: it can
-- update only 11 fixed seed rows and only after their 6/24-hour expiry.
grant execute on function public.blocked_user_ids(), public.get_pulse_bootstrap(),
  public.refresh_generic_stories() to anon, authenticated;

-- These helpers either derive auth.uid() internally for RLS or check the
-- caller's admin/verified-business status before writing.
grant execute on function public.current_admin_role(), public.current_business_id(),
  public.current_organizer_id(), public.has_admin_role(text[]),
  public.issue_deal_code(text), public.moderate_content(text, text, text),
  public.redeem_deal_code(text), public.review_place_claim(uuid, text),
  public.set_place_deal(uuid, text, boolean) to authenticated;

-- The push worker uses these three Data API RPCs with its service key.
grant execute on function public.claim_push_delivery_batch(),
  public.prepare_push_delivery(uuid, uuid),
  public.complete_push_delivery(uuid, uuid, text, text) to service_role;

-- PostgreSQL grants EXECUTE to PUBLIC by default. Both global and per-schema
-- defaults must be cleared: per-schema ACLs are additive to the global ACL.
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated, service_role;

commit;

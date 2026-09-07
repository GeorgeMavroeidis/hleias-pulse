-- Give the three privileged tables an audit trail. Found 2026-09-07 while
-- writing smoke:admin, recorded in IDEAS.md -> Security to Review.
--
-- admin_audit_logs was well covered for *content*: moderate_content() and
-- review_place_claim() each insert their own line, and write_admin_audit_log()
-- sits on places, posts, comments, stories, meet_events, routes,
-- cultural_events and place_business_profiles. Three tables had neither a
-- trigger nor an explicit insert anywhere in the path that writes them:
--
--   businesses     verifying a business left no trace -- and a verified
--   organizers     business is what unlocks place claims and deals
--                  (20260905170000), i.e. the revenue path
--   admin_members  granting somebody 'owner' left no trace either. That is the
--                  single most powerful action in the system: afterwards
--                  nothing recorded who did it, when, or to whom.
--
-- Why not simply hang the existing write_admin_audit_log() on these three:
--
--   1. It returns early unless the actor is owner/editor. That gate is right
--      for the tables it already covers (without it, every ordinary user's post
--      and comment would write an audit row), but on admin_members it would
--      skip exactly the writes that matter most -- a change made by the
--      postgres role, by service_role, or by a seed script has no auth.uid()
--      and would vanish. The admin_members trigger below is deliberately
--      role-blind and records current_user instead.
--   2. It logs every column of every write. On businesses/organizers that is
--      mostly self-service noise: an applicant editing their own bio is not a
--      privileged act. The trigger below fires only on a verification
--      transition -- including a row *inserted* already verified, which the
--      prevent_*_self_verification() guards never see because they are BEFORE
--      UPDATE.
--
-- Adds no policy and no capability: triggers only. RLS still decides who may
-- write these tables; this only makes a successful write leave a record.

create or replace function public.write_admin_member_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subject_id uuid;
  before_role text;
  after_role text;
  actor uuid := auth.uid();
  action_name text;
begin
  -- NEW/OLD are branched explicitly rather than coalesced, so no field of an
  -- unset record is ever read.
  if tg_op = 'DELETE' then
    subject_id := old.user_id;
    before_role := old.role;
    after_role := null;
    action_name := 'admin_role_revoked';
  elsif tg_op = 'INSERT' then
    subject_id := new.user_id;
    before_role := null;
    after_role := new.role;
    action_name := 'admin_role_granted';
  else
    subject_id := new.user_id;
    before_role := old.role;
    after_role := new.role;
    -- setAdminMember() upserts, so re-saving the same role lands here as an
    -- UPDATE that changed nothing. Still logged -- every write to this table is
    -- worth a line -- but not as a role change, which would read as a lie.
    action_name := case
      when before_role is distinct from after_role then 'admin_role_changed'
      else 'admin_member_updated'
    end;
  end if;

  -- admin_audit_logs.actor_id references auth.users. When an admin deletes
  -- their own account the cascade reaches admin_members inside that same
  -- statement, and an audit row pointing at the user being deleted would fail
  -- its foreign key check at end of statement -- taking the account deletion
  -- down with it. The FK is ON DELETE SET NULL, so the actor would end up null
  -- moments later regardless; write it null now and keep the deletion working.
  if tg_op = 'DELETE' and actor is not distinct from subject_id then
    actor := null;
  end if;

  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    actor,
    action_name,
    'admin_members',
    subject_id::text,
    jsonb_build_object(
      'before_role', before_role,
      'after_role', after_role,
      'actor_admin_role', public.current_admin_role(),
      'db_role', current_user,
      'op', lower(tg_op)
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.write_verification_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subject_id uuid;
  subject_user uuid;
  before_status text;
  after_status text;
  actor uuid := auth.uid();
  action_name text;
begin
  if tg_op = 'DELETE' then
    subject_id := old.id;
    subject_user := old.user_id;
    before_status := old.verification_status;
    after_status := null;
    -- Losing a *verified* row is the privileged event: it silently withdraws
    -- the capability to publish events or run deals. A pending or rejected
    -- applicant disappearing is not, and logging it would leave a record of
    -- somebody who deleted their account -- these rows cascade from
    -- auth.users.
    if before_status <> 'verified' then
      return old;
    end if;
    action_name := 'verification_revoked_by_delete';
    -- Same reason as in write_admin_member_audit_log(): never point actor_id at
    -- a user this very statement is deleting.
    if actor is not distinct from subject_user then
      actor := null;
    end if;
    -- ...and do not carry the erased user's id into the details either. The
    -- row id is enough to tie the line to its subject, and it stops resolving
    -- to a person once the row is gone.
    subject_user := null;
  elsif tg_op = 'INSERT' then
    subject_id := new.id;
    subject_user := new.user_id;
    before_status := null;
    after_status := new.verification_status;
    -- A self-service application must start 'pending' (the insert policy says
    -- so), and is not an admin act. A row inserted already verified can only
    -- have come from an owner/editor or from the postgres role -- that one is
    -- privileged, and it is the route the BEFORE UPDATE self-verification
    -- guards cannot see.
    if after_status = 'pending' then
      return new;
    end if;
    action_name := 'verification_status_changed';
  else
    subject_id := new.id;
    subject_user := new.user_id;
    before_status := old.verification_status;
    after_status := new.verification_status;
    -- Everything else on these tables is the applicant editing their own
    -- profile. Only the status transition is security-relevant.
    if before_status is not distinct from after_status then
      return new;
    end if;
    action_name := 'verification_status_changed';
  end if;

  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    actor,
    action_name,
    tg_table_name,
    subject_id::text,
    jsonb_build_object(
      'before_status', before_status,
      'after_status', after_status,
      'subject_user_id', subject_user,
      'actor_admin_role', public.current_admin_role(),
      'db_role', current_user,
      'op', lower(tg_op)
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_admin_members on public.admin_members;
create trigger audit_admin_members
after insert or update or delete on public.admin_members
for each row execute function public.write_admin_member_audit_log();

drop trigger if exists audit_business_verification on public.businesses;
create trigger audit_business_verification
after insert or update or delete on public.businesses
for each row execute function public.write_verification_audit_log();

drop trigger if exists audit_organizer_verification on public.organizers;
create trigger audit_organizer_verification
after insert or update or delete on public.organizers
for each row execute function public.write_verification_audit_log();

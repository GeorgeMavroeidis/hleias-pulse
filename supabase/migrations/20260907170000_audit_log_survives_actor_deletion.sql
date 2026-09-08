-- An audit row must outlive the account that wrote it.
--
-- admin_audit_logs.actor_id was created as
--   actor_id uuid references auth.users(id) on delete set null
-- (20260824090000). That foreign key means deleting an account rewrites its
-- whole admin history to "somebody did this" -- precisely when a person has a
-- reason to disappear. 20260907120000 then made this worse by design: it added
-- audit rows for the two most powerful actions in the system, verifying a
-- business and granting an admin role, so the history now worth keeping is
-- exactly the history that vanishes.
--
-- Dropping the constraint is the standard shape for an audit table: it records
-- an id, it does not participate in the lifecycle of the thing it names. The
-- column keeps its type and stays nullable, so a write with no auth.uid()
-- (a seed, or anything over a direct psql connection) still records null.
--
-- CHECKED, not assumed -- both of these were verified rather than argued:
--
--   * The constraint name. public.admin_audit_logs has exactly one foreign key,
--     admin_audit_logs_actor_id_fkey, FOREIGN KEY (actor_id) REFERENCES
--     auth.users(id) ON DELETE SET NULL, confirmed against pg_constraint on the
--     live database. `drop constraint if exists` on a wrong name is a silent
--     no-op, which is the same failure mode audit-rls.ts exists to catch.
--
--   * That the retained value really is opaque. Keeping a uuid is only
--     defensible if no other table still holds the same uuid after the account
--     is gone -- otherwise it is re-linkable and still personal data. Every
--     user_id / profile_id / actor_id / redeemed_by column in the schema
--     references either auth.users or public.profiles, and profiles.id is
--     itself `references auth.users(id) on delete cascade` (20260617123431), so
--     deleting the account either cascades those rows away or nulls the column.
--     There is no identity uuid column anywhere without a foreign key. After
--     this migration admin_audit_logs.actor_id is the ONLY place the uuid
--     survives, which is what makes it opaque rather than merely inconvenient.
--     Re-check this if a table is ever added that stores a user id loosely.
--
-- Privacy: this retains an opaque uuid and nothing else. No name, no email --
-- the details payloads carry roles and status transitions, not personal fields.
-- Keep it that way; these rows are now permanent.

alter table public.admin_audit_logs
  drop constraint if exists admin_audit_logs_actor_id_fkey;

-- Now remove the two guards the constraint forced on 20260907120000.
--
-- They exist because an audit row pointing at a user that the same statement is
-- deleting would fail the foreign key check at end of statement and take the
-- account deletion down with it. With the constraint gone there is no check
-- left to fail, so the reason is gone.
--
-- They are NOT merely redundant, which is why this is a fix and not a tidy-up.
-- The condition is `tg_op = 'DELETE' and actor is not distinct from subject`,
-- with nothing scoping it to a cascade -- so it also fires on a plain
-- self-directed delete where no account is being removed at all:
--
--   "Owners can remove team members" (20260824090000:106) is
--   `using (public.has_admin_role(array['owner']))` with no self-exclusion, and
--   removeAdminMember() (admin-api.ts) is a plain delete by user_id. So an owner
--   may remove their OWN admin_members row from the dashboard. actor and
--   subject are then the same live person, the guard matches, and actor_id is
--   written null -- something the old foreign key would never have done, since
--   ON DELETE SET NULL only fires when the auth.users row actually goes.
--
-- Net effect without this fix: "who resigned their own ownership" is recorded
-- as nobody, permanently, in a table this migration has just made permanent.
-- Dropping the constraint without dropping the guards would cement the one
-- erasure the constraint was never responsible for.
--
-- This is therefore a fix for a defect that is LIVE right now, not only a change
-- of retention policy: 20260907120000 is already applied, so an owner who
-- removes their own admin row today is already recorded as nobody.
--
-- DO NOT re-add admin_audit_logs_actor_id_fkey without restoring a guard of
-- this shape. The end-of-statement cascade hazard comes back with the
-- constraint, and it fails on the one path nobody tests by hand: a user
-- deleting their own account.
--
-- The functions below are otherwise byte-for-byte 20260907120000. Only the
-- `actor := null` blocks are removed.

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

  -- The actor is recorded as found. On a self-removal that is the owner who did
  -- it; on an account deletion it is whoever drove the deletion, and null when
  -- that was a pg script or service_role with no auth.uid().
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
    -- subject_user is still dropped from the details, but for a narrower reason
    -- than before: nothing in the app deletes a businesses or organizers row,
    -- so a DELETE here arrives only as the auth.users cascade or by hand over
    -- psql. In the cascade case the subject genuinely is being erased, and
    -- entity_id (the row id) is enough to tie the line to its subject. If an
    -- admin-facing delete is ever added, revisit this -- it would then be
    -- erasing the id of somebody who is still here.
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

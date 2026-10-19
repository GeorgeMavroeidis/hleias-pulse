-- Validate a new schedule at write time. A CHECK using now() would reject
-- unrelated updates after an event ages; RSVP and moderation must keep working.
create or replace function private.enforce_meet_future_start()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is not null then
    if tg_op = 'INSERT' then
      if not pg_catalog.isfinite(new.starts_at) or new.starts_at <= pg_catalog.clock_timestamp() then
        raise exception 'Meet start must be in the future.' using errcode = '22023';
      end if;
    elsif new.starts_at is distinct from old.starts_at
       or new.user_id is distinct from old.user_id then
      if not pg_catalog.isfinite(new.starts_at) or new.starts_at <= pg_catalog.clock_timestamp() then
        raise exception 'Meet start must be in the future.' using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_meet_future_start() from public, anon, authenticated, service_role;

drop trigger if exists enforce_meet_future_start on public.meet_events;
create trigger enforce_meet_future_start
before insert or update on public.meet_events
for each row execute function private.enforce_meet_future_start();

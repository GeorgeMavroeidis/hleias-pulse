begin;

-- A previous version accepted arbitrary text lengths. Block deployment if
-- oversized live rows appeared, so they can be reviewed without deleting data.
do $$
begin
  if exists (
    select 1 from public.push_subscriptions
    where pg_catalog.octet_length(endpoint) > 2048
       or pg_catalog.octet_length(p256dh) > 256
       or pg_catalog.octet_length(auth_key) > 128
  ) then
    raise exception 'Oversized push subscriptions require review before migration';
  end if;
end;
$$;

create or replace function private.enforce_push_subscription_endpoint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_allowed_push_endpoint(new.endpoint)
     or pg_catalog.octet_length(new.endpoint) > 2048
     or pg_catalog.octet_length(new.p256dh) > 256
     or pg_catalog.octet_length(new.auth_key) > 128 then
    raise exception using
      errcode = '23514',
      message = 'Invalid push subscription';
  end if;
  return new;
end;
$$;
revoke execute on function private.enforce_push_subscription_endpoint()
  from public, anon, authenticated, service_role;
drop trigger if exists push_subscriptions_validate_endpoint on public.push_subscriptions;
create trigger push_subscriptions_validate_endpoint
before insert or update of endpoint, p256dh, auth_key on public.push_subscriptions
for each row execute function private.enforce_push_subscription_endpoint();

-- A user may register several devices, but each subscription is a future
-- delivery for every answer they receive. Serialize registrations per user so
-- concurrent inserts cannot exceed the cap.
create or replace function private.enforce_push_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_count integer;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is not distinct from old.user_id then
      return new;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    76218812,
    pg_catalog.hashtext(new.user_id::text)
  );
  select count(*) into subscription_count
  from public.push_subscriptions as s
  where s.user_id = new.user_id and s.id <> new.id;
  if subscription_count >= 10 then
    raise exception using
      errcode = '23514',
      message = 'Push subscription limit reached';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_push_subscription_limit()
  from public, anon, authenticated, service_role;
drop trigger if exists push_subscriptions_limit_per_user on public.push_subscriptions;
create trigger push_subscriptions_limit_per_user
before insert or update of user_id on public.push_subscriptions
for each row execute function private.enforce_push_subscription_limit();

-- Keep each worker call bounded even if the hosted database already contains
-- more than ten subscriptions per user or a large historical queue. Previously
-- the fanout INSERT and expired-lease UPDATE touched every pending row before
-- the final claim LIMIT 20 was reached.
create or replace function public.claim_push_delivery_batch()
returns table (
  delivery_id uuid,
  claim_token uuid,
  outbox_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  recovered_outbox_id uuid;
  fanout_outbox_ids uuid[];
begin
  for recovered_outbox_id in
    with expired as (
      select d.id
      from private.push_notification_deliveries as d
      where d.status = 'processing'
        and d.processing_at < now() - interval '5 minutes'
      order by d.processing_at, d.id
      limit 20
      for update of d skip locked
    ), recovered as (
      update private.push_notification_deliveries as d
      set status = case when d.attempt_count >= 4 then 'failed' else 'queued' end,
          next_attempt_at = case when d.attempt_count >= 4 then d.next_attempt_at else now() end,
          claim_token = null,
          processing_at = null,
          completed_at = case when d.attempt_count >= 4 then now() else null end,
          last_error_code = case
            when d.attempt_count >= 4 then 'lease_exhausted'
            else 'lease_recovered'
          end,
          updated_at = now()
      from expired as e
      where d.id = e.id
      returning d.outbox_id
    )
    select distinct r.outbox_id from recovered as r
  loop
    perform private.refresh_push_outbox_status(recovered_outbox_id);
  end loop;

  select coalesce(array_agg(candidate.id), array[]::uuid[])
  into fanout_outbox_ids
  from (
    select o.id
    from private.push_notification_outbox as o
    where o.status = 'queued'
      and not exists (
        select 1 from private.push_notification_deliveries as d
        where d.outbox_id = o.id
      )
    order by o.created_at, o.id
    limit 20
    for update of o skip locked
  ) as candidate;

  insert into private.push_notification_deliveries (outbox_id, subscription_id)
  select o.id, s.id
  from private.push_notification_outbox as o
  join lateral (
    select s.id
    from public.push_subscriptions as s
    where s.user_id = o.recipient_id
    order by s.created_at desc, s.id
    limit 10
  ) as s on true
  where o.id = any(fanout_outbox_ids)
  on conflict on constraint push_notification_deliveries_outbox_subscription_key do nothing;

  update private.push_notification_outbox as o
  set status = 'skipped',
      last_error_code = 'no_subscription',
      completed_at = now(),
      updated_at = now()
  where o.id = any(fanout_outbox_ids)
    and o.status = 'queued'
    and not exists (
      select 1 from private.push_notification_deliveries as d
      where d.outbox_id = o.id
    );

  return query
  with candidates as (
    select d.id
    from private.push_notification_deliveries as d
    join private.push_notification_outbox as o on o.id = d.outbox_id
    where d.status = 'queued'
      and d.next_attempt_at <= now()
      and o.status in ('queued', 'processing')
    order by d.next_attempt_at, d.created_at
    for update of d skip locked
    limit 20
  ), claimed as (
    update private.push_notification_deliveries as d
    set status = 'processing',
        attempt_count = d.attempt_count + 1,
        claim_token = extensions.gen_random_uuid(),
        processing_at = now(),
        updated_at = now()
    from candidates as c
    where d.id = c.id
    returning d.id, d.claim_token, d.outbox_id, d.attempt_count
  ), marked as (
    update private.push_notification_outbox as o
    set status = 'processing', updated_at = now()
    where o.id in (select c.outbox_id from claimed as c)
    returning o.id
  )
  select c.id, c.claim_token, c.outbox_id, c.attempt_count
  from claimed as c;
end;
$$;

revoke execute on function public.claim_push_delivery_batch()
  from public, anon, authenticated;
grant execute on function public.claim_push_delivery_batch() to service_role;

commit;

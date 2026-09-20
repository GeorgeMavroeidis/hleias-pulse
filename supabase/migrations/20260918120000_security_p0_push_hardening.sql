begin;

-- Phase 0 push hardening.
--
-- Security invariants:
--   * comment INSERT never performs network I/O;
--   * only a transition into `published` can create a logical notification;
--   * queue state is private and unique per event/comment/recipient;
--   * clients cannot claim or complete queue work;
--   * every outbound endpoint is allowlisted both here and in the worker;
--   * the scheduled worker is inert unless all three Vault values exist.

create extension if not exists pg_cron;

drop trigger if exists comments_notify_question_answered on public.comments;
drop function if exists public.notify_question_answered();

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create table private.push_notification_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  event_type text not null check (event_type = 'question_answer_published'),
  source_comment_id uuid not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'skipped', 'failed')),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (event_type, source_comment_id, recipient_id)
);

create table private.push_notification_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  outbox_id uuid not null references private.push_notification_outbox(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'skipped', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 4),
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  processing_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outbox_id, subscription_id)
);

create index push_notification_outbox_status_idx
  on private.push_notification_outbox (status, created_at);
create index push_notification_deliveries_due_idx
  on private.push_notification_deliveries (next_attempt_at, created_at)
  where status = 'queued';
create index push_notification_deliveries_processing_idx
  on private.push_notification_deliveries (processing_at)
  where status = 'processing';
create index push_notification_deliveries_outbox_idx
  on private.push_notification_deliveries (outbox_id, status);

alter table private.push_notification_outbox enable row level security;
alter table private.push_notification_deliveries enable row level security;

revoke all on private.push_notification_outbox from public, anon, authenticated, service_role;
revoke all on private.push_notification_deliveries from public, anon, authenticated, service_role;

comment on table private.push_notification_outbox is
  'One durable logical notification per published answer and recipient. Contains no message text.';
comment on table private.push_notification_deliveries is
  'Per-subscription delivery state. Endpoints and encryption keys remain in push_subscriptions.';

-- Strict, anchored provider allowlist. Requiring the provider hostname to be
-- followed immediately by `/` also rejects URL credentials and explicit ports.
create or replace function private.is_allowed_push_endpoint(candidate text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select candidate is not null
    and candidate !~ '#'
    and (
      candidate ~* '^https://fcm[.]googleapis[.]com(:443)?/[^#]+$'
      or candidate ~* '^https://updates[.]push[.]services[.]mozilla[.]com(:443)?/[^#]+$'
      or candidate ~* '^https://[a-z0-9-]+[.]push[.]apple[.]com(:443)?/[^#]+$'
    );
$$;

create or replace function private.enforce_push_subscription_endpoint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_allowed_push_endpoint(new.endpoint) then
    raise exception using
      errcode = '23514',
      message = 'Invalid push subscription endpoint';
  end if;
  return new;
end;
$$;

-- Do not silently retain an endpoint that the privileged worker would refuse.
delete from public.push_subscriptions
where not private.is_allowed_push_endpoint(endpoint);

drop trigger if exists push_subscriptions_validate_endpoint on public.push_subscriptions;
create trigger push_subscriptions_validate_endpoint
before insert or update of endpoint on public.push_subscriptions
for each row execute function private.enforce_push_subscription_endpoint();

revoke all on function private.is_allowed_push_endpoint(text) from public, anon, authenticated;
revoke all on function private.enforce_push_subscription_endpoint() from public, anon, authenticated;

create or replace function private.enqueue_published_question_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
begin
  if new.target_type <> 'post' or new.post_id is null or new.user_id is null then
    return new;
  end if;

  select p.user_id
  into recipient
  from public.posts as p
  where p.id = new.post_id
    and p.kind = 'question'
    and p.moderation_status = 'published'
    and p.user_id is not null;

  if recipient is null or recipient = new.user_id then
    return new;
  end if;

  if exists (
    select 1
    from public.user_blocks as ub
    where ub.kind = 'block'
      and (
        (ub.blocker_id = new.user_id and ub.blocked_id = recipient)
        or (ub.blocker_id = recipient and ub.blocked_id = new.user_id)
      )
  ) then
    return new;
  end if;

  insert into private.push_notification_outbox (
    event_type,
    source_comment_id,
    recipient_id
  ) values (
    'question_answer_published',
    new.id,
    recipient
  )
  on conflict (event_type, source_comment_id, recipient_id) do nothing;

  return new;
end;
$$;

drop trigger if exists comments_queue_published_question_answer on public.comments;
create trigger comments_queue_published_question_answer
after update of moderation_status on public.comments
for each row
when (old.moderation_status is distinct from 'published' and new.moderation_status = 'published')
execute function private.enqueue_published_question_answer();

revoke all on function private.enqueue_published_question_answer() from public, anon, authenticated;

create or replace function private.refresh_push_outbox_status(target_outbox_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status text;
  error_code text;
begin
  select
    case
      when bool_or(d.status = 'processing') then 'processing'
      when bool_or(d.status = 'queued') then 'queued'
      when bool_or(d.status = 'sent') then 'sent'
      when bool_or(d.status = 'failed') then 'failed'
      else 'skipped'
    end,
    min(d.last_error_code) filter (where d.last_error_code is not null)
  into next_status, error_code
  from private.push_notification_deliveries as d
  where d.outbox_id = target_outbox_id;

  update private.push_notification_outbox
  set status = coalesce(next_status, 'skipped'),
      last_error_code = error_code,
      completed_at = case
        when coalesce(next_status, 'skipped') in ('sent', 'skipped', 'failed') then now()
        else null
      end,
      updated_at = now()
  where id = target_outbox_id;
end;
$$;

revoke all on function private.refresh_push_outbox_status(uuid)
  from public, anon, authenticated, service_role;

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
begin
  -- Recover only leases old enough that a normal Edge invocation cannot still
  -- be active. A crash after provider acceptance can still cause one retry;
  -- the stable Web Push Topic minimizes that unavoidable protocol boundary.
  for recovered_outbox_id in
    with recovered as (
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
      where d.status = 'processing'
        and d.processing_at < now() - interval '5 minutes'
      returning d.outbox_id
    )
    select distinct r.outbox_id from recovered as r
  loop
    perform private.refresh_push_outbox_status(recovered_outbox_id);
  end loop;

  insert into private.push_notification_deliveries (outbox_id, subscription_id)
  select o.id, s.id
  from private.push_notification_outbox as o
  join public.push_subscriptions as s on s.user_id = o.recipient_id
  where o.status in ('queued', 'processing')
  on conflict (outbox_id, subscription_id) do nothing;

  update private.push_notification_outbox as o
  set status = 'skipped',
      last_error_code = 'no_subscription',
      completed_at = now(),
      updated_at = now()
  where o.status = 'queued'
    and not exists (
      select 1
      from private.push_notification_deliveries as d
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

revoke all on function public.claim_push_delivery_batch()
  from public, anon, authenticated;
grant execute on function public.claim_push_delivery_batch() to service_role;

create or replace function public.prepare_push_delivery(
  target_delivery_id uuid,
  target_claim_token uuid
)
returns table (
  delivery_id uuid,
  outbox_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  post_id text,
  comment_text text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery private.push_notification_deliveries%rowtype;
  event private.push_notification_outbox%rowtype;
  subscription public.push_subscriptions%rowtype;
  source_comment public.comments%rowtype;
  parent_post public.posts%rowtype;
  eligible boolean := true;
begin
  select * into delivery
  from private.push_notification_deliveries as d
  where d.id = target_delivery_id
  for update;

  if not found
    or delivery.status <> 'processing'
    or delivery.claim_token is distinct from target_claim_token then
    return;
  end if;

  select * into event
  from private.push_notification_outbox as o
  where o.id = delivery.outbox_id;

  select * into subscription
  from public.push_subscriptions as s
  where s.id = delivery.subscription_id;

  select * into source_comment
  from public.comments as c
  where c.id = event.source_comment_id;

  if source_comment.id is not null then
    select * into parent_post
    from public.posts as p
    where p.id = source_comment.post_id;
  end if;

  eligible := event.id is not null
    and event.status = 'processing'
    and subscription.id is not null
    and source_comment.id is not null
    and source_comment.moderation_status = 'published'
    and source_comment.target_type = 'post'
    and source_comment.user_id is not null
    and parent_post.id is not null
    and parent_post.kind = 'question'
    and parent_post.moderation_status = 'published'
    and parent_post.user_id = event.recipient_id
    and source_comment.user_id <> event.recipient_id;

  if eligible and exists (
    select 1
    from public.user_blocks as ub
    where ub.kind = 'block'
      and (
        (ub.blocker_id = source_comment.user_id and ub.blocked_id = event.recipient_id)
        or (ub.blocker_id = event.recipient_id and ub.blocked_id = source_comment.user_id)
      )
  ) then
    eligible := false;
  end if;

  if not eligible then
    update private.push_notification_deliveries
    set status = 'skipped',
        claim_token = null,
        processing_at = null,
        completed_at = now(),
        last_error_code = 'ineligible',
        updated_at = now()
    where id = delivery.id;
    perform private.refresh_push_outbox_status(delivery.outbox_id);
    return;
  end if;

  if not private.is_allowed_push_endpoint(subscription.endpoint) then
    delete from public.push_subscriptions where id = subscription.id;
    update private.push_notification_deliveries
    set status = 'skipped',
        claim_token = null,
        processing_at = null,
        completed_at = now(),
        last_error_code = 'invalid_endpoint',
        updated_at = now()
    where id = delivery.id;
    perform private.refresh_push_outbox_status(delivery.outbox_id);
    return;
  end if;

  return query select
    delivery.id,
    delivery.outbox_id,
    subscription.id,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth_key,
    parent_post.id,
    source_comment.text,
    delivery.attempt_count;
end;
$$;

revoke all on function public.prepare_push_delivery(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_push_delivery(uuid, uuid) to service_role;

create or replace function public.complete_push_delivery(
  target_delivery_id uuid,
  target_claim_token uuid,
  outcome text,
  error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery private.push_notification_deliveries%rowtype;
  safe_error text := case
    when error_code ~ '^[a-z0-9_]{1,64}$' then error_code
    else null
  end;
begin
  if outcome not in ('sent', 'transient', 'permanent', 'gone') then
    raise exception 'Invalid delivery outcome';
  end if;

  select * into delivery
  from private.push_notification_deliveries as d
  where d.id = target_delivery_id
  for update;

  if not found
    or delivery.status <> 'processing'
    or delivery.claim_token is distinct from target_claim_token then
    return false;
  end if;

  if outcome = 'sent' then
    update private.push_notification_deliveries
    set status = 'sent',
        claim_token = null,
        processing_at = null,
        sent_at = now(),
        completed_at = now(),
        last_error_code = null,
        updated_at = now()
    where id = delivery.id;
  elsif outcome = 'gone' then
    delete from public.push_subscriptions where id = delivery.subscription_id;
    update private.push_notification_deliveries
    set status = 'skipped',
        claim_token = null,
        processing_at = null,
        completed_at = now(),
        last_error_code = coalesce(safe_error, 'subscription_gone'),
        updated_at = now()
    where id = delivery.id;
  elsif outcome = 'transient' and delivery.attempt_count < 4 then
    update private.push_notification_deliveries
    set status = 'queued',
        claim_token = null,
        processing_at = null,
        next_attempt_at = now() + case delivery.attempt_count
          when 1 then interval '1 minute'
          when 2 then interval '5 minutes'
          else interval '30 minutes'
        end,
        last_error_code = coalesce(safe_error, 'transient_failure'),
        updated_at = now()
    where id = delivery.id;
  else
    update private.push_notification_deliveries
    set status = 'failed',
        claim_token = null,
        processing_at = null,
        completed_at = now(),
        last_error_code = coalesce(safe_error, 'permanent_failure'),
        updated_at = now()
    where id = delivery.id;
  end if;

  perform private.refresh_push_outbox_status(delivery.outbox_id);
  return true;
end;
$$;

revoke all on function public.complete_push_delivery(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_push_delivery(uuid, uuid, text, text) to service_role;

-- The cron entry contains no credential. Vault values are read only at run
-- time, and a mismatched URL fails closed instead of becoming a database SSRF
-- primitive through operational misconfiguration.
create or replace function private.invoke_push_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_url text;
  worker_apikey text;
  worker_secret text;
  request_id bigint;
begin
  select decrypted_secret into worker_url
  from vault.decrypted_secrets where name = 'push_worker_url';
  select decrypted_secret into worker_apikey
  from vault.decrypted_secrets where name = 'push_worker_apikey';
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets where name = 'push_worker_secret';

  if worker_url is null or worker_apikey is null or worker_secret is null then
    return null;
  end if;

  if worker_url <> 'https://kfxfnqryfmuxiwlswyyn.supabase.co/functions/v1/send-push' then
    return null;
  end if;

  select net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', worker_apikey,
      'X-Push-Worker-Secret', worker_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_push_worker()
  from public, anon, authenticated, service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'push-notification-worker';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end;
$$;

select cron.schedule(
  'push-notification-worker',
  '* * * * *',
  $cron$select private.invoke_push_worker();$cron$
);

commit;

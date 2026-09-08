begin;

-- Web push, scoped to one thing only for now (FEATURES.md → Ask a local):
-- "someone answered your question". A user's browser registers a
-- push_subscriptions row when they opt in; a trigger on new comments asks the
-- send-push edge function to notify the question's owner when their question
-- gets an answer.

create extension if not exists pg_net;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- A user manages only their own subscriptions — nobody else's browser
-- endpoint is any of their business, and this table is never read through
-- get_pulse_bootstrap() or any other shared path.
create policy "Users manage their own push subscriptions"
on public.push_subscriptions for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Deliberately minimal: passes only the new comment's id. The edge function
-- (running with service_role) re-derives the question, its owner and the
-- real answer text itself — nobody can spoof a notification's title/body by
-- calling the function directly with a fabricated payload, since the
-- function never trusts anything the caller sends except this id.
--
-- Fire-and-forget (pg_net queues the HTTP call and returns immediately) so a
-- slow or failed push never blocks the comment insert itself.
create or replace function public.notify_question_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.target_type = 'post' and exists (
    select 1 from public.posts where id = new.post_id and kind = 'question'
  ) then
    perform net.http_post(
      url := 'https://kfxfnqryfmuxiwlswyyn.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer sb_publishable_3E2YsCPkTKaP2IiDIqQNrQ__OCnauzd'
      ),
      body := jsonb_build_object('comment_id', new.id)
    );
  end if;
  return new;
end;
$$;

create trigger comments_notify_question_answered
after insert on public.comments
for each row execute function public.notify_question_answered();

commit;

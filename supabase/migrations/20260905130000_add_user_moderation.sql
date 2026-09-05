-- User-facing moderation: reports, blocks and mutes.
--
-- PR #40 shipped the report / block / mute UI against
-- src/components/hp/moderation-api-stub.ts, which keeps everything in two
-- module-level Sets. A block therefore does not survive a page reload, and a
-- report is a console.warn that reaches nobody - no row, no moderator queue,
-- no admin dashboard entry. Apple Guideline 1.2 wants a mechanism that works,
-- and the one thing a reviewer can test by hand - block someone, relaunch, are
-- they still blocked - fails today.
--
-- This is the storage under that UI. The client contract is unchanged: the six
-- functions added to hp-api.ts match the stub's exported signatures exactly,
-- so the swap is one import line in moderation-store.ts.
--
-- Blocks and mutes share one table. They are mutually exclusive for a given
-- pair - blocking someone you had muted replaces the mute - and a single row
-- with a `kind` column makes that one upsert instead of a two-table
-- transaction that can half-fail and leave a user both blocked and muted.

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create table if not exists public.content_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  -- target_id is text, not uuid: places carry text ids while posts and stories
  -- carry uuids. public.moderate_content(target_type, target_id, ...) already
  -- takes text for the same reason, so a moderator can act on a report without
  -- a per-type branch.
  target_type text not null check (
    target_type in ('post', 'comment', 'place', 'story', 'meet_event', 'cultural_event', 'profile')
  ),
  target_id text not null,
  reason text not null check (
    reason in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'false_info', 'other')
  ),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'open' check (
    status in ('open', 'reviewing', 'actioned', 'dismissed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One standing report per person per target. Re-reporting the same thing
  -- updates the reason and note instead of flooding the queue with duplicates,
  -- and it keeps "how many distinct people reported this" an honest count.
  unique (reporter_id, target_type, target_id)
);

create index if not exists content_reports_status_created_idx
  on public.content_reports (status, created_at desc);

-- Answers "how many people reported this thing", which is what turns a queue
-- into a priority order.
create index if not exists content_reports_target_idx
  on public.content_reports (target_type, target_id);

drop trigger if exists content_reports_set_updated_at on public.content_reports;
create trigger content_reports_set_updated_at
  before update on public.content_reports
  for each row execute function public.set_updated_at();

alter table public.content_reports enable row level security;

-- A reporter may file and read their own reports, and nothing else. Reports are
-- deliberately not deletable by the reporter: withdrawing a harassment report
-- should be a moderator decision, not a button an aggressor can pressure
-- someone into pressing.
drop policy if exists "content_reports_insert_own" on public.content_reports;
create policy "content_reports_insert_own" on public.content_reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

drop policy if exists "content_reports_select_own" on public.content_reports;
create policy "content_reports_select_own" on public.content_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

drop policy if exists "content_reports_update_own" on public.content_reports;
create policy "content_reports_update_own" on public.content_reports
  for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()) and status = 'open');

drop policy if exists "content_reports_admin_read" on public.content_reports;
create policy "content_reports_admin_read" on public.content_reports
  for select to authenticated
  using (public.has_admin_role(array['owner', 'editor', 'moderator']));

drop policy if exists "content_reports_admin_write" on public.content_reports;
create policy "content_reports_admin_write" on public.content_reports
  for update to authenticated
  using (public.has_admin_role(array['owner', 'editor', 'moderator']))
  with check (public.has_admin_role(array['owner', 'editor', 'moderator']));

-- ---------------------------------------------------------------------------
-- Blocks and mutes
-- ---------------------------------------------------------------------------

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('block', 'mute')),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocker_kind_idx
  on public.user_blocks (blocker_id, kind);

-- Needed to hide a blocker's content from the person they blocked, which is the
-- half of blocking that is not just a client-side filter.
create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- Your block list is yours: you are the only one who can read or change it.
-- Nobody can see that they have been blocked, which is the whole point.
drop policy if exists "user_blocks_all_own" on public.user_blocks;
create policy "user_blocks_all_own" on public.user_blocks
  for all to authenticated
  using (blocker_id = (select auth.uid()))
  with check (blocker_id = (select auth.uid()));

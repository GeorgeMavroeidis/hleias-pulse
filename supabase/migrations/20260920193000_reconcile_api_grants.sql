-- Canonical API privileges: independent of Supabase legacy default grants.
-- RLS remains authoritative for which rows each caller may access.
-- No production write is needed to validate this migration; replay locally.
begin;

grant usage on schema public to anon, authenticated, service_role;

-- The migration ledger matches Git, but the live catalog retained older
-- shapes for these objects. Re-state the canonical definitions so a live
-- upgrade and an empty replay converge without rewriting migration history.
alter table public.posts alter column sort_order type bigint;
alter table public.comments alter column sort_order type bigint;

alter table public.place_business_profiles
  drop constraint if exists place_business_profiles_deal_text_length;
alter table public.place_business_profiles
  drop constraint if exists place_business_profiles_deal_text_len;
alter table public.place_business_profiles
  add constraint place_business_profiles_deal_text_len
  check (deal_text is null or char_length(deal_text) <= 140);

-- A redemption already follows its claim with ON DELETE CASCADE. Its
-- denormalized business/place keys used NO ACTION, however, and could block the
-- parent delete before that cleanup path ran. Make every ownership edge agree.
alter table public.deal_redemptions
  drop constraint deal_redemptions_business_id_fkey,
  drop constraint deal_redemptions_place_id_fkey;
alter table public.deal_redemptions
  add constraint deal_redemptions_business_id_fkey
    foreign key (business_id) references public.businesses(id) on delete cascade,
  add constraint deal_redemptions_place_id_fkey
    foreign key (place_id) references public.places(id) on update cascade on delete cascade;

drop index if exists public.user_place_visits_user_id_visited_at_idx;
create index if not exists user_place_visits_user_visited_idx
  on public.user_place_visits (user_id, visited_at desc);

create or replace function public.set_place_deal(
  claim_id uuid,
  deal_text text,
  deal_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_business uuid;
  claim_status text;
  cleaned text;
begin
  select business_id, status
    into owner_business, claim_status
  from public.place_business_profiles
  where id = claim_id;

  if not found then
    raise exception 'Claim not found';
  end if;
  if owner_business is distinct from public.current_business_id() then
    raise exception 'Not authorized to manage this deal';
  end if;
  if claim_status <> 'approved' then
    raise exception 'The place claim must be approved before adding a deal';
  end if;

  cleaned := nullif(btrim(set_place_deal.deal_text), '');
  if cleaned is not null and char_length(cleaned) > 140 then
    raise exception 'Deal text must be 140 characters or fewer';
  end if;

  update public.place_business_profiles
  set deal_text = cleaned,
      deal_active = set_place_deal.deal_active
  where id = claim_id;
end;
$$;

-- route_stops has no `id` column, so the generic admin audit function cannot
-- address it. The historical trigger was accepted by PostgreSQL but failed on
-- its first write with "record new has no field id".
create or replace function private.write_route_stop_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if not public.has_admin_role(array['owner', 'editor']) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    (row_data->>'route_id') || ':' || (row_data->>'position'),
    jsonb_build_object(
      'before', case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      'after', case when tg_op = 'DELETE' then null else to_jsonb(new) end
    )
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.write_route_stop_audit_log()
from public, anon, authenticated, service_role;
drop trigger if exists audit_admin_route_stops on public.route_stops;
create trigger audit_admin_route_stops
after insert or update or delete on public.route_stops
for each row execute function private.write_route_stop_audit_log();

-- Remove legacy blanket TRUNCATE / REFERENCES / TRIGGER and implicit CRUD.
revoke all on table
  public.admin_audit_logs,
  public.admin_members,
  public.authors,
  public.businesses,
  public.comments,
  public.content_reports,
  public.cultural_event_likes,
  public.cultural_events,
  public.deal_redemptions,
  public.event_rsvps,
  public.events,
  public.meet_events,
  public.organizers,
  public.place_avatars,
  public.place_business_profiles,
  public.places,
  public.post_likes,
  public.posts,
  public.profiles,
  public.push_subscriptions,
  public.route_stops,
  public.routes,
  public.saved_items,
  public.stories,
  public.story_views,
  public.user_activity_days,
  public.user_blocks,
  public.user_place_visits,
  public.user_preferences,
  public.user_security_events,
  public.vibe_chips
from public, anon, authenticated;

-- service_role is the trusted API administration role; private queues remain
-- inaccessible except through their existing, restricted worker RPCs.
grant all on table
  public.admin_audit_logs,
  public.admin_members,
  public.authors,
  public.businesses,
  public.comments,
  public.content_reports,
  public.cultural_event_likes,
  public.cultural_events,
  public.deal_redemptions,
  public.event_rsvps,
  public.events,
  public.meet_events,
  public.organizers,
  public.place_avatars,
  public.place_business_profiles,
  public.places,
  public.post_likes,
  public.posts,
  public.profiles,
  public.push_subscriptions,
  public.route_stops,
  public.routes,
  public.saved_items,
  public.stories,
  public.story_views,
  public.user_activity_days,
  public.user_blocks,
  public.user_place_visits,
  public.user_preferences,
  public.user_security_events,
  public.vibe_chips
to service_role;

grant select on public.authors to anon;
grant select on public.businesses to anon;
grant select on public.comments to anon;
grant select on public.cultural_events to anon;
grant select on public.events to anon;
grant select on public.meet_events to anon;
grant select on public.organizers to anon;
grant select on public.place_avatars to anon;
grant select on public.place_business_profiles to anon;
grant select on public.places to anon;
grant select on public.posts to anon;
grant select on public.profiles to anon;
grant select on public.route_stops to anon;
grant select on public.routes to anon;
grant select on public.stories to anon;
grant select on public.vibe_chips to anon;
grant select on public.admin_audit_logs to authenticated;
grant select, insert, update, delete on public.admin_members to authenticated;
grant select on public.authors to authenticated;
grant select, insert, update, delete on public.businesses to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
grant select, insert, update on public.content_reports to authenticated;
grant select, insert, delete on public.cultural_event_likes to authenticated;
grant select, insert, update, delete on public.cultural_events to authenticated;
grant select, insert, update, delete on public.deal_redemptions to authenticated;
grant select, insert, update, delete on public.event_rsvps to authenticated;
grant select on public.events to authenticated;
grant select, insert, update, delete on public.meet_events to authenticated;
grant select, insert, update, delete on public.organizers to authenticated;
grant select, insert, update, delete on public.place_avatars to authenticated;
grant select, insert, update, delete on public.place_business_profiles to authenticated;
grant select, insert, update, delete on public.places to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.route_stops to authenticated;
grant select, insert, update, delete on public.routes to authenticated;
grant select, insert, delete on public.saved_items to authenticated;
grant select, insert, update, delete on public.stories to authenticated;
grant select, insert, update, delete on public.story_views to authenticated;
grant select, insert, update on public.user_activity_days to authenticated;
grant select, insert, update, delete on public.user_blocks to authenticated;
grant select, insert, delete on public.user_place_visits to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select on public.user_security_events to authenticated;
grant select on public.vibe_chips to authenticated;

-- Both client paths use PostgREST UPSERT. PostgreSQL checks UPDATE permission
-- even for the first insert, so the original insert-only policies made a fresh
-- database fail while production's legacy blanket grants hid the omission.
drop policy if exists "Users can update own story views" on public.story_views;
create policy "Users can update own story views"
on public.story_views for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users can update own activity days" on public.user_activity_days;
create policy "Users can update own activity days"
on public.user_activity_days for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- PostgreSQL otherwise gives every new function to PUBLIC. Make current and
-- future RPC access explicit while keeping policy helper functions callable by
-- anonymous reads. Trigger-only functions are intentionally not API-callable.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function
  public.blocked_user_ids(),
  public.current_admin_role(),
  public.current_business_id(),
  public.current_organizer_id(),
  public.get_pulse_bootstrap(),
  public.has_admin_role(text[]),
  public.refresh_generic_stories()
to anon, authenticated;
grant execute on function
  public.issue_deal_code(text),
  public.moderate_content(text, text, text),
  public.redeem_deal_code(text),
  public.review_place_claim(uuid, text),
  public.set_place_deal(uuid, text, boolean)
to authenticated;

-- Future tables, sequences and functions must declare their own API grants.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Live had these two policies addressed to PUBLIC, while their committed
-- creation migration targets authenticated. Preserve the predicate and make
-- both upgrade and clean replay converge on the authored role boundary.
alter policy "Users can read own place visits" on public.user_place_visits to authenticated;
alter policy "Users can create own place visits" on public.user_place_visits to authenticated;

commit;

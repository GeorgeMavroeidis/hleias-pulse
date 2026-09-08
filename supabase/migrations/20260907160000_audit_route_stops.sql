-- Audit route_stops, the last table of its kind without a trigger.
--
-- `routes` has carried write_admin_audit_log() since 20260824090000;
-- `route_stops` never did. The two are edited as one thing in the product —
-- saveAdminRoute() then replaceAdminRouteStops() — so the gap is not visible
-- from the dashboard, but it means the stops of a curated itinerary can be
-- reordered, retargeted or emptied with no record, while renaming the route
-- around them is recorded. Found 2026-09-07 alongside the businesses /
-- organizers / admin_members gap (20260907120000) and approved as part of the
-- same pass.
--
-- This reuses the existing write_admin_audit_log() rather than adding another
-- function, which is the right call here and NOT the call made for
-- admin_members in 20260907120000. The difference is who can write the table.
-- write_admin_audit_log() returns early unless the actor is owner/editor, so
-- reusing it is only safe where nobody else can write:
--
--   route_stops    "Editors can manage route stops" (20260824090000) is the
--                  only write policy, and the table has no self-service path.
--                  Every legitimate write is already an owner/editor write, so
--                  the role gate never suppresses one.
--   admin_members  writable by owners, but ALSO by the postgres role and by
--                  service_role, neither of which has an auth.uid(). There the
--                  gate would have dropped exactly the rows worth keeping,
--                  which is why that table got a role-blind function instead.
--
-- Known and accepted cost: replaceAdminRouteStops() deletes every stop and
-- reinserts, so one save of an N-stop route writes 2N audit rows, each with a
-- full before/after row payload. Routes are curated by two maintainers and
-- rarely edited, so the volume is negligible; if that ever stops being true,
-- the fix is a narrower function like write_verification_audit_log(), not
-- removing the trigger.

drop trigger if exists audit_admin_route_stops on public.route_stops;
create trigger audit_admin_route_stops
after insert or update or delete on public.route_stops
for each row execute function public.write_admin_audit_log();

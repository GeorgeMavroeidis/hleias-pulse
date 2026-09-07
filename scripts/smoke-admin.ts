/**
 * End-to-end check of the admin privilege model — through the app's own code
 * path, not around it.
 *
 * `/admin` is the one surface with its own privilege-escalation route: a row in
 * `admin_members` grants the power to publish or hide anyone's content, verify a
 * business, resolve a place claim, and hand out more admin rows. Nothing
 * exercised any of it until this script. It is the gap IDEAS.md calls "the
 * sharpest of these".
 *
 * Like `smoke:moderation`, it imports the real functions from
 * `src/lib/admin-api.ts` and the real singleton client from
 * `src/lib/supabase/client.ts` — the same modules `AdminDashboard.tsx` loads —
 * and verifies the committed result over a direct `pg` connection. A stub, or a
 * client-side role check, could not pass it.
 *
 * Two things about Postgres row-level security shape every assertion here:
 *
 *   1. A refused INSERT raises 42501. A refused UPDATE or DELETE does not: its
 *      USING clause simply matches no rows, and the database returns success
 *      having changed nothing. `admin-api.ts` now asks for the changed rows
 *      back and raises AdminWriteRefusedError on an empty result, so the app is
 *      loud about it — but that is a client-side check, and a client-side check
 *      is exactly what a stub could fake. So "did it throw?" is still only half
 *      a test: every negative case below also re-reads the row over `pg` to
 *      prove the *policy* refused it.
 *   2. `write_admin_audit_log()` returns early unless the actor is owner/editor.
 *      A moderator's actions are logged only because `moderate_content()`
 *      inserts its own line. Both halves are asserted.
 *
 * Four disposable users, one scenario each:
 *
 *   outsider   signed in, no admin_members row — the stranger with a valid
 *              account and the public API key
 *   moderator  admin_members role 'moderator'
 *   owner      admin_members role 'owner'
 *   applicant  owns a pending business + organizer + place claim; never signs
 *              in. Verification targets that belong to somebody else, so the
 *              outsider is blocked by RLS rather than by the self-verification
 *              triggers (those are `smoke:verification-guards`).
 *
 * What it asserts:
 *
 *   as the outsider
 *     loadAdminData()      succeeds but returns members: [] and auditLogs: []
 *                          while `pg` proves both tables are non-empty — the
 *                          dashboard hides the team and the audit trail by RLS
 *                          alone, and does not error
 *     moderateContent()    raises 'Not authorized to moderate content'
 *     setBusinessVerification() / setOrganizerVerification()
 *                          raise "Nothing changed", and change nothing — the
 *                          two halves of case 1 above
 *     reviewPlaceClaim()   raises 'Not authorized to review place claims'
 *     setAdminMember()     raises — a stranger cannot promote themselves. This
 *                          is the privilege-escalation attempt.
 *
 *   as the moderator
 *     moderateContent()    publishes the post and writes exactly one audit row
 *                          ('moderation_status_changed'), with no trigger row
 *                          beside it (case 2 above)
 *     setAdminMember()     raises — a moderator cannot promote
 *     removeAdminMember()  raises "Nothing was removed", and the owner's row
 *                          survives
 *     reviewPlaceClaim()   raises — claim review is owner/editor only
 *
 *   as the owner
 *     setBusinessVerification() / setOrganizerVerification()  land, and each
 *                          writes a 'verification_status_changed' audit row
 *     reviewPlaceClaim()   approves the claim and writes 'place_claim_reviewed'
 *     moderateContent()    hides the post and now writes a trigger row too,
 *                          because the actor is an owner
 *     setAdminMember() / removeAdminMember()  add and remove a real member,
 *                          writing 'admin_role_granted' and 'admin_role_revoked'
 *
 * Those last audit assertions are the 2026-09-07 finding, now closed:
 * `businesses`, `organizers` and `admin_members` had no audit coverage at all,
 * so verifying a business and granting somebody `owner` left no trace.
 * 20260907120000 gives them their own triggers, and this script pins all three
 * — including the property that separates them from `write_admin_audit_log()`:
 * the `admin_members` trigger is role-blind, so the fixture rows this script
 * inserts over `pg`, with no JWT and therefore no `auth.uid()`, are audited too.
 * What is deliberately NOT audited is asserted as well: a self-service business
 * application (a row that starts `pending`) writes no line.
 *
 * Needs the local Supabase CLI session (service_role key, to create the four
 * disposable users) and SUPABASE_DB_PASSWORD, like the other smokes. Everything
 * it creates is removed in a `finally`.
 *
 *   npm run smoke:admin
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { readServiceRoleKey, readSupabaseClientConfig } from "./lib/env";
import { createPgSession } from "./lib/pg";

import { supabase } from "../src/lib/supabase/client";
import {
  loadAdminData,
  moderateContent,
  removeAdminMember,
  reviewPlaceClaim,
  setAdminMember,
  setBusinessVerification,
  setOrganizerVerification,
} from "../src/lib/admin-api";

const stamp = Date.now();
const POST_ID = `smoke-admin-post-${stamp}`;

type Role = "applicant" | "moderator" | "outsider" | "owner";

const ROLES: Role[] = ["outsider", "moderator", "owner", "applicant"];

type SmokeState = {
  businessId?: string;
  claimId?: string;
  emails: Record<Role, string>;
  organizerId?: string;
  password: string;
  users: Partial<Record<Role, string>>;
};

/**
 * Read committed state with the postgres superuser, bypassing RLS and the
 * client that did the write. A silent zero-row UPDATE looks identical to a
 * successful one from the caller's side; this is what tells them apart.
 *
 * Transaction mode (port 6543): this script runs only plain queries, never
 * `set local role`, so it needs no pinned backend. The session holds one
 * guarded connection and reopens it if the pooler drops it — see
 * scripts/lib/pg.ts for why the listener on it is the whole point.
 */
const db = createPgSession("transaction", "admin");
const withPg = db.withPg;
const closePg = db.close;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Run `call`, and return the error it threw — failing if it threw nothing. */
async function expectRejection(label: string, call: () => Promise<unknown>) {
  let rejection: unknown;
  try {
    await call();
  } catch (error) {
    rejection = error;
  }
  assert(rejection, `${label}: expected a rejection, the call succeeded.`);
  const message =
    rejection instanceof Error
      ? rejection.message
      : typeof rejection === "object" && rejection !== null && "message" in rejection
        ? String((rejection as { message: unknown }).message)
        : String(rejection);
  return message;
}

async function signInAs(email: string, password: string) {
  await supabase.auth.signOut();
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) throw new Error(`Sign-in failed for ${email}: ${result.error.message}`);
  const userId = result.data.user?.id;
  assert(userId, "Sign-in returned no user id.");
  return userId;
}

async function postStatus() {
  const result = await withPg((client) =>
    client.query<{ moderation_status: string }>(
      "select moderation_status from public.posts where id = $1",
      [POST_ID],
    ),
  );
  assert(result.rowCount === 1, `Fixture post ${POST_ID} is missing.`);
  return result.rows[0].moderation_status;
}

/** Audit rows this run's actors wrote, newest first. Scoped by actor so a */
/** maintainer using /admin at the same time cannot perturb the assertions. */
async function auditRows(actorId: string) {
  return (
    await withPg((client) =>
      client.query<{ action: string; entity_id: string | null; entity_type: string }>(
        `select action, entity_type, entity_id from public.admin_audit_logs
         where actor_id = $1 order by created_at desc`,
        [actorId],
      ),
    )
  ).rows;
}

/**
 * Audit rows about one entity, whoever wrote them. auditRows() above scopes by
 * actor, which cannot see the rows that matter most here: a change made with no
 * JWT has no actor at all, and recording it anyway is the point of the
 * admin_members trigger.
 */
async function auditRowsFor(entityType: string, entityId: string) {
  return (
    await withPg((client) =>
      client.query<{
        action: string;
        actor_id: string | null;
        details: Record<string, unknown>;
      }>(
        `select action, actor_id, details from public.admin_audit_logs
         where entity_type = $1 and entity_id = $2 order by created_at, action`,
        [entityType, entityId],
      ),
    )
  ).rows;
}

async function setupFixtures(admin: pg.Client, state: SmokeState) {
  // Cleanup deletes the disposable owner's auth user, which cascades into
  // admin_members and fires prevent_last_owner_removal(). If this disposable
  // owner were the only one, that trigger would refuse the delete and wedge the
  // fixture in place. Refuse to start rather than leave that behind.
  const owners = await admin.query<{ count: number }>(
    "select count(*)::int as count from public.admin_members where role = 'owner'",
  );
  assert(
    (owners.rows[0]?.count ?? 0) >= 1,
    "This project has no existing admin owner. Adding a disposable one would make it " +
      "the last owner, and prevent_last_owner_removal() would then block cleanup. " +
      "Promote a real owner first.",
  );

  const author = await admin.query<{ id: string }>("select id from public.authors limit 1");
  const place = await admin.query<{ id: string }>(
    "select id from public.places where moderation_status = 'published' limit 1",
  );
  assert(author.rowCount && place.rowCount, "No author/place available for the fixture post.");

  await admin.query(
    `insert into public.posts
       (id, author_id, place_id, kind, display_time, text, image_url, user_id, moderation_status)
     values ($1, $2, $3, 'tip', 'now', 'admin smoke fixture', '', $4, 'pending')`,
    [POST_ID, author.rows[0].id, place.rows[0].id, state.users.applicant],
  );

  // Inserted pending, by the postgres role. The self-verification triggers are
  // BEFORE UPDATE, so they do not fire on these inserts.
  const business = await admin.query<{ id: string }>(
    `insert into public.businesses (user_id, display_name, verification_status)
     values ($1, 'Admin smoke fixture business', 'pending') returning id`,
    [state.users.applicant],
  );
  state.businessId = business.rows[0].id;

  const organizer = await admin.query<{ id: string }>(
    `insert into public.organizers (user_id, display_name, verification_status)
     values ($1, 'Admin smoke fixture organizer', 'pending') returning id`,
    [state.users.applicant],
  );
  state.organizerId = organizer.rows[0].id;

  // place_business_profiles has a partial unique index on place_id where
  // status <> 'rejected', so the claim needs a place with no live claim.
  const unclaimed = await admin.query<{ id: string }>(`
    select p.id from public.places p
    where not exists (
      select 1 from public.place_business_profiles c
      where c.place_id = p.id and c.status <> 'rejected'
    )
    limit 1
  `);
  assert(unclaimed.rowCount, "No unclaimed place available for the claim fixture.");

  const claim = await admin.query<{ id: string }>(
    `insert into public.place_business_profiles (place_id, business_id, status)
     values ($1, $2, 'pending') returning id`,
    [unclaimed.rows[0].id, state.businessId],
  );
  state.claimId = claim.rows[0].id;

  for (const role of ["moderator", "owner"] as const) {
    await admin.query("insert into public.admin_members (user_id, role) values ($1, $2)", [
      state.users[role],
      role,
    ]);
  }
}

async function main() {
  const { url } = readSupabaseClientConfig();
  const serviceClient = createClient(url, readServiceRoleKey(), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const suffix = `${stamp}-${randomUUID().slice(0, 8)}`;
  const state: SmokeState = {
    emails: {
      applicant: `smoke-backend-admin-applicant-${suffix}@mailinator.com`,
      moderator: `smoke-backend-admin-moderator-${suffix}@mailinator.com`,
      outsider: `smoke-backend-admin-outsider-${suffix}@mailinator.com`,
      owner: `smoke-backend-admin-owner-${suffix}@mailinator.com`,
    },
    password: `Smoke-${randomUUID()}-Aa1!`,
    users: {},
  };

  try {
    for (const role of ROLES) {
      const created = await serviceClient.auth.admin.createUser({
        email: state.emails[role],
        password: state.password,
        email_confirm: true,
        user_metadata: { display_name: `Admin Smoke ${role}`, default_identity: "GUIDE" },
      });
      if (created.error) throw new Error(`createUser ${role}: ${created.error.message}`);
      const id = created.data.user?.id;
      assert(id, `createUser ${role} returned no id.`);
      state.users[role] = id;
    }
    console.log(`[auth] disposable users created: ${ROLES.join(", ")}`);

    // `once`, not `withPg`: setupFixtures does `insert ... returning id` for the
    // business, organizer and claim. A replayed callback would create a second
    // set and strand the first — the ids of the replay are the only ones the
    // state keeps, so the originals would never be cleaned up.
    await db.once((client) => setupFixtures(client, state));
    console.log("[fixture] post, business, organizer, place claim and admin rows created");

    // Those admin_members rows went in over `pg`: the postgres role, no JWT, so
    // auth.uid() is null and has_admin_role() is false. write_admin_audit_log()
    // would have returned early and recorded nothing. The dedicated trigger
    // (20260907120000) is deliberately role-blind, which is what makes a
    // promotion done outside the app auditable at all.
    const fixtureGrant = await auditRowsFor("admin_members", state.users.moderator!);
    assert(
      fixtureGrant.some(
        (row) =>
          row.action === "admin_role_granted" &&
          row.actor_id === null &&
          row.details.after_role === "moderator",
      ),
      "Granting an admin_members row over `pg` wrote no audit line. The role-blind " +
        "trigger from 20260907120000 is missing or is gated on has_admin_role().",
    );
    console.log("[fixture] the JWT-less admin_members grant was still audited");

    const businessId = state.businessId!;
    const claimId = state.claimId!;
    const organizerId = state.organizerId!;
    const moderatorId = state.users.moderator!;
    const outsiderId = state.users.outsider!;
    const ownerId = state.users.owner!;

    const businessStatus = async () =>
      (
        await withPg((client) =>
          client.query<{ verification_status: string }>(
            "select verification_status from public.businesses where id = $1",
            [businessId],
          ),
        )
      ).rows[0]?.verification_status;
    const organizerStatus = async () =>
      (
        await withPg((client) =>
          client.query<{ verification_status: string }>(
            "select verification_status from public.organizers where id = $1",
            [organizerId],
          ),
        )
      ).rows[0]?.verification_status;
    const claimStatus = async () =>
      (
        await withPg((client) =>
          client.query<{ status: string }>(
            "select status from public.place_business_profiles where id = $1",
            [claimId],
          ),
        )
      ).rows[0]?.status;
    const memberRole = async (userId: string) =>
      (
        await withPg((client) =>
          client.query<{ role: string }>(
            "select role from public.admin_members where user_id = $1",
            [userId],
          ),
        )
      ).rows[0]?.role ?? null;

    // == the outsider: a real account, no admin row ==========================
    const signedIn = await signInAs(state.emails.outsider, state.password);
    assert(signedIn === outsiderId, "Signed in as the wrong user.");
    console.log("[outsider] signed in through the app's own supabase client");

    // The control: prove both tables really do hold rows, so "the outsider sees
    // none" means hidden, not empty. Without this the next assertion is vacuous.
    const realCounts = await withPg((client) =>
      client.query<{ members: number; logs: number }>(
        `select (select count(*)::int from public.admin_members) as members,
                (select count(*)::int from public.admin_audit_logs) as logs`,
      ),
    );
    assert(
      realCounts.rows[0].members > 0 && realCounts.rows[0].logs > 0,
      "admin_members / admin_audit_logs are empty, so the visibility check below would prove nothing.",
    );

    const outsiderView = await loadAdminData();
    assert(
      outsiderView.members.length === 0,
      `A non-admin read ${outsiderView.members.length} admin_members rows. The team list is exposed.`,
    );
    assert(
      outsiderView.auditLogs.length === 0,
      `A non-admin read ${outsiderView.auditLogs.length} admin_audit_logs rows. The audit trail is exposed.`,
    );
    console.log(
      `[outsider] loadAdminData() returned members=0 auditLogs=0 while ${realCounts.rows[0].members} members / ${realCounts.rows[0].logs} logs exist`,
    );

    const outsiderModerate = await expectRejection("outsider moderateContent", () =>
      moderateContent("post", POST_ID, "published"),
    );
    assert(
      outsiderModerate.includes("Not authorized to moderate content"),
      `Expected moderate_content()'s own authorization error, got: ${outsiderModerate}`,
    );
    assert(
      (await postStatus()) === "pending",
      "The outsider's refused moderation still changed the post.",
    );
    console.log("[outsider] moderateContent refused, post untouched");

    // The quiet half of RLS. The database still refuses these by filtering —
    // the UPDATE's USING clause matches no row and Postgres reports success —
    // so the rejection below comes from admin-api.ts noticing that nothing came
    // back. Assert both: that the app is now loud, and, over `pg`, that the
    // policy is what actually stopped the write.
    const outsiderBusiness = await expectRejection("outsider setBusinessVerification", () =>
      setBusinessVerification(businessId, "verified"),
    );
    assert(
      outsiderBusiness.includes("Nothing changed"),
      `Expected setBusinessVerification() to report a refused write, got: ${outsiderBusiness}`,
    );
    assert(
      (await businessStatus()) === "pending",
      "A non-admin verified a business. setBusinessVerification is not gated.",
    );
    const outsiderOrganizer = await expectRejection("outsider setOrganizerVerification", () =>
      setOrganizerVerification(organizerId, "verified"),
    );
    assert(
      outsiderOrganizer.includes("Nothing changed"),
      `Expected setOrganizerVerification() to report a refused write, got: ${outsiderOrganizer}`,
    );
    assert(
      (await organizerStatus()) === "pending",
      "A non-admin verified an organizer. setOrganizerVerification is not gated.",
    );
    console.log("[outsider] business/organizer verification refused, nothing changed");

    // A refused write must not leave an audit line claiming otherwise — and the
    // applicant's own pending row must not either. The verification trigger
    // fires on status transitions only, so a self-service application is not
    // somebody's admin action and is not recorded as one.
    assert(
      (await auditRowsFor("businesses", businessId)).length === 0,
      "A business audit row exists before anyone verified anything. The trigger is " +
        "logging self-service writes, or a refused write.",
    );
    assert(
      (await auditRowsFor("organizers", organizerId)).length === 0,
      "An organizer audit row exists before anyone verified anything.",
    );
    console.log("[outsider] no audit rows written for the refused writes or the pending rows");

    const outsiderClaim = await expectRejection("outsider reviewPlaceClaim", () =>
      reviewPlaceClaim(claimId, "approved"),
    );
    assert(
      outsiderClaim.includes("Not authorized to review place claims"),
      `Expected review_place_claim()'s own authorization error, got: ${outsiderClaim}`,
    );
    assert((await claimStatus()) === "pending", "The outsider's refused review moved the claim.");
    console.log("[outsider] reviewPlaceClaim refused, claim untouched");

    // The privilege-escalation attempt. INSERT is the loud half of RLS: this
    // must raise, not quietly no-op.
    await expectRejection("outsider setAdminMember (self-promotion)", () =>
      setAdminMember(outsiderId, "owner"),
    );
    assert(
      (await memberRole(outsiderId)) === null,
      "PRIVILEGE ESCALATION: a signed-in non-admin granted themselves an admin_members row.",
    );
    console.log("[outsider] self-promotion to owner refused, no admin_members row created");

    // == the moderator ======================================================
    await signInAs(state.emails.moderator, state.password);

    await moderateContent("post", POST_ID, "published");
    assert((await postStatus()) === "published", "The moderator's moderateContent did not land.");
    const moderatorAudit = await auditRows(moderatorId);
    assert(
      moderatorAudit.some(
        (row) => row.action === "moderation_status_changed" && row.entity_id === POST_ID,
      ),
      "moderate_content() did not write an admin_audit_logs row for the moderator.",
    );
    // write_admin_audit_log() returns early for a moderator, so the explicit
    // insert inside moderate_content() is the only row. If a trigger row shows
    // up here the function's role gate has changed.
    assert(
      moderatorAudit.length === 1,
      `Expected exactly one audit row for the moderator, got ${moderatorAudit.length}: ` +
        `${moderatorAudit.map((row) => `${row.entity_type}/${row.action}`).join(", ")}`,
    );
    console.log("[moderator] moderateContent landed and wrote exactly one audit row");

    await expectRejection("moderator setAdminMember", () =>
      setAdminMember(outsiderId, "moderator"),
    );
    assert(
      (await memberRole(outsiderId)) === null,
      "A moderator promoted another user. admin_members INSERT is not owner-only.",
    );
    console.log("[moderator] cannot add a team member");

    // DELETE is the quiet half of RLS: the policy filters, nothing is deleted,
    // and Postgres reports success. admin-api.ts turns that into a rejection —
    // but a client-side check is not evidence about the policy, so the owner's
    // row is re-read. Asserting only on the throw would pass against a policy
    // that happily let a moderator delete the owner.
    const moderatorRemove = await expectRejection("moderator removeAdminMember", () =>
      removeAdminMember(ownerId),
    );
    assert(
      moderatorRemove.includes("Nothing was removed"),
      `Expected removeAdminMember() to report a refused write, got: ${moderatorRemove}`,
    );
    assert(
      (await memberRole(ownerId)) === "owner",
      "A moderator removed an owner from the admin team.",
    );
    console.log("[moderator] cannot remove a team member, owner row intact");

    const moderatorClaim = await expectRejection("moderator reviewPlaceClaim", () =>
      reviewPlaceClaim(claimId, "approved"),
    );
    assert(
      moderatorClaim.includes("Not authorized to review place claims"),
      `Expected review_place_claim() to refuse a moderator, got: ${moderatorClaim}`,
    );
    assert((await claimStatus()) === "pending", "A moderator moved a place claim.");
    console.log("[moderator] cannot review a place claim (owner/editor only)");

    // == the owner ==========================================================
    await signInAs(state.emails.owner, state.password);

    await setBusinessVerification(businessId, "verified");
    assert((await businessStatus()) === "verified", "An owner could not verify a business.");
    await setOrganizerVerification(organizerId, "verified");
    assert((await organizerStatus()) === "verified", "An owner could not verify an organizer.");
    console.log("[owner] verified the business and the organizer");

    // The 2026-09-07 gap. A verified business is what unlocks place claims and
    // deals, so "who verified this, and when" has to be answerable.
    for (const [table, id] of [
      ["businesses", businessId],
      ["organizers", organizerId],
    ] as const) {
      const rows = await auditRowsFor(table, id);
      assert(
        rows.some(
          (row) =>
            row.action === "verification_status_changed" &&
            row.actor_id === ownerId &&
            row.details.before_status === "pending" &&
            row.details.after_status === "verified",
        ),
        `Verifying a ${table.slice(0, -1)} wrote no audit row naming the owner who did it ` +
          `(got ${rows.length} row(s): ${rows.map((row) => row.action).join(", ") || "none"}).`,
      );
    }
    console.log("[owner] both verifications wrote a 'verification_status_changed' audit row");

    await reviewPlaceClaim(claimId, "approved");
    assert((await claimStatus()) === "approved", "An owner could not approve a place claim.");
    const ownerAuditAfterClaim = await auditRows(ownerId);
    assert(
      ownerAuditAfterClaim.some(
        (row) => row.action === "place_claim_reviewed" && row.entity_id === claimId,
      ),
      "review_place_claim() did not write its admin_audit_logs row.",
    );
    console.log("[owner] approved the place claim and wrote 'place_claim_reviewed'");

    await moderateContent("post", POST_ID, "hidden");
    assert((await postStatus()) === "hidden", "An owner could not hide a post.");
    const ownerAudit = await auditRows(ownerId);
    assert(
      ownerAudit.some(
        (row) => row.action === "moderation_status_changed" && row.entity_id === POST_ID,
      ),
      "moderate_content() did not log the owner's action.",
    );
    // The contrast with the moderator above: the actor is an owner, so
    // write_admin_audit_log() no longer returns early and the UPDATE on
    // public.posts leaves its own row alongside the function's.
    assert(
      ownerAudit.some((row) => row.entity_type === "posts" && row.action === "update"),
      "write_admin_audit_log() did not fire for an owner's post update.",
    );
    console.log("[owner] moderateContent logged twice: the function's row and the trigger's");

    await setAdminMember(outsiderId, "moderator");
    assert((await memberRole(outsiderId)) === "moderator", "An owner could not add a team member.");
    await removeAdminMember(outsiderId);
    assert((await memberRole(outsiderId)) === null, "An owner could not remove a team member.");
    console.log("[owner] added and removed a team member");

    // Handing out and taking back admin access is the most powerful pair of
    // actions in the system. Until 20260907120000 neither left a trace.
    const memberAudit = await auditRowsFor("admin_members", outsiderId);
    assert(
      memberAudit.some(
        (row) =>
          row.action === "admin_role_granted" &&
          row.actor_id === ownerId &&
          row.details.after_role === "moderator",
      ),
      "Granting an admin role wrote no audit row naming the owner who granted it.",
    );
    assert(
      memberAudit.some(
        (row) =>
          row.action === "admin_role_revoked" &&
          row.actor_id === ownerId &&
          row.details.before_role === "moderator",
      ),
      "Revoking an admin role wrote no audit row naming the owner who revoked it.",
    );
    console.log("[owner] the grant and the revoke were both audited");

    // The dashboard's own load, as an owner: the rows the outsider could not see.
    const ownerView = await loadAdminData();
    assert(
      ownerView.members.length >= 2 && ownerView.auditLogs.length > 0,
      `An owner's loadAdminData() came back thin: members=${ownerView.members.length} auditLogs=${ownerView.auditLogs.length}.`,
    );
    console.log(
      `[owner] loadAdminData() returned members=${ownerView.members.length} auditLogs=${ownerView.auditLogs.length}`,
    );

    console.log("smoke_admin_ok");
  } finally {
    console.log("[cleanup] removing disposable admin fixtures");
    try {
      await supabase.auth.signOut();
      await withPg(async (client) => {
        const ids = ROLES.map((role) => state.users[role]).filter(Boolean) as string[];
        await client.query("delete from public.posts where id = $1", [POST_ID]);
        if (ids.length) {
          // actor_id is ON DELETE SET NULL, so audit rows survive their author.
          // Clear them by hand or every run leaves orphans behind.
          await client.query(
            "delete from public.admin_audit_logs where actor_id = any($1::uuid[])",
            [ids],
          );
          // admin_members, businesses (and place_business_profiles through it)
          // and organizers all cascade from auth.users.
          await client.query("delete from auth.users where id = any($1::uuid[])", [ids]);
          // That cascade is itself audited now (20260907120000): dropping an
          // admin_members row or a verified business writes a fresh line, after
          // the sweep above and with actor_id null, so no actor query can find
          // it. Sweep again by entity — which is also how the fixture's own
          // JWT-less grants are cleared.
          await client.query(
            "delete from public.admin_audit_logs where entity_id = any($1::text[])",
            [
              [...ids, state.businessId, state.organizerId, state.claimId, POST_ID].filter(
                Boolean,
              ) as string[],
            ],
          );
        }
        await client.query("delete from auth.users where email = any($1::text[])", [
          ROLES.map((role) => state.emails[role]),
        ]);
      });
      console.log("[cleanup] done");
    } catch (cleanupError) {
      console.warn(
        `[cleanup] best-effort cleanup failed: ${
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        }`,
      );
    }

    await closePg();
  }
}

main().catch((error) => {
  const detail =
    error instanceof Error
      ? (error.stack ?? error.message)
      : typeof error === "object" && error !== null
        ? JSON.stringify(error, null, 2)
        : String(error);
  console.error(`smoke_admin_failed ${detail}`);
  process.exit(1);
});

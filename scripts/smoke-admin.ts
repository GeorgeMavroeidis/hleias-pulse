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
 *      USING clause simply matches no rows, and the call returns success having
 *      changed nothing. So "did it throw?" is only half a test — every negative
 *      case below re-reads the row over `pg` to prove it did not move.
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
 *                          do NOT raise, and change nothing (case 1 above)
 *     reviewPlaceClaim()   raises 'Not authorized to review place claims'
 *     setAdminMember()     raises — a stranger cannot promote themselves. This
 *                          is the privilege-escalation attempt.
 *
 *   as the moderator
 *     moderateContent()    publishes the post and writes exactly one audit row
 *                          ('moderation_status_changed'), with no trigger row
 *                          beside it (case 2 above)
 *     setAdminMember()     raises — a moderator cannot promote
 *     removeAdminMember()  does NOT raise, and the owner's row survives
 *     reviewPlaceClaim()   raises — claim review is owner/editor only
 *
 *   as the owner
 *     setBusinessVerification() / setOrganizerVerification()  land
 *     reviewPlaceClaim()   approves the claim and writes 'place_claim_reviewed'
 *     moderateContent()    hides the post and now writes a trigger row too,
 *                          because the actor is an owner
 *     setAdminMember() / removeAdminMember()  add and remove a real member
 *
 * NOT audited today, and deliberately not asserted either way: `businesses`,
 * `organizers` and `admin_members` carry no `write_admin_audit_log` trigger, so
 * verifying a business and granting somebody `owner` leave no trace. Recorded in
 * IDEAS.md -> Security to Review rather than pinned here, so fixing it does not
 * fail this test.
 *
 * Needs the local Supabase CLI session (service_role key, to create the four
 * disposable users) and SUPABASE_DB_PASSWORD, like the other smokes. Everything
 * it creates is removed in a `finally`.
 *
 *   npm run smoke:admin
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

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

const projectRef = "kfxfnqryfmuxiwlswyyn";
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

function readEnvValue(name: string) {
  try {
    const env = readFileSync(".env", "utf8");
    const value = env
      .split(/\n/)
      .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
      .find((match) => match?.[1] === name)?.[2]
      ?.trim()
      .replace(/^['"]|['"]$/g, "");
    return value || process.env[name];
  } catch {
    return process.env[name];
  }
}

function readSupabaseClientConfig() {
  const source = readFileSync("src/lib/supabase/client.ts", "utf8");
  const url = source.match(/const supabaseUrl = "([^"]+)"/)?.[1];
  const publishableKey = source.match(/const supabasePublishableKey\s*=\s*"([^"]+)"/)?.[1];

  if (!url || !publishableKey) {
    throw new Error("Could not read Supabase URL/publishable key from src/lib/supabase/client.ts.");
  }

  return { publishableKey, url };
}

function readServiceRoleKey() {
  const output = execFileSync(
    "npx",
    ["supabase", "projects", "api-keys", "--project-ref", projectRef, "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(output);
  const keys = Array.isArray(parsed) ? parsed : (parsed.api_keys ?? parsed.keys ?? []);
  const serviceRole = keys.find((key: Record<string, unknown>) => {
    const name = String(key.name ?? key.api_key_type ?? key.type ?? key.key_type ?? "");
    return name === "service_role";
  });
  const value = serviceRole?.api_key ?? serviceRole?.key ?? serviceRole?.value;

  if (typeof value !== "string" || value.length < 100) {
    throw new Error("Could not read Supabase service_role key from the local CLI session.");
  }

  return value;
}

function createPgClient() {
  const password = readEnvValue("SUPABASE_DB_PASSWORD");
  if (!password) {
    throw new Error("SUPABASE_DB_PASSWORD is missing. Put it in .env, like the other smokes.");
  }

  // This project (created 2026-08) is pooler-only — db.<ref>.supabase.co does
  // not resolve. withPg() opens a fresh connection per assertion and this script
  // runs only plain queries (no `set role`), so transaction mode (port 6543) is
  // the right fit — session mode stalls on the rapid connect/end churn.
  // User is postgres.<ref>.
  return new pg.Client({
    host: "aws-0-eu-central-1.pooler.supabase.com",
    port: 6543,
    database: "postgres",
    user: `postgres.${projectRef}`,
    password,
    ssl: { rejectUnauthorized: false },
  });
}

/**
 * A pooled connection can drop under a long run — the assertions below are
 * spaced out by HTTPS round-trips through supabase-js, so the socket sits idle
 * between them. `pg.Client` reports that by emitting an `error` event, and an
 * EventEmitter with no `error` listener rethrows as an uncaught exception,
 * which kills the process *outside* main()'s try/finally. The first run of this
 * script did exactly that and leaked four disposable users. Hence: one shared
 * connection instead of ~35 short-lived ones, a listener on it, and a retry.
 */
let shared: pg.Client | null = null;

function isConnectionError(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "57P01" || // admin_shutdown — the pooler recycled the backend
    /connection terminated|connection error|socket hang up|server closed the connection/i.test(
      message,
    )
  );
}

async function connectPg() {
  if (shared) return shared;
  const client = createPgClient();
  client.on("error", (error: Error) => {
    console.warn(`[pg] pooled connection dropped: ${error.message}`);
    if (shared === client) shared = null;
  });
  await client.connect();
  shared = client;
  return client;
}

/**
 * Read committed state with the postgres superuser, bypassing RLS and the
 * client that did the write. A silent zero-row UPDATE looks identical to a
 * successful one from the caller's side; this is what tells them apart.
 *
 * Retries once, and only when the connection itself failed — a SQL error (a
 * unique violation, a trigger's `raise`) is the answer the assertion wants and
 * must propagate untouched.
 */
async function withPg<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const client = await connectPg();
    try {
      return await run(client);
    } catch (error) {
      if (attempt >= 1 || !isConnectionError(error)) throw error;
      if (shared === client) shared = null;
      await client.end().catch(() => {});
      console.warn("[pg] retrying on a fresh connection");
    }
  }
}

async function closePg() {
  const client = shared;
  shared = null;
  if (client) await client.end().catch(() => {});
}

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

    await withPg((client) => setupFixtures(client, state));
    console.log("[fixture] post, business, organizer, place claim and admin rows created");

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

    // Neither of these raises: the UPDATE's USING clause matches no row, so
    // PostgREST reports success having changed nothing. The row read is the
    // whole assertion.
    await setBusinessVerification(businessId, "verified");
    assert(
      (await businessStatus()) === "pending",
      "A non-admin verified a business. setBusinessVerification is not gated.",
    );
    await setOrganizerVerification(organizerId, "verified");
    assert(
      (await organizerStatus()) === "pending",
      "A non-admin verified an organizer. setOrganizerVerification is not gated.",
    );
    console.log("[outsider] business/organizer verification silently changed nothing");

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

    // DELETE is the quiet half of RLS: no error, no effect. Asserting only on
    // the absence of a throw here would pass against a policy that let a
    // moderator delete the owner.
    await removeAdminMember(ownerId);
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

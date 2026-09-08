/**
 * The self-verification guards: prevent_organizer_self_verification() and
 * prevent_business_self_verification().
 *
 * "Verified" is a capability, not a label. A verified organizer may publish
 * cultural events; a verified business may claim a place and run a deal
 * (20260905170000 gates deals on it outright). So the whole value of the
 * applicant → admin review → verified pipeline rests on an applicant being
 * unable to shortcut it, and there are exactly two ways to try:
 *
 *   flip it afterwards   update businesses/organizers set verification_status
 *                        = 'verified' on your own row. RLS *allows* this update
 *                        — "Users can update own business profile" matches on
 *                        user_id = auth.uid() — so the policy is not what stops
 *                        it. The BEFORE UPDATE trigger is.
 *   set it at creation   insert your own row already 'verified'. The trigger
 *                        does not fire on INSERT; here it is the policy's
 *                        WITH CHECK (verification_status = 'pending') that bites.
 *
 * Two different mechanisms guarding one escalation route, and a change to either
 * one alone would open it. Both are asserted, for both tables.
 *
 * The applicant's honest path runs through the app's own functions in
 * src/lib/hp-api.ts (applyToBecomeBusiness, applyToBecomeOrganizer,
 * updateOrganizerProfile) and the real singleton client. The attacks are sent
 * as raw PostgREST calls on that same client, because that is the shape of the
 * real threat: nothing in the UI offers this button, so a UI-level test would
 * prove nothing. Anyone holding the publishable key can compose the request by
 * hand. The admin half then uses admin-api.ts, the way /admin does.
 *
 * What it asserts:
 *
 *   applyToBecomeBusiness()/applyToBecomeOrganizer()
 *                        land a row, and it is 'pending' — the app never sends
 *                        a status and the INSERT policy would refuse any other
 *   self-verify update   raises 'Only an Owner or Editor can change
 *                        verification status', for businesses and organizers,
 *                        and the row stays 'pending'
 *   self-reject update   raises the same — the trigger tests `is distinct
 *                        from`, so it guards the column, not one value of it
 *   insert-as-verified   refused by the INSERT policy's WITH CHECK, on a second
 *                        user (user_id is unique, so the applicant cannot retry)
 *   updateOrganizerProfile()
 *                        still works — the guard is surgical, an applicant can
 *                        still edit their own name and bio while pending
 *   admin verification   setBusinessVerification()/setOrganizerVerification()
 *                        as an owner still land. A guard that also blocked the
 *                        real reviewer would pass every negative test above and
 *                        be useless.
 *
 * Needs the local Supabase CLI session (service_role key, to create the
 * disposable users) and SUPABASE_DB_PASSWORD, like the other smokes. Everything
 * it creates is removed in a `finally`.
 *
 *   npm run smoke:verification-guards
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { readServiceRoleKey, readSupabaseClientConfig } from "./lib/env";
import { createPgSession } from "./lib/pg";

import { supabase } from "../src/lib/supabase/client";
import { setBusinessVerification, setOrganizerVerification } from "../src/lib/admin-api";
import {
  applyToBecomeBusiness,
  applyToBecomeOrganizer,
  getMyBusinessStatus,
  getMyOrganizerStatus,
  updateOrganizerProfile,
} from "../src/lib/hp-api";

const stamp = Date.now();

type Role = "applicant" | "impostor" | "owner";

const ROLES: Role[] = ["applicant", "impostor", "owner"];

type SmokeState = {
  businessId?: string;
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
const db = createPgSession("transaction", "verification");
const withPg = db.withPg;
const closePg = db.close;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Run `call`, and return the error message it threw — failing if it threw none. */
async function expectRejection(label: string, call: () => Promise<unknown>) {
  let rejection: unknown;
  try {
    await call();
  } catch (error) {
    rejection = error;
  }
  assert(rejection, `${label}: expected a rejection, the call succeeded.`);
  return rejection instanceof Error
    ? rejection.message
    : typeof rejection === "object" && rejection !== null && "message" in rejection
      ? String((rejection as { message: unknown }).message)
      : String(rejection);
}

async function signInAs(email: string, password: string) {
  await supabase.auth.signOut();
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) throw new Error(`Sign-in failed for ${email}: ${result.error.message}`);
  const userId = result.data.user?.id;
  assert(userId, "Sign-in returned no user id.");
  return userId;
}

const GUARD_MESSAGE = "Only an Owner or Editor can change verification status";

async function main() {
  const { url } = readSupabaseClientConfig();
  const serviceClient = createClient(url, readServiceRoleKey(), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const suffix = `${stamp}-${randomUUID().slice(0, 8)}`;
  const state: SmokeState = {
    emails: {
      applicant: `smoke-backend-verification-guards-applicant-${suffix}@mailinator.com`,
      impostor: `smoke-backend-verification-guards-impostor-${suffix}@mailinator.com`,
      owner: `smoke-backend-verification-guards-owner-${suffix}@mailinator.com`,
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
        user_metadata: { display_name: `Verification Smoke ${role}`, default_identity: "GUIDE" },
      });
      if (created.error) throw new Error(`createUser ${role}: ${created.error.message}`);
      const id = created.data.user?.id;
      assert(id, `createUser ${role} returned no id.`);
      state.users[role] = id;
    }
    console.log(`[auth] disposable users created: ${ROLES.join(", ")}`);

    // `once`, not `withPg`: this inserts fixture rows and a replayed
    // callback would fail on the duplicate key rather than the original
    // connection error, hiding what actually went wrong.
    await db.once(async (client) => {
      // Deleting the disposable owner in cleanup cascades into admin_members and
      // fires prevent_last_owner_removal(). If ours were the only owner that
      // trigger would refuse, and the fixture would be stuck. Refuse to start.
      const owners = await client.query<{ count: number }>(
        "select count(*)::int as count from public.admin_members where role = 'owner'",
      );
      assert(
        (owners.rows[0]?.count ?? 0) >= 1,
        "This project has no existing admin owner. Adding a disposable one would make it " +
          "the last owner, and prevent_last_owner_removal() would then block cleanup.",
      );
      await client.query("insert into public.admin_members (user_id, role) values ($1, 'owner')", [
        state.users.owner,
      ]);
    });
    console.log("[fixture] disposable owner promoted");

    const businessStatus = async () =>
      (
        await withPg((client) =>
          client.query<{ verification_status: string }>(
            "select verification_status from public.businesses where user_id = $1",
            [state.users.applicant],
          ),
        )
      ).rows[0]?.verification_status ?? null;
    const organizerStatus = async () =>
      (
        await withPg((client) =>
          client.query<{ verification_status: string }>(
            "select verification_status from public.organizers where user_id = $1",
            [state.users.applicant],
          ),
        )
      ).rows[0]?.verification_status ?? null;

    // == the applicant applies, honestly, through the app ====================
    await signInAs(state.emails.applicant, state.password);

    const business = await applyToBecomeBusiness("Verification smoke taverna", {
      bio: "Disposable fixture.",
    });
    state.businessId = business.id;
    const organizer = await applyToBecomeOrganizer(
      "Verification smoke association",
      "Disposable fixture.",
    );
    state.organizerId = organizer.id;

    assert(
      (await businessStatus()) === "pending",
      "applyToBecomeBusiness() did not land a 'pending' row.",
    );
    assert(
      (await organizerStatus()) === "pending",
      "applyToBecomeOrganizer() did not land a 'pending' row.",
    );
    console.log("[applicant] applied as a business and an organizer, both pending");

    // == attack 1: flip your own status after the fact =======================
    // RLS permits this UPDATE (the row is theirs). Only the BEFORE UPDATE
    // trigger stands between an applicant and a verified badge.
    const businessSelfVerify = await expectRejection("business self-verify", async () => {
      const result = await supabase
        .from("businesses")
        .update({ verification_status: "verified" })
        .eq("user_id", state.users.applicant!);
      if (result.error) throw result.error;
      return result;
    });
    assert(
      businessSelfVerify.includes(GUARD_MESSAGE),
      `Expected prevent_business_self_verification()'s message, got: ${businessSelfVerify}`,
    );
    assert(
      (await businessStatus()) === "pending",
      "SELF-VERIFICATION: an applicant verified their own business.",
    );

    const organizerSelfVerify = await expectRejection("organizer self-verify", async () => {
      const result = await supabase
        .from("organizers")
        .update({ verification_status: "verified" })
        .eq("user_id", state.users.applicant!);
      if (result.error) throw result.error;
      return result;
    });
    assert(
      organizerSelfVerify.includes(GUARD_MESSAGE),
      `Expected prevent_organizer_self_verification()'s message, got: ${organizerSelfVerify}`,
    );
    assert(
      (await organizerStatus()) === "pending",
      "SELF-VERIFICATION: an applicant verified their own organizer row.",
    );
    console.log("[applicant] self-verification refused on both tables, both still pending");

    // The trigger tests `new.verification_status is distinct from old`, so it
    // guards the column rather than the single value 'verified'. Moving to
    // 'rejected' — pointless for an attacker, but the cheap way to prove the
    // condition is not `= 'verified'` — must be refused the same way.
    const businessSelfReject = await expectRejection("business self-reject", async () => {
      const result = await supabase
        .from("businesses")
        .update({ verification_status: "rejected" })
        .eq("user_id", state.users.applicant!);
      if (result.error) throw result.error;
      return result;
    });
    assert(
      businessSelfReject.includes(GUARD_MESSAGE),
      `The guard is value-specific, not column-wide. 'rejected' got through as: ${businessSelfReject}`,
    );
    console.log("[applicant] any change to verification_status is refused, not only 'verified'");

    // == the guard is surgical ==============================================
    // An applicant must still be able to work on their own pending profile.
    // A guard that froze the whole row would pass every check above.
    const renamed = await updateOrganizerProfile(
      "Verification smoke association (edited)",
      "Edited while pending.",
    );
    assert(
      renamed.displayName === "Verification smoke association (edited)",
      "updateOrganizerProfile() did not apply the new name.",
    );
    assert(
      (await organizerStatus()) === "pending",
      "Editing the profile moved verification_status.",
    );
    console.log("[applicant] can still edit name and bio while pending");

    // == attack 2: be born verified =========================================
    // The trigger is BEFORE UPDATE and never sees an INSERT. What refuses this
    // is the policy's WITH CHECK (verification_status = 'pending'). A second
    // user, because businesses.user_id / organizers.user_id are unique and the
    // applicant already holds a row on both.
    await signInAs(state.emails.impostor, state.password);

    for (const table of ["businesses", "organizers"] as const) {
      const bornVerified = await expectRejection(`${table} insert-as-verified`, async () => {
        const result = await supabase.from(table).insert({
          user_id: state.users.impostor!,
          display_name: `Born verified ${table}`,
          verification_status: "verified",
        });
        if (result.error) throw result.error;
        return result;
      });
      assert(
        /row-level security|violates/i.test(bornVerified),
        `Expected an RLS refusal inserting a verified ${table} row, got: ${bornVerified}`,
      );
      const planted = await withPg((client) =>
        client.query(`select 1 from public.${table} where user_id = $1`, [state.users.impostor]),
      );
      assert(
        planted.rowCount === 0,
        `SELF-VERIFICATION: a user created a verified ${table} row outright.`,
      );
    }
    console.log("[impostor] cannot insert a row that is already verified, on either table");

    // The honest insert still works — same table, status omitted.
    const honest = await applyToBecomeBusiness("Impostor's honest application");
    assert(
      honest.verificationStatus === "pending",
      `An omitted status should default to pending, got ${honest.verificationStatus}.`,
    );
    console.log("[impostor] the same insert without a status is accepted as pending");

    // == the reviewer can still do the job ==================================
    await signInAs(state.emails.owner, state.password);

    await setBusinessVerification(state.businessId, "verified");
    await setOrganizerVerification(state.organizerId, "verified");
    assert(
      (await businessStatus()) === "verified",
      "An owner could not verify the business — the guard is blocking the real reviewer.",
    );
    assert(
      (await organizerStatus()) === "verified",
      "An owner could not verify the organizer — the guard is blocking the real reviewer.",
    );
    console.log("[owner] verified both rows, so the guard does not block review");

    // And the applicant reads their new status back through the app.
    await signInAs(state.emails.applicant, state.password);
    const finalBusiness = await getMyBusinessStatus();
    const finalOrganizer = await getMyOrganizerStatus();
    assert(
      finalBusiness?.verificationStatus === "verified",
      `getMyBusinessStatus() reported ${finalBusiness?.verificationStatus}, expected verified.`,
    );
    assert(
      finalOrganizer?.verificationStatus === "verified",
      `getMyOrganizerStatus() reported ${finalOrganizer?.verificationStatus}, expected verified.`,
    );
    console.log("[applicant] reads back 'verified' through the app's own getters");

    console.log("smoke_verification_guards_ok");
  } finally {
    console.log("[cleanup] removing disposable verification fixtures");
    try {
      await supabase.auth.signOut();
      await withPg(async (client) => {
        const ids = ROLES.map((role) => state.users[role]).filter(Boolean) as string[];
        if (ids.length) {
          // Collected before the cascade, because the audit rows are keyed on
          // these ids and the rows that carry them are about to disappear.
          const auditedEntities = (
            await client.query<{ id: string }>(
              `select id::text as id from public.businesses where user_id = any($1::uuid[])
               union all
               select id::text as id from public.organizers where user_id = any($1::uuid[])`,
              [ids],
            )
          ).rows.map((row) => row.id);

          await client.query(
            "delete from public.admin_audit_logs where actor_id = any($1::uuid[])",
            [ids],
          );
          // businesses, organizers and admin_members all cascade from auth.users.
          await client.query("delete from auth.users where id = any($1::uuid[])", [ids]);

          // 20260907120000 put AFTER DELETE audit triggers on all three of those
          // tables, which changes what the cascade leaves behind. Those triggers
          // fire *during* the delete above — after the actor_id sweep has
          // already run — and they deliberately record actor_id as null when the
          // actor is the user being deleted, as the postgres role is here. So
          // the first sweep can never match them. This second pass is keyed on
          // entity_id instead: the subject's user id for admin_members, the row
          // id for businesses and organizers.
          await client.query(
            `delete from public.admin_audit_logs
             where (entity_type = 'admin_members' and entity_id = any($1::text[]))
                or (entity_type in ('businesses', 'organizers')
                    and entity_id = any($2::text[]))`,
            [ids, auditedEntities],
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
  console.error(`smoke_verification_guards_failed ${detail}`);
  process.exit(1);
});

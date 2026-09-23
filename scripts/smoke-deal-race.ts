/**
 * Concurrency check for public.redeem_deal_code().
 *
 * Before 20260905180000 the function read the code with a plain SELECT, checked
 * status = 'issued', and then updated by primary key with no row lock and no
 * status test in the UPDATE's WHERE. Two sessions redeeming the same code could
 * both pass the SELECT and both succeed: one coupon, honoured twice.
 *
 * This does not fire N requests and hope they collide — a race that only
 * sometimes reproduces is a test that only sometimes fails. It drives the
 * interleaving by hand over two connections:
 *
 *   A: begin; redeem(CODE)          -> succeeds, holds the row lock, uncommitted
 *   B: begin; redeem(CODE)          -> blocks on A's lock
 *   A: commit                       -> B wakes up
 *   B:                              -> must raise 'Code not found or already used'
 *
 * B waking up is the whole test. Under READ COMMITTED, Postgres re-evaluates
 * B's UPDATE predicate against the row A just wrote (EvalPlanQual); because the
 * new WHERE carries `and r.status = 'issued'`, it matches nothing and the
 * function raises. With the old body, B's UPDATE targeted a primary key it had
 * already read, so it overwrote A's redemption and returned success.
 *
 * Needs SUPABASE_DB_PASSWORD (.env or environment), like the other smokes.
 * Creates its own fixture — a verified business, an approved claim on an
 * unclaimed place, one issued code — and removes it again in a finally block.
 *
 *   npm run smoke:deal-race
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { assertSmokeTargetIsLocal, readServiceRoleKey, readSupabaseClientConfig } from "./lib/env";
import { cleanupAll } from "./lib/cleanup";
import { connectGuarded, createPgSession, endQuietly } from "./lib/pg";

assertSmokeTargetIsLocal();

const CODE = `RACE${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;

/** Run the rest of this transaction as `authenticated` with auth.uid() = userId. */
async function actAs(client: pg.Client, userId: string) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}

async function waitForBlockedRedeemer(
  admin: ReturnType<typeof createPgSession>,
  backendPid: number,
  finished: () => boolean,
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (finished()) throw new Error("B finished before waiting on A's row lock.");
    const wait = await admin.withPg((client) =>
      client.query<{ wait_event_type: string | null }>(
        "select wait_event_type from pg_stat_activity where pid = $1",
        [backendPid],
      ),
    );
    if (wait.rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("B did not reach A's row lock within 10 seconds.");
}

type Fixture = { businessId: string; claimId: string; ownerId: string; placeId: string };

async function setup(admin: pg.Client, ownerId: string): Promise<Fixture> {
  await admin.query("begin");
  try {
    // A committed seed place is read-only support for this fixture. The owner,
    // business, claim and code all belong to this test.
    const place = await admin.query<{ id: string }>(`
    select p.id from public.places p
    where not exists (
      select 1 from public.place_business_profiles c
      where c.place_id = p.id and c.status <> 'rejected'
    )
    limit 1
  `);
    if (!place.rowCount) throw new Error("No unclaimed place available for the fixture.");

    const placeId = place.rows[0].id;

    // Inserted verified outright. prevent_business_self_verification() is a
    // BEFORE UPDATE trigger, so it does not fire here — and this is the postgres
    // role setting up a fixture, not a user escalating themselves.
    const business = await admin.query<{ id: string }>(
      `insert into public.businesses (user_id, display_name, verification_status)
     values ($1, 'Deal race fixture', 'verified') returning id`,
      [ownerId],
    );
    const businessId = business.rows[0].id;

    const claim = await admin.query<{ id: string }>(
      `insert into public.place_business_profiles
       (place_id, business_id, status, deal_text, deal_active)
     values ($1, $2, 'approved', 'Fixture deal', true) returning id`,
      [placeId, businessId],
    );
    const claimId = claim.rows[0].id;

    await admin.query(
      `insert into public.deal_redemptions
       (profile_claim_id, place_id, business_id, code, user_id, expires_at)
     values ($1, $2, $3, $4, $5, now() + interval '1 hour')`,
      [claimId, placeId, businessId, CODE, ownerId],
    );

    await admin.query("commit");
    return { businessId, claimId, ownerId, placeId };
  } catch (error) {
    await admin.query("rollback").catch(() => {});
    throw error;
  }
}

async function teardown(admin: pg.Client, ownerId: string | undefined) {
  if (!ownerId) return;
  const owned = await admin.query<{ id: string }>(
    "select id from public.businesses where user_id = $1",
    [ownerId],
  );
  const businessId = owned.rows[0]?.id;
  if (!businessId) return;
  // deal_redemptions and place_business_profiles both cascade from businesses.
  await admin.query("delete from public.businesses where id = $1", [businessId]);

  // 20260907120000 put an audit trigger on businesses, and this fixture trips
  // it twice: once on insert, because it is created already 'verified' rather
  // than 'pending', and once on delete, because losing a verified row is the
  // privileged event the trigger records. admin_audit_logs has no foreign key
  // to businesses, so neither row cascades away with the business above —
  // they have to be swept by hand, and *after* the delete, or the second one
  // has not been written yet.
  await admin.query(
    "delete from public.admin_audit_logs where entity_type = 'businesses' and entity_id = $1",
    [businessId],
  );
}

async function main() {
  // `admin` runs plain fixture statements, so it can be a reconnecting session
  // — that is what keeps `teardown` reachable after a failure instead of
  // leaking a business, its place claim and the redemption row.
  //
  // `a` and `b` are the two racing sessions and must each be one pinned
  // connection: they hold an open transaction, take a row lock, and run as an
  // impersonated role via `set local role`. Reconnecting either of them would
  // release the very lock this script exists to observe, so they get a guarded
  // client with no retry — the guard keeps a dropped socket from killing the
  // process, and nothing more.
  const admin = createPgSession("session", "admin");
  const [a, b] = await Promise.all([
    connectGuarded("session", "a"),
    connectGuarded("session", "b"),
  ]);
  const { url } = readSupabaseClientConfig();
  const authAdmin = createClient(url, readServiceRoleKey(), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const ownerEmail = `deal-race-${randomUUID()}@smoke.invalid`;
  let ownerId: string | undefined;
  let fixture: Fixture | null = null;
  let testFailure: unknown;

  try {
    const created = await authAdmin.auth.admin.createUser({
      email: ownerEmail,
      password: `Smoke-${randomUUID()}-Aa1!`,
      email_confirm: true,
    });
    if (created.error) throw new Error(`Creating deal fixture owner: ${created.error.message}`);
    ownerId = created.data.user?.id;
    if (!ownerId) throw new Error("Auth did not return the deal fixture owner ID.");
    // `once`, not `withPg`: setup inserts rows and is not safe to replay.
    fixture = await admin.once((client) => setup(client, ownerId!));

    // --- A redeems and holds the lock ------------------------------------
    await a.query("begin");
    await actAs(a, fixture.ownerId);
    const first = await a.query<{ redeem_deal_code: unknown }>(
      "select public.redeem_deal_code($1)",
      [CODE],
    );
    if (!first.rowCount) throw new Error("A: redeem_deal_code returned no row.");

    // --- B redeems the same code and blocks on A -------------------------
    await b.query("begin");
    await actAs(b, fixture.ownerId);
    const backendPid = (await b.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]
      .pid;
    let secondError: string | null = null;
    let secondSucceeded = false;
    let secondFinished = false;
    const bDone = b
      .query("select public.redeem_deal_code($1)", [CODE])
      .then(() => {
        secondSucceeded = true;
      })
      .catch((error: unknown) => {
        secondError = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        secondFinished = true;
      });

    // Observe PostgreSQL's lock wait, instead of relying on a fixed sleep that
    // can race with a busy CI runner before B reaches the UPDATE.
    await waitForBlockedRedeemer(admin, backendPid, () => secondFinished);

    await a.query("commit");
    await bDone;
    await b.query("rollback").catch(() => {});

    // --- Assertions -------------------------------------------------------
    if (secondSucceeded) {
      throw new Error(
        "RACE STILL OPEN: both sessions redeemed the same code. " +
          "The UPDATE is missing `and status = 'issued'` in its WHERE.",
      );
    }
    if (!secondError || !String(secondError).includes("Code not found or already used")) {
      throw new Error(`B failed, but not with the expected message. Got: ${secondError}`);
    }

    const row = await admin.withPg((client) =>
      client.query<{ redeemed_at: string | null; status: string }>(
        "select status, redeemed_at from public.deal_redemptions where code = $1",
        [CODE],
      ),
    );
    if (row.rows[0]?.status !== "redeemed") {
      throw new Error(
        `Expected status 'redeemed' after the winning session, got '${row.rows[0]?.status}'.`,
      );
    }
    if (!row.rows[0].redeemed_at) throw new Error("redeemed_at was not set.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          code: CODE,
          firstSessionRedeemed: true,
          secondSessionBlockedThenRejected: true,
          secondSessionError: secondError,
          finalStatus: row.rows[0].status,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    // Release the row locks first, so teardown's delete is not blocked by them.
    await a.query("rollback").catch(() => {});
    await b.query("rollback").catch(() => {});
    try {
      await cleanupAll(
        [
          ["deal fixture", () => admin.withPg((client) => teardown(client, ownerId))],
          [
            "deal owner",
            () =>
              admin.withPg((client) =>
                client.query("delete from auth.users where email = $1", [ownerEmail]),
              ),
          ],
        ],
        testFailure,
      );
    } finally {
      await admin.close();
      await endQuietly(a, b);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

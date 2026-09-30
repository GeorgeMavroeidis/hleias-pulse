/**
 * Concurrency checks for public.issue_deal_code() and redeem_deal_code().
 *
 * Before 20260905180000, redeem_deal_code read the code with a plain SELECT, checked
 * status = 'issued', and then updated by primary key with no row lock and no
 * status test in the UPDATE's WHERE. Two sessions redeeming the same code could
 * both pass the SELECT and both succeed: one coupon, honoured twice.
 *
 * This does not fire N requests and hope they collide — a race that only
 * sometimes reproduces is a test that only sometimes fails. It drives the
 * interleaving by hand over two connections:
 *
 * Issuance is also interleaved: A issues and holds the per-user advisory lock;
 * B's issuance must wait, then return the same code. The test then checks the
 * hourly and daily per-user quotas using redeemed fixture codes.
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
 * unclaimed place and a fresh user — and removes them in a finally block.
 *
 *   npm run smoke:deal-race
 */
import pg from "pg";
import { randomUUID } from "node:crypto";

import { assertSmokeTargetIsLocal } from "./lib/env";
import { connectGuarded, createPgSession, endQuietly } from "./lib/pg";

/** Run the rest of this transaction as `authenticated` with auth.uid() = userId. */
async function actAs(client: pg.Client, userId: string) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}

type Fixture = { businessId: string; claimId: string; ownerId: string; placeId: string };

async function waitForLock(admin: ReturnType<typeof createPgSession>, contenderPid: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const state = await admin.withPg((client) =>
      client.query<{ wait_event_type: string | null }>(
        "select wait_event_type from pg_stat_activity where pid=$1",
        [contenderPid],
      ),
    );
    if (state.rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The contender never reached a PostgreSQL lock wait.");
}

async function setup(admin: pg.Client): Promise<Fixture> {
  await admin.query("begin");
  try {
    // A fresh user and an unclaimed place keep this smoke self-contained on a
    // migration-built database, with no standing admin or business fixture.
    const ownerId = randomUUID();
    await admin.query("insert into auth.users(id) values($1)", [ownerId]);
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

    await admin.query("commit");
    return { businessId, claimId, ownerId, placeId };
  } catch (error) {
    await admin.query("rollback").catch(() => {});
    throw error;
  }
}

async function teardown(admin: pg.Client, fixture: Fixture | null) {
  if (!fixture) return;
  // These foreign keys do not cascade from businesses. Remove the redemption
  // and claim explicitly before deleting their owning business.
  await admin.query("delete from public.deal_redemptions where business_id = $1", [
    fixture.businessId,
  ]);
  await admin.query("delete from public.place_business_profiles where id = $1", [fixture.claimId]);
  await admin.query("delete from public.businesses where id = $1", [fixture.businessId]);

  // 20260907120000 put an audit trigger on businesses, and this fixture trips
  // it twice: once on insert, because it is created already 'verified' rather
  // than 'pending', and once on delete, because losing a verified row is the
  // privileged event the trigger records. admin_audit_logs has no foreign key
  // to businesses, so neither row cascades away with the business above —
  // they have to be swept by hand, and *after* the delete, or the second one
  // has not been written yet.
  await admin.query(
    "delete from public.admin_audit_logs where entity_type = 'businesses' and entity_id = $1",
    [fixture.businessId],
  );
  await admin.query("delete from auth.users where id = $1", [fixture.ownerId]);
}

async function main() {
  assertSmokeTargetIsLocal();
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
  const bPid = Number(
    (await b.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid,
  );
  let fixture: Fixture | null = null;

  try {
    // `once`, not `withPg`: setup inserts rows and is not safe to replay.
    fixture = await admin.once(setup);

    // --- A issues a code and holds the per-user advisory lock ------------
    await a.query("begin");
    await actAs(a, fixture.ownerId);
    const firstIssue = await a.query<{ payload: { code: string } }>(
      "select public.issue_deal_code($1) as payload",
      [fixture.placeId],
    );
    const code = firstIssue.rows[0]?.payload.code;
    if (!code) throw new Error("A: issue_deal_code returned no code.");

    // B must wait, then see and reuse A's committed code.
    await b.query("begin");
    await actAs(b, fixture.ownerId);
    let secondIssue: string | null = null;
    let issueError: string | null = null;
    const issueDone = b
      .query<{ payload: { code: string } }>("select public.issue_deal_code($1) as payload", [
        fixture.placeId,
      ])
      .then((result) => {
        secondIssue = result.rows[0]?.payload.code ?? null;
      })
      .catch((error: unknown) => {
        issueError = error instanceof Error ? error.message : String(error);
      });
    await waitForLock(admin, bPid);
    if (secondIssue || issueError) {
      throw new Error("B did not wait for A's deal issuance transaction.");
    }
    await a.query("commit");
    await issueDone;
    if (issueError || secondIssue !== code) {
      throw new Error(
        `Concurrent issuance returned ${secondIssue ?? issueError} instead of ${code}.`,
      );
    }
    await b.query("commit");
    const issuedRows = await admin.withPg((client) =>
      client.query<{ count: string }>(
        "select count(*) from public.deal_redemptions where profile_claim_id=$1 and user_id=$2",
        [fixture!.claimId, fixture!.ownerId],
      ),
    );
    if (Number(issuedRows.rows[0].count) !== 1) {
      throw new Error("Concurrent issuance created more than one redemption row.");
    }

    // --- A redeems and holds the lock ------------------------------------
    await a.query("begin");
    await actAs(a, fixture.ownerId);
    const first = await a.query<{ redeem_deal_code: unknown }>(
      "select public.redeem_deal_code($1)",
      [code],
    );
    if (!first.rowCount) throw new Error("A: redeem_deal_code returned no row.");

    // --- B redeems the same code and blocks on A -------------------------
    await b.query("begin");
    await actAs(b, fixture.ownerId);
    let secondError: string | null = null;
    let secondSucceeded = false;
    const bDone = b
      .query("select public.redeem_deal_code($1)", [code])
      .then(() => {
        secondSucceeded = true;
      })
      .catch((error: unknown) => {
        secondError = error instanceof Error ? error.message : String(error);
      });

    // Give B time to reach the lock. If it has already finished here, it never
    // blocked at all, which is itself the bug.
    await waitForLock(admin, bPid);
    if (secondSucceeded || secondError) {
      throw new Error(
        `B did not block on A's row lock (succeeded=${secondSucceeded}, error=${secondError}). ` +
          "The redemption is not taking a lock at all.",
      );
    }

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
        [code],
      ),
    );
    if (row.rows[0]?.status !== "redeemed") {
      throw new Error(
        `Expected status 'redeemed' after the winning session, got '${row.rows[0]?.status}'.`,
      );
    }
    if (!row.rows[0].redeemed_at) throw new Error("redeemed_at was not set.");

    // The deal may be revoked while a caller waits for its per-user lock.
    // Eligibility must be read after the wait, not from a stale pre-lock row.
    await a.query("begin");
    await a.query("select pg_advisory_xact_lock(76218811, hashtext($1))", [fixture.ownerId]);
    await b.query("begin");
    await actAs(b, fixture.ownerId);
    let revokedError = "";
    const revokedIssue = b
      .query("select public.issue_deal_code($1)", [fixture.placeId])
      .catch((error: unknown) => {
        revokedError = error instanceof Error ? error.message : String(error);
      });
    await waitForLock(admin, bPid);
    await admin.withPg((client) =>
      client.query("update public.place_business_profiles set deal_active=false where id=$1", [
        fixture!.claimId,
      ]),
    );
    await a.query("commit");
    await revokedIssue;
    await b.query("rollback");
    if (!revokedError.includes("This place has no active deal")) {
      throw new Error(`Revoked deal remained issuable after lock wait: ${revokedError}`);
    }
    await admin.withPg((client) =>
      client.query("update public.place_business_profiles set deal_active=true where id=$1", [
        fixture!.claimId,
      ]),
    );

    // The redeemed code still counts toward the quota. Nine more recent
    // redeemed rows bring this user's hourly total to ten, so a new request
    // must be rejected even though there is no active code to reuse.
    await admin.withPg((client) =>
      client.query(
        `insert into public.deal_redemptions
           (profile_claim_id,place_id,business_id,code,status,user_id,redeemed_at)
         select $1,$2,$3,'RATE-' || extensions.gen_random_uuid()::text,
                'redeemed',$4,now()
         from generate_series(1,9)`,
        [fixture!.claimId, fixture!.placeId, fixture!.businessId, fixture!.ownerId],
      ),
    );
    await a.query("begin");
    await actAs(a, fixture.ownerId);
    let quotaError = "";
    try {
      await a.query("select public.issue_deal_code($1)", [fixture.placeId]);
    } catch (error) {
      quotaError = error instanceof Error ? error.message : String(error);
    }
    await a.query("rollback");
    if (!quotaError.includes("Deal code limit reached")) {
      throw new Error(`Hourly issuance quota did not reject the eleventh code: ${quotaError}`);
    }

    // Move the ten prior issuances outside the hour, then add twenty more.
    // The hourly counter is zero while the daily counter is thirty.
    await admin.withPg(async (client) => {
      await client.query(
        "update public.deal_redemptions set issued_at=now()-interval '2 hours' where user_id=$1",
        [fixture!.ownerId],
      );
      await client.query(
        `insert into public.deal_redemptions
           (profile_claim_id,place_id,business_id,code,status,user_id,issued_at,redeemed_at)
         select $1,$2,$3,'DAY-' || extensions.gen_random_uuid()::text,
                'redeemed',$4,now()-interval '2 hours',now()
         from generate_series(1,20)`,
        [fixture!.claimId, fixture!.placeId, fixture!.businessId, fixture!.ownerId],
      );
    });
    await a.query("begin");
    await actAs(a, fixture.ownerId);
    let dailyError = "";
    try {
      await a.query("select public.issue_deal_code($1)", [fixture.placeId]);
    } catch (error) {
      dailyError = error instanceof Error ? error.message : String(error);
    }
    await a.query("rollback");
    if (!dailyError.includes("Deal code limit reached")) {
      throw new Error(`Daily issuance quota did not reject the 31st code: ${dailyError}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          code,
          concurrentIssuanceReusedOneCode: true,
          hourlyIssuanceQuotaRejected: true,
          dailyIssuanceQuotaRejected: true,
          revokedDealRejectedAfterLockWait: true,
          firstSessionRedeemed: true,
          secondSessionBlockedThenRejected: true,
          secondSessionError: secondError,
          finalStatus: row.rows[0].status,
        },
        null,
        2,
      ),
    );
  } finally {
    // Release the row locks first, so teardown's delete is not blocked by them.
    await a.query("rollback").catch(() => {});
    await b.query("rollback").catch(() => {});
    // A delete, so replaying it on a fresh connection is safe.
    await admin
      .withPg((client) => teardown(client, fixture))
      .catch((error) => {
        console.error("Fixture cleanup failed — remove it by hand:", fixture, error);
        process.exitCode = 1;
      });
    await admin.close();
    await endQuietly(a, b);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

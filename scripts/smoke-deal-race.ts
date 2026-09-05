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
import { readFileSync } from "node:fs";
import pg from "pg";

const projectRef = "kfxfnqryfmuxiwlswyyn";
const CODE = `RACE${Math.floor(Math.random() * 90 + 10)}`;

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

function createPgClient() {
  const password = readEnvValue("SUPABASE_DB_PASSWORD");
  if (!password) throw new Error("SUPABASE_DB_PASSWORD is missing.");

  return new pg.Client({
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: "postgres",
    user: "postgres",
    password,
    ssl: { rejectUnauthorized: false },
  });
}

/** Run the rest of this transaction as `authenticated` with auth.uid() = userId. */
async function actAs(client: pg.Client, userId: string) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}

type Fixture = { businessId: string; claimId: string; ownerId: string; placeId: string };

async function setup(admin: pg.Client): Promise<Fixture> {
  // An auth user who does not already own a business (businesses.user_id is
  // unique), and a place with no live claim (place_business_profiles has a
  // partial unique index on place_id where status <> 'rejected').
  const owner = await admin.query<{ id: string }>(`
    select u.id from auth.users u
    where not exists (select 1 from public.businesses b where b.user_id = u.id)
    limit 1
  `);
  if (!owner.rowCount)
    throw new Error("No auth user available that does not already own a business.");

  const place = await admin.query<{ id: string }>(`
    select p.id from public.places p
    where not exists (
      select 1 from public.place_business_profiles c
      where c.place_id = p.id and c.status <> 'rejected'
    )
    limit 1
  `);
  if (!place.rowCount) throw new Error("No unclaimed place available for the fixture.");

  const ownerId = owner.rows[0].id;
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

  return { businessId, claimId, ownerId, placeId };
}

async function teardown(admin: pg.Client, fixture: Fixture | null) {
  if (!fixture) return;
  // deal_redemptions and place_business_profiles both cascade from businesses.
  await admin.query("delete from public.businesses where id = $1", [fixture.businessId]);
}

async function main() {
  const admin = createPgClient();
  const a = createPgClient();
  const b = createPgClient();
  let fixture: Fixture | null = null;

  await Promise.all([admin.connect(), a.connect(), b.connect()]);

  try {
    fixture = await setup(admin);

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
    let secondError: string | null = null;
    let secondSucceeded = false;
    const bDone = b
      .query("select public.redeem_deal_code($1)", [CODE])
      .then(() => {
        secondSucceeded = true;
      })
      .catch((error: unknown) => {
        secondError = error instanceof Error ? error.message : String(error);
      });

    // Give B time to reach the lock. If it has already finished here, it never
    // blocked at all, which is itself the bug.
    await new Promise((resolve) => setTimeout(resolve, 750));
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

    const row = await admin.query<{ redeemed_at: string | null; status: string }>(
      "select status, redeemed_at from public.deal_redemptions where code = $1",
      [CODE],
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
  } finally {
    await a.query("rollback").catch(() => {});
    await b.query("rollback").catch(() => {});
    await teardown(admin, fixture).catch((error) => {
      console.error("Fixture cleanup failed — remove it by hand:", fixture, error);
    });
    await Promise.all([admin.end(), a.end(), b.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

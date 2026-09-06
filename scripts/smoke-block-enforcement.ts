/**
 * Server-side block enforcement check for 20260905190000.
 *
 * The failure mode this guards against is not "blocking is wrong", it is
 * "blocking silently does nothing". A policy that references user_blocks
 * through a plain subquery looks correct and enforces nothing, because
 * user_blocks' own RLS (user_blocks_all_own) hides the rows the test needs
 * from the person being blocked. So this asserts the block actually bites,
 * in both directions, and that anon is untouched.
 *
 * Fixture: two auth users, one published post each. A blocks B. Then:
 *
 *   B must not see A's post   <- the half a client filter cannot do
 *   A must not see B's post   <- reinforces what the client already does
 *   B must still see B's own  <- "Users can read own posts" still applies
 *   anon must see both        <- signed-out readers are unaffected
 *
 * Needs SUPABASE_DB_PASSWORD (.env or environment), like the other smokes.
 * Everything it creates is removed in a finally block.
 *
 *   npm run smoke:block-enforcement
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const projectRef = "kfxfnqryfmuxiwlswyyn";
const stamp = Date.now();
const POST_A = `block-smoke-a-${stamp}`;
const POST_B = `block-smoke-b-${stamp}`;

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

  // This project (created 2026-08) is pooler-only — db.<ref>.supabase.co does
  // not resolve. Session mode (port 5432) so `set local role` in actAs/visibleAs
  // behaves exactly as a direct connection would. User is postgres.<ref>.
  return new pg.Client({
    host: "aws-0-eu-central-1.pooler.supabase.com",
    port: 5432,
    database: "postgres",
    user: `postgres.${projectRef}`,
    password,
    ssl: { rejectUnauthorized: false },
  });
}

/** Which of the two fixture posts this reader can see, as the given user. */
async function visiblePostsAs(client: pg.Client, userId: string | null) {
  await client.query("begin");
  try {
    if (userId) {
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
      await client.query("set local role authenticated");
    } else {
      await client.query("select set_config('request.jwt.claims', '', true)");
      await client.query("set local role anon");
    }

    const result = await client.query<{ id: string }>(
      "select id from public.posts where id = any($1::text[]) order by id",
      [[POST_A, POST_B]],
    );
    return result.rows.map((row) => row.id);
  } finally {
    await client.query("rollback");
  }
}

type Fixture = { authorId: string; placeId: string; userA: string; userB: string };

async function setup(admin: pg.Client): Promise<Fixture> {
  const users = await admin.query<{ id: string }>(
    "select id from auth.users order by created_at limit 2",
  );
  if (users.rowCount !== 2) throw new Error("Need at least two auth users to test blocking.");

  const author = await admin.query<{ id: string }>("select id from public.authors limit 1");
  const place = await admin.query<{ id: string }>("select id from public.places limit 1");
  if (!author.rowCount || !place.rowCount)
    throw new Error("No author/place available for the fixture.");

  const fixture: Fixture = {
    authorId: author.rows[0].id,
    placeId: place.rows[0].id,
    userA: users.rows[0].id,
    userB: users.rows[1].id,
  };

  for (const [id, userId] of [
    [POST_A, fixture.userA],
    [POST_B, fixture.userB],
  ] as const) {
    await admin.query(
      `insert into public.posts
         (id, author_id, place_id, kind, display_time, text, image_url, user_id, moderation_status)
       values ($1, $2, $3, 'tip', 'now', 'block enforcement fixture', '', $4, 'published')`,
      [id, fixture.authorId, fixture.placeId, userId],
    );
  }

  // A blocks B.
  await admin.query(
    `insert into public.user_blocks (blocker_id, blocked_id, kind) values ($1, $2, 'block')
     on conflict (blocker_id, blocked_id) do update set kind = 'block'`,
    [fixture.userA, fixture.userB],
  );

  return fixture;
}

async function teardown(admin: pg.Client, fixture: Fixture | null) {
  await admin.query("delete from public.posts where id = any($1::text[])", [[POST_A, POST_B]]);
  if (fixture) {
    await admin.query("delete from public.user_blocks where blocker_id = $1 and blocked_id = $2", [
      fixture.userA,
      fixture.userB,
    ]);
  }
}

function assertSame(label: string, actual: string[], expected: string[]) {
  const a = [...actual].sort().join(",");
  const b = [...expected].sort().join(",");
  if (a !== b) throw new Error(`${label}: expected [${b}], got [${a}]`);
}

async function main() {
  const admin = createPgClient();
  const reader = createPgClient();
  let fixture: Fixture | null = null;

  await Promise.all([admin.connect(), reader.connect()]);

  try {
    fixture = await setup(admin);

    const asB = await visiblePostsAs(reader, fixture.userB);
    const asA = await visiblePostsAs(reader, fixture.userA);
    const asAnon = await visiblePostsAs(reader, null);

    // The half a client filter cannot do. If this fails with both posts
    // visible, the policy is referencing user_blocks through the reader's own
    // RLS and matching nothing.
    assertSame("B (blocked) sees only their own post", asB, [POST_B]);
    assertSame("A (blocker) sees only their own post", asA, [POST_A]);
    assertSame("anon is unaffected", asAnon, [POST_A, POST_B]);

    console.log(
      JSON.stringify(
        { ok: true, blockedReaderSees: asB, blockerSees: asA, anonSees: asAnon },
        null,
        2,
      ),
    );
  } finally {
    await teardown(admin, fixture).catch((error) => {
      console.error("Fixture cleanup failed — remove it by hand:", { POST_A, POST_B }, error);
    });
    await Promise.all([admin.end(), reader.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

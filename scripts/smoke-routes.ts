/**
 * routes / route_stops: public read, admin-only write, and the referential
 * behaviour the Routes screen depends on.
 *
 * Routes are the one content type with no `moderation_status` column and no
 * user-submission path — only an owner/editor can write them, and whatever they
 * write is public the instant it lands ("Public can read routes" is
 * `using (true)`). That makes the write gate the only gate, so this asserts it
 * from both sides, and asserts the read side really is open to a signed-out
 * visitor rather than merely open to the author who just wrote it.
 *
 * Both halves of RLS show up again, as in smoke-admin.ts: a refused INSERT
 * raises 42501, a refused UPDATE or DELETE quietly matches nothing and reports
 * success. `replaceAdminRouteStops()` makes that concrete — called by a
 * non-admin with an empty list it is a bare DELETE, so it returns without
 * error, and only re-reading the stops shows they are all still there.
 *
 * The ordering and cascade half covers what a broken itinerary would look like:
 *
 *   primary key (route_id, position)   two stops cannot share a position
 *   check (position >= 0)              no negative steps
 *   order by position                  survives being inserted out of order
 *   route_id on delete cascade         deleting a route takes its stops
 *   place_id on delete restrict        a place cannot be deleted while a route
 *                                      still walks people to it
 *
 * The last one is the one worth having: without it, deleting a place would
 * leave a stop pointing at nothing and the active step-by-step guide would walk
 * a tourist to a null.
 *
 * Note in passing, not asserted: route_stops' read policy is `using (true)`
 * with no join to places, so a stop pointing at a `pending` place publishes its
 * own title and body while the place itself stays hidden. Routes are
 * admin-authored, so there is no user content behind that; it is a curation
 * wrinkle, not a leak.
 *
 * Needs the local Supabase CLI session (service_role key, to create the two
 * disposable users) and SUPABASE_DB_PASSWORD, like the other smokes. Everything
 * it creates is removed in a `finally`.
 *
 *   npm run smoke:routes
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { supabase } from "../src/lib/supabase/client";
import { replaceAdminRouteStops, saveAdminRoute } from "../src/lib/admin-api";

const projectRef = "kfxfnqryfmuxiwlswyyn";
const stamp = Date.now();
const ROUTE_ID = `smoke-routes-${stamp}`;
const OTHER_ROUTE_ID = `smoke-routes-outsider-${stamp}`;
const PLACE_ID = `smoke-routes-place-${stamp}`;

type Role = "outsider" | "owner";

const ROLES: Role[] = ["owner", "outsider"];

type SmokeState = {
  emails: Record<Role, string>;
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
  // not resolve. Only plain queries here (no `set role`), so transaction mode
  // (port 6543) is the right fit. User is postgres.<ref>.
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
 * One shared connection with a listener on it, as in smoke-admin.ts. A dropped
 * pooled connection emits an `error` event, and an EventEmitter with no `error`
 * listener rethrows as an uncaught exception — which would kill the process
 * outside main()'s try/finally and leak the fixture.
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
 * client that attempted the write. Retries once, and only when the connection
 * itself failed — a SQL error is the answer an assertion wants.
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
  return rejection as { code?: string; message?: string };
}

async function signInAs(email: string, password: string) {
  await supabase.auth.signOut();
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) throw new Error(`Sign-in failed for ${email}: ${result.error.message}`);
  const userId = result.data.user?.id;
  assert(userId, "Sign-in returned no user id.");
  return userId;
}

async function stopsFromPg() {
  return (
    await withPg((client) =>
      client.query<{ place_id: string; position: number; title: string }>(
        "select position, place_id, title from public.route_stops where route_id = $1 order by position",
        [ROUTE_ID],
      ),
    )
  ).rows;
}

async function routeTitle() {
  return (
    await withPg((client) =>
      client.query<{ title: string }>("select title from public.routes where id = $1", [ROUTE_ID]),
    )
  ).rows[0]?.title;
}

async function main() {
  const { url } = readSupabaseClientConfig();
  const serviceClient = createClient(url, readServiceRoleKey(), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const suffix = `${stamp}-${randomUUID().slice(0, 8)}`;
  const state: SmokeState = {
    emails: {
      outsider: `smoke-backend-routes-outsider-${suffix}@mailinator.com`,
      owner: `smoke-backend-routes-owner-${suffix}@mailinator.com`,
    },
    password: `Smoke-${randomUUID()}-Aa1!`,
    users: {},
  };
  let authorId = "";
  let existingPlaces: string[] = [];

  try {
    for (const role of ROLES) {
      const created = await serviceClient.auth.admin.createUser({
        email: state.emails[role],
        password: state.password,
        email_confirm: true,
        user_metadata: { display_name: `Routes Smoke ${role}`, default_identity: "GUIDE" },
      });
      if (created.error) throw new Error(`createUser ${role}: ${created.error.message}`);
      const id = created.data.user?.id;
      assert(id, `createUser ${role} returned no id.`);
      state.users[role] = id;
    }
    console.log(`[auth] disposable users created: ${ROLES.join(", ")}`);

    await withPg(async (client) => {
      // Cleanup deletes the disposable owner, cascading into admin_members and
      // firing prevent_last_owner_removal(). Refuse to start if ours would be
      // the only owner left, or cleanup would wedge.
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

      const author = await client.query<{ id: string }>("select id from public.authors limit 1");
      assert(author.rowCount, "No author available for the fixture route.");
      authorId = author.rows[0].id;

      const places = await client.query<{ id: string }>(
        "select id from public.places where moderation_status = 'published' order by id limit 2",
      );
      assert(places.rowCount === 2, "Need two published places for the fixture stops.");
      existingPlaces = places.rows.map((row) => row.id);

      // A disposable place, so the ON DELETE RESTRICT assertion can try to
      // delete something real without touching curated content.
      await client.query(
        `insert into public.places
           (id, name, greek_name, type, area, x, y, lat, lng, pulse, mood, crowd, budget,
            best_time, short, image_url, hotness, status, moderation_status)
         values ($1, 'Routes smoke place', 'Δοκιμαστικό σημείο', 'beach', 'Smoke', 0, 0,
                 37.67, 21.44, 0, 'test', 'empty', 'free', 'never', 'Disposable fixture.',
                 '', 0, 'quiet', 'pending')`,
        [PLACE_ID],
      );
    });
    console.log("[fixture] disposable owner promoted, disposable place created");

    // == an owner writes the route ==========================================
    await signInAs(state.emails.owner, state.password);

    await saveAdminRoute({
      id: ROUTE_ID,
      title: "Routes smoke itinerary",
      author_id: authorId,
      lede: "Disposable fixture route.",
      duration: "2h",
      budget: "free",
      image_url: "",
      tags: ["smoke"],
    });
    assert((await routeTitle()) === "Routes smoke itinerary", "saveAdminRoute() did not land.");

    // routes carries an audit trigger (audit_admin_routes); route_stops does
    // not. An owner's edit is therefore on the record.
    const audit = await withPg((client) =>
      client.query<{ action: string }>(
        `select action from public.admin_audit_logs
         where actor_id = $1 and entity_type = 'routes' and entity_id = $2`,
        [state.users.owner, ROUTE_ID],
      ),
    );
    assert(
      audit.rowCount && audit.rows.some((row) => row.action === "insert"),
      "write_admin_audit_log() did not record an owner creating a route.",
    );
    console.log("[owner] created the route, and the audit trigger recorded it");

    // Deliberately handed over out of order: position, not array order, is what
    // the itinerary reads back by.
    await replaceAdminRouteStops(ROUTE_ID, [
      {
        route_id: ROUTE_ID,
        position: 2,
        display_time: "18:00",
        place_id: PLACE_ID,
        title: "Third",
        body: "Last stop.",
      },
      {
        route_id: ROUTE_ID,
        position: 0,
        display_time: "10:00",
        place_id: existingPlaces[0],
        title: "First",
        body: "Start here.",
      },
      {
        route_id: ROUTE_ID,
        position: 1,
        display_time: "14:00",
        place_id: existingPlaces[1],
        title: "Second",
        body: "Then here.",
      },
    ]);
    const ordered = await stopsFromPg();
    assert(
      ordered.map((row) => row.title).join(",") === "First,Second,Third",
      `Stops did not come back in position order: ${ordered.map((row) => `${row.position}:${row.title}`).join(", ")}`,
    );
    console.log("[owner] three stops inserted out of order, read back in position order");

    // == the shape constraints ==============================================
    const duplicate = await expectRejection("duplicate position", async () => {
      const result = await supabase.from("route_stops").insert({
        route_id: ROUTE_ID,
        position: 1,
        display_time: "15:00",
        place_id: existingPlaces[0],
        title: "Clash",
        body: "Same position as Second.",
      });
      if (result.error) throw result.error;
      return result;
    });
    assert(
      duplicate.code === "23505",
      `Expected a primary-key violation on (route_id, position), got ${duplicate.code}: ${duplicate.message}`,
    );

    const negative = await expectRejection("negative position", async () => {
      const result = await supabase.from("route_stops").insert({
        route_id: ROUTE_ID,
        position: -1,
        display_time: "09:00",
        place_id: existingPlaces[0],
        title: "Before the start",
        body: "Should not exist.",
      });
      if (result.error) throw result.error;
      return result;
    });
    assert(
      negative.code === "23514",
      `Expected the position >= 0 check constraint, got ${negative.code}: ${negative.message}`,
    );
    assert((await stopsFromPg()).length === 3, "A refused stop insert still landed.");
    console.log("[owner] duplicate and negative positions refused, still three stops");

    // == public read ========================================================
    // Signed out, holding nothing but the publishable key — the tourist case.
    await supabase.auth.signOut();
    const anonRoute = await supabase.from("routes").select("id,title").eq("id", ROUTE_ID);
    if (anonRoute.error) throw anonRoute.error;
    assert(
      anonRoute.data?.length === 1,
      "A signed-out visitor cannot read a route. 'Public can read routes' is not doing its job.",
    );
    const anonStops = await supabase
      .from("route_stops")
      .select("position,title")
      .eq("route_id", ROUTE_ID)
      .order("position", { ascending: true });
    if (anonStops.error) throw anonStops.error;
    assert(
      anonStops.data?.map((row) => row.title).join(",") === "First,Second,Third",
      `A signed-out visitor read the stops as: ${anonStops.data?.map((row) => row.title).join(",")}`,
    );
    console.log("[anon] signed-out read of the route and its stops works, in order");

    // == a signed-in non-admin cannot write =================================
    await signInAs(state.emails.outsider, state.password);

    const outsiderInsert = await expectRejection("outsider saveAdminRoute", () =>
      saveAdminRoute({
        id: OTHER_ROUTE_ID,
        title: "Outsider's route",
        author_id: authorId,
        lede: "Should never exist.",
        duration: "1h",
        budget: "free",
        image_url: "",
      }),
    );
    assert(
      outsiderInsert.code === "42501",
      `Expected an RLS refusal creating a route, got ${outsiderInsert.code}: ${outsiderInsert.message}`,
    );
    const planted = await withPg((client) =>
      client.query("select 1 from public.routes where id = $1", [OTHER_ROUTE_ID]),
    );
    assert(planted.rowCount === 0, "A non-admin created a route.");

    // The quiet half. Neither of these raises: the USING clause matches no row,
    // so PostgREST reports success having changed nothing. Only the re-read
    // tells them apart from a write that worked.
    const outsiderUpdate = await supabase
      .from("routes")
      .update({ title: "Defaced" })
      .eq("id", ROUTE_ID);
    if (outsiderUpdate.error) throw outsiderUpdate.error;
    assert(
      (await routeTitle()) === "Routes smoke itinerary",
      "A non-admin rewrote a published route's title.",
    );

    // replaceAdminRouteStops() with an empty list is a bare DELETE, so this is
    // the whole "silent refusal" case in one app-level call: it returns without
    // error and must have removed nothing.
    await replaceAdminRouteStops(ROUTE_ID, []);
    assert(
      (await stopsFromPg()).length === 3,
      "A non-admin emptied a route's stops. The DELETE policy is not admin-only.",
    );
    console.log("[outsider] route write refused; update and delete no-oped, content intact");

    // == referential behaviour ==============================================
    const restricted = await expectRejection("delete a place a stop points at", () =>
      withPg((client) => client.query("delete from public.places where id = $1", [PLACE_ID])),
    );
    assert(
      restricted.code === "23503",
      `Expected ON DELETE RESTRICT to protect a place in use, got ${restricted.code}: ${restricted.message}`,
    );
    console.log("[cascade] a place cannot be deleted while a route stop points at it");

    // routes -> route_stops is ON DELETE CASCADE: dropping the itinerary takes
    // its steps, so no orphaned stop can survive its route.
    await withPg((client) => client.query("delete from public.routes where id = $1", [ROUTE_ID]));
    assert(
      (await stopsFromPg()).length === 0,
      "Deleting the route left its stops behind. route_stops.route_id is not cascading.",
    );
    console.log("[cascade] deleting the route removed all three stops");

    console.log("smoke_routes_ok");
  } finally {
    console.log("[cleanup] removing disposable route fixtures");
    try {
      await supabase.auth.signOut();
      await withPg(async (client) => {
        const ids = ROLES.map((role) => state.users[role]).filter(Boolean) as string[];
        // Stops first: place_id is ON DELETE RESTRICT, so the disposable place
        // cannot go while anything still points at it.
        await client.query("delete from public.route_stops where route_id = any($1::text[])", [
          [ROUTE_ID, OTHER_ROUTE_ID],
        ]);
        await client.query("delete from public.routes where id = any($1::text[])", [
          [ROUTE_ID, OTHER_ROUTE_ID],
        ]);
        await client.query("delete from public.places where id = $1", [PLACE_ID]);
        if (ids.length) {
          await client.query(
            "delete from public.admin_audit_logs where actor_id = any($1::uuid[])",
            [ids],
          );
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
  console.error(`smoke_routes_failed ${detail}`);
  process.exit(1);
});

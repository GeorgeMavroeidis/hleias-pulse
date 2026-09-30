/**
 * Database-only route preview acceptance on a disposable local stack.
 * All fixtures and quota claims live in one transaction and are rolled back.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type pg from "pg";

import { routeInputHash } from "../src/lib/hp/route-preview";
import { assertSmokeTargetIsLocal } from "./lib/env";
import { createPgSession } from "./lib/pg";

type Place = { id: string; lng: number; lat: number };
type Identity = { role: "anon" | "authenticated"; id?: string; anonymous?: boolean };

assertSmokeTargetIsLocal();
const session = createPgSession("session", "route-preview");

async function setIdentity(client: pg.Client, identity: Identity) {
  await client.query(`set local role ${identity.role}`);
  await client.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      role: identity.role,
      ...(identity.id ? { sub: identity.id } : {}),
      is_anonymous: Boolean(identity.anonymous),
    }),
  ]);
}

async function setPostgres(client: pg.Client) {
  await client.query("set local role postgres");
}

async function expectSqlError(
  client: pg.Client,
  code: string,
  label: string,
  work: () => Promise<unknown>,
) {
  await client.query("savepoint expected_error");
  try {
    await assert.rejects(work(), (error: unknown) => {
      assert.equal((error as { code?: string }).code, code, label);
      return true;
    });
  } finally {
    await client.query("rollback to savepoint expected_error");
    await client.query("release savepoint expected_error");
  }
}

function stops(routeId: string, places: Place[]) {
  return places.map((place, position) => ({
    route_id: routeId,
    position,
    display_time: `${10 + position}:00`,
    place_id: place.id,
    title: `Stop ${position + 1}`,
    body: "Disposable route preview stop",
  }));
}

function routePayload(routeId: string, places: Place[], title = "Preview smoke route") {
  const coordinates = places.map((place) => [place.lng, place.lat] as [number, number]);
  return {
    id: routeId,
    title,
    author_id: "you",
    lede: "A disposable route",
    duration: "2h",
    budget: "free",
    tags: ["smoke"],
    image_url: "https://example.invalid/route.jpg",
    sort_order: 1,
    routing_profile: "driving-car" as const,
    route_geometry: { type: "LineString", coordinates },
    route_distance_m: 1000,
    route_duration_s: 600,
    route_input_hash: routeInputHash("driving-car", coordinates),
    route_generated_at: new Date().toISOString(),
    // These are deliberately not in the RPC's write list.
    comment_count: 999,
    saves_count: 999,
    created_at: "2000-01-01T00:00:00Z",
  };
}

async function save(
  client: pg.Client,
  route: Record<string, unknown>,
  orderedStops: ReturnType<typeof stops>,
  coordinates: [number, number][] | null,
  profile: string | null,
) {
  const result = await client.query<{ saved: Record<string, unknown> }>(
    `select to_jsonb(public.save_admin_route_with_stops(
       $1::jsonb, $2::jsonb, $3::jsonb, $4::text
     )) as saved`,
    [JSON.stringify(route), JSON.stringify(orderedStops), JSON.stringify(coordinates), profile],
  );
  return result.rows[0]?.saved;
}

async function previewState(client: pg.Client, routeId: string) {
  const result = await client.query<{
    title: string;
    route_geometry: unknown;
    route_distance_m: number | null;
    route_duration_s: number | null;
    route_input_hash: string | null;
    route_generated_at: string | null;
    comment_count: number;
    saves_count: number;
  }>(
    `select title, route_geometry, route_distance_m, route_duration_s,
            route_input_hash, route_generated_at, comment_count, saves_count
     from public.routes where id=$1`,
    [routeId],
  );
  return result.rows[0];
}

async function main() {
  await session.once(async (client) => {
    await client.query("begin");
    try {
      const owner = randomUUID();
      const editor = randomUUID();
      const moderator = randomUUID();
      const outsider = randomUUID();
      const anonymous = randomUUID();
      const routeId = `smoke-preview-${randomUUID()}`;

      await client.query("insert into auth.users(id) values($1),($2),($3),($4)", [
        owner,
        editor,
        moderator,
        outsider,
      ]);
      await client.query("insert into auth.users(id,is_anonymous) values($1,true)", [anonymous]);
      await client.query(
        `insert into public.admin_members(user_id,role)
         values ($1,'owner'),($2,'editor'),($3,'moderator'),($4,'owner')`,
        [owner, editor, moderator, anonymous],
      );
      const places = (
        await client.query<Place>(
          "select id,lng,lat from public.places where moderation_status='published' order by id limit 2",
        )
      ).rows;
      assert.equal(places.length, 2, "Local seed must contain two published places");
      const orderedStops = stops(routeId, places);
      const coordinates = places.map((place) => [place.lng, place.lat] as [number, number]);
      const route = routePayload(routeId, places);

      await setIdentity(client, { role: "anon" });
      await expectSqlError(client, "42501", "signed-out RPC", () =>
        save(client, route, orderedStops, coordinates, "driving-car"),
      );
      await expectSqlError(client, "42501", "signed-out quota", () =>
        client.query("select public.claim_route_preview_quota()"),
      );
      for (const [id, label, isAnonymous] of [
        [outsider, "outsider", false],
        [moderator, "moderator", false],
        [anonymous, "anonymous owner", true],
      ] as const) {
        await setIdentity(client, { role: "authenticated", id, anonymous: isAnonymous });
        await expectSqlError(client, "42501", `${label} save`, () =>
          save(client, route, orderedStops, coordinates, "driving-car"),
        );
        await expectSqlError(client, "42501", `${label} quota`, () =>
          client.query("select public.claim_route_preview_quota()"),
        );
      }

      await setIdentity(client, { role: "authenticated", id: owner });
      const saved = await save(
        client,
        route,
        [...orderedStops].reverse(),
        coordinates,
        "driving-car",
      );
      assert.equal(saved?.title, route.title);
      assert.equal(saved?.route_input_hash, route.route_input_hash);
      await setPostgres(client);
      let state = await previewState(client, routeId);
      assert.equal(state?.comment_count, 0, "RPC must not accept client engagement counts");
      assert.equal(state?.saves_count, 0, "RPC must not accept client engagement counts");
      const auditRows = (
        await client.query<{
          actor_id: string;
          action: string;
          details: {
            before: Record<string, unknown> | null;
            after: Record<string, unknown> | null;
          };
        }>(
          `select actor_id,action,details from public.admin_audit_logs
           where entity_type='routes' and entity_id=$1`,
          [routeId],
        )
      ).rows;
      assert.ok(auditRows.length >= 2, "Route save did not create audit records");
      for (const row of auditRows) {
        assert.equal(row.actor_id, owner, "Route audit lost the editor identity");
        assert.ok(["insert", "update"].includes(row.action), "Route audit lost its action");
        for (const version of [row.details.before, row.details.after]) {
          if (version) {
            assert.equal("route_geometry" in version, false, "Route audit duplicated geometry");
          }
        }
      }
      assert.ok(
        auditRows.some(
          (row) =>
            row.details.after?.title === route.title &&
            row.details.after?.route_input_hash === route.route_input_hash &&
            row.details.after?.route_distance_m === route.route_distance_m,
        ),
        "Route audit lost editorial content or derived preview metadata",
      );
      await setIdentity(client, { role: "authenticated", id: owner });
      await expectSqlError(client, "23514", "malformed geometry constraint", () =>
        client.query(
          `update public.routes set route_geometry='{}'::jsonb
           where id=$1`,
          [routeId],
        ),
      );
      await expectSqlError(client, "23514", "geometry without hash constraint", () =>
        client.query(
          `update public.routes set route_input_hash=null
           where id=$1`,
          [routeId],
        ),
      );
      await setPostgres(client);
      const storedStops = (
        await client.query<{ place_id: string; position: number }>(
          "select place_id,position from public.route_stops where route_id=$1 order by position",
          [routeId],
        )
      ).rows;
      assert.deepEqual(
        storedStops.map((stop) => stop.place_id),
        places.map((place) => place.id),
        "RPC did not replace stops in position order",
      );

      // A profile change through the atomic RPC keeps only the preview built
      // for the new mode; a later direct table edit has no preview to rebuild.
      const walkingRoute = {
        ...route,
        routing_profile: "foot-walking",
        route_input_hash: routeInputHash("foot-walking", coordinates),
      };
      await setIdentity(client, { role: "authenticated", id: owner });
      await save(client, walkingRoute, orderedStops, coordinates, "foot-walking");
      await setPostgres(client);
      state = await previewState(client, routeId);
      assert.ok(state?.route_geometry, "Atomic profile change lost the new preview");
      assert.equal(state.route_input_hash, walkingRoute.route_input_hash);
      await setIdentity(client, { role: "authenticated", id: owner });
      await client.query("update public.routes set routing_profile='driving-car' where id=$1", [
        routeId,
      ]);
      await setPostgres(client);
      state = await previewState(client, routeId);
      assert.equal(state?.route_geometry, null, "Direct profile edit left stale geometry");
      assert.equal(state?.route_distance_m, null, "Direct profile edit left stale distance");
      assert.equal(state?.route_duration_s, null, "Direct profile edit left stale duration");
      assert.equal(state?.route_input_hash, null, "Direct profile edit left stale hash");
      assert.equal(state?.route_generated_at, null, "Direct profile edit left stale timestamp");
      await setIdentity(client, { role: "authenticated", id: owner });
      await save(client, route, orderedStops, coordinates, "driving-car");
      await setPostgres(client);
      assert.equal((await previewState(client, routeId))?.route_input_hash, route.route_input_hash);

      await setIdentity(client, { role: "authenticated", id: editor });
      const invalidStops = [
        { ...orderedStops[0], place_id: `missing-${randomUUID()}` },
        orderedStops[1],
      ];
      await expectSqlError(client, "23503", "failed stop insert rolls back route", () =>
        save(
          client,
          {
            ...route,
            title: "Should roll back",
            route_geometry: null,
            route_distance_m: null,
            route_duration_s: null,
            route_input_hash: null,
            route_generated_at: null,
          },
          invalidStops,
          null,
          null,
        ),
      );
      await setPostgres(client);
      state = await previewState(client, routeId);
      assert.equal(state?.title, route.title, "A failed stop write changed route metadata");
      assert.equal(
        state?.route_input_hash,
        route.route_input_hash,
        "A failed stop write lost preview",
      );

      await setIdentity(client, { role: "authenticated", id: editor });
      await expectSqlError(client, "22023", "profile mismatch", () =>
        save(client, { ...route, title: "Bad profile" }, orderedStops, coordinates, "foot-walking"),
      );
      await expectSqlError(client, "22023", "coordinate mismatch", () =>
        save(
          client,
          { ...route, title: "Bad coordinates" },
          orderedStops,
          [[coordinates[0][0] + 0.01, coordinates[0][1]], coordinates[1]],
          "driving-car",
        ),
      );
      await setPostgres(client);
      state = await previewState(client, routeId);
      assert.equal(state?.title, route.title, "Mismatched preview changed route metadata");

      await setIdentity(client, { role: "authenticated", id: editor });
      await client.query(
        "update public.route_stops set place_id=$1 where route_id=$2 and position=0",
        [places[1].id, routeId],
      );
      await setPostgres(client);
      state = await previewState(client, routeId);
      assert.equal(state?.route_geometry, null, "Direct stop edit left stale geometry");
      assert.equal(state?.route_input_hash, null, "Direct stop edit left stale hash");

      await setIdentity(client, { role: "authenticated", id: owner });
      await save(client, route, orderedStops, coordinates, "driving-car");
      await setPostgres(client);
      await client.query("update public.places set lat=lat+0.000001 where id=$1", [places[0].id]);
      state = await previewState(client, routeId);
      assert.equal(state?.route_geometry, null, "Moved place left stale geometry");
      assert.equal(state?.route_distance_m, null, "Moved place left stale distance");
      assert.equal(state?.route_duration_s, null, "Moved place left stale duration");
      assert.equal(state?.route_input_hash, null, "Moved place left stale hash");
      assert.equal(state?.route_generated_at, null, "Moved place left stale timestamp");
      await setIdentity(client, { role: "authenticated", id: owner });
      await expectSqlError(client, "22023", "stale coordinates after place move", () =>
        save(
          client,
          { ...route, title: "Stale coordinates" },
          orderedStops,
          coordinates,
          "driving-car",
        ),
      );
      await setPostgres(client);
      assert.equal((await previewState(client, routeId))?.title, route.title);

      const tableGrants = (
        await client.query<{ reader: boolean; writer: boolean }>(
          `select has_table_privilege('authenticated','private.route_preview_requests','SELECT') as reader,
                  has_table_privilege('authenticated','private.route_preview_requests','INSERT') as writer`,
        )
      ).rows[0];
      assert.deepEqual(tableGrants, { reader: false, writer: false });
      await setIdentity(client, { role: "authenticated", id: owner });
      for (let claim = 0; claim < 20; claim += 1) {
        const result = await client.query<{ accepted: boolean }>(
          "select public.claim_route_preview_quota() as accepted",
        );
        assert.equal(result.rows[0].accepted, true, `Claim ${claim + 1} should pass`);
      }
      await setIdentity(client, { role: "authenticated", id: editor });
      assert.equal(
        (
          await client.query<{ accepted: boolean }>(
            "select public.claim_route_preview_quota() as accepted",
          )
        ).rows[0].accepted,
        false,
        "The 21st claim by another editor must hit the global minute limit",
      );
      await setPostgres(client);
      assert.equal(
        Number(
          (await client.query("select count(*) as n from private.route_preview_requests")).rows[0]
            .n,
        ),
        20,
      );
      await client.query(
        "update private.route_preview_requests set requested_at=clock_timestamp()-interval '2 minutes'",
      );
      await setIdentity(client, { role: "authenticated", id: editor });
      assert.equal(
        (
          await client.query<{ accepted: boolean }>(
            "select public.claim_route_preview_quota() as accepted",
          )
        ).rows[0].accepted,
        true,
        "The rolling minute limit did not release capacity",
      );
      await setPostgres(client);
      await client.query(
        `insert into private.route_preview_requests(requested_at)
         select clock_timestamp()-interval '2 minutes' from generate_series(1,479)`,
      );
      await setIdentity(client, { role: "authenticated", id: owner });
      assert.equal(
        (
          await client.query<{ accepted: boolean }>(
            "select public.claim_route_preview_quota() as accepted",
          )
        ).rows[0].accepted,
        false,
        "The global 24-hour limit did not block the 501st request",
      );
      await setPostgres(client);
      await client.query(
        "update private.route_preview_requests set requested_at=clock_timestamp()-interval '25 hours'",
      );
      await setIdentity(client, { role: "authenticated", id: owner });
      assert.equal(
        (
          await client.query<{ accepted: boolean }>(
            "select public.claim_route_preview_quota() as accepted",
          )
        ).rows[0].accepted,
        true,
        "Expired requests were not pruned from the rolling 24-hour window",
      );
      await setPostgres(client);
      assert.equal(
        Number(
          (await client.query("select count(*) as n from private.route_preview_requests")).rows[0]
            .n,
        ),
        1,
      );
      console.log("smoke_route_preview_ok");
    } finally {
      await client.query("rollback");
    }
  });
  await session.close();
}

main().catch(async (error) => {
  await session.close();
  console.error(error);
  process.exitCode = 1;
});

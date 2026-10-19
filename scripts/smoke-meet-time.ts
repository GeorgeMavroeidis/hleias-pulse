/** Future-start enforcement and aged event updates, on disposable local Supabase only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { assertSmokeTargetIsLocal } from "./lib/env";
import { createPgSession } from "./lib/pg";

assertSmokeTargetIsLocal();
const db = createPgSession("session", "meet-time");

async function signedIn(client: pg.Client, userId: string) {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: userId, role: "authenticated", is_anonymous: false }),
  ]);
  await client.query("set local role authenticated");
}

async function expectTimeRejected(client: pg.Client, sql: string, values: unknown[]) {
  await client.query("savepoint invalid_time");
  try {
    await assert.rejects(client.query(sql, values), (error: unknown) => {
      assert.equal((error as { code?: string }).code, "22023");
      assert.match((error as Error).message, /Meet start must be in the future/);
      return true;
    });
  } finally {
    await client.query("rollback to savepoint invalid_time");
    await client.query("release savepoint invalid_time");
  }
}

try {
  await db.once(async (client) => {
    await client.query("begin");
    try {
      const hostId = randomUUID();
      const guestId = randomUUID();
      const prefix = `local-meet-time-${randomUUID()}`;
      const placeId = (
        await client.query<{ id: string }>(
          "select id from public.places where moderation_status='published' order by id limit 1",
        )
      ).rows[0]?.id;
      assert.ok(placeId, "A published local fixture place is required.");
      await client.query("insert into auth.users(id) values($1),($2)", [hostId, guestId]);
      await signedIn(client, hostId);

      const insert = `insert into public.meet_events
        (id,place_id,user_id,profile_id,title,host_name,host_avatar_url,starts_at,category,vibe,price,description,cover_url,moderation_status)
        values($1,$2,$3,$3,'Local Meet test','Local host','', $4::timestamptz,'social','Friendly','Free','Local test','','pending') returning id`;
      for (const start of ["2000-01-01T00:00:00Z", "now", "infinity", "-infinity"]) {
        await expectTimeRejected(client, insert, [`${prefix}-${start}`, placeId, hostId, start]);
      }
      const future = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
      const eventId = `${prefix}-future`;
      assert.equal((await client.query(insert, [eventId, placeId, hostId, future])).rowCount, 1);
      await expectTimeRejected(client, "update public.meet_events set starts_at=$1 where id=$2", [
        "now",
        eventId,
      ]);
      await expectTimeRejected(client, "update public.meet_events set starts_at=$1 where id=$2", [
        "infinity",
        eventId,
      ]);
      assert.equal(
        (
          await client.query(
            "update public.meet_events set starts_at=clock_timestamp()+interval '2 days' where id=$1 returning id",
            [eventId],
          )
        ).rowCount,
        1,
      );

      // Let a real future start age. No trigger is disabled and no seed is edited.
      const agedId = `${prefix}-aged`;
      assert.equal(
        (
          await client.query(
            insert.replace("$4::timestamptz", "clock_timestamp()+interval '100 milliseconds'"),
            [agedId, placeId, hostId],
          )
        ).rowCount,
        1,
      );
      await client.query("select pg_sleep(0.2)");
      assert.equal(
        (
          await client.query<{ aged: boolean }>(
            "select starts_at < clock_timestamp() as aged from public.meet_events where id=$1",
            [agedId],
          )
        ).rows[0].aged,
        true,
      );
      assert.equal(
        (
          await client.query(
            "update public.meet_events set description='Updated after starting', starts_at=starts_at where id=$1 returning id",
            [agedId],
          )
        ).rowCount,
        1,
      );
      await expectTimeRejected(
        client,
        "update public.meet_events set starts_at=clock_timestamp()-interval '1 second' where id=$1",
        [agedId],
      );

      await client.query("reset role");
      assert.equal(
        (
          await client.query(
            "update public.meet_events set moderation_status='published' where id=$1 returning id",
            [agedId],
          )
        ).rowCount,
        1,
      );
      await signedIn(client, guestId);
      assert.equal(
        (
          await client.query(
            "insert into public.event_rsvps(event_id,user_id,profile_id,status) values($1,$2,$2,'going') returning event_id",
            [agedId, guestId],
          )
        ).rowCount,
        1,
      );
      assert.deepEqual(
        (
          await client.query("select going_count,maybe_count from public.meet_events where id=$1", [
            agedId,
          ])
        ).rows[0],
        { going_count: 1, maybe_count: 0 },
      );
      await client.query(
        "update public.event_rsvps set status='maybe' where event_id=$1 and user_id=$2",
        [agedId, guestId],
      );
      assert.deepEqual(
        (
          await client.query("select going_count,maybe_count from public.meet_events where id=$1", [
            agedId,
          ])
        ).rows[0],
        { going_count: 0, maybe_count: 1 },
      );
      await client.query("delete from public.event_rsvps where event_id=$1 and user_id=$2", [
        agedId,
        guestId,
      ]);
      assert.deepEqual(
        (
          await client.query("select going_count,maybe_count from public.meet_events where id=$1", [
            agedId,
          ])
        ).rows[0],
        { going_count: 0, maybe_count: 0 },
      );

      // Historical curated events have no user owner and remain importable.
      await client.query("reset role");
      assert.equal(
        (await client.query(insert, [`${prefix}-curated`, placeId, null, "2000-01-01T00:00:00Z"]))
          .rowCount,
        1,
      );
      const grants = (
        await client.query(
          "select has_function_privilege('anon','private.enforce_meet_future_start()','EXECUTE') as anon, has_function_privilege('authenticated','private.enforce_meet_future_start()','EXECUTE') as authenticated, has_function_privilege('service_role','private.enforce_meet_future_start()','EXECUTE') as service_role",
        )
      ).rows[0];
      assert.deepEqual(grants, { anon: false, authenticated: false, service_role: false });
    } finally {
      await client.query("rollback");
    }
  });
  console.log(
    "Meet future-start enforcement, authenticated writes, aged edits/moderation/RSVP, and private grants passed; all fixtures rolled back.",
  );
} finally {
  await db.close();
}

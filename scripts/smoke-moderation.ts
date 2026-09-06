/**
 * End-to-end check that moderation actually persists — through the app's own
 * code path, not around it.
 *
 * Why this exists, specifically: `smoke:block-enforcement` has been green the
 * entire time blocking was broken. It connects with `pg` and asserts the RLS
 * policy bites, which it does — but the UI imported an in-memory stub
 * (`moderation-api-stub.ts`, now deleted) whose whole state was two
 * module-level `Set`s, so a report reached nobody and a block died on reload.
 * The database was never the problem; the wiring was, and nothing tested the
 * wiring.
 *
 * So this script imports the real functions from `src/lib/hp-api.ts` and the
 * real singleton client from `src/lib/supabase/client.ts` — the same modules
 * the app loads. If someone re-points those imports at a stub again, or the
 * hp-api signatures drift, this fails.
 *
 * What it asserts, as user A against user B:
 *
 *   reportContent()    writes a row A can read back
 *   re-report          updates in place, never duplicates (the unique
 *                      constraint / onConflict path)
 *   re-report reopens  a report a moderator already actioned — the WITH CHECK
 *                      edge case in content_reports_update_own
 *   blockUser()        lands a real `kind='block'` row, verified over `pg`,
 *                      not just read back through the same client that wrote it
 *   getMyBlocks()      returns it after a fresh sign-in
 *   muteUser()         replaces rather than duplicates (PK is the pair)
 *   unmuteUser()       is kind-scoped: it must not clear a block
 *   unblockUser()      removes the row
 *
 * Needs the local Supabase CLI session (service_role key, to create the two
 * disposable users) and SUPABASE_DB_PASSWORD, like the other smokes. Everything
 * it creates is removed in a `finally`.
 *
 *   npm run smoke:moderation
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { supabase } from "../src/lib/supabase/client";
import {
  blockUser,
  getMyBlocks,
  muteUser,
  reportContent,
  unblockUser,
  unmuteUser,
} from "../src/lib/hp-api";

const projectRef = "kfxfnqryfmuxiwlswyyn";

type SmokeState = {
  emailA: string;
  emailB: string;
  password: string;
  userA?: string;
  userB?: string;
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
  const publishableKey = source.match(/const supabasePublishableKey =\s*\n\s*"([^"]+)"/)?.[1];

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

  return new pg.Client({
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: "postgres",
    user: "postgres",
    password,
    ssl: { rejectUnauthorized: false },
  });
}

/**
 * Read committed state with the postgres superuser, bypassing RLS and the
 * client that did the write. "The row is really there" is the claim the stub
 * could fake; this is the check it could not have passed.
 */
async function withPg<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = createPgClient();
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function signInAs(email: string, password: string) {
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) throw new Error(`Sign-in failed for ${email}: ${result.error.message}`);
  const userId = result.data.user?.id;
  assert(userId, "Sign-in returned no user id.");
  return userId;
}

async function main() {
  const { url } = readSupabaseClientConfig();
  const admin = createClient(url, readServiceRoleKey(), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const state: SmokeState = {
    emailA: `codex-moderation-a-${suffix}@mailinator.com`,
    emailB: `codex-moderation-b-${suffix}@mailinator.com`,
    password: `Smoke-${randomUUID()}-Aa1!`,
  };

  try {
    for (const which of ["A", "B"] as const) {
      const email = which === "A" ? state.emailA : state.emailB;
      const created = await admin.auth.admin.createUser({
        email,
        password: state.password,
        email_confirm: true,
        user_metadata: { display_name: `Moderation Smoke ${which}`, default_identity: "GUIDE" },
      });
      if (created.error) throw new Error(`createUser ${which}: ${created.error.message}`);
      const id = created.data.user?.id;
      assert(id, `createUser ${which} returned no id.`);
      if (which === "A") state.userA = id;
      else state.userB = id;
    }
    const userA = state.userA!;
    const userB = state.userB!;
    console.log(`[auth] disposable users created a=${userA} b=${userB}`);

    const signedIn = await signInAs(state.emailA, state.password);
    assert(signedIn === userA, "Signed in as the wrong user.");
    console.log("[auth] signed in as A through the app's own supabase client");

    // -- reports ------------------------------------------------------------
    // A profile target needs no fixture content: target_id is text with no FK,
    // so reporting B's account exercises the same path a post report would.
    await reportContent({
      targetType: "profile",
      targetId: userB,
      reason: "spam",
      note: "Disposable moderation smoke report.",
    });

    const afterFirst = await withPg((client) =>
      client.query<{ reason: string; status: string }>(
        "select reason, status from public.content_reports where reporter_id = $1 and target_id = $2",
        [userA, userB],
      ),
    );
    assert(
      afterFirst.rowCount === 1,
      `reportContent() did not persist exactly one row (got ${afterFirst.rowCount}). ` +
        "This is the assertion the in-memory stub could never have passed.",
    );
    assert(afterFirst.rows[0].reason === "spam", "Report persisted the wrong reason.");
    console.log("[report] first report persisted ok");

    await reportContent({
      targetType: "profile",
      targetId: userB,
      reason: "harassment",
      note: "Updated reason.",
    });
    const afterSecond = await withPg((client) =>
      client.query<{ reason: string }>(
        "select reason from public.content_reports where reporter_id = $1 and target_id = $2",
        [userA, userB],
      ),
    );
    assert(afterSecond.rowCount === 1, "Re-reporting duplicated the row instead of updating it.");
    assert(afterSecond.rows[0].reason === "harassment", "Re-report did not update the reason.");
    console.log("[report] re-report updated in place, no duplicate");

    // Regression guard for the WITH CHECK edge case: once a moderator closes a
    // report, re-reporting takes the UPDATE path, and content_reports_update_own
    // requires the NEW row to be status='open'. Without an explicit status in
    // the upsert payload this fails the policy and the user sees only "Could
    // not send the report."
    await withPg((client) =>
      client.query(
        "update public.content_reports set status = 'actioned' where reporter_id = $1 and target_id = $2",
        [userA, userB],
      ),
    );
    await reportContent({ targetType: "profile", targetId: userB, reason: "hate" });
    const afterReopen = await withPg((client) =>
      client.query<{ status: string }>(
        "select status from public.content_reports where reporter_id = $1 and target_id = $2",
        [userA, userB],
      ),
    );
    assert(afterReopen.rowCount === 1, "Re-report after actioning lost or duplicated the row.");
    assert(
      afterReopen.rows[0].status === "open",
      `Re-reporting an actioned report left status=${afterReopen.rows[0].status}, not 'open'.`,
    );
    console.log("[report] re-reporting an actioned report reopens it");

    // -- blocks and mutes ---------------------------------------------------
    const blockKind = async () =>
      (
        await withPg((client) =>
          client.query<{ kind: string }>(
            "select kind from public.user_blocks where blocker_id = $1 and blocked_id = $2",
            [userA, userB],
          ),
        )
      ).rows;

    await blockUser(userB);
    let rows = await blockKind();
    assert(rows.length === 1 && rows[0].kind === "block", "blockUser() did not persist a block.");
    console.log("[block] blockUser persisted kind=block");

    // Sign out and back in: the lists must come from the database, not from
    // whatever the process happened to be holding.
    await supabase.auth.signOut();
    await signInAs(state.emailA, state.password);
    const reloaded = await getMyBlocks();
    assert(
      reloaded.blocked.includes(userB),
      "getMyBlocks() did not return the block after a fresh sign-in.",
    );
    assert(!reloaded.muted.includes(userB), "A blocked user should not also be listed as muted.");
    console.log("[block] getMyBlocks survives a fresh sign-in");

    await muteUser(userB);
    rows = await blockKind();
    assert(rows.length === 1, "muteUser() duplicated the pair instead of replacing the kind.");
    assert(rows[0].kind === "mute", "muteUser() did not replace the block with a mute.");
    console.log("[mute] muteUser replaced the block, one row per pair");

    await blockUser(userB);
    await unmuteUser(userB);
    rows = await blockKind();
    assert(
      rows.length === 1 && rows[0].kind === "block",
      "unmuteUser() is not kind-scoped — it cleared the block.",
    );
    console.log("[mute] unmuteUser is kind-scoped, block survived");

    await unblockUser(userB);
    rows = await blockKind();
    assert(rows.length === 0, "unblockUser() left the row behind.");
    console.log("[block] unblockUser removed the row");

    console.log("smoke_moderation_ok");
  } finally {
    console.log("[cleanup] removing disposable moderation fixtures");
    try {
      await supabase.auth.signOut();
      await withPg(async (client) => {
        const ids = [state.userA, state.userB].filter(Boolean) as string[];
        if (ids.length) {
          // target_id is text and carries no foreign key, so a report *about* a
          // user is not reached by that user's delete cascade. Clear it by hand.
          await client.query(
            "delete from public.content_reports where reporter_id = any($1::uuid[]) or target_id = any($2::text[])",
            [ids, ids],
          );
          await client.query(
            "delete from public.user_blocks where blocker_id = any($1::uuid[]) or blocked_id = any($1::uuid[])",
            [ids],
          );
          await client.query("delete from auth.users where id = any($1::uuid[])", [ids]);
        }
        await client.query("delete from auth.users where email = any($1::text[])", [
          [state.emailA, state.emailB],
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
  }
}

main().catch((error) => {
  console.error(
    `smoke_moderation_failed ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});

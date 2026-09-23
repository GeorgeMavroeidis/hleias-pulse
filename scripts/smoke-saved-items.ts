/** Exercise the app's saved-item path against a disposable local Supabase stack. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { readServiceRoleKey, readSupabaseClientConfig } from "./lib/env";
import { loadPulseUserState, setSavedItem } from "../src/lib/hp-api";
import { supabase } from "../src/lib/supabase/client";

if (process.env.HLEIAS_LOCAL_ONLY !== "1") {
  throw new Error("Run this smoke only through npm run supabase:local -- smoke:saved-items.");
}

type Target = { type: "place" | "post" | "route"; id: string };

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function main() {
  const { url } = readSupabaseClientConfig();
  const admin = createClient(url, readServiceRoleKey(), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const suffix = randomUUID().slice(0, 12);
  const password = `Smoke-${randomUUID()}-Aa1!`;
  const emails = [0, 1].map((index) => `smoke-saved-${index}-${suffix}@example.invalid`);
  const userIds: string[] = [];

  async function signIn(index: number) {
    assertOk(
      "sign in",
      (await supabase.auth.signInWithPassword({ email: emails[index], password })).error,
    );
  }

  async function rows() {
    const result = await admin
      .from("saved_items")
      .select("user_id,target_type,place_id,post_id,route_id")
      .in("user_id", userIds);
    assertOk("read saved rows", result.error);
    return result.data ?? [];
  }

  try {
    const [places, posts, routes] = await Promise.all([
      admin.from("places").select("id").eq("moderation_status", "published").limit(2),
      admin.from("posts").select("id").eq("moderation_status", "published").limit(1),
      admin.from("routes").select("id").limit(1),
    ]);
    assertOk("read places", places.error);
    assertOk("read posts", posts.error);
    assertOk("read routes", routes.error);
    const targets: Target[] = [
      { type: "place", id: places.data?.[0]?.id ?? "" },
      { type: "post", id: posts.data?.[0]?.id ?? "" },
      { type: "route", id: routes.data?.[0]?.id ?? "" },
    ];
    assert(
      targets.every((target) => target.id),
      "Local seed needs a published place, post and route.",
    );
    const unsavedPlaceId = places.data?.[1]?.id;
    assert(unsavedPlaceId, "Local seed needs a second place for the forged-save check.");

    for (const [index, email] of emails.entries()) {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: `Saved Smoke ${index}`, default_identity: "GUIDE" },
      });
      assertOk("create disposable user", created.error);
      assert(created.data.user?.id, "Created user has no id.");
      userIds.push(created.data.user.id);
    }

    await signIn(0);
    for (const target of targets) {
      await setSavedItem(target, true);
      await setSavedItem(target, true); // Repeating a save must not duplicate the row.
    }
    let saved = await rows();
    assert.equal(saved.length, 3, "Owner should have exactly one row per target.");
    for (const target of targets) {
      const column = `${target.type}_id` as "place_id" | "post_id" | "route_id";
      const row = saved.find((item) => item.target_type === target.type);
      assert.equal(row?.user_id, userIds[0]);
      assert.equal(row?.[column], target.id);
      assert.equal([row?.place_id, row?.post_id, row?.route_id].filter(Boolean).length, 1);
    }
    let state = await loadPulseUserState();
    assert(state.savedPlaceIds.includes(targets[0].id), "Saved place missing from app state.");
    assert.equal(state.savedPosts[targets[1].id], true, "Saved post missing from app state.");
    assert.equal(state.savedRoutes[targets[2].id], true, "Saved route missing from app state.");

    await supabase.auth.signOut();
    await signIn(1);
    state = await loadPulseUserState();
    assert.equal(state.savedPlaceIds.length, 0);
    assert.equal(Object.keys(state.savedPosts).length, 0);
    assert.equal(Object.keys(state.savedRoutes).length, 0);

    const privateRead = await supabase.from("saved_items").select("id").eq("user_id", userIds[0]);
    assertOk("other user read", privateRead.error);
    assert.equal(privateRead.data?.length, 0, "Another user can read private saved rows.");
    const forged = await supabase.from("saved_items").insert({
      user_id: userIds[0],
      target_type: "place",
      place_id: unsavedPlaceId,
    });
    assert(forged.error, "Another user could insert a saved row for the owner.");
    const foreignDelete = await supabase.from("saved_items").delete().eq("user_id", userIds[0]);
    assertOk("other user delete", foreignDelete.error);
    assert.equal((await rows()).length, 3, "Another user deleted the owner's saved rows.");

    await setSavedItem(targets[0], true);
    saved = await rows();
    assert.equal(saved.length, 4, "Two users cannot independently save the same place.");
    await supabase.auth.signOut();
    await signIn(0);
    for (const target of targets) await setSavedItem(target, false);
    state = await loadPulseUserState();
    assert.equal(state.savedPlaceIds.length, 0);
    assert.equal(Object.keys(state.savedPosts).length, 0);
    assert.equal(Object.keys(state.savedRoutes).length, 0);
    saved = await rows();
    assert.equal(saved.length, 1, "Removing the owner's saves changed another user's saved place.");
    assert.equal(saved[0].user_id, userIds[1]);

    console.log("smoke_saved_items_ok");
  } finally {
    await supabase.auth.signOut();
    for (const userId of userIds) {
      assertOk("delete disposable user", (await admin.auth.admin.deleteUser(userId)).error);
    }
    if (userIds.length) assert.equal((await rows()).length, 0, "Saved rows survived user cleanup.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

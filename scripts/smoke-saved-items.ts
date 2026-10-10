/** Exercise the app's saved-item path against a disposable local Supabase stack. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { readServiceRoleKey, readSupabaseClientConfig } from "./lib/env";
import { cleanupAll } from "./lib/cleanup";
import { loadPulseUserState, loadSavedItems, setSavedItem } from "../src/lib/hp-api";
import { savedTargetAvailable } from "../src/lib/hp/saved-items";
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
  const fixturePostId = `saved-recovery-${suffix}`;
  let testFailure: unknown;

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
      admin
        .from("posts")
        .select("id,author_id,image_url")
        .eq("moderation_status", "published")
        .limit(1),
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

    // Use a disposable post owned by the other account so hiding it really
    // removes permission for the saver, while preserving the private bookmark.
    assertOk(
      "create saved recovery fixture",
      (
        await admin.from("posts").insert({
          id: fixturePostId,
          author_id: posts.data![0].author_id,
          user_id: userIds[1],
          profile_id: userIds[1],
          author_kind: "user",
          place_id: targets[0].id,
          kind: "tip",
          display_time: "2000-01-01",
          created_at: "2000-01-01T00:00:00Z",
          text: "Fictional local Saved recovery fixture.",
          image_url: posts.data![0].image_url,
          moderation_status: "published",
        })
      ).error,
    );
    targets[1].id = fixturePostId;

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

    let resolved = await loadSavedItems();
    assert.equal(resolved.targets.length, 3);
    for (const target of targets)
      assert(
        savedTargetAvailable(target, resolved),
        `${target.type} did not resolve by stored ID.`,
      );
    assert.equal(resolved.posts[0]?.text, "Fictional local Saved recovery fixture.");
    assert(
      resolved.places.some((place) => place.id === resolved.posts[0]?.placeId),
      "Saved post is missing its permission-checked place context.",
    );
    assert(
      resolved.routes[0]?.stops.every((stop) =>
        resolved.places.some((place) => place.id === stop.placeId),
      ),
      "Saved route is missing its permission-checked stops.",
    );
    assertOk(
      "hide saved fixture",
      (await admin.from("posts").update({ moderation_status: "hidden" }).eq("id", fixturePostId))
        .error,
    );
    resolved = await loadSavedItems();
    assert.equal(resolved.targets.length, 3, "An unavailable target erased its bookmark.");
    assert.equal(resolved.posts.length, 0, "Stored-ID resolution bypassed row permissions.");
    assert.equal(savedTargetAvailable(targets[1], resolved), false);
    assertOk(
      "restore saved fixture",
      (await admin.from("posts").update({ moderation_status: "published" }).eq("id", fixturePostId))
        .error,
    );

    // Exercise the real resolver's error propagation at both the bookmark
    // read and target/context reads. No failed read may look like no saves.
    const originalFetch = globalThis.fetch;
    for (const failedTable of ["saved_items", "posts", "places"]) {
      let intercepted = false;
      globalThis.fetch = async (input, init) => {
        const requestUrl = new URL(
          typeof input === "string" ? input : input instanceof URL ? input : input.url,
        );
        assert.equal(
          requestUrl.origin,
          new URL(url).origin,
          "Saved recovery attempted a non-local destination.",
        );
        if (requestUrl.pathname === `/rest/v1/${failedTable}`) {
          intercepted = true;
          return new Response(
            JSON.stringify({ message: "Injected local read failure", code: "LOCAL_TEST_FAILURE" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        return originalFetch(input, init);
      };
      try {
        await assert.rejects(loadSavedItems(), { message: "Injected local read failure" });
        assert(intercepted, `Resolver did not read ${failedTable}.`);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }

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
  } catch (error) {
    testFailure = error;
    throw error;
  } finally {
    await cleanupAll(
      [
        ["sign out", async () => assertOk("sign out", (await supabase.auth.signOut()).error)],
        [
          "delete saved recovery fixture",
          async () =>
            assertOk(
              "delete saved recovery fixture",
              (await admin.from("posts").delete().eq("id", fixturePostId)).error,
            ),
        ],
        ...userIds.map(
          (userId) =>
            [
              `delete disposable user ${userId}`,
              async () =>
                assertOk(
                  "delete disposable user",
                  (await admin.auth.admin.deleteUser(userId)).error,
                ),
            ] as [string, () => Promise<void>],
        ),
        [
          "verify saved-row cleanup",
          async () => {
            if (userIds.length) {
              assert.equal((await rows()).length, 0, "Saved rows survived user cleanup.");
            }
          },
        ],
      ],
      testFailure,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

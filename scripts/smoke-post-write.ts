/**
 * The Pulse composer, end to end: sign in, post, read it back, delete it.
 *
 * This goes through the app's own `createPulsePost` and the app's own singleton
 * client rather than a client built here, so it exercises the path a user
 * actually takes. Asserting against the layer underneath would prove the
 * database works while the UI is wired to something else -- the failure mode
 * that let moderation do nothing at all for a fortnight (CLAUDE.md).
 *
 * It used to sign in nowhere and simply call createPulsePost, which has
 * required a session since ensurePulseUserId() was added. Under Node there is
 * no browser storage for a session to come from, so it could only ever have
 * failed with "Sign in required" -- on any machine, not just in CI. Nothing
 * caught that because nothing ran it. The first CI run did.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { readServiceRoleKey, readSupabaseClientConfig } from "./lib/env";
import { createPulsePost, loadPulseData } from "../src/lib/hp-api";
import { supabase } from "../src/lib/supabase/client";

function requireOk(label: string, error: { message?: string } | null | undefined) {
  if (error) throw new Error(`${label}: ${error.message ?? "Unknown Supabase error"}`);
}

async function main() {
  const { url } = readSupabaseClientConfig();
  const admin = createClient(url, readServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `codex-post-write-${suffix}@mailinator.com`;
  const password = `Smoke-${randomUUID()}-Aa1!`;
  let userId: string | undefined;
  let postId: string | undefined;

  try {
    // Read first, still anonymous: a tourist browsing before signing in is the
    // app's most common reader, so it is worth one assertion of its own.
    const data = await loadPulseData();
    const place = data.places[0];
    if (!place) throw new Error("No places returned from Supabase.");

    const createUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: "Codex Post Smoke",
        default_identity: "GUIDE",
      },
    });
    requireOk("admin createUser", createUser.error);
    userId = createUser.data.user?.id;
    if (!userId) throw new Error("Admin createUser did not return a user ID.");

    const login = await supabase.auth.signInWithPassword({ email, password });
    requireOk("password login", login.error);

    const text = `Codex form smoke ${Date.now()}`;
    const post = await createPulsePost({ text, place, vibes: ["Locals"] });
    postId = post.id;

    const verifyResult = await supabase
      .from("posts")
      .select("id,text,place_id,user_id")
      .eq("id", post.id)
      .single();
    requireOk("read back the inserted post", verifyResult.error);
    if (!verifyResult.data) throw new Error("Inserted post could not be read back.");
    if (verifyResult.data.text !== text) throw new Error("Inserted post text did not round-trip.");
    // Authorship is the part RLS decides, so assert it rather than assuming the
    // insert attributed the row to whoever was signed in.
    if (verifyResult.data.user_id !== userId) {
      throw new Error("Inserted post was not attributed to the signed-in user.");
    }

    // Deleted as the author, not as admin: this is the delete policy under test.
    const deleteResult = await supabase.from("posts").delete().eq("id", post.id);
    requireOk("author deletes own post", deleteResult.error);

    const goneResult = await supabase.from("posts").select("id").eq("id", post.id).maybeSingle();
    requireOk("confirm the post is gone", goneResult.error);
    if (goneResult.data) throw new Error("Post still readable after the author deleted it.");
    postId = undefined;

    console.log(
      JSON.stringify(
        { ok: true, createdPostId: post.id, placeId: place.id, verifiedText: text, cleanup: true },
        null,
        2,
      ),
    );
  } finally {
    // Service-role sweep, so a failure part-way through cannot strand a row or a
    // user the way four leaked accounts did on 2026-09-07. Runs even when the
    // author-delete above never happened.
    if (postId) await admin.from("posts").delete().eq("id", postId);
    await supabase.auth.signOut();
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

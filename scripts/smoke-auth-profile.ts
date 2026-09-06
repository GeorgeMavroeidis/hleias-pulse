import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

type SmokeState = {
  avatarPath?: string;
  commentId?: string;
  email: string;
  password: string;
  postId?: string;
  userId?: string;
};

const projectRef = "kfxfnqryfmuxiwlswyyn";

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
    throw new Error("SUPABASE_DB_PASSWORD is missing.");
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

async function confirmSmokeUserForLogin(userId: string, email: string) {
  const client = createPgClient();
  await client.connect();
  try {
    const result = await client.query(
      `
        update auth.users
        set
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          confirmation_token = '',
          confirmation_sent_at = null,
          updated_at = now()
        where id = $1
          and email = $2
        returning id
      `,
      [userId, email],
    );

    if (result.rowCount !== 1) {
      throw new Error("Could not confirm smoke user through direct Postgres cleanup/test access.");
    }
  } finally {
    await client.end();
  }
}

async function cleanupSmokeUser(state: SmokeState) {
  const client = createPgClient();
  await client.connect();
  try {
    if (state.userId) {
      await client.query("delete from public.comments where user_id = $1", [state.userId]);
      await client.query("delete from public.posts where user_id = $1", [state.userId]);
      await client.query("delete from public.places where user_id = $1", [state.userId]);
      await client.query("delete from public.saved_items where user_id = $1", [state.userId]);
      await client.query("delete from public.post_likes where user_id = $1", [state.userId]);
      await client.query("delete from auth.users where id = $1 and email = $2", [
        state.userId,
        state.email,
      ]);
      return;
    }

    await client.query("delete from auth.users where email = $1", [state.email]);
  } finally {
    await client.end();
  }
}

function requireNoError<T>(label: string, data: T, error: { message?: string } | null) {
  if (error) {
    throw new Error(`${label}: ${error.message ?? "Unknown Supabase error"}`);
  }
  return data;
}

async function signInForSmoke(
  supabase: SupabaseClient,
  state: SmokeState,
): Promise<"signup-session" | "password-login" | "password-login-after-test-confirm"> {
  const firstLogin = await supabase.auth.signInWithPassword({
    email: state.email,
    password: state.password,
  });

  if (!firstLogin.error) {
    if (!firstLogin.data.user?.id) throw new Error("Password login did not return a user ID.");
    state.userId = firstLogin.data.user.id;
    return state.userId === firstLogin.data.user.id && firstLogin.data.session
      ? "password-login"
      : "password-login";
  }

  const needsConfirmation = /confirm/i.test(firstLogin.error.message);
  if (!needsConfirmation || !state.userId) {
    throw new Error(`Password login failed: ${firstLogin.error.message}`);
  }

  await confirmSmokeUserForLogin(state.userId, state.email);

  const secondLogin = await supabase.auth.signInWithPassword({
    email: state.email,
    password: state.password,
  });
  requireNoError("password login after test confirmation", secondLogin.data, secondLogin.error);

  if (!secondLogin.data.user?.id)
    throw new Error("Confirmed password login did not return user ID.");
  state.userId = secondLogin.data.user.id;
  return "password-login-after-test-confirm";
}

async function main() {
  const { publishableKey, url } = readSupabaseClientConfig();
  const supabase = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const supabaseAdmin = createClient(url, readServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const state: SmokeState = {
    email: `codex-auth-smoke-${suffix}@mailinator.com`,
    password: `Smoke-${randomUUID()}-Aa1!`,
  };

  let confirmationMode = "unknown";

  try {
    console.log("[auth] creating disposable confirmed Supabase Auth user through Auth Admin");
    const createUserResult = await supabaseAdmin.auth.admin.createUser({
      email: state.email,
      password: state.password,
      email_confirm: true,
      user_metadata: {
        display_name: "Codex Smoke User",
        default_identity: "GUIDE",
      },
    });
    requireNoError("auth admin createUser", createUserResult.data, createUserResult.error);
    if (!createUserResult.data.user?.id)
      throw new Error("Auth Admin createUser did not return ID.");
    state.userId = createUserResult.data.user.id;
    console.log(`[auth] disposable auth user created user_id=${state.userId}`);

    confirmationMode = await signInForSmoke(supabase, state);
    console.log(`[auth] password login ok mode=${confirmationMode}`);

    const profileResult = await supabase
      .from("profiles")
      .select("id,handle,display_name,default_identity,profile_completed_at")
      .eq("id", state.userId)
      .single();
    const profile = requireNoError(
      "profile trigger select",
      profileResult.data,
      profileResult.error,
    );
    if (!profile?.id) throw new Error("Profile trigger did not create a profile row.");
    console.log("[profile] trigger-created profile row ok");

    const handle = `smoke_${suffix.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`.slice(0, 30);
    const updatedProfileResult = await supabase
      .from("profiles")
      .update({
        handle,
        display_name: "Codex Smoke User",
        default_identity: "GUIDE",
        bio: "Disposable backend smoke test profile.",
        home_area: "Pyrgos",
        avatar_path: `${state.userId}/smoke-avatar.png`,
        profile_completed_at: new Date().toISOString(),
      })
      .eq("id", state.userId)
      .select("id,handle,display_name,default_identity,avatar_path,profile_completed_at")
      .single();
    const updatedProfile = requireNoError(
      "profile owner update",
      updatedProfileResult.data,
      updatedProfileResult.error,
    );
    if (updatedProfile.handle !== handle || updatedProfile.default_identity !== "GUIDE") {
      throw new Error("Profile update did not persist expected values.");
    }
    console.log(`[profile] owner update ok handle=${handle}`);

    const preferenceResult = await supabase
      .from("user_preferences")
      .update({
        language: "EN",
        vibe_chips: ["beach", "culture"],
        home_map_area: "Pyrgos",
        location_enabled: false,
      })
      .eq("user_id", state.userId)
      .select("user_id,language,vibe_chips,home_map_area")
      .single();
    const preferences = requireNoError(
      "preferences owner update",
      preferenceResult.data,
      preferenceResult.error,
    );
    if (preferences.language !== "EN") throw new Error("Preference update did not persist.");
    console.log("[preferences] owner update ok");

    state.avatarPath = `${state.userId}/smoke-avatar.png`;
    const pngOnePixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    );
    const uploadResult = await supabase.storage
      .from("avatars")
      .upload(state.avatarPath, pngOnePixel, {
        cacheControl: "60",
        contentType: "image/png",
        upsert: true,
      });
    requireNoError("avatar upload", uploadResult.data, uploadResult.error);
    console.log(`[storage] avatar upload ok path=${state.avatarPath}`);

    const placeResult = await supabase.from("places").select("id,image_url").limit(1).single();
    const place = requireNoError("read place for smoke post", placeResult.data, placeResult.error);
    if (!place?.id) throw new Error("No place available for smoke post.");

    state.postId = `smoke-post-${suffix}`;
    const postResult = await supabase
      .from("posts")
      .insert({
        id: state.postId,
        author_id: "you",
        author_kind: "user",
        user_id: state.userId,
        profile_id: state.userId,
        posting_identity: "GUIDE",
        place_id: place.id,
        kind: "spot",
        display_time: "just now",
        text: "Disposable backend smoke test post.",
        tags: ["smoke-test"],
        likes_count: 0,
        image_url: place.image_url,
        sort_order: -Date.now(),
      })
      .select("id,user_id,profile_id,posting_identity,author_kind")
      .single();
    const post = requireNoError("profile-owned post insert", postResult.data, postResult.error);
    if (post.profile_id !== state.userId || post.posting_identity !== "GUIDE") {
      throw new Error("Post did not persist expected profile identity.");
    }
    console.log("[content] profile-owned post insert ok");

    const commentResult = await supabase
      .from("comments")
      .insert({
        target_type: "post",
        post_id: state.postId,
        author_id: "you",
        author_name: "Codex Smoke User",
        author_kind: "user",
        user_id: state.userId,
        profile_id: state.userId,
        posting_identity: "GUIDE",
        text: "Disposable backend smoke test comment.",
        sort_order: Date.now(),
      })
      .select("id,user_id,profile_id,posting_identity,author_kind")
      .single();
    const comment = requireNoError(
      "profile-owned comment insert",
      commentResult.data,
      commentResult.error,
    );
    state.commentId = comment.id;
    if (comment.profile_id !== state.userId || comment.posting_identity !== "GUIDE") {
      throw new Error("Comment did not persist expected profile identity.");
    }
    console.log("[content] profile-owned comment insert ok");

    console.log(`smoke_auth_profile_ok confirmation_mode=${confirmationMode}`);
  } finally {
    console.log("[cleanup] removing disposable smoke user/content");
    try {
      if (state.avatarPath) {
        await supabase.storage.from("avatars").remove([state.avatarPath]);
      }
      await cleanupSmokeUser(state);
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
    `smoke_auth_profile_failed ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});

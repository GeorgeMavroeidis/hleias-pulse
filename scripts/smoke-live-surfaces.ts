import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  createPulseMeetEvent,
  createPulseStory,
  loadPulseData,
  loadPulseUserState,
  markPulseStoriesSeen,
  recordPulseActivityDay,
  setPulseMeetRsvp,
} from "../src/lib/hp-api";
import { supabase } from "../src/lib/supabase/client";

const projectRef = "kfxfnqryfmuxiwlswyyn";

function readSupabaseClientConfig() {
  const source = readFileSync("src/lib/supabase/client.ts", "utf8");
  const url = source.match(/const supabaseUrl = "([^"]+)"/)?.[1];
  const publishableKey = source.match(/const supabasePublishableKey\s*=\s*"([^"]+)"/)?.[1];

  if (!url || !publishableKey) {
    throw new Error("Could not read Supabase client config.");
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
  const email = `codex-live-surfaces-${suffix}@mailinator.com`;
  const password = `Smoke-${randomUUID()}-Aa1!`;
  let userId: string | undefined;
  let storyId: string | undefined;
  let eventId: string | undefined;

  try {
    const bootstrap = await loadPulseData();
    if (bootstrap.stories.length === 0) throw new Error("Bootstrap returned no Supabase stories.");
    if (bootstrap.meetEvents.length === 0) {
      throw new Error("Bootstrap returned no Supabase Meet events.");
    }
    const place = bootstrap.places[0];
    if (!place) throw new Error("Bootstrap returned no places.");

    const createUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: "Codex Live Smoke",
        default_identity: "GUIDE",
      },
    });
    requireOk("admin createUser", createUser.error);
    userId = createUser.data.user?.id;
    if (!userId) throw new Error("Admin createUser did not return a user ID.");

    const login = await supabase.auth.signInWithPassword({ email, password });
    requireOk("password login", login.error);

    const profileUpdate = await supabase
      .from("profiles")
      .update({
        handle: `live_${suffix.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`.slice(0, 30),
        display_name: "Codex Live Smoke",
        default_identity: "GUIDE",
        profile_completed_at: new Date().toISOString(),
      })
      .eq("id", userId);
    requireOk("profile completion", profileUpdate.error);

    const story = await createPulseStory({
      place,
      profileId: userId,
      authorName: "Codex Live Smoke",
      authorType: "GUIDE",
      authorAvatarUrl: "https://i.pravatar.cc/120?img=22",
      kind: "report",
      caption: `Live surface smoke story ${suffix}`,
      visibilityHours: 24,
      crowd: "low",
      parking: "easy",
      condition: ["smoke"],
    });
    storyId = story.id;

    await markPulseStoriesSeen([story.id]);
    const afterStory = await loadPulseUserState();
    if (!afterStory.seenStoryIds.includes(story.id)) {
      throw new Error("Story view did not round-trip through Supabase.");
    }

    const event = await createPulseMeetEvent({
      place,
      profileId: userId,
      hostName: "Codex Live Smoke",
      hostAvatarUrl: "https://i.pravatar.cc/120?img=22",
      hostType: "GUIDE",
      title: `Live surface smoke event ${suffix}`,
      placeId: place.id,
      happensAt: new Date(Date.now() + 3_600_000).toISOString(),
      category: "social",
      vibe: "Friendly",
      price: "Free",
      description: "Disposable Meet event smoke test.",
      tags: ["smoke"],
    });
    eventId = event.id;

    let state = await loadPulseUserState();
    if (state.rsvpMap[event.id] !== "going") {
      throw new Error("Hosted event did not create a going RSVP.");
    }

    await setPulseMeetRsvp(event.id, "maybe", { profileId: userId });
    state = await loadPulseUserState();
    if (state.rsvpMap[event.id] !== "maybe") {
      throw new Error("Meet RSVP update did not round-trip through Supabase.");
    }

    const streak = await recordPulseActivityDay();
    if (streak.count < 1) throw new Error("Activity day did not update Supabase streak.");

    console.log(
      JSON.stringify(
        {
          ok: true,
          bootstrapStories: bootstrap.stories.length,
          bootstrapMeetEvents: bootstrap.meetEvents.length,
          createdStoryId: story.id,
          createdMeetEventId: event.id,
          rsvpStatus: state.rsvpMap[event.id],
          streakCount: streak.count,
          cleanup: true,
        },
        null,
        2,
      ),
    );
  } finally {
    if (eventId) await admin.from("meet_events").delete().eq("id", eventId);
    if (storyId) await admin.from("stories").delete().eq("id", storyId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    await supabase.auth.signOut();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

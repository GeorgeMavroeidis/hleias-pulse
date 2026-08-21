import type { Author } from "./hp-model";
import { supabase } from "./supabase/client";
import type { Database } from "./supabase/database.types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
type PreferenceRow = Database["public"]["Tables"]["user_preferences"]["Row"];

export type AccountIdentity = Extract<Author["type"], "LOCAL" | "TOURIST" | "GUIDE" | "BUSINESS">;

export interface PulseAccountProfile {
  id: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  avatarPath: string | null;
  bio: string | null;
  homeArea: string | null;
  defaultIdentity: AccountIdentity;
  profileCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PulseUserPreferences {
  userId: string;
  language: "GR" | "EN";
  homeMapArea: string | null;
  locationEnabled: boolean;
  vibeChips: string[];
}

export type PulseAccountState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "anonymous"; userId: string }
  | {
      status: "needsProfile";
      userId: string;
      email: string | null;
      profile: PulseAccountProfile | null;
      preferences: PulseUserPreferences | null;
    }
  | {
      status: "ready";
      userId: string;
      email: string | null;
      profile: PulseAccountProfile;
      preferences: PulseUserPreferences | null;
    };

export type SavePulseProfileInput = {
  displayName: string;
  handle: string;
  defaultIdentity: AccountIdentity;
  homeArea?: string;
  bio?: string;
  avatarUrl?: string | null;
  avatarPath?: string | null;
};

const ACCOUNT_IDENTITIES: AccountIdentity[] = ["LOCAL", "TOURIST", "GUIDE", "BUSINESS"];

function accountIdentity(value: string | null | undefined): AccountIdentity {
  const normalized = (value ?? "LOCAL").toUpperCase();
  return ACCOUNT_IDENTITIES.includes(normalized as AccountIdentity)
    ? (normalized as AccountIdentity)
    : "LOCAL";
}

function mapProfile(row: ProfileRow): PulseAccountProfile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    avatarPath: row.avatar_path,
    bio: row.bio,
    homeArea: row.home_area,
    defaultIdentity: accountIdentity(row.default_identity),
    profileCompletedAt: row.profile_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPreferences(row: PreferenceRow): PulseUserPreferences {
  return {
    userId: row.user_id,
    language: row.language === "EN" ? "EN" : "GR",
    homeMapArea: row.home_map_area,
    locationEnabled: row.location_enabled,
    vibeChips: row.vibe_chips,
  };
}

export function normalizeHandle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_.]+/g, "")
    .slice(0, 30);
}

export function isProfileComplete(profile: PulseAccountProfile | null | undefined) {
  return Boolean(profile?.profileCompletedAt && profile.displayName && profile.handle);
}

export function profileDisplayName(profile: PulseAccountProfile | null | undefined) {
  return profile?.displayName?.trim() || profile?.handle || "Local Explorer";
}

export function profileInitials(profile: PulseAccountProfile | null | undefined) {
  const source = profileDisplayName(profile);
  const letters = source
    .split(/[\s._-]+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return letters || "LP";
}

export function profileAvatarUrl(profile: PulseAccountProfile | null | undefined) {
  return profile?.avatarUrl || null;
}

export async function getCurrentPulseAccount(): Promise<PulseAccountState> {
  const sessionResult = await supabase.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;

  const session = sessionResult.data.session;
  if (!session?.user) return { status: "signedOut" };

  const user = session.user;
  if ((user as { is_anonymous?: boolean }).is_anonymous) {
    return { status: "anonymous", userId: user.id };
  }

  const [profileResult, preferencesResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (preferencesResult.error) throw preferencesResult.error;

  const profile = profileResult.data ? mapProfile(profileResult.data) : null;
  const preferences = preferencesResult.data ? mapPreferences(preferencesResult.data) : null;
  const email = user.email ?? null;

  if (!isProfileComplete(profile)) {
    return {
      status: "needsProfile",
      userId: user.id,
      email,
      profile,
      preferences,
    };
  }

  return {
    status: "ready",
    userId: user.id,
    email,
    profile: profile as PulseAccountProfile,
    preferences,
  };
}

export function subscribeToPulseAuth(onChange: () => void) {
  const { data } = supabase.auth.onAuthStateChange(() => {
    onChange();
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string) {
  const result = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (result.error) throw result.error;
  return result.data;
}

export async function signUpWithPassword({
  email,
  password,
  displayName,
  defaultIdentity,
}: {
  email: string;
  password: string;
  displayName: string;
  defaultIdentity: AccountIdentity;
}) {
  const result = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        display_name: displayName.trim(),
        default_identity: defaultIdentity,
      },
      emailRedirectTo: typeof window === "undefined" ? undefined : window.location.origin,
    },
  });
  if (result.error) throw result.error;

  if (!result.data.session) {
    return { status: "needsConfirmation" as const, user: result.data.user };
  }

  return { status: "signedIn" as const, user: result.data.user };
}

export async function savePulseProfile(userId: string, input: SavePulseProfileInput) {
  const displayName = input.displayName.trim();
  const handle = normalizeHandle(input.handle);
  const complete = Boolean(displayName && handle);
  const update: ProfileUpdate = {
    id: userId,
    display_name: displayName || null,
    handle: handle || null,
    default_identity: accountIdentity(input.defaultIdentity),
    home_area: input.homeArea?.trim() || null,
    bio: input.bio?.trim() || null,
    profile_completed_at: complete ? new Date().toISOString() : null,
  };

  if (input.avatarUrl !== undefined) update.avatar_url = input.avatarUrl;
  if (input.avatarPath !== undefined) update.avatar_path = input.avatarPath;

  const result = await supabase
    .from("profiles")
    .upsert(update as Database["public"]["Tables"]["profiles"]["Insert"], { onConflict: "id" })
    .select("*")
    .single();

  if (result.error) throw result.error;
  return mapProfile(result.data);
}

export async function uploadPulseAvatar(userId: string, file: File) {
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const uploadResult = await supabase.storage.from("avatars").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "image/jpeg",
    upsert: true,
  });

  if (uploadResult.error) throw uploadResult.error;

  const publicUrl = supabase.storage.from("avatars").getPublicUrl(uploadResult.data.path)
    .data.publicUrl;

  return {
    avatarPath: uploadResult.data.path,
    avatarUrl: publicUrl,
  };
}

export async function signOutPulseAccount() {
  const result = await supabase.auth.signOut();
  if (result.error) throw result.error;
}

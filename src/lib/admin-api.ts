import { supabase } from "./supabase/client";
import type { Database } from "./supabase/database.types";

export type AdminRole = "owner" | "editor" | "moderator";
export type ModerationStatus = "pending" | "published" | "hidden";
export type ModerationTarget =
  | "place"
  | "post"
  | "comment"
  | "story"
  | "meet_event"
  | "cultural_event";
export type OrganizerVerificationStatus = "pending" | "verified" | "rejected";
export type BusinessVerificationStatus = "pending" | "verified" | "rejected";
export type PlaceClaimStatus = "pending" | "approved" | "rejected";

type Row<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Row"];

export type AdminPlace = Row<"places">;
export type AdminPost = Row<"posts">;
export type AdminComment = Row<"comments">;
export type AdminStory = Row<"stories">;
export type AdminMeetEvent = Row<"meet_events">;
export type AdminCulturalEvent = Row<"cultural_events">;
export type AdminOrganizer = Row<"organizers">;
export type AdminBusiness = Row<"businesses">;
export type AdminPlaceClaim = Row<"place_business_profiles">;
export type AdminRoute = Row<"routes">;
export type AdminRouteStop = Row<"route_stops">;
export type AdminProfile = Row<"profiles">;
export type AdminMember = Row<"admin_members">;
export type AdminAuditLog = Row<"admin_audit_logs">;

export interface AdminData {
  places: AdminPlace[];
  posts: AdminPost[];
  comments: AdminComment[];
  stories: AdminStory[];
  meetEvents: AdminMeetEvent[];
  culturalEvents: AdminCulturalEvent[];
  organizers: AdminOrganizer[];
  businesses: AdminBusiness[];
  placeClaims: AdminPlaceClaim[];
  routes: AdminRoute[];
  routeStops: AdminRouteStop[];
  profiles: AdminProfile[];
  members: AdminMember[];
  auditLogs: AdminAuditLog[];
}

export const EMPTY_ADMIN_DATA: AdminData = {
  places: [],
  posts: [],
  comments: [],
  stories: [],
  meetEvents: [],
  culturalEvents: [],
  organizers: [],
  businesses: [],
  placeClaims: [],
  routes: [],
  routeStops: [],
  profiles: [],
  members: [],
  auditLogs: [],
};

function required<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

/**
 * Postgres refuses a privileged write in two very different ways, and only one
 * of them is loud. An INSERT that fails a policy's WITH CHECK raises 42501. An
 * UPDATE or DELETE that fails a policy's USING clause simply matches no rows:
 * nothing changes, and PostgREST reports success. So a moderator clicking
 * "Verify" on a business got a green "Business verified." notice while the row
 * never moved, and removeAdminMember() reported a member removed who is still
 * on the team.
 *
 * The database is not the problem — RLS refuses exactly the right writes, and
 * smoke:admin re-reads every refused row to prove it did not move. What was
 * wrong is what the caller was told. So every privileged UPDATE/DELETE below
 * asks for the rows it changed back and treats an empty result as the refusal
 * it is. Enforcement stays server-side; this is the client reporting it
 * honestly.
 *
 * The message says "either the row is gone, or you lack the role" rather than
 * picking one: from here the two are genuinely indistinguishable — RLS filters
 * a forbidden row and a missing row identically, on purpose, so a policy cannot
 * be used to probe for rows the caller may not see.
 *
 * `instanceof` is unreliable across duplicated chunks in the static build, so
 * callers that need to branch should check `name` — isAdminWriteRefusedError()
 * does. (Same rationale as ReportAlreadyReviewedError in hp-api.ts.)
 */
export class AdminWriteRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminWriteRefusedError";
  }
}

export function isAdminWriteRefusedError(error: unknown): error is AdminWriteRefusedError {
  return (
    error instanceof AdminWriteRefusedError ||
    (typeof error === "object" &&
      error !== null &&
      (error as Error).name === "AdminWriteRefusedError")
  );
}

/**
 * Assert that a privileged write actually touched a row. `rows` is whatever the
 * `.select()` chained onto the write returned; an empty array means every
 * candidate row was filtered away by a policy.
 */
function assertWrote(rows: unknown[] | null, message: string) {
  if (!rows || rows.length === 0) throw new AdminWriteRefusedError(message);
}

export async function getAdminRole(): Promise<AdminRole | null> {
  const result = await supabase.rpc("current_admin_role");
  if (result.error) throw result.error;
  const role = result.data;
  return role === "owner" || role === "editor" || role === "moderator" ? role : null;
}

export async function loadAdminData(): Promise<AdminData> {
  const [
    places,
    posts,
    comments,
    stories,
    meetEvents,
    culturalEvents,
    organizers,
    businesses,
    placeClaims,
    routes,
    routeStops,
    profiles,
    members,
    auditLogs,
  ] = await Promise.all([
    supabase.from("places").select("*").order("updated_at", { ascending: false }),
    supabase.from("posts").select("*").order("created_at", { ascending: false }),
    supabase.from("comments").select("*").order("created_at", { ascending: false }),
    supabase.from("stories").select("*").order("created_at", { ascending: false }),
    supabase.from("meet_events").select("*").order("starts_at", { ascending: true }),
    supabase.from("cultural_events").select("*").order("event_date", { ascending: true }),
    supabase.from("organizers").select("*").order("created_at", { ascending: false }),
    supabase.from("businesses").select("*").order("created_at", { ascending: false }),
    supabase.from("place_business_profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("routes").select("*").order("sort_order", { ascending: true }),
    supabase.from("route_stops").select("*").order("position", { ascending: true }),
    supabase.from("profiles").select("*").order("updated_at", { ascending: false }),
    supabase.from("admin_members").select("*").order("created_at", { ascending: true }),
    supabase
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const results = [
    places,
    posts,
    comments,
    stories,
    meetEvents,
    culturalEvents,
    organizers,
    businesses,
    placeClaims,
    routes,
    routeStops,
    profiles,
    members,
    auditLogs,
  ];
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;

  return {
    places: required(places.data, "Could not load places."),
    posts: required(posts.data, "Could not load posts."),
    comments: required(comments.data, "Could not load comments."),
    stories: required(stories.data, "Could not load stories."),
    meetEvents: required(meetEvents.data, "Could not load Meet events."),
    culturalEvents: required(culturalEvents.data, "Could not load cultural events."),
    organizers: required(organizers.data, "Could not load organizers."),
    businesses: required(businesses.data, "Could not load businesses."),
    placeClaims: required(placeClaims.data, "Could not load place claims."),
    routes: required(routes.data, "Could not load routes."),
    routeStops: required(routeStops.data, "Could not load route stops."),
    profiles: required(profiles.data, "Could not load profiles."),
    members: required(members.data, "Could not load team members."),
    auditLogs: required(auditLogs.data, "Could not load audit history."),
  };
}

export async function uploadContentMedia(file: File, folder: string): Promise<string> {
  if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
    throw new Error("Use a PNG, JPEG, or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) throw new Error("Images must be 5 MB or smaller.");

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fileName = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const upload = await supabase.storage.from("content-media").upload(fileName, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) throw upload.error;
  return supabase.storage.from("content-media").getPublicUrl(upload.data.path).data.publicUrl;
}

export async function saveAdminPlace(place: Database["public"]["Tables"]["places"]["Insert"]) {
  const result = await supabase.from("places").upsert(place).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

// Tables whose rows are destroyed by Postgres, without warning, when their place
// is deleted — every one of these FKs is `on delete cascade`. Ordered worst
// first: a business claim carries the partner's deal text, phone and photos.
//
// Not listed, because Postgres already refuses the delete while they exist:
// posts, meet_events, events and route_stops (`on delete restrict`) and
// deal_redemptions (no action). Also not listed: place_avatars, saved_items and
// user_place_visits, which are decoration and per-user state — losing those with
// the place is the intended behaviour, not a surprise.
const PLACE_CASCADE_CHECKS = [
  { column: "place_id", label: "business claim", table: "place_business_profiles" },
  { column: "place_id", label: "story", table: "stories" },
  { column: "place_id", label: "comment", table: "comments" },
] as const;

/**
 * Hard-deletes a place, refusing while content would be silently destroyed.
 *
 * Postgres only protects some of this. posts, meet_events, events, route_stops
 * and deal_redemptions block the delete themselves, so those need no help. But
 * comments, stories and place_business_profiles are `on delete cascade`: without
 * the pre-flight below, deleting a place with no posts but three stories and an
 * approved business claim succeeds and takes all four rows with it, behind a
 * dialog that says "this cannot be undone".
 *
 * This is a guard, not a boundary. Authorisation is RLS ("Editors can manage
 * places", owner/editor only) and that is what actually stops a non-admin. A
 * direct PostgREST call still cascades, and a user deleting their own published
 * place through "Users can delete own places" never passes through here at all.
 * Closing that properly means changing the three FKs to `on delete restrict`,
 * which is a migration and needs George's explicit approval.
 */
export async function deleteAdminPlace(id: string) {
  const blocking: string[] = [];

  for (const check of PLACE_CASCADE_CHECKS) {
    const result = await supabase
      .from(check.table)
      .select("id", { count: "exact", head: true })
      .eq(check.column, id);
    if (result.error) throw result.error;
    const count = result.count ?? 0;
    if (count > 0) blocking.push(`${count} ${check.label}${count === 1 ? "" : "s"}`);
  }

  if (blocking.length) {
    throw new Error(
      `Deleting this place would also delete ${blocking.join(", ")}. ` +
        "Remove or reassign them first, or hide the place instead.",
    );
  }

  const result = await supabase.from("places").delete().eq("id", id).select("id");
  if (result.error) throw result.error;
  assertWrote(
    result.data,
    "Nothing was deleted — either that place is already gone, or deleting a place is Owner/Editor only.",
  );
}

export async function saveAdminStory(story: Database["public"]["Tables"]["stories"]["Insert"]) {
  const result = await supabase.from("stories").upsert(story).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function saveAdminMeetEvent(
  event: Database["public"]["Tables"]["meet_events"]["Insert"],
) {
  const result = await supabase.from("meet_events").upsert(event).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function saveAdminCulturalEvent(
  event: Database["public"]["Tables"]["cultural_events"]["Insert"],
) {
  const result = await supabase.from("cultural_events").upsert(event).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function setOrganizerVerification(
  organizerId: string,
  status: OrganizerVerificationStatus,
) {
  const result = await supabase
    .from("organizers")
    .update({ verification_status: status })
    .eq("id", organizerId)
    .select("id");
  if (result.error) throw result.error;
  assertWrote(
    result.data,
    "Nothing changed — either that organizer is gone, or only an Owner or Editor can change verification.",
  );
}

export async function createAdminOrganizer(userId: string, displayName: string) {
  const result = await supabase
    .from("organizers")
    .upsert(
      { user_id: userId, display_name: displayName, verification_status: "verified" },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export async function setBusinessVerification(
  businessId: string,
  status: BusinessVerificationStatus,
) {
  const result = await supabase
    .from("businesses")
    .update({ verification_status: status })
    .eq("id", businessId)
    .select("id");
  if (result.error) throw result.error;
  assertWrote(
    result.data,
    "Nothing changed — either that business is gone, or only an Owner or Editor can change verification.",
  );
}

export async function createAdminBusiness(userId: string, displayName: string) {
  const result = await supabase
    .from("businesses")
    .upsert(
      { user_id: userId, display_name: displayName, verification_status: "verified" },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export async function reviewPlaceClaim(claimId: string, status: PlaceClaimStatus) {
  const result = await supabase.rpc("review_place_claim", {
    claim_id: claimId,
    next_status: status,
  });
  if (result.error) throw result.error;
}

// Kill-switch for a bad static deal (stage B2). Editors already have the
// "Editors can manage place business profiles" policy, so a direct update is
// enough -- this just clears the text and deactivates it.
export async function clearPlaceDeal(claimId: string) {
  const result = await supabase
    .from("place_business_profiles")
    .update({ deal_text: null, deal_active: false })
    .eq("id", claimId)
    .select("id");
  if (result.error) throw result.error;
  assertWrote(
    result.data,
    "The deal was not cleared — either the claim is gone, or clearing a deal is Owner/Editor only.",
  );
}

// Redeemed-coupon count per claim (stage B3), for the "Place claims" list. RLS
// "Admins can read all deal redemptions" scopes this for owner/editor/moderator.
export async function getClaimRedemptionCounts(): Promise<Record<string, number>> {
  const result = await supabase
    .from("deal_redemptions")
    .select("profile_claim_id")
    .eq("status", "redeemed");
  if (result.error) throw result.error;
  const counts: Record<string, number> = {};
  for (const row of result.data ?? []) {
    counts[row.profile_claim_id] = (counts[row.profile_claim_id] ?? 0) + 1;
  }
  return counts;
}

export async function saveAdminRoute(route: Database["public"]["Tables"]["routes"]["Insert"]) {
  const result = await supabase.from("routes").upsert(route).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function replaceAdminRouteStops(
  routeId: string,
  stops: Database["public"]["Tables"]["route_stops"]["Insert"][],
) {
  // Deliberately not checked for a zero-row result the way the privileged
  // writes above are: a route that currently has no stops is a normal state,
  // so "deleted nothing" here is not evidence of a refusal. The insert that
  // follows is the loud half — it raises 42501 for a caller without the role.
  const removed = await supabase.from("route_stops").delete().eq("route_id", routeId);
  if (removed.error) throw removed.error;
  if (stops.length === 0) return;
  const inserted = await supabase.from("route_stops").insert(stops);
  if (inserted.error) throw inserted.error;
}

export async function editAdminPost(id: string, text: string) {
  const result = await supabase.from("posts").update({ text }).eq("id", id).select("id");
  if (result.error) throw result.error;
  assertWrote(
    result.data,
    "The post was not saved — either it is gone, or editing content is Owner/Editor only.",
  );
}

export async function editAdminComment(id: string, text: string) {
  const result = await supabase.from("comments").update({ text }).eq("id", id).select("id");
  if (result.error) throw result.error;
  assertWrote(
    result.data,
    "The comment was not saved — either it is gone, or editing content is Owner/Editor only.",
  );
}

export async function moderateContent(
  targetType: ModerationTarget,
  targetId: string,
  status: Extract<ModerationStatus, "published" | "hidden">,
) {
  const result = await supabase.rpc("moderate_content", {
    target_type: targetType,
    target_id: targetId,
    next_status: status,
  });
  if (result.error) throw result.error;
}

// Adding somebody is the loud half of RLS: a fresh row fails the INSERT policy's
// WITH CHECK and raises 42501. Changing an existing member's role is the quiet
// half — the upsert becomes an UPDATE, and a non-Owner's UPDATE just matches
// nothing. Both paths are covered by asking for the row back.
export async function setAdminMember(userId: string, role: AdminRole) {
  const result = await supabase
    .from("admin_members")
    .upsert({ user_id: userId, role })
    .select("user_id");
  if (result.error) throw result.error;
  assertWrote(result.data, "The team role was not saved — only an Owner can manage admin roles.");
}

export async function removeAdminMember(userId: string) {
  const result = await supabase
    .from("admin_members")
    .delete()
    .eq("user_id", userId)
    .select("user_id");
  if (result.error) throw result.error;
  assertWrote(
    result.data,
    "Nothing was removed — either that member is already gone, or only an Owner can manage admin roles.",
  );
}

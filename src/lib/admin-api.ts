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

type Row<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Row"];

export type AdminPlace = Row<"places">;
export type AdminPost = Row<"posts">;
export type AdminComment = Row<"comments">;
export type AdminStory = Row<"stories">;
export type AdminMeetEvent = Row<"meet_events">;
export type AdminCulturalEvent = Row<"cultural_events">;
export type AdminOrganizer = Row<"organizers">;
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
    .eq("id", organizerId);
  if (result.error) throw result.error;
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

export async function saveAdminRoute(route: Database["public"]["Tables"]["routes"]["Insert"]) {
  const result = await supabase.from("routes").upsert(route).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function replaceAdminRouteStops(
  routeId: string,
  stops: Database["public"]["Tables"]["route_stops"]["Insert"][],
) {
  const removed = await supabase.from("route_stops").delete().eq("route_id", routeId);
  if (removed.error) throw removed.error;
  if (stops.length === 0) return;
  const inserted = await supabase.from("route_stops").insert(stops);
  if (inserted.error) throw inserted.error;
}

export async function editAdminPost(id: string, text: string) {
  const result = await supabase.from("posts").update({ text }).eq("id", id);
  if (result.error) throw result.error;
}

export async function editAdminComment(id: string, text: string) {
  const result = await supabase.from("comments").update({ text }).eq("id", id);
  if (result.error) throw result.error;
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

export async function setAdminMember(userId: string, role: AdminRole) {
  const result = await supabase.from("admin_members").upsert({ user_id: userId, role });
  if (result.error) throw result.error;
}

export async function removeAdminMember(userId: string) {
  const result = await supabase.from("admin_members").delete().eq("user_id", userId);
  if (result.error) throw result.error;
}

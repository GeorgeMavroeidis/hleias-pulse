/**
 * TEMPORARY moderation client.
 *
 * The real implementation belongs in `src/lib/hp-api.ts` (Mavroeidis's lane) and
 * is being built in parallel against exactly these signatures. Nothing in this
 * file talks to Supabase — every call resolves, warns once on the console, and
 * mutates an in-memory store so the UI can be exercised end to end before the
 * tables exist.
 *
 * SWAP INSTRUCTIONS — when `hp-api.ts` ships these functions, delete this file
 * and change the single import in `moderation-store.ts` from
 *   `from "./moderation-api-stub"`  to  `from "@/lib/hp-api"`.
 * The types below move to `hp-api.ts` with it. No other file imports this
 * module, on purpose: the stub is one seam, not a scattering of them.
 *
 * The store is module-level, so it resets on reload. That is deliberate — a
 * stub that looks persistent invites someone to mistake it for the real thing.
 */

/**
 * NOTE — one addition to the agreed contract: `cultural_event`.
 *
 * Cultural events are their own table with their own `moderation_status`, so a
 * report against one cannot be filed as `meet_event` without landing on the
 * wrong row. The agreed enum has no member for them. Rather than mislabel the
 * report, the value is added here; if the backend ships without it the swap
 * fails to typecheck, which is the point — it surfaces the gap instead of
 * silently misfiling reports.
 */
export type ReportTargetType =
  | "post"
  | "comment"
  | "place"
  | "story"
  | "meet_event"
  | "cultural_event"
  | "profile";

export type ReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual"
  | "violence"
  | "false_info"
  | "other";

export interface ReportContentInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  note?: string;
}

const blocked = new Set<string>();
const muted = new Set<string>();

function warn(call: string, payload: unknown) {
  console.warn(
    `[moderation-api-stub] ${call} is not wired to Supabase yet — nothing was persisted.`,
    payload,
  );
}

export async function reportContent(input: ReportContentInput): Promise<void> {
  warn("reportContent()", input);
}

export async function blockUser(userId: string): Promise<void> {
  warn("blockUser()", { userId });
  blocked.add(userId);
  muted.delete(userId);
}

export async function unblockUser(userId: string): Promise<void> {
  warn("unblockUser()", { userId });
  blocked.delete(userId);
}

export async function muteUser(userId: string): Promise<void> {
  warn("muteUser()", { userId });
  muted.add(userId);
}

export async function unmuteUser(userId: string): Promise<void> {
  warn("unmuteUser()", { userId });
  muted.delete(userId);
}

export async function getMyBlocks(): Promise<{ blocked: string[]; muted: string[] }> {
  return { blocked: [...blocked], muted: [...muted] };
}

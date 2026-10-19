import type { Comment } from "../hp-model";

export type CommentTarget = {
  type: "post" | "place" | "route" | "cultural_event";
  id: string;
};
export type CommentSubmissionResult =
  | { status: "submitted"; comment: Comment }
  | { status: "auth-required" }
  | { status: "profile-required" };
export type CommentDraftStatus =
  | "idle"
  | "saving"
  | "error"
  | "auth-required"
  | "profile-required"
  | "submitted";
export interface CommentDraft {
  text: string;
  revision: number;
  status: CommentDraftStatus;
  /** Retained when sign-in finds an existing draft for this same target. */
  otherTexts?: string[];
}
export interface CommentDraftBinding {
  draft: CommentDraft;
  disabled?: boolean;
  onChange: (text: string) => void;
  onSubmit: () => Promise<CommentSubmissionResult | undefined>;
  onUseGuestDraft: () => void;
}

const EMPTY_DRAFT: CommentDraft = Object.freeze({ text: "", revision: 0, status: "idle" });
const keyFor = (target: CommentTarget) => JSON.stringify([target.type, target.id]);
const ownerFor = (userId: string | null) => userId ?? "guest";

/** Session-only store owned by PulseApp, independent of modal mount lifetimes. */
export class CommentDraftStore {
  private scopes = new Map<string, Map<string, CommentDraft>>();
  private listeners = new Set<() => void>();
  private version = 0;
  private viewer: string | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.version;
  private emit() {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }
  private scope(userId: string | null) {
    const owner = ownerFor(userId);
    let scope = this.scopes.get(owner);
    if (!scope) {
      scope = new Map();
      this.scopes.set(owner, scope);
    }
    return scope;
  }
  get(userId: string | null, target: CommentTarget): CommentDraft {
    return this.scopes.get(ownerFor(userId))?.get(keyFor(target)) ?? EMPTY_DRAFT;
  }
  setText(userId: string | null, target: CommentTarget, text: string) {
    const current = this.get(userId, target);
    this.scope(userId).set(keyFor(target), {
      ...current,
      text,
      revision: current.revision + 1,
      status: current.status === "saving" ? "saving" : "idle",
    });
    this.emit();
  }
  /** Guest text follows sign-in once; account-owned drafts never move between accounts. */
  setViewer(userId: string | null) {
    if (this.viewer === userId) return;
    const wasGuest = this.viewer === null;
    this.viewer = userId;
    if (wasGuest && userId) {
      const guest = this.scope(null);
      const destination = this.scope(userId);
      for (const [key, draft] of guest) {
        if (!draft.text) continue;
        const existing = destination.get(key);
        destination.set(
          key,
          existing?.text
            ? { ...existing, otherTexts: [...(existing.otherTexts ?? []), draft.text] }
            : { ...draft, otherTexts: existing?.otherTexts, status: "idle" },
        );
        guest.delete(key);
      }
    }
    this.emit();
  }
  useGuestDraft(userId: string | null, target: CommentTarget) {
    const current = this.get(userId, target);
    if (!current.otherTexts?.length || current.status === "saving") return;
    this.scope(userId).set(keyFor(target), {
      ...current,
      text: current.otherTexts[0],
      otherTexts: [...current.otherTexts.slice(1), ...(current.text ? [current.text] : [])],
      revision: current.revision + 1,
      status: "idle",
    });
    this.emit();
  }
  async submit(
    userId: string | null,
    target: CommentTarget,
    write: (text: string) => Promise<CommentSubmissionResult>,
  ): Promise<CommentSubmissionResult | undefined> {
    const captured = this.get(userId, target);
    if (!captured.text.trim() || captured.status === "saving") return;
    const key = keyFor(target);
    const scope = this.scope(userId);
    scope.set(key, { ...captured, status: "saving" });
    this.emit();
    try {
      const result = await write(captured.text.trim());
      const current = scope.get(key) ?? EMPTY_DRAFT;
      const unchanged = current.revision === captured.revision && current.text === captured.text;
      scope.set(key, {
        ...current,
        text: result.status === "submitted" && unchanged ? "" : current.text,
        status: result.status === "submitted" && !unchanged ? "idle" : result.status,
      });
      this.emit();
      return result;
    } catch {
      const current = scope.get(key) ?? EMPTY_DRAFT;
      scope.set(key, { ...current, status: "error" });
      this.emit();
      return undefined;
    }
  }
}

/** New authoritative rows replace old statuses; synthetic ID-less preview rows remain distinct. */
export function mergeComments(previous: Comment[], incoming: Comment[]): Comment[] {
  const result: Comment[] = [];
  const indexes = new Map<string, number>();
  for (const comment of [...previous, ...incoming]) {
    const index = comment.id ? indexes.get(comment.id) : undefined;
    if (index === undefined) {
      if (comment.id) indexes.set(comment.id, result.length);
      result.push(comment);
    } else {
      result[index] = comment;
    }
  }
  return result;
}

export function visibleComments(comments: Comment[], viewerUserId: string | null): Comment[] {
  return comments.filter(
    (comment) =>
      !comment.moderationStatus ||
      comment.moderationStatus === "published" ||
      (comment.moderationStatus === "pending" &&
        Boolean(viewerUserId) &&
        comment.userId === viewerUserId),
  );
}

/** Keep unobserved acknowledgements while allowing a published row to replace its pending copy. */
export function reconcileCommentGroups(
  previous: Record<string, Comment[]>,
  incoming: Record<string, Comment[]>,
): Record<string, Comment[]> {
  const result = { ...incoming };
  for (const [targetId, comments] of Object.entries(previous)) {
    const pending = comments.filter((comment) => comment.moderationStatus === "pending");
    result[targetId] = mergeComments(pending, incoming[targetId] ?? []);
  }
  return result;
}

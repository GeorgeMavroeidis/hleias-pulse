import {
  blockUser,
  getMyBlocks,
  muteUser,
  reportContent,
  unblockUser,
  unmuteUser,
  type ReportContentInput,
  type ReportReason,
  type ReportTargetType,
} from "./moderation-api-stub";

export type { ReportReason, ReportTargetType };

/**
 * Moderation state — blocked and muted accounts, plus which sheet is open.
 *
 * This is a subscribable module store rather than a React context on purpose.
 * A context Provider would have to wrap the whole of PulseApp.tsx, and that one
 * change re-indents ~580 lines of JSX in the file two people are working in.
 * CLAUDE.md forbids exactly that kind of churn, so the state lives here and
 * PulseApp opts in with a hook call and one component — no re-indentation.
 *
 * There is exactly one PulseApp on screen, so a single store is the right shape.
 */

/** What a "..." menu knows about the thing it is attached to. */
export interface ModerationTarget {
  type: ReportTargetType;
  id: string;
  /** Auth user id of the author. Absent on seeded content — block and mute then hide themselves. */
  authorUserId?: string | null;
  authorName?: string | null;
  authorAvatarUrl?: string | null;
  /** Short label shown in the report sheet so the user can see what they are reporting. */
  summary?: string | null;
}

export interface UserLabel {
  name: string;
  avatarUrl?: string | null;
}

export interface ModerationState {
  blockedIds: string[];
  mutedIds: string[];
  reportTarget: ModerationTarget | null;
  blockedSheetOpen: boolean;
  currentUserId: string | null;
  /** Names captured when an account is blocked, so the list stays readable. */
  labelCache: Record<string, UserLabel>;
}

/** Callbacks owned by PulseApp: the sign-in gate, toasts, and error routing. */
export interface ModerationBridge {
  requireProfile: () => boolean;
  showToast: (message: string) => void;
  onWriteError: (error: unknown, fallbackMessage: string) => void;
  resolveUserLabel: (userId: string) => UserLabel | null;
  /** Translates an English key, so store-driven toasts stay Greek-first. */
  translate: (message: string) => string;
}

const EMPTY_STATE: ModerationState = {
  blockedIds: [],
  mutedIds: [],
  reportTarget: null,
  blockedSheetOpen: false,
  currentUserId: null,
  labelCache: {},
};

let state: ModerationState = EMPTY_STATE;
const listeners = new Set<() => void>();

// Until PulseApp mounts, actions must not explode. These no-ops keep the store
// safe to call from anywhere; the real callbacks arrive on mount.
let bridge: ModerationBridge = {
  requireProfile: () => false,
  showToast: () => {},
  onWriteError: () => {},
  resolveUserLabel: () => null,
  translate: (message) => message,
};

export function setModerationBridge(next: ModerationBridge) {
  bridge = next;
}

export function subscribeToModeration(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getModerationState() {
  return state;
}

function set(patch: Partial<ModerationState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function rememberLabel(target: ModerationTarget) {
  const userId = target.authorUserId;
  const name = target.authorName;
  if (!userId || !name || state.labelCache[userId]) return;
  set({
    labelCache: { ...state.labelCache, [userId]: { name, avatarUrl: target.authorAvatarUrl } },
  });
}

/** Called when the signed-in user changes. Loads their lists, or clears them. */
export function syncModerationUser(userId: string | null) {
  if (state.currentUserId === userId) return;
  set({ currentUserId: userId, blockedIds: [], mutedIds: [] });
  if (!userId) return;
  void getMyBlocks()
    .then((result) => {
      // The account may have changed again while the read was in flight.
      if (state.currentUserId !== userId) return;
      set({ blockedIds: result.blocked, mutedIds: result.muted });
    })
    .catch((error) => {
      // A failed read must not break the app. The lists stay empty and the next
      // block or mute repopulates them.
      console.warn("Could not load blocked and muted accounts.", error);
    });
}

export function isBlocked(userId?: string | null) {
  return userId ? state.blockedIds.includes(userId) : false;
}

export function isMuted(userId?: string | null) {
  return userId ? state.mutedIds.includes(userId) : false;
}

/** Content that should not be shown at all — the author is blocked or muted. */
export function isHidden(userId?: string | null) {
  return isBlocked(userId) || isMuted(userId);
}

export function openReportSheet(target: ModerationTarget) {
  if (!bridge.requireProfile()) return;
  rememberLabel(target);
  set({ reportTarget: target });
}

export function closeReportSheet() {
  set({ reportTarget: null });
}

export function openBlockedSheet() {
  set({ blockedSheetOpen: true });
}

export function closeBlockedSheet() {
  set({ blockedSheetOpen: false });
}

/** Resolves true when the report was accepted. */
export async function submitReport(
  input: ReportContentInput,
  alsoBlockUserId: string | null,
): Promise<boolean> {
  try {
    await reportContent(input);
    if (alsoBlockUserId) await applyBlock(alsoBlockUserId);
    return true;
  } catch (error) {
    bridge.onWriteError(error, bridge.translate("Could not send the report. Try again."));
    return false;
  }
}

async function applyBlock(userId: string) {
  await blockUser(userId);
  set({
    blockedIds: state.blockedIds.includes(userId)
      ? state.blockedIds
      : [...state.blockedIds, userId],
    // Blocking supersedes muting; keeping both would show the account twice.
    mutedIds: state.mutedIds.filter((id) => id !== userId),
  });
}

export function toggleBlock(target: ModerationTarget) {
  const userId = target.authorUserId;
  if (!userId) return;
  if (!bridge.requireProfile()) return;
  rememberLabel(target);
  if (isBlocked(userId)) {
    void unblock(userId);
    return;
  }
  void applyBlock(userId)
    .then(() => announceBlock(true))
    .catch((error) => {
      bridge.onWriteError(error, bridge.translate("Could not update this account. Try again."));
    });
}

function announceBlock(blocked: boolean) {
  bridge.showToast(bridge.translate(blocked ? "Account blocked" : "Account unblocked"));
}

function announceMute(muted: boolean) {
  bridge.showToast(bridge.translate(muted ? "Account muted" : "Account unmuted"));
}

export async function unblock(userId: string) {
  try {
    await unblockUser(userId);
    set({ blockedIds: state.blockedIds.filter((id) => id !== userId) });
    announceBlock(false);
  } catch (error) {
    bridge.onWriteError(error, bridge.translate("Could not update this account. Try again."));
  }
}

export function toggleMute(target: ModerationTarget) {
  const userId = target.authorUserId;
  if (!userId) return;
  if (!bridge.requireProfile()) return;
  rememberLabel(target);
  if (isMuted(userId)) {
    void unmute(userId);
    return;
  }
  void muteUser(userId)
    .then(() => {
      set({ mutedIds: [...state.mutedIds, userId] });
      announceMute(true);
    })
    .catch((error) => {
      bridge.onWriteError(error, bridge.translate("Could not update this account. Try again."));
    });
}

export async function unmute(userId: string) {
  try {
    await unmuteUser(userId);
    set({ mutedIds: state.mutedIds.filter((id) => id !== userId) });
    announceMute(false);
  } catch (error) {
    bridge.onWriteError(error, bridge.translate("Could not update this account. Try again."));
  }
}

/** Name for the blocked list: live content first, then what we cached at block time. */
export function labelForUser(userId: string): UserLabel {
  return (
    bridge.resolveUserLabel(userId) ??
    state.labelCache[userId] ?? { name: bridge.translate("Blocked account") }
  );
}

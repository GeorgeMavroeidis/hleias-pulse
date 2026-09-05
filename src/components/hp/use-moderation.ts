import { useEffect, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n";
import { ReportSheet } from "./ReportSheet";
import { BlockedUsersSheet } from "./BlockedUsersSheet";
import {
  closeBlockedSheet,
  closeReportSheet,
  getModerationState,
  isBlocked,
  isHidden,
  isMuted,
  labelForUser,
  openBlockedSheet,
  openReportSheet,
  setModerationBridge,
  submitReport,
  subscribeToModeration,
  syncModerationUser,
  toggleBlock,
  toggleMute,
  unblock,
  unmute,
  type ModerationTarget,
  type UserLabel,
} from "./moderation-store";

export type { ModerationTarget, UserLabel };

/**
 * Read moderation state. Any component under PulseApp can call this — there is
 * no provider to thread, by design (see moderation-store.ts for why).
 */
export function useModeration() {
  const state = useSyncExternalStore(subscribeToModeration, getModerationState, getModerationState);
  return {
    blockedIds: state.blockedIds,
    mutedIds: state.mutedIds,
    currentUserId: state.currentUserId,
    isBlocked,
    isMuted,
    isHidden,
    openReport: openReportSheet,
    openBlockedUsers: openBlockedSheet,
    block: toggleBlock,
    mute: toggleMute,
  };
}

/**
 * Called once by PulseApp. Hands the store the app-level callbacks it cannot
 * own itself — the sign-in gate, toasts, write-error routing, name lookup —
 * and keeps the blocked and muted lists in step with the signed-in account.
 */
export function useModerationBridge({
  currentUserId,
  requireProfile,
  showToast,
  onWriteError,
  resolveUserLabel,
  onSheetOpenChange,
}: {
  currentUserId: string | null;
  /** Returns false and opens the sign-in sheet when there is no account. */
  requireProfile: () => boolean;
  showToast: (message: string) => void;
  /** PulseApp handleWriteError — routes an expired session back to the sign-in sheet. */
  onWriteError: (error: unknown, fallbackMessage: string) => void;
  resolveUserLabel: (userId: string) => UserLabel | null;
  /** Mirrors "a moderation sheet is open" so the shell behind it can go inert. */
  onSheetOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();

  // Re-registered on every render so the store always calls the current
  // closures rather than the ones captured on mount.
  setModerationBridge({ requireProfile, showToast, onWriteError, resolveUserLabel, translate: t });

  useEffect(() => {
    syncModerationUser(currentUserId);
  }, [currentUserId]);

  const state = useSyncExternalStore(subscribeToModeration, getModerationState, getModerationState);
  const sheetOpen = Boolean(state.reportTarget) || state.blockedSheetOpen;

  useEffect(() => {
    onSheetOpenChange(sheetOpen);
    // onSheetOpenChange is a setState function; re-running on its identity
    // would fire this on every render for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen]);
}

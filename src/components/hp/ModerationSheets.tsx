import { useSyncExternalStore } from "react";
import { ReportSheet } from "./ReportSheet";
import { BlockedUsersSheet } from "./BlockedUsersSheet";
import {
  closeBlockedSheet,
  closeReportSheet,
  getModerationState,
  labelForUser,
  submitReport,
  subscribeToModeration,
  unblock,
  unmute,
} from "./moderation-store";

/**
 * The report and blocked-accounts sheets. Rendered once by PulseApp, inside the
 * app shell so their `absolute inset-0` resolves against the phone frame.
 */
export function ModerationSheets() {
  const state = useSyncExternalStore(subscribeToModeration, getModerationState, getModerationState);

  return (
    <>
      <ReportSheet target={state.reportTarget} onClose={closeReportSheet} onSubmit={submitReport} />
      <BlockedUsersSheet
        open={state.blockedSheetOpen}
        onClose={closeBlockedSheet}
        blockedIds={state.blockedIds}
        mutedIds={state.mutedIds}
        labelFor={labelForUser}
        onUnblock={unblock}
        onUnmute={unmute}
      />
    </>
  );
}

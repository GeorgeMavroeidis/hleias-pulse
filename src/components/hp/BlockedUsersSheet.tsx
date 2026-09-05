import { AnimatePresence, motion } from "framer-motion";
import { BellOff, ShieldOff, UserX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SectionHeader } from "./blend-ui";
import type { UserLabel } from "./use-moderation";

function Row({
  userId,
  label,
  actionLabel,
  onAction,
}: {
  userId: string;
  label: UserLabel;
  actionLabel: string;
  onAction: (userId: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-2.5">
      {label.avatarUrl ? (
        <img
          src={label.avatarUrl}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          className="h-9 w-9 shrink-0 rounded-full border border-hp-ink/10 object-cover"
        />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-hp-ink/5 text-hp-ink/50">
          <UserX size={15} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-hp-ink">
        {label.name}
      </span>
      <button
        type="button"
        onClick={() => onAction(userId)}
        className="shrink-0 rounded-full border border-hp-ink/15 px-3 py-1.5 text-[11px] font-bold text-hp-ink transition active:scale-95"
      >
        {actionLabel}
      </button>
    </li>
  );
}

export function BlockedUsersSheet({
  open,
  onClose,
  blockedIds,
  mutedIds,
  labelFor,
  onUnblock,
  onUnmute,
}: {
  open: boolean;
  onClose: () => void;
  blockedIds: string[];
  mutedIds: string[];
  labelFor: (userId: string) => UserLabel;
  onUnblock: (userId: string) => Promise<void>;
  onUnmute: (userId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const empty = blockedIds.length === 0 && mutedIds.length === 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[94] overflow-hidden"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
            aria-label={t("Close")}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 240 }}
            role="dialog"
            aria-modal="true"
            aria-label={t("Blocked and muted")}
            className="hp-composer-sheet absolute inset-x-0 bottom-0 max-h-[86%] max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hp-ink/15" />

            <SectionHeader icon={ShieldOff} label={t("Blocked and muted")} tone="deep" />

            <p className="mb-4 text-[12px] leading-relaxed text-hp-muted">
              {t(
                "Blocked accounts cannot see or reach you. Muted accounts stay visible to others but not to you.",
              )}
            </p>

            {empty ? (
              <div className="rounded-3xl border border-dashed border-hp-ink/15 bg-white/45 px-5 py-10 text-center text-[13px] text-hp-muted">
                {t("You have not blocked or muted anyone.")}
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {blockedIds.length > 0 && (
                  <section>
                    <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-hp-muted">
                      <UserX size={12} /> {t("Blocked")} · {blockedIds.length}
                    </h4>
                    <ul className="flex flex-col gap-2">
                      {blockedIds.map((userId) => (
                        <Row
                          key={userId}
                          userId={userId}
                          label={labelFor(userId)}
                          actionLabel={t("Unblock")}
                          onAction={(id) => void onUnblock(id)}
                        />
                      ))}
                    </ul>
                  </section>
                )}

                {mutedIds.length > 0 && (
                  <section>
                    <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-hp-muted">
                      <BellOff size={12} /> {t("Muted")} · {mutedIds.length}
                    </h4>
                    <ul className="flex flex-col gap-2">
                      {mutedIds.map((userId) => (
                        <Row
                          key={userId}
                          userId={userId}
                          label={labelFor(userId)}
                          actionLabel={t("Unmute")}
                          onAction={(id) => void onUnmute(id)}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-full bg-hp-ink py-3 text-[12px] font-bold text-hp-paper"
            >
              {t("Close")}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

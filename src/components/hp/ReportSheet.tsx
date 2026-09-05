import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Flag, ShieldAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SectionHeader } from "./blend-ui";
import { REPORT_RESPONSE_HOURS, SUPPORT_EMAIL } from "./safety-config";
import type { ReportContentInput, ReportReason } from "./moderation-api-stub";
import type { ModerationTarget } from "./use-moderation";

/* Reason list. English keys, Greek comes from src/lib/i18n.tsx. Order matters:
   the reasons a real person reaches for most often sit at the top. */
const REASONS: { id: ReportReason; label: string; helper: string }[] = [
  { id: "spam", label: "Spam or advertising", helper: "Repeated or irrelevant promotion." },
  { id: "harassment", label: "Harassment or bullying", helper: "Targets a person or group." },
  { id: "hate", label: "Hate speech", helper: "Attacks an identity or origin." },
  { id: "sexual", label: "Sexual content", helper: "Not appropriate for this app." },
  { id: "violence", label: "Violence or threats", helper: "Threatens or glorifies harm." },
  { id: "false_info", label: "False information", helper: "Wrong place, hours, or event." },
  { id: "other", label: "Something else", helper: "Tell us in your own words." },
];

const TARGET_LABEL: Record<ModerationTarget["type"], string> = {
  post: "this post",
  comment: "this comment",
  place: "this place",
  story: "this story",
  meet_event: "this gathering",
  cultural_event: "this event",
  profile: "this account",
};

export function ReportSheet({
  target,
  onClose,
  onSubmit,
}: {
  target: ModerationTarget | null;
  onClose: () => void;
  /** Resolves true when the report was accepted. */
  onSubmit: (input: ReportContentInput, alsoBlockUserId: string | null) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!target) return;
    setReason(null);
    setNote("");
    setAlsoBlock(false);
    setSending(false);
    setSent(false);
  }, [target]);

  const canBlock = Boolean(target?.authorUserId);

  const submit = async () => {
    if (!target || !reason || sending) return;
    setSending(true);
    const ok = await onSubmit(
      {
        targetType: target.type,
        targetId: target.id,
        reason,
        note: note.trim() ? note.trim() : undefined,
      },
      alsoBlock && target.authorUserId ? target.authorUserId : null,
    );
    setSending(false);
    if (!ok) return;
    setSent(true);
    // Leave the confirmation on screen long enough to read, then get out of the way.
    window.setTimeout(onClose, 1800);
  };

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[95] overflow-hidden"
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
            aria-label={t("Report content")}
            className="hp-composer-sheet absolute inset-x-0 bottom-0 max-h-[88%] max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hp-ink/15" />

            {sent ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-hp-olive/15 text-hp-olive">
                  <Check size={26} strokeWidth={2.6} />
                </span>
                <h3 className="text-[16px] font-black text-hp-ink">{t("Report sent")}</h3>
                <p className="max-w-[280px] text-[12px] leading-relaxed text-hp-muted">
                  {t("We review reports within {hours} hours and act on what breaks the rules.", {
                    hours: REPORT_RESPONSE_HOURS,
                  })}
                </p>
              </div>
            ) : (
              <>
                <SectionHeader icon={Flag} label={t("Report content")} tone="sunset" />

                <p className="mb-3 text-[12.5px] leading-relaxed text-hp-muted">
                  {t("Tell us what is wrong with {target}. Reports are private.", {
                    target: t(TARGET_LABEL[target.type]),
                  })}
                </p>

                {target.summary && (
                  <p className="mb-3 line-clamp-2 rounded-2xl border border-hp-ink/10 bg-white/60 px-3 py-2 text-[12px] italic text-hp-ink/75">
                    {target.summary}
                  </p>
                )}

                <fieldset className="flex flex-col gap-1.5">
                  <legend className="sr-only">{t("Reason for the report")}</legend>
                  {REASONS.map((item) => {
                    const active = reason === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setReason(item.id)}
                        className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
                          active
                            ? "border-hp-sunset bg-hp-sunset/10"
                            : "border-hp-ink/10 bg-white/50"
                        }`}
                      >
                        <span
                          className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${
                            active ? "border-hp-sunset" : "border-hp-ink/25"
                          }`}
                        >
                          {active && <span className="h-2 w-2 rounded-full bg-hp-sunset" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-bold text-hp-ink">
                            {t(item.label)}
                          </span>
                          <span className="block text-[10.5px] text-hp-muted">
                            {t(item.helper)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </fieldset>

                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                    {t("Add detail (optional)")}
                  </span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    maxLength={400}
                    placeholder={t("What should we look at?")}
                    className="w-full resize-none rounded-2xl border border-hp-ink/10 bg-white/60 px-3 py-2.5 text-[13px] text-hp-ink outline-none transition placeholder:text-hp-muted focus:border-hp-sunset/45 focus:bg-white/85"
                  />
                </label>

                {canBlock && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={alsoBlock}
                    onClick={() => setAlsoBlock((value) => !value)}
                    className={`mt-2 flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
                      alsoBlock ? "border-hp-ink bg-hp-ink/5" : "border-hp-ink/10 bg-white/50"
                    }`}
                  >
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border-2 ${
                        alsoBlock ? "border-hp-ink bg-hp-ink text-hp-paper" : "border-hp-ink/25"
                      }`}
                    >
                      {alsoBlock && <Check size={10} strokeWidth={3.4} />}
                    </span>
                    <span className="text-[12.5px] font-bold text-hp-ink">
                      {target.authorName
                        ? t("Also block {name}", { name: target.authorName })
                        : t("Also block this account")}
                    </span>
                  </button>
                )}

                <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={!reason || sending}
                    className="rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper shadow-[0_10px_24px_-12px_rgba(224,106,50,0.7)] transition active:scale-[0.99] disabled:opacity-45 disabled:shadow-none"
                  >
                    {sending ? t("Working...") : t("Send report")}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={sending}
                    className="rounded-full border border-hp-ink/15 px-5 text-[13px] font-bold text-hp-ink disabled:opacity-45"
                  >
                    {t("Cancel")}
                  </button>
                </div>

                <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-hp-muted">
                  <ShieldAlert size={13} className="mt-[1px] shrink-0" />
                  <span>
                    {t("Urgent or serious? Write to us at")}{" "}
                    <a
                      href={`mailto:${SUPPORT_EMAIL}`}
                      className="font-bold text-hp-deep underline"
                    >
                      {SUPPORT_EMAIL}
                    </a>
                    .
                  </span>
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

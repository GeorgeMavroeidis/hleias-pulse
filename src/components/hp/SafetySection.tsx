import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ExternalLink, Mail, ShieldCheck, ShieldOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SectionHeader } from "./blend-ui";
import { CONTENT_POLICY_URL, REPORT_RESPONSE_HOURS, SUPPORT_EMAIL } from "./safety-config";
import { useModeration } from "./use-moderation";

/* The rules we enforce, stated plainly. App Store Guideline 1.2 wants these
   readable inside the app, not only on a website. English keys; Greek lives in
   src/lib/i18n.tsx like everything else. */
const RULES = [
  "No harassment, threats, or targeting a person.",
  "No hate speech about origin, religion, gender, or sexuality.",
  "No sexual or graphically violent content.",
  "No spam, fake places, or invented events.",
  "Post about Ilia, and post things that are true.",
];

export function SafetySection({
  /** The blocked list needs an account; the policy and contact details do not. */
  showBlockedList = true,
}: {
  showBlockedList?: boolean;
}) {
  const { t } = useI18n();
  const moderation = useModeration();
  const [rulesOpen, setRulesOpen] = useState(false);

  return (
    <section>
      <SectionHeader icon={ShieldCheck} label={t("Safety and contact")} tone="sea" />
      <div className="space-y-2">
        {showBlockedList && (
          <button
            type="button"
            onClick={moderation.openBlockedUsers}
            className="hp-card-lift flex w-full items-center gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-3 text-left transition active:scale-[0.99]"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-hp-ink/5 text-hp-ink">
              <ShieldOff size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-black text-hp-ink">
                {t("Blocked and muted")}
              </span>
              <span className="block text-[11px] text-hp-muted">
                {moderation.blockedIds.length} {t("blocked")} · {moderation.mutedIds.length}{" "}
                {t("muted")}
              </span>
            </span>
          </button>
        )}

        <div className="overflow-hidden rounded-2xl border border-hp-ink/10 bg-hp-paper">
          <button
            type="button"
            onClick={() => setRulesOpen((value) => !value)}
            aria-expanded={rulesOpen}
            className="flex w-full items-center gap-3 p-3 text-left transition active:scale-[0.99]"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-hp-sea/15 text-hp-deep">
              <ShieldCheck size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-black text-hp-ink">
                {t("Content policy")}
              </span>
              <span className="block text-[11px] text-hp-muted">
                {t("What is allowed, and what we remove.")}
              </span>
            </span>
            <ChevronDown
              size={16}
              className={`shrink-0 text-hp-muted transition-transform ${rulesOpen ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence initial={false}>
            {rulesOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="border-t border-hp-ink/10 px-3.5 py-3">
                  <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[12px] leading-relaxed text-hp-ink/80">
                    {RULES.map((rule) => (
                      <li key={rule}>{t(rule)}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11.5px] leading-relaxed text-hp-muted">
                    {t(
                      "Anyone can report content from the ... menu. We review reports within {hours} hours and remove what breaks these rules. Repeat offenders lose their account.",
                      { hours: REPORT_RESPONSE_HOURS },
                    )}
                  </p>
                  {CONTENT_POLICY_URL && (
                    <a
                      href={CONTENT_POLICY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-hp-deep underline"
                    >
                      {t("Read the full policy")} <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="hp-card-lift flex w-full items-center gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-3 text-left transition active:scale-[0.99]"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-hp-olive/15 text-hp-olive">
            <Mail size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-black text-hp-ink">{t("Contact us")}</span>
            <span className="block truncate text-[11px] text-hp-muted">{SUPPORT_EMAIL}</span>
          </span>
        </a>
      </div>
    </section>
  );
}

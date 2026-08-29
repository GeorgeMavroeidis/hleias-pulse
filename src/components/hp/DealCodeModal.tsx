import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Ticket, X } from "lucide-react";
import type { DealCode } from "@/lib/hp/business-types";
import { useI18n } from "@/lib/i18n";

function formatExpiry(iso: string, language: "GR" | "EN") {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "GR" ? "el-GR" : "en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function DealCodeModal({ code, onClose }: { code: DealCode | null; onClose: () => void }) {
  const { language, t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context / permissions) -- the
      // code is on screen anyway.
    }
  };

  return (
    <AnimatePresence>
      {code && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[92] overflow-hidden"
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
            aria-label={t("Your coupon code")}
            className="hp-composer-sheet absolute inset-x-0 bottom-0 max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-paper p-5 text-center"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hp-ink/15" />
            <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-hp-sunset">
              <Ticket size={13} /> {t("Your coupon code")}
            </div>
            {code.dealText && (
              <p className="mx-auto mb-4 max-w-xs text-[13px] font-semibold leading-snug text-hp-ink">
                {code.dealText}
              </p>
            )}
            <div className="mx-auto w-full max-w-xs rounded-2xl border-2 border-hp-sunset/40 bg-hp-sunset/10 py-5">
              <span className="font-mono text-[34px] font-black tracking-[0.35em] text-hp-ink">
                {code.code}
              </span>
            </div>
            <p className="mt-3 text-[11px] text-hp-muted">{t("Show this code at the counter.")}</p>
            {code.expiresAt && (
              <p className="mt-0.5 text-[11px] font-semibold text-hp-muted">
                {t("Expires")}: {formatExpiry(code.expiresAt, language)}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void copy()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-hp-ink/15 py-3 text-[12px] font-bold text-hp-ink"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {t(copied ? "Copied" : "Copy")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full bg-hp-ink py-3 text-[12px] font-bold text-hp-paper"
              >
                {t("Close")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

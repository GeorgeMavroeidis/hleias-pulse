import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Gift } from "lucide-react";
import type { DealCode } from "@/lib/hp/business-types";
import { dealSealValue } from "@/lib/hp/deal-seal";
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
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setQrUrl(null);
      return;
    }
    let cancelled = false;
    void import("qrcode")
      .then((mod) =>
        mod.default.toDataURL(code.code, {
          margin: 1,
          width: 320,
          color: { dark: "#141210", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

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

  const expired = Boolean(code?.expiresAt) && new Date(code!.expiresAt).getTime() < Date.now();
  const seal = code ? dealSealValue(code.dealText) : null;

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
            className="hp-composer-sheet absolute inset-x-0 bottom-0 max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-paper p-5"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hp-ink/15" />

            <div className={`hp-ticket ${expired ? "is-expired" : ""}`}>
              <div className="hp-ticket__head">
                {seal && (
                  <span className="hp-ticket__seal">
                    <b>{seal.big}</b>
                    {seal.small && <small>{seal.small}</small>}
                  </span>
                )}
                <span className="hp-ticket__chip">
                  <Gift size={15} strokeWidth={2.2} />
                </span>
                {code.dealText && <p className="hp-ticket__deal">{code.dealText}</p>}
              </div>

              <div className="hp-ticket__perf">
                <i />
              </div>

              <div className="hp-ticket__body">
                <div className="hp-ticket__redeem">
                  {expired && (
                    <div className="hp-ticket__stamp">
                      <span>{t("Expired")}</span>
                    </div>
                  )}
                  <div className="hp-ticket__qr">{qrUrl && <img src={qrUrl} alt="" />}</div>
                  <div className="hp-ticket__code">{code.code}</div>
                  <button
                    type="button"
                    onClick={() => void copy()}
                    className="mx-auto mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold text-hp-sunset"
                  >
                    {copied ? <Check size={11} /> : <Copy size={11} />}
                    {t(copied ? "Copied" : "Copy")}
                  </button>
                </div>
                <div className="hp-ticket__meta">
                  <span className="hp-ticket__tag">{t("One use")}</span>
                  {code.expiresAt && (
                    <span>
                      {expired
                        ? t("The code expired")
                        : `${t("Valid until")} ${formatExpiry(code.expiresAt, language)}`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-4 text-center text-[11px] text-hp-muted">
              {t("Show the QR or the code at the counter.")}
            </p>

            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full rounded-full bg-hp-ink py-3 text-[12px] font-bold text-hp-paper"
            >
              {t("Close")}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

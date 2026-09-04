import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { type Tab, type NavTab, TAB_ITEMS } from "./pulse-shared";

export function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: NavTab) => void }) {
  const { t } = useI18n();
  return (
    <div className="relative z-50 shrink-0 border-t border-hp-ink/10 bg-hp-paper px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_28px_rgba(23,20,17,0.08)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-7 h-7 bg-gradient-to-t from-hp-paper to-transparent"
      />
      <div className="grid grid-cols-4">
        {TAB_ITEMS.map(({ id, label, Icon }) => {
          const on = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (!on) setTab(id);
              }}
              aria-current={on ? "page" : undefined}
              className="flex flex-col items-center gap-0.5 rounded-2xl py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hp-sunset focus-visible:ring-offset-2 focus-visible:ring-offset-hp-paper"
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 520, damping: 36, mass: 0.55 }}
                className={`grid h-9 w-9 place-items-center rounded-full transition-colors duration-150 ${
                  on ? "bg-hp-ink text-hp-paper" : "text-hp-ink/60"
                }`}
              >
                <Icon size={16} />
              </motion.span>
              <span className={`text-[10px] font-bold ${on ? "text-hp-ink" : "text-hp-ink/50"}`}>
                {t(label)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============== Main App ============== */

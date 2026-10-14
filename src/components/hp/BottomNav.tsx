import { motion } from "framer-motion";
import { Compass } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { type Tab, TAB_ITEMS } from "./pulse-shared";

// The Trip tab owns three screens: the planner and the two screens it opens.
const TRIP_TABS: Tab[] = ["trip", "essentials", "quicklook"];

export function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { t } = useI18n();
  const left = TAB_ITEMS.slice(0, 2);
  const right = TAB_ITEMS.slice(2);
  const tripOn = TRIP_TABS.includes(tab);

  const renderTab = ({ id, label, Icon }: (typeof TAB_ITEMS)[number]) => {
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
  };

  return (
    <div className="relative z-50 shrink-0 border-t border-hp-ink/10 bg-hp-paper px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_28px_rgba(23,20,17,0.08)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-7 h-7 bg-gradient-to-t from-hp-paper to-transparent"
      />
      <div className="grid grid-cols-5 items-end">
        {left.map(renderTab)}

        {/* Trip: the visitor's own plan, so it sits in the middle, raised and in the
            same orange as the "+" button — the one tab that is a place to act. */}
        <button
          type="button"
          onClick={() => {
            if (tab !== "trip") setTab("trip");
          }}
          aria-current={tripOn ? "page" : undefined}
          className="flex flex-col items-center gap-0.5 rounded-2xl pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hp-sunset focus-visible:ring-offset-2 focus-visible:ring-offset-hp-paper"
        >
          <span
            className={`-mt-5 grid h-12 w-12 place-items-center rounded-full bg-hp-sunset text-hp-paper shadow-[0_8px_20px_-6px_rgba(224,106,50,0.75)] ring-4 ring-hp-paper transition-transform duration-150 ${
              tripOn ? "scale-105" : ""
            }`}
          >
            <Compass size={20} strokeWidth={2.4} />
          </span>
          <span className={`text-[10px] font-bold ${tripOn ? "text-hp-sunset" : "text-hp-ink/60"}`}>
            {t("Trip")}
          </span>
        </button>

        {right.map(renderTab)}
      </div>
    </div>
  );
}

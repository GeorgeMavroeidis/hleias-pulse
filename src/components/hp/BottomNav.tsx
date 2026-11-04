import { Compass } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { type Tab, type NavTab, TAB_ITEMS } from "./pulse-shared";

// The Trip tab owns three screens: the planner and the two screens it opens.
const TRIP_TABS: Tab[] = ["trip", "essentials", "quicklook"];

export function BottomNav({
  tab,
  setTab,
  onOpenTrip,
}: {
  tab: Tab;
  setTab: (t: NavTab) => void;
  /** Shows the centre Trip button. Omitted where there is no planner (the preview). */
  onOpenTrip?: () => void;
}) {
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
        className={`hp-bottom-nav-item ${on ? "is-active" : ""}`}
      >
        <span className="hp-bottom-nav-icon" aria-hidden="true">
          <Icon size={20} strokeWidth={on ? 2.2 : 1.8} />
        </span>
        <span className="hp-bottom-nav-label">{t(label)}</span>
      </button>
    );
  };

  return (
    <nav className="hp-bottom-nav relative z-50 shrink-0" aria-label={t("Main navigation")}>
      <div className={`grid ${onOpenTrip ? "grid-cols-5" : "grid-cols-4"} items-end`}>
        {left.map(renderTab)}

        {/* Trip: the visitor's own plan, so it sits in the middle, raised and in the
            sunset accent — the one tab that is a place to act. */}
        {onOpenTrip && (
          <button
            type="button"
            onClick={() => {
              if (tab !== "trip") onOpenTrip();
            }}
            aria-current={tripOn ? "page" : undefined}
            className={`hp-bottom-nav-item hp-bottom-nav-trip ${tripOn ? "is-active" : ""}`}
          >
            <span className="hp-bottom-nav-trip-icon" aria-hidden="true">
              <Compass size={20} strokeWidth={2.4} />
            </span>
            <span className="hp-bottom-nav-label">{t("Trip")}</span>
          </button>
        )}

        {right.map(renderTab)}
      </div>
    </nav>
  );
}

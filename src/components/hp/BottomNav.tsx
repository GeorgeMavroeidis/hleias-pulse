import { useI18n } from "@/lib/i18n";
import { type Tab, type NavTab, TAB_ITEMS } from "./pulse-shared";

export function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: NavTab) => void }) {
  const { t } = useI18n();
  return (
    <nav className="hp-bottom-nav relative z-50 shrink-0" aria-label={t("Main navigation")}>
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
              className={`hp-bottom-nav-item ${on ? "is-active" : ""}`}
            >
              <span className="hp-bottom-nav-icon" aria-hidden="true">
                <Icon size={20} strokeWidth={on ? 2.2 : 1.8} />
              </span>
              <span className="hp-bottom-nav-label">{t(label)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

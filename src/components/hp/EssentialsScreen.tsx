import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Compass,
  ExternalLink,
  Eye,
  PencilLine,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  ESSENTIALS_CARDS,
  cardFreshness,
  essentialsBySection,
  visibleCards,
  type EssentialsCard,
  type EssentialsSectionId,
} from "@/lib/hp/essentials";
import { SECTION_ICONS } from "./essentials-icons";

// The region is fixed until there is a second one; see "Built to travel" in
// docs/TOURIST_STAY_PACK.md.
const REGION = "ilia";

function formatChecked(iso: string, language: "GR" | "EN") {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(language === "GR" ? "el-GR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function FreshnessLine({ card }: { card: EssentialsCard }) {
  const { language, t } = useI18n();
  const freshness = cardFreshness(card);
  if (card.draft) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-hp-muted">
        <PencilLine size={11} />
        {t("Draft — not verified yet")}
      </span>
    );
  }
  if (freshness === "fresh" && card.lastCheckedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-hp-olive">
        <CheckCircle2 size={11} />
        {t("Checked {date}", { date: formatChecked(card.lastCheckedAt, language) })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-hp-sunset">
      <AlertTriangle size={11} />
      {t("Needs re-checking — confirm with the official source")}
    </span>
  );
}

export function EssentialsScreen({
  initialSection = "all",
  showDrafts,
  onBack,
  onOpenQuickLook,
}: {
  initialSection?: EssentialsSectionId | "all";
  /** Team only: also show unverified draft cards. Visitors never see drafts. */
  showDrafts: boolean;
  onBack: () => void;
  onOpenQuickLook: () => void;
}) {
  const { language, t } = useI18n();
  const groups = useMemo(
    () => essentialsBySection(visibleCards(ESSENTIALS_CARDS, showDrafts), REGION),
    [showDrafts],
  );
  const [active, setActive] = useState<EssentialsSectionId | "all">(initialSection);
  const visible = active === "all" ? groups : groups.filter((g) => g.section.id === active);

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto overscroll-contain px-4 pb-32 pt-3">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-[12px] font-bold text-hp-ink"
        >
          <ArrowLeft size={14} />
          {t("Back to my trip")}
        </button>
        <header className="mb-4">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-hp-muted">
            {t("For your stay")}
          </p>
          <div className="mt-1 flex items-end justify-between">
            <h2 className="text-3xl font-black leading-none text-hp-ink">{t("Essentials")}</h2>
            <Compass size={22} className="mb-0.5 text-hp-sunset" />
          </div>
          <div className="mt-1.5 h-[1.5px] bg-hp-ink" />
          <p className="mt-2 text-[12px] leading-snug text-hp-muted">
            {t("What you need to know so your days here go smoothly.")}
          </p>
        </header>

        <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {[
            { id: "all" as const, label: t("All") },
            ...groups.map((g) => ({ id: g.section.id, label: g.section.title[language] })),
          ].map((chip) => {
            const on = active === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setActive(chip.id)}
                aria-pressed={on}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition active:scale-[0.98] ${
                  on
                    ? "border-hp-ink bg-hp-ink text-hp-paper"
                    : "border-hp-ink/10 bg-hp-paper text-hp-ink/70"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-hp-ink/20 p-6 text-center">
            <p className="text-[14px] font-black text-hp-ink">{t("Coming soon")}</p>
            <p className="mt-1 text-[12px] leading-snug text-hp-muted">
              {t("Our team is checking these details so you can rely on them.")}
            </p>
          </div>
        )}

        <div className="hp-stagger flex flex-col gap-5">
          {visible.map(({ section, cards }) => {
            const Icon = SECTION_ICONS[section.id];
            return (
              <section key={section.id}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[9px] bg-hp-sunset text-hp-paper">
                    <Icon size={14} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-hp-ink">
                      {section.title[language]}
                    </div>
                    <div className="truncate text-[10.5px] text-hp-muted">
                      {section.hint[language]}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {/* "What to see" points at the real content rather than
                      duplicating it: every place and route as a 2-line card. */}
                  {section.id === "see" && (
                    <button
                      type="button"
                      onClick={onOpenQuickLook}
                      className="hp-card-lift flex w-full items-center gap-3 rounded-2xl border border-hp-sunset/25 bg-hp-sunset/10 p-3 text-left transition active:scale-[0.99]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-hp-sunset text-hp-paper">
                        <Eye size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-black text-hp-ink">
                          {t("Quick look at every place")}
                        </span>
                        <span className="block text-[11px] text-hp-muted">
                          {t("Places and routes in two lines each")}
                        </span>
                      </span>
                    </button>
                  )}
                  {cards.map((card) => (
                    <article
                      key={card.id}
                      className={`hp-card-lift rounded-2xl border bg-hp-paper p-3.5 ${
                        card.draft ? "border-dashed border-hp-ink/20" : "border-hp-ink/10"
                      }`}
                    >
                      <h3 className="text-[14px] font-black leading-tight text-hp-ink">
                        {card.title[language]}
                      </h3>
                      {/* A draft's body is template text; the badge below already
                          says it is unverified, so don't repeat it. */}
                      {!card.draft && (
                        <p className="mt-1 text-[12.5px] leading-snug text-hp-ink/80">
                          {card.body[language]}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <FreshnessLine card={card} />
                        {card.sourceUrl && (
                          <a
                            href={card.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-hp-deep"
                          >
                            {t("Official source")}
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <p className="mt-6 text-center text-[10.5px] leading-snug text-hp-muted">
          {t("Information only — always confirm times and closures with the official source.")}
        </p>
      </div>
    </div>
  );
}

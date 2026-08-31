import { useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { PulseDeal } from "@/lib/hp-api";
import type { Place } from "@/lib/hp-model";
import { DealCard } from "./DealCard";

interface Props {
  deals: PulseDeal[];
  places: Place[];
  onOpenPlace: (place: Place) => void;
}

type Row = { deal: PulseDeal; place: Place };

// v1 Discovery layer: every active static deal, grouped by area (the data is
// already sorted area-then-name), so a user never has to hunt the map pin by
// pin. The first card reads as a "featured" (taller) coupon.
export function DealsScreen({ deals, places, onOpenPlace }: Props) {
  const { language, t } = useI18n();

  const rows = useMemo<Row[]>(() => {
    const placeById = new Map(places.map((place) => [place.id, place]));
    return deals
      .map((deal) => ({ deal, place: placeById.get(deal.placeId) }))
      .filter((row): row is Row => Boolean(row.place))
      .sort((a, b) => {
        const areaCmp = a.place.area.localeCompare(b.place.area, language === "GR" ? "el" : "en");
        if (areaCmp !== 0) return areaCmp;
        const nameA = language === "GR" ? a.place.greekName || a.place.name : a.place.name;
        const nameB = language === "GR" ? b.place.greekName || b.place.name : b.place.name;
        return nameA.localeCompare(nameB, language === "GR" ? "el" : "en");
      });
  }, [deals, places, language]);

  const groups = useMemo(() => {
    const out: { area: string; rows: Row[] }[] = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      if (last && last.area === row.place.area) last.rows.push(row);
      else out.push({ area: row.place.area, rows: [row] });
    }
    return out;
  }, [rows]);

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto overscroll-contain px-4 pb-32 pt-3">
        <header className="mb-4">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-hp-muted">
            {t("Local offers")}
          </p>
          <div className="mt-1 flex items-end justify-between">
            <h2 className="text-3xl font-black leading-none text-hp-ink">{t("Deals")}</h2>
            {rows.length > 0 && (
              <span className="hp-num pb-1 text-[13px] font-bold text-hp-sunset">
                {t("{n} active", { n: rows.length })}
              </span>
            )}
          </div>
          <div className="mt-1.5 h-[1.5px] bg-hp-ink" />
        </header>

        {rows.length === 0 ? (
          <div className="hp-card-lift mt-8 rounded-3xl border border-hp-ink/10 bg-hp-paper p-8 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-hp-sunset text-hp-paper">
              <Sparkles size={20} />
            </div>
            <h3 className="text-[15px] font-black text-hp-ink">{t("No active deals")}</h3>
            <p className="mx-auto mt-1 max-w-[16rem] text-[12px] text-hp-muted">
              {t("Check back soon — local businesses add deals here.")}
            </p>
          </div>
        ) : (
          <div className="hp-stagger flex flex-col gap-4">
            {groups.map((group, gi) => (
              <div key={group.area}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[8.5px] font-black uppercase tracking-[0.18em] text-hp-ink">
                    {group.area}
                  </span>
                  <span className="h-px flex-1 bg-hp-ink/10" />
                  <span className="hp-num text-[8.5px] font-black text-hp-muted">
                    {group.rows.length}
                  </span>
                </div>
                <div className="flex flex-col gap-5">
                  <AnimatePresence initial={false}>
                    {group.rows.map(({ deal, place }, i) => (
                      <DealCard
                        key={place.id}
                        place={place}
                        dealText={deal.dealText}
                        businessName={deal.businessName}
                        featured={gi === 0 && i === 0}
                        onOpen={onOpenPlace}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

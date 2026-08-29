import { useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { Gift, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { PulseDeal } from "@/lib/hp-api";
import type { Place } from "@/lib/hp-model";
import { DealCard } from "./DealCard";

interface Props {
  deals: PulseDeal[];
  places: Place[];
  onOpenPlace: (place: Place) => void;
}

// v1 Discovery layer: a flat, browsable list of every active static deal so a
// user never has to hunt the map pin by pin. No search / filter chips yet.
// Sorted by area, then place name.
export function DealsScreen({ deals, places, onOpenPlace }: Props) {
  const { language, t } = useI18n();

  const rows = useMemo(() => {
    const placeById = new Map(places.map((place) => [place.id, place]));
    return deals
      .map((deal) => ({ deal, place: placeById.get(deal.placeId) }))
      .filter((row): row is { deal: PulseDeal; place: Place } => Boolean(row.place))
      .sort((a, b) => {
        const areaCmp = a.place.area.localeCompare(b.place.area, language === "GR" ? "el" : "en");
        if (areaCmp !== 0) return areaCmp;
        const nameA = language === "GR" ? a.place.greekName || a.place.name : a.place.name;
        const nameB = language === "GR" ? b.place.greekName || b.place.name : b.place.name;
        return nameA.localeCompare(nameB, language === "GR" ? "el" : "en");
      });
  }, [deals, places, language]);

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto overscroll-contain px-4 pb-32 pt-3">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-hp-sunset/15 text-hp-sunset">
            <Gift size={18} />
          </span>
          <div>
            <h2 className="text-2xl font-black leading-none text-hp-ink">{t("Deals")}</h2>
            <p className="mt-0.5 text-[11.5px] text-hp-muted">
              {t("Active offers from local businesses.")}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-hp-ink/15 bg-hp-paper/60 p-8 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-hp-sunset/10 text-hp-sunset">
              <Sparkles size={20} />
            </div>
            <h3 className="text-[15px] font-bold text-hp-ink">{t("No active deals")}</h3>
            <p className="mx-auto mt-1 max-w-[16rem] text-[12px] text-hp-muted">
              {t("Check back soon — local businesses add deals here.")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <AnimatePresence initial={false}>
              {rows.map(({ deal, place }) => (
                <DealCard
                  key={place.id}
                  place={place}
                  dealText={deal.dealText}
                  businessName={deal.businessName}
                  onOpen={onOpenPlace}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

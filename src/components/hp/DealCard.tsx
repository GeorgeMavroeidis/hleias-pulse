import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Place } from "@/lib/hp-model";
import { ImageBox } from "./ImageBox";

interface Props {
  place: Place;
  dealText: string;
  businessName: string;
  onOpen: (place: Place) => void;
}

// Discovery-layer card. Same shape as CulturalEventCard minus the ticket CTA:
// tapping anywhere opens the PlaceDetailModal directly (bypassing the map), where
// the deal callout + "Get code" already live.
export function DealCard({ place, dealText, businessName, onOpen }: Props) {
  const { language, t } = useI18n();
  const name = language === "GR" ? place.greekName || place.name : place.name;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-3xl border border-hp-ink/10 bg-hp-paper text-left shadow-[0_8px_22px_rgba(23,20,17,0.07)] transition active:scale-[0.99]"
      onClick={() => onOpen(place)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(place);
        }
      }}
      aria-label={t("Open deal at {place}", { place: name })}
    >
      <div className="relative block w-full text-left">
        <div className="relative h-36 w-full">
          <ImageBox
            src={place.imageUrl}
            alt={name}
            className="h-full w-full"
            rounded="rounded-none"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/12 to-transparent" />
        </div>
        <div className="absolute bottom-2 left-3 right-3 text-hp-paper">
          <h3 className="text-[16px] font-black leading-tight drop-shadow-sm">{name}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] font-bold text-hp-paper/85">
            <MapPin size={10} /> {place.area}
          </div>
        </div>
      </div>

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-hp-sunset">
          🎁 {t("App deal")}
        </div>
        <p className="mt-1.5 text-[14px] font-bold leading-snug text-hp-ink">{dealText}</p>
        <p className="mt-1.5 text-[11px] font-semibold text-hp-muted">{businessName}</p>
      </div>
    </motion.article>
  );
}

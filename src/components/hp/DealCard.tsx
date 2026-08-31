import { motion } from "framer-motion";
import { Gift } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Place } from "@/lib/hp-model";
import { ImageBox } from "./ImageBox";

interface Props {
  place: Place;
  dealText: string;
  businessName: string;
  featured?: boolean;
  onOpen: (place: Place) => void;
}

// Best-effort "offer size" for the wax-stamp seal. A real implementation
// would carry this as a structured field; here we sniff the deal text.
function sealValue(dealText: string): { big: string; small?: string } | null {
  const pct = dealText.match(/(\d{1,2})\s*%/);
  if (pct) return { big: `−${pct[1]}%` };
  if (/1\s*\+\s*1|\b2\b[^\d]{0,8}\b1\b/.test(dealText)) return { big: "2·1", small: "ΔΩΡΟ" };
  return null;
}

// Premium "printed coupon" card. Tapping anywhere opens the PlaceDetailModal
// (where the deal callout + "Get code" already live).
export function DealCard({ place, dealText, businessName, featured = false, onOpen }: Props) {
  const { language, t } = useI18n();
  const name = language === "GR" ? place.greekName || place.name : place.name;
  const seal = sealValue(dealText);
  const monogram = (businessName.trim()[0] ?? "•").toUpperCase();

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className={`hp-coupon text-left transition active:scale-[0.99] ${
        featured ? "hp-coupon--featured" : ""
      }`}
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
      <div className="hp-coupon__photo">
        <ImageBox
          src={place.imageUrl}
          alt={name}
          className="h-full w-full"
          rounded="rounded-none"
        />
        {seal && (
          <span className="hp-coupon__seal">
            <b>{seal.big}</b>
            {seal.small && <small>{seal.small}</small>}
          </span>
        )}
        <span className="hp-coupon__name">
          <strong>{name}</strong>
          <span>{place.area}</span>
        </span>
      </div>
      <div className="hp-coupon__perf">
        <i />
      </div>
      <div className="hp-coupon__body">
        <span className="hp-coupon__watermark">
          <Gift size={featured ? 50 : 44} />
        </span>
        <div className="hp-coupon__mono">
          <i>{monogram}</i>
          <span>{businessName}</span>
        </div>
        <p className="hp-coupon__deal">{dealText}</p>
        <div className="hp-coupon__foot">
          <span className="hp-coupon__dot" /> {t("Active offer")}
        </div>
      </div>
    </motion.article>
  );
}

import { useMemo, useState } from "react";
import {
  Clock,
  Coins,
  Footprints,
  MapPin,
  Route as RouteIcon,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Place, PlaceType, RouteItem } from "@/lib/hp-model";
import {
  placeSummary,
  routeSummary,
  type SummaryCard,
  type SummaryFactKind,
} from "@/lib/hp/summaries";

const FACT_ICONS: Record<SummaryFactKind, LucideIcon> = {
  time: Clock,
  budget: Coins,
  best: Sun,
  crowd: Users,
  suits: Footprints,
  stops: MapPin,
};

const PLACE_TYPES: PlaceType[] = [
  "beach",
  "culture",
  "nature",
  "village",
  "food",
  "local",
  "night",
  "sunset",
];

const TYPE_LABEL: Record<PlaceType, { GR: string; EN: string }> = {
  beach: { GR: "Παραλίες", EN: "Beaches" },
  culture: { GR: "Πολιτισμός", EN: "Culture" },
  nature: { GR: "Φύση", EN: "Nature" },
  village: { GR: "Χωριά", EN: "Villages" },
  food: { GR: "Φαγητό", EN: "Food" },
  local: { GR: "Ντόπια σημεία", EN: "Local spots" },
  night: { GR: "Νύχτα", EN: "Night" },
  sunset: { GR: "Ηλιοβασίλεμα", EN: "Sunset" },
};

interface Props {
  places: Place[];
  routes: RouteItem[];
  onOpenPlace: (place: Place) => void;
  onOpenRoute: (route: RouteItem) => void;
}

function Card({ card, onOpen }: { card: SummaryCard; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hp-card-lift w-full rounded-2xl border border-hp-ink/10 bg-hp-paper p-3.5 text-left transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-black leading-tight text-hp-ink">{card.title}</h3>
        {card.kind === "route" && (
          <RouteIcon size={14} className="mt-0.5 shrink-0 text-hp-sunset" />
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-hp-ink/80">{card.line}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {card.facts.map((fact) => {
          const Icon = FACT_ICONS[fact.kind];
          return (
            <span
              key={fact.kind}
              className="inline-flex items-center gap-1 rounded-full bg-hp-ink/5 px-2 py-0.5 text-[10.5px] font-bold text-hp-ink/75"
            >
              <Icon size={11} />
              {fact.label}
            </span>
          );
        })}
      </div>
      {card.untranslated && (
        <p className="mt-1.5 text-[10px] text-hp-muted">{t("Greek summary coming soon")}</p>
      )}
    </button>
  );
}

// "Quick look": every place and route as a two-line card. This is the browsing
// half of the trip builder; picking cards into days comes next.
export function QuickLookScreen({ places, routes, onOpenPlace, onOpenRoute }: Props) {
  const { language, t } = useI18n();
  const [mode, setMode] = useState<"places" | "routes">("places");
  const [type, setType] = useState<PlaceType | "all">("all");

  const presentTypes = useMemo(
    () => PLACE_TYPES.filter((pt) => places.some((place) => place.type === pt)),
    [places],
  );

  const placeCards = useMemo(
    () =>
      places
        .filter((place) => type === "all" || place.type === type)
        .map((place) => ({ place, card: placeSummary(place, language) }))
        .sort((a, b) => a.card.title.localeCompare(b.card.title, language === "GR" ? "el" : "en")),
    [places, type, language],
  );

  const routeCards = useMemo(
    () => routes.map((route) => ({ route, card: routeSummary(route, language) })),
    [routes, language],
  );

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition active:scale-[0.98] ${
      on ? "border-hp-ink bg-hp-ink text-hp-paper" : "border-hp-ink/10 bg-hp-paper text-hp-ink/70"
    }`;

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto overscroll-contain px-4 pb-32 pt-3">
        <header className="mb-4">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-hp-muted">
            {t("Everything in two lines")}
          </p>
          <div className="mt-1 flex items-end justify-between">
            <h2 className="text-3xl font-black leading-none text-hp-ink">{t("Quick look")}</h2>
            <span className="hp-num pb-1 text-[13px] font-bold text-hp-sunset">
              {mode === "places" ? placeCards.length : routeCards.length}
            </span>
          </div>
          <div className="mt-1.5 h-[1.5px] bg-hp-ink" />
        </header>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("places")}
            className={chip(mode === "places")}
            aria-pressed={mode === "places"}
          >
            {t("Places")}
          </button>
          <button
            type="button"
            onClick={() => setMode("routes")}
            className={chip(mode === "routes")}
            aria-pressed={mode === "routes"}
          >
            {t("Routes")}
          </button>
        </div>

        {mode === "places" && (
          <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            <button
              type="button"
              onClick={() => setType("all")}
              className={chip(type === "all")}
              aria-pressed={type === "all"}
            >
              {t("All")}
            </button>
            {presentTypes.map((pt) => (
              <button
                key={pt}
                type="button"
                onClick={() => setType(pt)}
                className={chip(type === pt)}
                aria-pressed={type === pt}
              >
                {TYPE_LABEL[pt][language]}
              </button>
            ))}
          </div>
        )}

        <div className="hp-stagger flex flex-col gap-2">
          {mode === "places"
            ? placeCards.map(({ place, card }) => (
                <Card key={card.id} card={card} onOpen={() => onOpenPlace(place)} />
              ))
            : routeCards.map(({ route, card }) => (
                <Card key={card.id} card={card} onOpen={() => onOpenRoute(route)} />
              ))}
        </div>

        <p className="mt-6 text-center text-[10.5px] leading-snug text-hp-muted">
          {t("Times are rough estimates for planning.")}
        </p>
      </div>
    </div>
  );
}

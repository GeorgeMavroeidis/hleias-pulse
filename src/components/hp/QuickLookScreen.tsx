import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Clock,
  Coins,
  Footprints,
  House,
  Landmark,
  MapPin,
  Moon,
  Route as RouteIcon,
  Sun,
  Sunset,
  TreePine,
  Users,
  Utensils,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { ImageBox } from "./ImageBox";
import { NearMeBar } from "./NearMeBar";
import { distanceLabel, useNearOrigin, withDistance } from "@/lib/hp/near-me";
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

const TYPE_ICON: Record<PlaceType, LucideIcon> = {
  beach: Waves,
  culture: Landmark,
  nature: TreePine,
  village: House,
  food: Utensils,
  local: MapPin,
  night: Moon,
  sunset: Sunset,
};

/** A photo tile: the picture does the talking, text is a title and one short line. */
export function PhotoTile({
  imageUrl,
  title,
  meta,
  onOpen,
  tall = true,
  badge,
}: {
  imageUrl: string;
  title: string;
  meta: string;
  onOpen: () => void;
  tall?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative block w-full overflow-hidden rounded-2xl text-left shadow-[0_8px_20px_-12px_rgba(23,20,17,0.5)] transition active:scale-[0.98] ${
        tall ? "aspect-[4/5]" : "aspect-[16/9]"
      }`}
    >
      <ImageBox
        src={imageUrl}
        alt=""
        className="absolute inset-0 h-full w-full transition duration-500 group-hover:scale-105"
        rounded="rounded-2xl"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      {badge && <span className="absolute right-2 top-2">{badge}</span>}
      <span className="absolute inset-x-0 bottom-0 p-2.5 text-hp-paper">
        <span className="block text-[13.5px] font-black leading-tight [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] line-clamp-2">
          {title}
        </span>
        <span className="mt-0.5 block text-[10.5px] font-semibold opacity-90">{meta}</span>
      </span>
    </button>
  );
}

interface Props {
  onBack: () => void;
  places: Place[];
  routes: RouteItem[];
  onOpenPlace: (place: Place) => void;
  onOpenRoute: (route: RouteItem) => void;
}

export function SummaryCardButton({ card, onOpen }: { card: SummaryCard; onOpen: () => void }) {
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
export function QuickLookScreen({ onBack, places, routes, onOpenPlace, onOpenRoute }: Props) {
  const { language, t } = useI18n();
  const [mode, setMode] = useState<"places" | "routes">("places");
  const [type, setType] = useState<PlaceType | "all">("all");
  const origin = useNearOrigin();

  const presentTypes = useMemo(
    () => PLACE_TYPES.filter((pt) => places.some((place) => place.type === pt)),
    [places],
  );

  const placeCards = useMemo(() => {
    const filtered = places.filter((place) => type === "all" || place.type === type);
    // Near me: nearest first, with the distance. Otherwise liveliest first.
    const ordered = origin
      ? withDistance(filtered, origin)
      : [...filtered]
          .sort(
            (a, b) =>
              b.hotness - a.hotness ||
              a.name.localeCompare(b.name, language === "GR" ? "el" : "en"),
          )
          .map((place) => ({ place, km: null as number | null, minutes: 0 }));
    return ordered.map(({ place, km, minutes }) => ({
      place,
      card: placeSummary(place, language),
      near: km === null ? null : distanceLabel(km, minutes, language),
    }));
  }, [places, type, language, origin]);

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
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-[12px] font-bold text-hp-ink"
        >
          <ArrowLeft size={14} />
          {t("Back to my trip")}
        </button>
        <header className="mb-3 flex items-end justify-between">
          <h2 className="text-3xl font-black leading-none text-hp-ink">{t("Quick look")}</h2>
          <span className="hp-num pb-0.5 text-[13px] font-bold text-hp-sunset">
            {mode === "places" ? placeCards.length : routeCards.length}
          </span>
        </header>

        <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-full bg-hp-ink/5 p-1">
          {(["places", "routes"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-full py-2 text-[12px] font-bold transition ${
                mode === m ? "bg-hp-ink text-hp-paper" : "text-hp-ink/65"
              }`}
            >
              {m === "places" ? t("Places") : t("Routes")}
            </button>
          ))}
        </div>

        {mode === "places" && <NearMeBar places={places} />}

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
            {presentTypes.map((pt) => {
              const Icon = TYPE_ICON[pt];
              return (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setType(pt)}
                  className={`${chip(type === pt)} inline-flex items-center gap-1`}
                  aria-pressed={type === pt}
                >
                  <Icon size={12} />
                  {TYPE_LABEL[pt][language]}
                </button>
              );
            })}
          </div>
        )}

        {mode === "places" ? (
          <div className="hp-stagger grid grid-cols-2 gap-2.5">
            {placeCards.map(({ place, card, near }) => {
              const time = card.facts.find((f) => f.kind === "time")?.label;
              const cost = card.facts.find((f) => f.kind === "budget")?.label;
              return (
                <PhotoTile
                  key={place.id}
                  imageUrl={place.imageUrl}
                  title={card.title}
                  meta={[time, cost].filter(Boolean).join(" · ")}
                  onOpen={() => onOpenPlace(place)}
                  badge={
                    near ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-hp-paper/95 px-2 py-1 text-[10px] font-black text-hp-deep shadow">
                        <MapPin size={10} />
                        {near}
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        ) : (
          <div className="hp-stagger flex flex-col gap-2.5">
            {routeCards.map(({ route, card }) => (
              <PhotoTile
                key={route.id}
                tall={false}
                imageUrl={route.imageUrl}
                title={card.title}
                meta={card.facts
                  .map((f) => f.label)
                  .slice(0, 3)
                  .join(" · ")}
                onOpen={() => onOpenRoute(route)}
                badge={
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-hp-sunset text-hp-paper">
                    <RouteIcon size={13} />
                  </span>
                }
              />
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-[10.5px] leading-snug text-hp-muted">
          {t("Times are rough estimates for planning.")}
        </p>
      </div>
    </div>
  );
}

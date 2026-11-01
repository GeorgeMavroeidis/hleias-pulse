import { useEffect, useState } from "react";
import { LocateFixed, MapPin, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Place } from "@/lib/hp-model";
import {
  STAY_BASES,
  baseOrigin,
  loadBaseId,
  readGps,
  saveBaseId,
  setOrigin,
  useNearOrigin,
} from "@/lib/hp/near-me";

/**
 * "What is close to me?" — one tap for the phone's location, or pick the town
 * you are staying in. Shared by the Quick look and the card deck.
 */
export function NearMeBar({ places }: { places: Place[] }) {
  const { language, t } = useI18n();
  const origin = useNearOrigin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  // Restore the remembered stay base (a place name, never a coordinate of the person).
  useEffect(() => {
    if (origin || places.length === 0) return;
    const saved = loadBaseId();
    const restored = saved ? baseOrigin(saved, places, language) : null;
    if (restored) setOrigin(restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once when places arrive
  }, [places.length]);

  const useGps = async () => {
    setBusy(true);
    setError(null);
    try {
      setOrigin(await readGps(language));
      setChoosing(false);
    } catch {
      setError(
        t("We could not get your location. Allow it in your browser, or choose where you stay."),
      );
      setChoosing(true);
    } finally {
      setBusy(false);
    }
  };

  const pickBase = (baseId: string) => {
    const next = baseOrigin(baseId, places, language);
    if (!next) return;
    saveBaseId(baseId);
    setOrigin(next);
    setChoosing(false);
    setError(null);
  };

  if (origin && !choosing) {
    return (
      <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-hp-sea/12 px-3 py-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-bold text-hp-ink">
          <MapPin size={14} className="shrink-0 text-hp-sea" />
          <span className="truncate">{t("Near: {name}", { name: origin.label })}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setChoosing(true)}
            className="rounded-full bg-hp-paper px-2.5 py-1 text-[11px] font-bold text-hp-ink"
          >
            {t("Change")}
          </button>
          <button
            type="button"
            onClick={() => {
              saveBaseId(null);
              setOrigin(null);
            }}
            aria-label={t("Stop sorting by distance")}
            className="grid h-6 w-6 place-items-center rounded-full bg-hp-paper text-hp-ink"
          >
            <X size={12} />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-3xl bg-gradient-to-br from-hp-sea to-hp-deep p-3.5 text-hp-on-media">
      <p className="text-[14px] font-black leading-tight">{t("What is close to you?")}</p>
      <p className="mt-0.5 text-[11.5px] font-semibold opacity-90">
        {t("We show distance and drive time. Your location stays on your phone.")}
      </p>
      <button
        type="button"
        onClick={useGps}
        disabled={busy}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-hp-paper px-3.5 py-2 text-[12px] font-black text-hp-deep disabled:opacity-60"
      >
        <LocateFixed size={14} />
        {busy ? t("Finding you…") : t("Use my location")}
      </button>
      <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-wider opacity-80">
        {t("or where are you staying?")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {STAY_BASES.map((base) => (
          <button
            key={base.id}
            type="button"
            onClick={() => pickBase(base.id)}
            className="rounded-full bg-white/20 px-3 py-1.5 text-[11.5px] font-bold backdrop-blur transition active:scale-95"
          >
            {base.name[language]}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-[11px] font-semibold text-amber-200">{error}</p>}
    </div>
  );
}

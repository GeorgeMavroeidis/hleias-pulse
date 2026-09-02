import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Flame,
  Layers3,
  Lightbulb,
  Moon,
  Radio,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { areaTier, clusterActivity, type AreaTier, type MapAreaCluster } from "./SocialMap";

// Per-tier presentation, shared with the Map-tab area card in PulseApp so the
// badge/blurb reads identically everywhere an area is selected. Labels/blurbs
// are English source keys — Greek comes from the i18n dictionary.
export const AREA_TIER_META: Record<
  AreaTier,
  { label: string; blurb: string; Icon: LucideIcon; badge: string; dot: string }
> = {
  hot: {
    label: "Hot",
    blurb: "Very lively right now",
    Icon: Flame,
    badge: "bg-hp-sunset/15 text-hp-sunset",
    dot: "bg-hp-sunset",
  },
  active: {
    label: "Active",
    blurb: "Lots happening",
    Icon: Zap,
    badge: "bg-hp-sea/25 text-hp-deep",
    dot: "bg-hp-deep",
  },
  calm: {
    label: "Calm",
    blurb: "Quiet for now",
    Icon: Moon,
    badge: "bg-hp-ink/8 text-hp-muted",
    dot: "bg-hp-muted",
  },
};

type InsightIcon = "flame" | "signal" | "moon";
type InsightMsg = { icon: InsightIcon; title: string; sub: string };

const INSIGHT_ICON: Record<InsightIcon, LucideIcon> = {
  flame: Flame,
  signal: Radio,
  moon: Moon,
};

function signalCount(cluster: MapAreaCluster) {
  return cluster.postCount + cluster.eventCount;
}

interface Props {
  clusters: MapAreaCluster[];
  selectedCluster: MapAreaCluster | null;
  onSelectArea: (cluster: MapAreaCluster) => void;
  onDismiss: () => void;
}

/**
 * Map-tab overlay: a rotating "smart insight" banner + an "Areas" pill that
 * opens the Explore areas panel. Sits on top of the map; the existing on-map
 * chip rail and bottom sheet are untouched. Everything is derived from the
 * already-computed `mapClusters` — no new data, no backend.
 */
export function MapAreaInsights({ clusters, selectedCluster, onSelectArea, onDismiss }: Props) {
  const { t } = useI18n();
  const [panelOpen, setPanelOpen] = useState(false);
  const [rotateIdx, setRotateIdx] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // A selected area takes over the map — close the panel and show "Viewing X".
  // `hasSelection` (a stable boolean) is the dep, not `selectedCluster` (the
  // parent hands a fresh object every render).
  const hasSelection = Boolean(selectedCluster);
  useEffect(() => {
    if (hasSelection) setPanelOpen(false);
  }, [hasSelection]);

  const ranked = useMemo(
    () => [...clusters].sort((a, b) => clusterActivity(b) - clusterActivity(a)),
    [clusters],
  );

  // Rule set, evaluated top-down over the ranked areas. "top-2 + roll-up":
  // #1 hotspot, the next area still reading Hot, and a same-tone roll-up.
  const messages = useMemo<InsightMsg[]>(() => {
    if (ranked.length === 0) return [];
    const list: InsightMsg[] = [];
    const top = ranked[0];
    const topScore = clusterActivity(top);

    if (topScore >= 0.65) {
      list.push({
        icon: "flame",
        title: t("{area} is tonight's hotspot", { area: top.name }),
        sub: t("{count} recent signals nearby", { count: signalCount(top) }),
      });
    }

    const nextHot = ranked.find((cluster, index) => index > 0 && areaTier(cluster) === "hot");
    if (nextHot) {
      list.push({
        icon: "flame",
        title: t("{area} is buzzing right now", { area: nextHot.name }),
        sub: t("{count} recent signals", { count: signalCount(nextHot) }),
      });
    }

    const strong = ranked.filter((cluster) => clusterActivity(cluster) >= 0.48);
    const byTone = new Map<string, number>();
    strong.forEach((cluster) => byTone.set(cluster.tone, (byTone.get(cluster.tone) ?? 0) + 1));
    const rollupTone = [...byTone.entries()].find(([, count]) => count >= 2)?.[0];
    if (rollupTone) {
      list.push({
        icon: "signal",
        title:
          rollupTone === "beach"
            ? t("The coast is wide awake")
            : t("A few areas are buzzing at once"),
        sub: t("Several spots are showing signal right now"),
      });
    }

    if (list.length === 0) {
      list.push({
        icon: "moon",
        title: t("Quiet evening so far"),
        sub: t("Nothing strong nearby yet"),
      });
    }
    return list;
  }, [ranked, t]);

  useEffect(() => {
    setRotateIdx(0);
  }, [messages.length]);

  useEffect(() => {
    if (reduceMotion || messages.length < 2) return;
    const id = window.setInterval(
      () => setRotateIdx((index) => (index + 1) % messages.length),
      9000,
    );
    return () => window.clearInterval(id);
  }, [reduceMotion, messages.length]);

  if (clusters.length === 0) return null;

  const activeMsg = messages[Math.min(rotateIdx, messages.length - 1)] ?? null;
  const MsgIcon = activeMsg ? INSIGHT_ICON[activeMsg.icon] : Flame;

  const selTier = selectedCluster ? areaTier(selectedCluster) : null;
  const SelIcon = selTier ? AREA_TIER_META[selTier].Icon : Flame;

  return (
    <>
      {/* ── Banner + Areas pill (top of map, below the chip rail) ── */}
      <div className="pointer-events-none absolute inset-x-3 top-[92px] z-[25] flex flex-col gap-2">
        {selectedCluster && selTier ? (
          <div className="pointer-events-auto mr-14 flex items-center gap-2 rounded-full bg-hp-ink/92 py-1.5 pl-1.5 pr-2 shadow-[0_1px_2px_rgba(23,20,17,0.05),0_16px_32px_-18px_rgba(23,20,17,0.5)] backdrop-blur">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/15 text-white">
              <SelIcon size={12} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] leading-tight">
              <span className="font-black text-hp-paper">
                {t("Viewing {area}", { area: selectedCluster.name })}
              </span>
              <span className="text-hp-paper/60">
                {" · "}
                {t(AREA_TIER_META[selTier].label)}
                {" · "}
                {t("{count} signals", { count: signalCount(selectedCluster) })}
              </span>
            </span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label={t("Clear area focus")}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-hp-paper transition active:scale-90"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          activeMsg && (
            <>
              {/* One stable button; only the inner text swaps + fades on rotate.
                  No exit animation / AnimatePresence here — a "wait"-mode
                  crossfade wedges if the key changes twice in quick succession
                  (rotation tick + a data-refresh recompute). */}
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                aria-label={t("Open the areas panel")}
                className="pointer-events-auto mr-14 flex items-center gap-2.5 overflow-hidden rounded-2xl border border-hp-sunset/25 bg-hp-sunset/12 px-3 py-2 text-left shadow-[0_1px_2px_rgba(23,20,17,0.05),0_14px_30px_-18px_rgba(23,20,17,0.35)] backdrop-blur transition active:scale-[0.99]"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-hp-sunset text-white">
                  <MsgIcon size={16} />
                </span>
                <motion.span
                  key={activeMsg.title}
                  initial={reduceMotion ? false : { opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="min-w-0 flex-1"
                >
                  <span className="block truncate text-[13px] font-black leading-tight text-hp-ink">
                    {activeMsg.title}
                  </span>
                  <span className="block truncate text-[10px] text-hp-muted">{activeMsg.sub}</span>
                </motion.span>
                <ChevronRight size={15} className="shrink-0 text-hp-ink/40" />
              </button>

              {messages.length > 1 && (
                <div className="mr-14 flex justify-center gap-1" aria-hidden="true">
                  {messages.map((msg, index) => (
                    <span
                      key={msg.title}
                      className={`h-1 w-1 rounded-full transition ${
                        index === Math.min(rotateIdx, messages.length - 1)
                          ? "bg-hp-sunset"
                          : "bg-hp-ink/20"
                      }`}
                    />
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="pointer-events-auto inline-flex items-center gap-1 self-start rounded-full border border-hp-ink/10 bg-hp-paper/95 px-3 py-1.5 text-[11px] font-black text-hp-ink shadow-sm backdrop-blur transition active:scale-95"
              >
                <Layers3 size={12} />
                {t("Areas")}
                <ChevronDown size={12} />
              </button>
            </>
          )
        )}
      </div>

      {/* ── Explore areas panel ──
          Plain conditional render (no AnimatePresence). An exiting
          AnimatePresence child in the same commit as the area selection makes
          framer drop the map bottom-sheet's height animation, so the sheet
          stays collapsed after picking an area here. Enter animation only. */}
      {panelOpen && (
        <>
          <motion.div
            className="absolute inset-0 z-40 bg-hp-ink/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            onClick={() => setPanelOpen(false)}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 top-16 z-40 flex flex-col overflow-hidden rounded-t-3xl border-t border-hp-ink/10 bg-hp-paper shadow-[0_-16px_44px_rgba(23,20,17,0.26)]"
            role="dialog"
            aria-label={t("Explore areas near you")}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={
              reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }
            }
          >
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-hp-ink/15" />
            <div className="flex shrink-0 items-start gap-2 border-b border-hp-ink/10 px-4 pb-3 pt-1.5">
              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] font-black text-hp-ink">
                  {t("Explore areas near you")}
                </h3>
                <p className="text-[10px] text-hp-muted">
                  {t("Based on live activity and signals")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label={t("Close")}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-hp-ink/5 text-hp-ink transition active:scale-90"
              >
                <X size={13} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-1">
              {ranked.map((cluster) => {
                const tier = areaTier(cluster);
                const meta = AREA_TIER_META[tier];
                const BadgeIcon = meta.Icon;
                return (
                  <button
                    key={cluster.id}
                    type="button"
                    onClick={() => {
                      onSelectArea(cluster);
                      setPanelOpen(false);
                    }}
                    className="flex w-full items-center gap-3 border-t border-hp-ink/[0.06] px-1 py-2.5 text-left transition first:border-t-0 active:bg-hp-ink/[0.03]"
                  >
                    <span className="grid h-9 w-9 shrink-0 overflow-hidden rounded-full border border-hp-ink/10 bg-hp-ink/5">
                      {cluster.leadPlace.imageUrl && (
                        <img
                          src={cluster.leadPlace.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-black text-hp-ink">
                          {cluster.name}
                        </span>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-[2px] text-[8.5px] font-black uppercase tracking-wide ${meta.badge}`}
                        >
                          <BadgeIcon size={9} />
                          {t(meta.label)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-hp-muted">
                        {t("{count} signals", { count: signalCount(cluster) })}
                      </span>
                      <span className="block truncate text-[10.5px] text-hp-ink/70">
                        {t(meta.blurb)}
                      </span>
                    </span>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                  </button>
                );
              })}
            </div>

            <div className="flex shrink-0 items-center gap-1.5 border-t border-hp-ink/10 px-4 py-3 text-[10.5px] text-hp-muted">
              <Lightbulb size={13} className="shrink-0 text-hp-sunset" />
              {t("Tap any area to focus the map there")}
            </div>
          </motion.div>
        </>
      )}
    </>
  );
}

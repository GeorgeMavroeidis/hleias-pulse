import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Radio } from "lucide-react";
import type { ActivityTick } from "@/lib/hp/activity-data";
import { useLang } from "@/lib/hp/language-context";
import { liveTickerTimeLabel } from "@/lib/hp/pulse-strings";

interface Props {
  ticks: ActivityTick[];
  onOpenPlace?: (placeId: string) => void;
}

/**
 * "Happening now" strip at the top of the Pulse feed. A softly-rotating spotlight
 * item plus a scrollable tail. This is the refresh-bait element — the variable
 * reward that makes people come back.
 */
export function LiveTicker({ ticks, onOpenPlace }: Props) {
  const { lang } = useLang();
  const [spotlight, setSpotlight] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (ticks.length <= 1) return;
    timer.current = window.setInterval(() => {
      setSpotlight((i) => (i + 1) % ticks.length);
    }, 3800);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [ticks.length]);

  if (ticks.length === 0) return null;
  const head = ticks[spotlight] ?? ticks[0];

  return (
    <div className="-mx-4 mb-3">
      {/* Spotlight */}
      <button
        type="button"
        onClick={() => onOpenPlace?.(head.placeId)}
        className="group relative mx-4 flex w-[calc(100%-2rem)] items-center gap-3 overflow-hidden rounded-2xl border border-hp-sunset/25 bg-gradient-to-r from-hp-sunset/10 via-hp-paper to-hp-paper px-3 py-2.5 text-left shadow-sm"
      >
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-hp-sunset/15 text-hp-sunset">
          <Radio size={15} className="animate-pulse" />
          <span className="hp-live-ping absolute inset-0 rounded-full" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={head.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="min-w-0"
            >
              <p className="truncate text-[12.5px] font-bold leading-tight text-hp-ink">
                <span className="text-hp-sunset">●</span> {head.who} {head.verb}
                <span className="text-hp-ink/55"> · {head.at}</span>
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-hp-muted">
                {liveTickerTimeLabel(lang, head.minutesAgo)}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
        <img
          src={head.avatar}
          alt=""
          className="h-7 w-7 shrink-0 rounded-full border border-hp-ink/10 object-cover"
          loading="lazy"
        />
      </button>

      {/* Tail */}
      <div className="hp-no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {ticks.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpenPlace?.(t.placeId)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-hp-ink/10 bg-hp-paper px-2.5 py-1.5 text-[11px] shadow-sm transition active:scale-95"
          >
            <img
              src={t.avatar}
              alt=""
              className="h-4 w-4 rounded-full object-cover"
              loading="lazy"
            />
            <span className="font-bold text-hp-ink">{t.who}</span>
            <span className="text-hp-muted">{t.verb}</span>
            <span className="font-semibold text-hp-deep">·</span>
          </button>
        ))}
      </div>
    </div>
  );
}

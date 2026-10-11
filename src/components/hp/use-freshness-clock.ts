import { useEffect, useState } from "react";
import { systemClock, subscribeFreshnessClock, type Clock } from "@/lib/hp/freshness";

/** Evidence keeps aging during failed fetches, backgrounding, and app resume. */
export function useFreshnessClock(clock: Clock = systemClock) {
  const [nowMs, setNowMs] = useState(() => clock.nowMs());
  useEffect(() => {
    return subscribeFreshnessClock(clock, setNowMs, {
      every: (update, milliseconds) => {
        const interval = window.setInterval(update, milliseconds);
        return () => window.clearInterval(interval);
      },
      onFocus: (update) => {
        window.addEventListener("focus", update);
        return () => window.removeEventListener("focus", update);
      },
      onVisibilityChange: (update) => {
        document.addEventListener("visibilitychange", update);
        return () => document.removeEventListener("visibilitychange", update);
      },
    });
  }, [clock]);
  return [nowMs, setNowMs] as const;
}

import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { createTemporalAtmosphereClock } from "@/lib/hp/temporal-atmosphere";

export function useTemporalAtmosphere(enabled: boolean, observedNow: number) {
  const clock = useMemo(() => createTemporalAtmosphereClock(), []);
  const atmosphere = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  useLayoutEffect(() => {
    const syncVisibility = () => clock.setActive(enabled && !document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      clock.setActive(false);
    };
  }, [clock, enabled]);
  useLayoutEffect(() => clock.refresh(), [clock, observedNow]);
  return atmosphere;
}

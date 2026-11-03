import { useMemo } from "react";
import { getTemporalAtmosphere, type TemporalPresentation } from "@/lib/hp/temporal-atmosphere";

/** Project the app's shared clock; palettes never start an independent timer. */
export function useTemporalAtmosphere(nowMs: number): TemporalPresentation {
  return useMemo(() => {
    const { nextBoundaryAt: _boundary, ...presentation } = getTemporalAtmosphere({ now: nowMs });
    return presentation;
  }, [nowMs]);
}

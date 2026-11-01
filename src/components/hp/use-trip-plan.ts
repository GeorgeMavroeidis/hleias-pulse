import { useCallback, useEffect, useState } from "react";
import {
  addItem,
  createPlan,
  DEFAULT_DAYS,
  emptiestDay,
  loadPlan,
  removeItem,
  savePlan,
  STORAGE_KEY,
  TRIP_PLAN_EVENT,
  type TripItem,
  type TripPlan,
} from "@/lib/hp/trip-plan";

/**
 * The device's trip plan, shared by every screen that shows it. Saving fires
 * TRIP_PLAN_EVENT, so a place sheet opened on top of the Trip screen and the
 * screen itself never disagree (or overwrite each other's changes).
 */
export function useTripPlan() {
  const [plan, setPlanState] = useState<TripPlan | null>(() =>
    typeof window === "undefined" ? null : loadPlan(),
  );

  useEffect(() => {
    const sync = () => setPlanState(loadPlan());
    const syncOtherTab = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) sync();
    };
    window.addEventListener(TRIP_PLAN_EVENT, sync);
    window.addEventListener("storage", syncOtherTab);
    return () => {
      window.removeEventListener(TRIP_PLAN_EVENT, sync);
      window.removeEventListener("storage", syncOtherTab);
    };
  }, []);

  const setPlan = useCallback((next: TripPlan | null) => {
    setPlanState(next);
    savePlan(next);
  }, []);

  return [plan, setPlan] as const;
}

/**
 * "Add to my trip" for one place or route. Adding before any plan exists starts
 * a DEFAULT_DAYS trip; the item goes to the emptiest day. Tapping again removes it.
 */
export function useTripToggle(kind: TripItem["kind"], id: string) {
  const [plan, setPlan] = useTripPlan();
  const day = plan?.items.find((item) => item.kind === kind && item.id === id)?.day ?? null;

  const toggle = () => {
    if (plan && day !== null) {
      setPlan(removeItem(plan, kind, id));
      return;
    }
    const base = plan ?? createPlan(DEFAULT_DAYS);
    setPlan(addItem(base, { kind, id, day: emptiestDay(base) }));
  };

  return { day, toggle };
}

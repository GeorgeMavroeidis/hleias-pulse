import { CalendarCheck, CalendarPlus } from "lucide-react";
import type { MouseEvent } from "react";
import { useI18n } from "@/lib/i18n";
import type { TripItem } from "@/lib/hp/trip-plan";
import { useTripToggle } from "./use-trip-plan";

/**
 * The one "Add to my trip" control, shared by place sheets and route cards so
 * every surface feeds the same plan. Once added it shows the day; tap to remove.
 */
export function AddToTripButton({
  kind,
  id,
  name,
  className = "",
}: {
  kind: TripItem["kind"];
  id: string;
  name: string;
  className?: string;
}) {
  const { t } = useI18n();
  const { day, toggle } = useTripToggle(kind, id);
  const added = day !== null;

  return (
    <button
      type="button"
      onClick={(event: MouseEvent) => {
        // Route cards are clickable as a whole; this tap must not also open the route.
        event.stopPropagation();
        toggle();
      }}
      aria-pressed={added}
      aria-label={added ? t("Remove {name} from your trip", { name }) : undefined}
      className={`hp-add-to-trip ${added ? "is-added" : ""} ${className}`}
    >
      {added ? (
        <CalendarCheck size={15} aria-hidden="true" />
      ) : (
        <CalendarPlus size={15} aria-hidden="true" />
      )}
      {added ? t("In trip · Day {n}", { n: day }) : t("Add to trip")}
    </button>
  );
}

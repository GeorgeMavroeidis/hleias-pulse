import { AlertTriangle, Car, Eye, LifeBuoy, Ship, type LucideIcon } from "lucide-react";
import type { EssentialsSectionId } from "@/lib/hp/essentials";

// Shared by the Essentials screen and the "practical info" tiles on the Trip tab.
export const SECTION_ICONS: Record<EssentialsSectionId, LucideIcon> = {
  arrive: Ship,
  roads: Car,
  see: Eye,
  watch: AlertTriangle,
  emergency: LifeBuoy,
};

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

// One colour per section so the Trip screens are not a wall of the same white
// card. Gradients use the app's own palette (sea, deep, olive, purple, sunset).
export const SECTION_GRADIENT: Record<EssentialsSectionId, string> = {
  arrive: "from-hp-sea to-hp-deep",
  roads: "from-hp-purple to-hp-deep",
  see: "from-hp-olive to-hp-sea",
  watch: "from-amber-400 to-hp-sunset",
  emergency: "from-red-500 to-hp-sunset",
};

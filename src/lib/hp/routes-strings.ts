import type { Lang } from "./i18n";

export const ROUTES_STRINGS = {
  screenTitle: { GR: "Διαδρομές", EN: "Routes" },
  screenSubtitle: {
    GR: "Πραγματικές μέρες, γραμμένες από ντόπιους. Κλέψ' τες.",
    EN: "Real day moves, written by locals. Steal them.",
  },
  searchPlaceholder: {
    GR: "Αναζήτηση διαδρομών, budget, περιοχής...",
    EN: "Search routes, budget, area...",
  },
  searchAriaLabel: { GR: "Αναζήτηση διαδρομών", EN: "Search routes" },
  recommendedTitle: { GR: "Προτείνουμε", EN: "What we recommend" },
  communityTitle: { GR: "Προτάσεις ντόπιων", EN: "Locals recommend" },
  emptyTitle: { GR: "Καμία διαδρομή δεν ταιριάζει", EN: "No routes match" },
  emptySubtitle: {
    GR: "Δοκίμασε άλλο φίλτρο ή όρο αναζήτησης.",
    EN: "Try another filter or search term.",
  },
  readRoute: { GR: "Ανάγνωση διαδρομής", EN: "Read route" },
  closeActiveRoute: { GR: "Κλείσιμο ενεργής διαδρομής", EN: "Close active route" },
  centerStop: { GR: "Κεντράρισμα στάσης", EN: "Center stop" },
  nextStop: { GR: "Επόμενη στάση", EN: "Next stop" },
  restart: { GR: "Επανεκκίνηση", EN: "Restart" },
} as const satisfies Record<string, { GR: string; EN: string }>;

export function activeRouteLabel(lang: Lang, stopIndex: number, total: number) {
  return lang === "GR"
    ? `Ενεργή διαδρομή · στάση ${stopIndex}/${total}`
    : `Active route · stop ${stopIndex}/${total}`;
}

export function routesCuratedEyebrow(lang: Lang, count: number) {
  return lang === "GR" ? `${count} επιλεγμένες` : `${count} curated`;
}

export function routesCommunityEyebrow(lang: Lang, count: number) {
  return lang === "GR" ? `${count} από την κοινότητα` : `${count} community`;
}

export function readRouteAriaLabel(lang: Lang, title: string) {
  return lang === "GR" ? `Ανάγνωση διαδρομής ${title}` : `Read route ${title}`;
}

export function routeStopsLabel(lang: Lang, count: number) {
  if (lang === "GR") return `${count} ${count === 1 ? "στάση" : "στάσεις"}`;
  return `${count} ${count === 1 ? "stop" : "stops"}`;
}

export const ROUTE_FILTER_LABELS: Record<string, { GR: string; EN: string }> = {
  All: { GR: "Όλα", EN: "All" },
  Beach: { GR: "Παραλία", EN: "Beach" },
  Nature: { GR: "Φύση", EN: "Nature" },
  Culture: { GR: "Πολιτισμός", EN: "Culture" },
  "No car": { GR: "Χωρίς αυτοκίνητο", EN: "No car" },
  Free: { GR: "Δωρεάν", EN: "Free" },
};

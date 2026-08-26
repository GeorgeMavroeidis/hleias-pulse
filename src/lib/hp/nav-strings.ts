export const NAV_TAB_LABELS: Record<"map" | "pulse" | "routes" | "meet", { GR: string; EN: string }> = {
  map: { GR: "Χάρτης", EN: "Map" },
  pulse: { GR: "Pulse", EN: "Pulse" },
  routes: { GR: "Διαδρομές", EN: "Routes" },
  meet: { GR: "Συναντήσεις", EN: "Meet" },
};

export const MEET_SUB_TAB_LABELS: Record<"community" | "events", { GR: string; EN: string }> = {
  community: { GR: "Κοινότητα", EN: "Community" },
  events: { GR: "Εκδηλώσεις", EN: "Events" },
};

export const TOP_BAR_STRINGS = {
  tagline: { GR: "Τοπικά μέρη, διαδρομές και συμβουλές.", EN: "Local spots, routes, and tips." },
  closeSearch: { GR: "Κλείσιμο αναζήτησης", EN: "Close search" },
  openSearch: { GR: "Άνοιγμα αναζήτησης", EN: "Open search" },
  toggleLanguage: { GR: "Εναλλαγή γλώσσας", EN: "Toggle language" },
  searchAppAriaLabel: { GR: "Αναζήτηση ΗΛΕΙΑ PULSE", EN: "Search ΗΛΕΙΑ PULSE" },
  searchPlaceholder: {
    GR: "παραλία, πανηγύρι, sunset…",
    EN: "beach, panigyri, sunset…",
  },
} as const satisfies Record<string, { GR: string; EN: string }>;

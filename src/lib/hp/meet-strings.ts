import type { Lang } from "./i18n";
import type { MeetCategory } from "./meet-types";

type Dict = Record<string, { GR: string; EN: string }>;

/**
 * Display-only labels for MeetCategory. Kept separate from
 * MEET_CATEGORY_META.label, which is also used as a stored data value
 * (default "vibe" text) and must stay in English.
 */
export const MEET_CATEGORY_LABELS: Record<MeetCategory, { GR: string; EN: string }> = {
  panigyri: { GR: "Πανηγύρι", EN: "Panigyri" },
  beach: { GR: "Παραλία", EN: "Beach" },
  music: { GR: "Ζωντανή μουσική", EN: "Live music" },
  sunset: { GR: "Ηλιοβασίλεμα", EN: "Sunset" },
  sport: { GR: "Αθλητικά", EN: "Sport" },
  cleanup: { GR: "Καθαρισμός", EN: "Cleanup" },
  food: { GR: "Φαγητό", EN: "Food" },
  social: { GR: "Παρέα", EN: "Hangout" },
};

export const MEET_SCREEN_STRINGS = {
  title: { GR: "Συναντήσεις", EN: "Meet" },
  subtitle: { GR: "Συναντήσεις και σχέδια — πες ότι έρχεσαι.", EN: "Gatherings & plans — say you're in." },
  all: { GR: "Όλα", EN: "All" },
  mine: { GR: "Δικά μου", EN: "Mine" },
  emptyMineTitle: { GR: "Δεν έχεις σχεδιάσει τίποτα ακόμα", EN: "Nothing planned yet" },
  emptyAllTitle: { GR: "Καμία συνάντηση εδώ", EN: "No gatherings here" },
  emptyMineHelper: {
    GR: "Δήλωσε συμμετοχή σε κάτι, ή δημιούργησε τη δική σου — μια βουτιά, έναν καφέ, ένα πανηγύρι.",
    EN: "RSVP to something, or host your own — a swim, a coffee, a panigyri.",
  },
  emptyAllHelper: {
    GR: "Γίνε ο πρώτος που θα δημιουργήσει κάτι σε αυτή την ατμόσφαιρα.",
    EN: "Be the first to host something in this vibe.",
  },
  hostAGathering: { GR: "Δημιουργία συνάντησης", EN: "Host a gathering" },
  host: { GR: "Δημιουργία", EN: "Host" },
} as const satisfies Dict;

export function mineChipLabel(lang: Lang, count: number) {
  const mine = MEET_SCREEN_STRINGS.mine[lang];
  return count > 0 ? `${mine} · ${count}` : mine;
}

export const HOST_TYPE_LABELS: Record<"LOCAL" | "GUIDE" | "BUSINESS" | "TOURIST", { GR: string; EN: string }> = {
  LOCAL: { GR: "ντόπιος", EN: "local" },
  GUIDE: { GR: "ξεναγός", EN: "guide" },
  BUSINESS: { GR: "επιχείρηση", EN: "business" },
  TOURIST: { GR: "τουρίστας", EN: "tourist" },
};

export const EVENT_CARD_STRINGS = {
  hot: { GR: "Καυτό", EN: "Hot" },
  today: { GR: "Σήμερα", EN: "Today" },
  tomorrow: { GR: "Αύριο", EN: "Tomorrow" },
  maybe: { GR: "Ίσως", EN: "Maybe" },
} as const satisfies Dict;

export function openOnMapAriaLabel(lang: Lang, placeName: string) {
  return lang === "GR" ? `Άνοιγμα ${placeName} στον χάρτη` : `Open ${placeName} on the map`;
}

export function goingButtonLabel(lang: Lang, isGoing: boolean) {
  if (lang === "GR") return "Έρχομαι";
  return isGoing ? "I'm going" : "I'm in";
}

export function goingMaybeSummary(lang: Lang, going: number, maybe: number) {
  if (lang === "GR") {
    return `${going} έρχονται${maybe > 0 ? ` · ${maybe} ίσως` : ""}`;
  }
  return `${going} going${maybe > 0 ? ` · ${maybe} maybe` : ""}`;
}

export function spotsLeftLabel(lang: Lang, count: number) {
  if (lang === "GR") return `${count} ${count === 1 ? "θέση" : "θέσεις"}`;
  return `${count} ${count === 1 ? "spot" : "spots"}`;
}

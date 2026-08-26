import type { Lang } from "./i18n";

type Dict = Record<string, { GR: string; EN: string }>;

export const MAP_CHROME_STRINGS = {
  interactiveMap: { GR: "Διαδραστικός χάρτης της Ηλείας", EN: "Interactive map of Ilia" },
  loadingMap: { GR: "Φόρτωση χάρτη", EN: "Loading map" },
  backToPreviousView: { GR: "Επιστροφή στην προηγούμενη προβολή χάρτη", EN: "Back to previous map view" },
  topMapAreas: { GR: "Κορυφαίες περιοχές χάρτη", EN: "Top map areas" },
  zoomIn: { GR: "Μεγέθυνση χάρτη", EN: "Zoom in map" },
  zoomOut: { GR: "Σμίκρυνση χάρτη", EN: "Zoom out map" },
  findMyLocation: { GR: "Εύρεση της τοποθεσίας μου", EN: "Find my location" },
  showOverview: { GR: "Προβολή της Ηλείας συνολικά", EN: "Show Ilia overview" },
  tapPlaceOrCluster: { GR: "Πάτησε σε ένα μέρος ή ομάδα", EN: "Tap a place or cluster" },
  hotAroundCoast: { GR: "Ζέστη γύρω από την ακτή", EN: "Hot around the coast" },
} as const satisfies Dict;

export function areaPlacesSummary(lang: Lang, areaName: string) {
  return lang === "GR" ? `${areaName} μέρη` : `${areaName} places`;
}

export function filterAreasSummary(lang: Lang, filterLabel: string) {
  return lang === "GR" ? `${filterLabel} περιοχές` : `${filterLabel} areas`;
}

export function areasMovingTonightSummary(lang: Lang, count: number) {
  if (lang === "GR") {
    return `${count} ${count === 1 ? "περιοχή κινείται" : "περιοχές κινούνται"} απόψε`;
  }
  return `${count} area${count === 1 ? "" : "s"} moving tonight`;
}

export function postsCountLabel(lang: Lang, count: number) {
  if (lang === "GR") return `${count} ${count === 1 ? "ανάρτηση" : "αναρτήσεις"}`;
  return `${count} post${count === 1 ? "" : "s"}`;
}

export function eventsCountLabel(lang: Lang, count: number) {
  if (lang === "GR") return `${count} ${count === 1 ? "εκδήλωση" : "εκδηλώσεις"}`;
  return `${count} event${count === 1 ? "" : "s"}`;
}

export function eventsOrPostsLine(lang: Lang, eventCount: number, postCount: number) {
  return eventCount > 0 ? eventsCountLabel(lang, eventCount) : postsCountLabel(lang, postCount);
}

export function tipsCountLabel(lang: Lang, count: number) {
  if (lang === "GR") return `${count} ${count === 1 ? "συμβουλή" : "συμβουλές"}`;
  return `${count} tip${count === 1 ? "" : "s"}`;
}

export function postsAndEventsLine(lang: Lang, postCount: number, eventCount: number) {
  return `${postsCountLabel(lang, postCount)} · ${eventsCountLabel(lang, eventCount)}`;
}

export function eventsTonightLine(lang: Lang, eventCount: number) {
  return lang === "GR"
    ? `${eventsCountLabel(lang, eventCount)} απόψε`
    : `${eventsCountLabel(lang, eventCount)} tonight`;
}

export function sunsetPostsLine(lang: Lang, postCount: number) {
  return lang === "GR"
    ? `ηλιοβασίλεμα · ${postsCountLabel(lang, postCount)}`
    : `sunset · ${postsCountLabel(lang, postCount)}`;
}

export function tonightPostsLine(lang: Lang, postCount: number) {
  return lang === "GR"
    ? `απόψε · ${postsCountLabel(lang, postCount)}`
    : `tonight · ${postsCountLabel(lang, postCount)}`;
}

export const AREA_STATUS_MARKER_LABELS: Record<"moving" | "hot" | "live", { GR: string; EN: string }> = {
  moving: { GR: "Κινείται", EN: "Moving" },
  hot: { GR: "Καυτό", EN: "Hot" },
  live: { GR: "Ζωντανά", EN: "Live" },
};

export function zoomIntoClusterAriaLabel(lang: Lang, clusterName: string) {
  return lang === "GR" ? `Μεγέθυνση στο ${clusterName}` : `Zoom into ${clusterName}`;
}

export function zoomIntoActivityAriaLabel(lang: Lang, pointCount: number, clusterName: string) {
  return lang === "GR"
    ? `Μεγέθυνση σε ${pointCount} δραστηριότητες κοντά στο ${clusterName}`
    : `Zoom into ${pointCount} activities near ${clusterName}`;
}

export function openPlaceAriaLabel(lang: Lang, placeName: string) {
  return lang === "GR" ? `Άνοιγμα ${placeName}` : `Open ${placeName}`;
}

export const MAP_BOTTOM_SHEET_STRINGS = {
  tonightsPulse: { GR: "Η βραδιά τώρα", EN: "Tonight's pulse" },
  tapBubbleHint: { GR: "Πάτησε μια φούσκα για να δεις τι συμβαίνει.", EN: "Tap a bubble to see what's happening." },
  clusteredElements: { GR: "Ομαδοποιημένα στοιχεία", EN: "Clustered elements" },
  saved: { GR: "Αποθηκεύτηκε", EN: "Saved" },
  save: { GR: "Αποθήκευση", EN: "Save" },
  details: { GR: "Λεπτομέρειες", EN: "Details" },
} as const satisfies Dict;

export const SNAP_LABELS: Record<"collapsed" | "preview" | "full", { GR: string; EN: string }> = {
  collapsed: { GR: "συμπτυγμένο", EN: "collapsed" },
  preview: { GR: "προεπισκόπηση", EN: "preview" },
  full: { GR: "πλήρες", EN: "full" },
};

export function setSheetAriaLabel(lang: Lang, snap: "collapsed" | "preview" | "full") {
  return lang === "GR"
    ? `Ρύθμιση φύλλου σε ${SNAP_LABELS[snap].GR}`
    : `Set sheet to ${SNAP_LABELS[snap].EN}`;
}

export function clusteredPlacesCountLabel(lang: Lang, count: number) {
  if (lang === "GR") {
    return `${count} ${count === 1 ? "ομαδοποιημένο μέρος" : "ομαδοποιημένα μέρη"} σε αυτή την περιοχή`;
  }
  return `${count} clustered place${count === 1 ? "" : "s"} in this area`;
}

export function storiesFromAreaLabel(lang: Lang, areaName: string) {
  return lang === "GR" ? `Ιστορίες από ${areaName}` : `Stories from ${areaName}`;
}

export function openStoriesForPlaceAriaLabel(lang: Lang, placeName: string) {
  return lang === "GR" ? `Άνοιγμα ιστοριών για ${placeName}` : `Open stories for ${placeName}`;
}

export function openInOpenStreetMapAriaLabel(lang: Lang, placeName: string) {
  return lang === "GR" ? `Άνοιγμα ${placeName} στο OpenStreetMap` : `Open ${placeName} in OpenStreetMap`;
}

export function sharePlaceAriaLabel(lang: Lang, placeName: string) {
  return lang === "GR" ? `Κοινοποίηση ${placeName}` : `Share ${placeName}`;
}

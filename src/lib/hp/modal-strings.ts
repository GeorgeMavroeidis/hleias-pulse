import type { Lang } from "./i18n";

type Dict = Record<string, { GR: string; EN: string }>;

export const PLACE_DETAIL_STRINGS = {
  closePlaceDetails: { GR: "Κλείσιμο λεπτομερειών μέρους", EN: "Close place details" },
  playAll: { GR: "Αναπαραγωγή όλων", EN: "Play all" },
  postsToday: { GR: "αναρτήσεις σήμερα", EN: "posts today" },
  eventsTonight: { GR: "εκδηλώσεις απόψε", EN: "events tonight" },
  crowd: { GR: "κόσμος", EN: "crowd" },
  budget: { GR: "προϋπολογισμός", EN: "budget" },
  bestTime: { GR: "καλύτερη ώρα", EN: "best time" },
  localNotes: { GR: "τοπικές σημειώσεις", EN: "local notes" },
  bestFor: { GR: "Καλύτερο για", EN: "Best for" },
  recentPosts: { GR: "Πρόσφατες αναρτήσεις", EN: "Recent posts" },
  noRecentPosts: { GR: "Καμία πρόσφατη ανάρτηση ακόμα. Γίνε ο πρώτος.", EN: "No recent posts here yet. Be first." },
  quickComment: { GR: "Γρήγορο σχόλιο", EN: "Quick comment" },
  addLocalNotePlaceholder: { GR: "Πρόσθεσε μια τοπική σημείωση…", EN: "Add a local note…" },
  saved: { GR: "Αποθηκεύτηκε", EN: "Saved" },
  save: { GR: "Αποθήκευση", EN: "Save" },
  map: { GR: "Χάρτης", EN: "Map" },
} as const satisfies Dict;

export function placeDetailsAriaLabel(lang: Lang, placeName: string) {
  return lang === "GR" ? `Λεπτομέρειες ${placeName}` : `${placeName} details`;
}

export function placeStoriesCountLabel(lang: Lang, count: number) {
  return lang === "GR" ? `Ιστορίες μέρους · ${count}` : `Place stories · ${count}`;
}

export function openPlaceStoriesAriaLabel(lang: Lang, placeName: string) {
  return lang === "GR" ? `Άνοιγμα ιστοριών ${placeName}` : `Open ${placeName} stories`;
}

export function postCommentOnAriaLabel(lang: Lang, placeName: string) {
  return lang === "GR" ? `Δημοσίευση σχολίου στο ${placeName}` : `Post comment on ${placeName}`;
}

export const POST_DETAIL_STRINGS = {
  closePostDetails: { GR: "Κλείσιμο λεπτομερειών ανάρτησης", EN: "Close post details" },
  comments: { GR: "Σχόλια", EN: "Comments" },
  beFirstToComment: { GR: "Γράψε το πρώτο σχόλιο.", EN: "Be the first to comment." },
  quickCommentOnPost: { GR: "Γρήγορο σχόλιο σε ανάρτηση", EN: "Quick comment on post" },
  quickCommentPlaceholder: { GR: "Γρήγορο σχόλιο…", EN: "Quick comment…" },
  postComment: { GR: "Δημοσίευση σχολίου", EN: "Post comment" },
  openOnMap: { GR: "Άνοιγμα στον χάρτη", EN: "Open on map" },
} as const satisfies Dict;

export function postAtAriaLabel(lang: Lang, placeName: string) {
  return lang === "GR" ? `Ανάρτηση στο ${placeName}` : `Post at ${placeName}`;
}

export const ROUTE_ARTICLE_STRINGS = {
  closeRouteArticle: { GR: "Κλείσιμο άρθρου διαδρομής", EN: "Close route article" },
  timeline: { GR: "Χρονολόγιο", EN: "Timeline" },
  openOnMap: { GR: "Άνοιγμα στον χάρτη", EN: "Open on map" },
  comments: { GR: "Σχόλια", EN: "Comments" },
  noRouteComments: { GR: "Κανένα σχόλιο διαδρομής ακόμα.", EN: "No route comments yet." },
  quickCommentOnRoute: { GR: "Γρήγορο σχόλιο σε διαδρομή", EN: "Quick comment on route" },
  addRouteNotePlaceholder: { GR: "Πρόσθεσε μια σημείωση διαδρομής…", EN: "Add a route note…" },
  postRouteComment: { GR: "Δημοσίευση σχολίου διαδρομής", EN: "Post route comment" },
  mapRoute: { GR: "Χάρτης διαδρομής", EN: "Map route" },
  saved: { GR: "Αποθηκεύτηκε", EN: "Saved" },
  saveRoute: { GR: "Αποθήκευση διαδρομής", EN: "Save route" },
  shareRoute: { GR: "Κοινοποίηση διαδρομής", EN: "Share route" },
} as const satisfies Dict;

export function routeAriaLabel(lang: Lang, title: string) {
  return lang === "GR" ? `Διαδρομή: ${title}` : `Route: ${title}`;
}

export function openInOpenStreetMapAriaLabel(lang: Lang, name: string) {
  return lang === "GR" ? `Άνοιγμα ${name} στο OpenStreetMap` : `Open ${name} in OpenStreetMap`;
}

export function shareAriaLabel(lang: Lang, name: string) {
  return lang === "GR" ? `Κοινοποίηση ${name}` : `Share ${name}`;
}

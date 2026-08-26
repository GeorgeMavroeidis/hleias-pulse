import type { Lang } from "./i18n";

type Dict = Record<string, { GR: string; EN: string }>;

export const PULSE_FEED_STRINGS = {
  unsavePost: { GR: "Κατάργηση αποθήκευσης ανάρτησης", EN: "Unsave post" },
  savePost: { GR: "Αποθήκευση ανάρτησης", EN: "Save post" },
  unlikePost: { GR: "Αναίρεση like ανάρτησης", EN: "Unlike post" },
  likePost: { GR: "Like ανάρτησης", EN: "Like post" },
  openComments: { GR: "Άνοιγμα σχολίων", EN: "Open comments" },
  sharePost: { GR: "Κοινοποίηση ανάρτησης", EN: "Share post" },
  openOnMap: { GR: "άνοιγμα στον χάρτη", EN: "open on map" },
  createLocalPost: { GR: "Δημιουργία τοπικής ανάρτησης", EN: "Create local post" },
} as const satisfies Dict;

export const PULSE_FILTER_LABELS: Record<"Now" | "Tonight" | "Weekend" | "Local tips", { GR: string; EN: string }> = {
  Now: { GR: "Τώρα", EN: "Now" },
  Tonight: { GR: "Απόψε", EN: "Tonight" },
  Weekend: { GR: "Σαββατοκύριακο", EN: "Weekend" },
  "Local tips": { GR: "Τοπικές συμβουλές", EN: "Local tips" },
};

export function openPostAboutAriaLabel(lang: Lang, placeName: string) {
  return lang === "GR" ? `Άνοιγμα ανάρτησης για ${placeName}` : `Open post about ${placeName}`;
}

export function openPostDetailsAriaLabel(lang: Lang, placeName: string) {
  return lang === "GR"
    ? `Άνοιγμα λεπτομερειών ανάρτησης για ${placeName}`
    : `Open post details for ${placeName}`;
}

export function liveTickerTimeLabel(lang: Lang, minutesAgo: number) {
  const time =
    minutesAgo < 1
      ? lang === "GR"
        ? "μόλις τώρα"
        : "just now"
      : lang === "GR"
        ? `πριν ${minutesAgo}λ`
        : `${minutesAgo}m ago`;
  const live = lang === "GR" ? "ζωντανά" : "live";
  return `${time} · ${live}`;
}

export const STORY_LIVE_BADGE = { GR: "Ζωντανά", EN: "Live" } as const;

export function openStoriesAriaLabel(lang: Lang, count: number, placeName: string) {
  if (lang === "GR") {
    return `Άνοιγμα ${count} ${count === 1 ? "ιστορίας" : "ιστοριών"} για ${placeName}`;
  }
  return `Open ${count} stor${count === 1 ? "y" : "ies"} for ${placeName}`;
}

export const TRENDING_STATUS_LABELS: Record<"quiet" | "active" | "popular" | "busy", { GR: string; EN: string }> = {
  quiet: { GR: "Ήσυχα", EN: "Quiet" },
  active: { GR: "Ζεσταίνει", EN: "Warming up" },
  popular: { GR: "Πολύς κόσμος", EN: "Busy" },
  busy: { GR: "Γεμάτο", EN: "Packed" },
};

export function trendingNowAriaLabel(lang: Lang, placeName: string) {
  return lang === "GR"
    ? `Δημοφιλές τώρα: ${placeName}. Άνοιγμα λεπτομερειών.`
    : `Trending now: ${placeName}. Open details.`;
}

export function trendingTonightBadge(lang: Lang, rank: number) {
  return lang === "GR" ? `#${rank} απόψε` : `#${rank} tonight`;
}

export function hereRecentlyLabel(lang: Lang, count: number) {
  return lang === "GR" ? `${count} εδώ πρόσφατα` : `${count} here recently`;
}

export const IM_GOING = { GR: "Έρχομαι", EN: "I'm going" } as const;

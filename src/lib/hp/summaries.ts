// Two-line summary cards for places and routes — the "quick pick" building
// block for the trip builder (docs/TOURIST_STAY_PACK.md → "Summaries of
// everything we have").
//
// Everything here is derived from fields the database already has
// (`short`, `budget`, `best_time`, `crowd`, `tags`, `type` on places; `lede`,
// `duration`, `budget`, stops on routes). Nothing new is stored.
//
// The database text is English-only. The Greek lines below are translations
// of each place's existing `short` / route `lede`, kept in-bundle until the
// content moves to a bilingual column. They were machine-assisted and should
// be read over by a native speaker — the meaning is the source's, not new
// claims. A place with no Greek entry falls back to its English `short`.

import type { Place, PlaceType, RouteItem } from "@/lib/hp-model";

type Lang = "GR" | "EN";

export const PLACE_SUMMARY_GR: Record<string, string> = {
  "agios-andreas": "Μικρό στέκι δίπλα στη θάλασσα για φαγητό, μπίρες και χαλαρό ηλιοβασίλεμα.",
  "amaliada-square": "Καφές, προθέρμανση και ντόπια κίνηση πριν την Κουρούτα.",
  "ancient-elis": "Αρχαίος χώρος χωρίς την πίεση των τουριστών. Ήσυχη στάση πολιτισμού.",
  "ancient-olympia": "Αρχαία ερείπια, χρυσό φως και μια απρόσμενα ωραία βόλτα αργά το απόγευμα.",
  andritsaina: "Ορεινό χωριό με χαρακτήρα. Όχι γυαλισμένο, και αυτό είναι το καλό του.",
  "andritsaina-streets": "Για αργή βόλτα πριν το φαγητό, με ορεινό αέρα.",
  "arkoudi-beach": "Μικρό παραθαλάσσιο χωριό στα βόρεια για εύκολο μπάνιο και φαγητό μετά.",
  "bassae-inside": "Για όσους κάνουν roadtrip και θέλουν κάτι περισσότερο από beach bars.",
  "bassae-temple": "Σοβαρή παράκαμψη, αλλά από αυτές που κάνουν τη μέρα να μοιάζει μεγαλύτερη.",
  chlemoutsi: "Σιλουέτα κάστρου, θέα από τον λόφο και ένα καλό διάλειμμα από τις παραλίες.",
  "chlemoutsi-sea-view": "Πιο κινηματογραφική ματιά στο κάστρο και στον ορίζοντα του Ιονίου.",
  "elis-agora": "Ήρεμη αρχαιολογική στάση για όσους δεν αντέχουν τους γεμάτους χώρους.",
  epitalio:
    "Αληθινό ντόπιο σημείο νότια του Πύργου, που ενώνει την πόλη με την πλευρά της Ζαχάρως.",
  "foloi-deep":
    "Για τους λάτρεις της φύσης και του εναλλακτικού. Πάρε νερό, μην αφήσεις σκουπίδια.",
  "foloi-forest": "Δάσος με βελανιδιές, σκιά και μυθική ησυχία. Η μέρα χωρίς παραλία.",
  gastouni: "Αληθινός ντόπιος ρυθμός: καφές, δουλειές και χρήσιμη στάση πριν την ακτή.",
  giannitsochori: "Απόδραση στη νότια ακτή όταν θέλεις περισσότερο χώρο και λιγότερο κόσμο.",
  "glyfa-beach":
    "Μεγάλη αμμουδιά ανάμεσα στους αμμόλοφους του Βαρθολομιού και το Αρκούδι — για χώρο, όχι για σκηνικό.",
  "kaiafas-lake": "Λίμνη, πευκοδάσος και μια παράξενη ηρεμία. Ωραία αντίθεση μετά την παραλία.",
  "kaiafas-sunset": "Για ηλιοβασίλεμα χωρίς τη φασαρία των beach bars.",
  "kakovatos-beach": "Χαλαρή παραλία για όσους δεν θέλουν το προφανές σκηνικό.",
  "kakovatos-inland": "Η παραλία συναντά τα χωράφια. Καλό για ήσυχο «ξεκαθάρισμα».",
  "katakolo-kiani-akti":
    "Εύκολη επιλογή για μπάνιο όταν είσαι στο Κατάκολο και δεν θες ολόκληρη εκστρατεία.",
  "katakolo-port": "Βόλτα στο λιμάνι, καφές, θαλασσινός αέρας, χάος κρουαζιέρας, καλό χάζι.",
  "katakolo-sunset": "Ηλιοβασίλεμα χωρίς κόπο, με τα φώτα του λιμανιού και αύρα από τη θάλασσα.",
  korakochori: "Μικρό παραθαλάσσιο χωριό που δένει την ακτή από το Κατάκολο ως τη Σκαφιδιά.",
  "kourouta-beach":
    "Ο προφανής μαγνήτης για beach party. Έλα για τη θάλασσα, μείνε όταν ανάψουν τα φώτα.",
  "kourouta-sunset": "Εκεί που η παραλία σιγά σιγά γίνεται το βραδινό πρόγραμμα.",
  "kyllini-beach": "Αίσθηση μεγάλης παραλίας, πιο άνετη από τα γεμάτα σημεία.",
  "kyllini-harbor": "Κίνηση από τα πλοία, γρήγορος καφές, θέα στη θάλασσα, κόσμος σε μετάβαση.",
  "kyllini-old-beach": "Τίποτα φανταχτερό. Απλώς μια γρήγορη βουτιά κοντά στο λιμάνι.",
  "lampeia-divri": "Πιο δροσερό ορεινό χωριό όταν η ακτή καίει.",
  lechaina: "Μικρή πόλη στα βόρεια που γεμίζει την πλευρά της Κυλλήνης στον χάρτη.",
  "lechaina-zacharo-flower":
    "Άγρια ακτογραμμή για ήσυχες βόλτες, αλμυρό αέρα και να βρεις το δικό σου σημείο.",
  "loutra-kyllinis":
    "Περιοχή ιαματικών λουτρών κοντά στην Κυλλήνη για πιο αργό ρυθμό, εκτός παραλίας.",
  "mercouri-estate":
    "Ιστορικό οινοποιείο και κτήμα κοντά στο Κορακοχώρι — για μια μέρα Κατάκολο/Ολυμπία που δεν είναι μόνο αρχαία.",
  "nemouta-village": "Μικρό ορεινό χωριό, βάση πριν ή μετά τους καταρράκτες.",
  "nemouta-waterfalls":
    "Αληθινή απόδραση στην ενδοχώρα: μονοπάτι με καταρράκτες κοντά στη Νεμούτα και την κοιλάδα του Ερύμανθου.",
  "olympia-museum": "Καλή επιλογή σε εσωτερικό χώρο όταν ο ήλιος είναι πολύ δυνατός.",
  "olympia-stadium": "Το αρχαίο στάδιο. Απλό, τεράστιο, σιωπηλό. Καλύτερο απ' ό,τι περιμένεις.",
  "olympic-games-museum": "Μικρή δόση πολιτισμού πριν γυρίσεις στην παραλία.",
  "palouki-beach":
    "Πιο ήσυχη αμμουδιά κοντά στην Κουρούτα, με μικρό λιμανάκι και ατμόσφαιρα κάμπινγκ.",
  "pineios-reservoir":
    "Τεχνητή λίμνη και φράγμα βορειοανατολικά της Αμαλιάδας, για ήσυχη διαδρομή στην ενδοχώρα.",
  "pyrgos-centre": "Όχι καρτποστάλ. Εδώ ζει η πραγματική εβδομάδα της πόλης.",
  "pyrgos-night": "Ξεκίνα από εδώ, ρώτα και ακολούθησε τη νύχτα.",
  "samiko-acropolis":
    "Για όσους προτιμούν την αίσθηση του άγνωστου αρχαίου τόπου από τις ξεναγήσεις.",
  skafidia: "Μικρότερη παραθαλάσσια ατμόσφαιρα κοντά σε Πύργο και Κατάκολο.",
  "skafidia-monastery": "Μικρή στάση πολιτισμού κοντά στη Σκαφιδιά, εύκολα μαζί με την ακτή.",
  "tholo-beach": "Αμμουδιά στη νότια ακτή κοντά στη Ζαχάρω, για κάμπινγκ και περισσότερο χώρο.",
  vartholomio: "Πρακτική ντόπια στάση ανάμεσα στον κάμπο και την ακτή Αρκούδι/Γλύφα.",
  "zacharo-beach": "Μακριά αμμουδιά, μεγάλος ουρανός, λιγότερο γυαλισμένη, πιο ελεύθερη.",
};

export const ROUTE_SUMMARY_GR: Record<string, string> = {
  "route-1": "Για τη γνωστή βραδιά στην Κουρούτα χωρίς να χάσεις τη μισή μέρα.",
  "route-2":
    "Κατεβαίνεις από την κρουαζιέρα, βόλτα στο λιμάνι, μπάνιο, φαγητό δίπλα στη θάλασσα. Χωρίς αυτοκίνητο.",
  "route-3":
    "Ξέχνα τον κόσμο. Μεγάλος ουρανός, δωρεάν παραλίες κι ένα ηλιοβασίλεμα που δεν ξεχνιέται.",
  "route-4": "Άλλαξε τη ζέστη με σκιά. Βελανιδιές, αργό χωριό, αληθινός ορεινός αέρας.",
  "route-5": "Πολιτισμός, αλλά από αυτόν που θα συζητάς μετά.",
};

// A rough, editable default for how long a stop of each kind takes, used to
// show "≈ 2–3 h" and, later, to warn about an overloaded day in the trip
// builder. These are planning estimates, not measurements — tune them freely.
export const TYPICAL_VISIT: Record<PlaceType, { min: number; max: number }> = {
  beach: { min: 2, max: 4 },
  culture: { min: 1, max: 2 },
  nature: { min: 2, max: 3 },
  food: { min: 1, max: 2 },
  local: { min: 1, max: 1 },
  village: { min: 1, max: 2 },
  night: { min: 2, max: 4 },
  sunset: { min: 1, max: 1 },
};

const BUDGET: Record<string, { GR: string; EN: string }> = {
  free: { GR: "Δωρεάν", EN: "Free" },
  "€": { GR: "€ Οικονομικό", EN: "€ Cheap" },
  "€€": { GR: "€€ Μέτριο", EN: "€€ Mid" },
  "€€€": { GR: "€€€ Ακριβό", EN: "€€€ Pricey" },
};

// Free-text in the database; the common values are mapped, anything else is
// shown as written.
const BEST_TIME_GR: Record<string, string> = {
  morning: "πρωί",
  early: "νωρίς",
  midday: "μεσημέρι",
  "hot midday": "καυτό μεσημέρι",
  "late afternoon": "αργά το απόγευμα",
  "golden hour": "χρυσή ώρα",
  sunset: "ηλιοβασίλεμα",
  "sunset dinner": "δείπνο στο ηλιοβασίλεμα",
  evening: "βράδυ",
  "summer evening": "καλοκαιρινό βράδυ",
  "18:00 onwards": "από τις 18:00",
  "morning to sunset": "πρωί ως ηλιοβασίλεμα",
  "morning tour": "πρωινή βόλτα",
  "before ferry": "πριν το πλοίο",
  "spring or early autumn": "άνοιξη ή αρχές φθινοπώρου",
};

const CROWD: Record<string, { GR: string; EN: string }> = {
  low: { GR: "Λίγος κόσμος", EN: "Quiet" },
  medium: { GR: "Μέτριος κόσμος", EN: "Some people" },
  high: { GR: "Πολύς κόσμος", EN: "Busy" },
};

// Tags that tell a visitor who a place suits. Order = priority when trimming.
const SUITS: Record<string, { GR: string; EN: string }> = {
  family: { GR: "Για οικογένειες", EN: "Family-friendly" },
  quiet: { GR: "Ήσυχο", EN: "Quiet" },
  "no car": { GR: "Χωρίς αυτοκίνητο", EN: "No car needed" },
  walk: { GR: "Περπάτημα", EN: "Walkable" },
  shade: { GR: "Σκιά", EN: "Shade" },
  indoor: { GR: "Εσωτερικός χώρος", EN: "Indoors" },
  swim: { GR: "Μπάνιο", EN: "Swim" },
  photo: { GR: "Για φωτογραφίες", EN: "Photo spot" },
};

export type SummaryFactKind = "time" | "budget" | "best" | "crowd" | "suits" | "stops";
export type SummaryFact = { kind: SummaryFactKind; label: string };

export type SummaryCard = {
  kind: "place" | "route";
  id: string;
  title: string;
  /** The one-line "what is it" — line one of the two. */
  line: string;
  /** Short chips — line two. At most MAX_FACTS. */
  facts: SummaryFact[];
  /** True when the line is shown in English because no Greek version exists. */
  untranslated: boolean;
};

export const MAX_FACTS = 4;

function budgetLabel(value: string, lang: Lang) {
  return BUDGET[value.trim()]?.[lang] ?? value;
}

// Prefixed so a bare "morning" reads as advice, not as an opening hour.
function bestTimeLabel(value: string, lang: Lang) {
  const key = value.trim().toLowerCase();
  if (lang === "EN") return `Best: ${value.trim()}`;
  return `Καλύτερα: ${BEST_TIME_GR[key] ?? value.trim()}`;
}

function crowdLabel(value: string, lang: Lang) {
  const key = value.trim().toLowerCase();
  // "high when cruise ships arrive" etc. → treat as high, keep it simple.
  const base = CROWD[key] ?? (key.startsWith("high") ? CROWD.high : undefined);
  return base?.[lang] ?? value;
}

export function visitLabel(type: PlaceType, lang: Lang) {
  const { min, max } = TYPICAL_VISIT[type];
  const unit = lang === "GR" ? "ώρ." : "h";
  return min === max ? `≈ ${min} ${unit}` : `≈ ${min}–${max} ${unit}`;
}

export function placeSummary(place: Place, lang: Lang): SummaryCard {
  const gr = PLACE_SUMMARY_GR[place.id];
  const line = lang === "GR" ? (gr ?? place.short) : place.short;
  const facts: SummaryFact[] = [{ kind: "time", label: visitLabel(place.type, lang) }];
  if (place.budget) facts.push({ kind: "budget", label: budgetLabel(place.budget, lang) });
  if (place.bestTime) facts.push({ kind: "best", label: bestTimeLabel(place.bestTime, lang) });
  const suit = place.tags.map((tag) => SUITS[tag.toLowerCase()]).find(Boolean);
  if (suit) facts.push({ kind: "suits", label: suit[lang] });
  else if (place.crowd) facts.push({ kind: "crowd", label: crowdLabel(place.crowd, lang) });
  return {
    kind: "place",
    id: place.id,
    title: lang === "GR" ? place.greekName || place.name : place.name,
    line,
    facts: facts.slice(0, MAX_FACTS),
    untranslated: lang === "GR" && !gr,
  };
}

function durationLabel(value: string, lang: Lang) {
  if (lang === "EN") return value;
  const v = value.trim().toLowerCase();
  if (v === "1 day") return "1 μέρα";
  if (v === "half day") return "μισή μέρα";
  const hours = /^(\d+(?:\.\d+)?)\s*h$/.exec(v);
  if (hours) return `${hours[1]} ώρες`;
  return value;
}

export function routeSummary(route: RouteItem, lang: Lang): SummaryCard {
  const gr = ROUTE_SUMMARY_GR[route.id];
  const facts: SummaryFact[] = [];
  if (route.duration) facts.push({ kind: "time", label: durationLabel(route.duration, lang) });
  if (route.budget) facts.push({ kind: "budget", label: budgetLabel(route.budget, lang) });
  if (route.stops.length > 0) {
    const n = route.stops.length;
    facts.push({
      kind: "stops",
      label:
        lang === "GR"
          ? `${n} ${n === 1 ? "στάση" : "στάσεις"}`
          : `${n} ${n === 1 ? "stop" : "stops"}`,
    });
  }
  const suit = route.tags.map((tag) => SUITS[tag.toLowerCase()]).find(Boolean);
  if (suit) facts.push({ kind: "suits", label: suit[lang] });
  return {
    kind: "route",
    id: route.id,
    title: route.title,
    line: lang === "GR" ? (gr ?? route.lede) : route.lede,
    facts: facts.slice(0, MAX_FACTS),
    untranslated: lang === "GR" && !gr,
  };
}

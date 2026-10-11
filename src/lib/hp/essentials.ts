// Essentials: the "what you need so you don't suffer" cards for a visitor who
// has a week in the region. Plan and reasoning: docs/TOURIST_STAY_PACK.md.
//
// v1 is deliberately static and in-bundle — no table, no fetch. That keeps it
// readable offline (a tourist roaming abroad may have no signal) and lets the
// team iterate on the shape before committing to a schema. When the content
// settles, this moves to an admin-written `essentials` table with the same
// fields.
//
// Content rule: every card carries a `lastCheckedAt` and an owner. A card that
// was never checked, or is older than STALE_AFTER_DAYS, renders with a warning
// instead of looking current — a wrong ferry time costs someone a real day.
// Prefer `sourceUrl` (the official page) over copying a timetable into `body`.

export type EssentialsSectionId = "arrive" | "roads" | "see" | "watch" | "emergency";

export type LocalizedText = { GR: string; EN: string };

export type EssentialsCard = {
  id: string;
  section: EssentialsSectionId;
  /** Which region this belongs to — Ilia first; see "Built to travel" in the plan. */
  region: string;
  title: LocalizedText;
  body: LocalizedText;
  /** Official source to check against. Shown as a link. */
  sourceUrl?: string;
  /** ISO date the content was last verified by its owner; null = never. */
  lastCheckedAt: string | null;
  /** Who keeps this card current. Placeholder until ownership is decided. */
  owner: string;
  /** True while the body is template text, not verified content. */
  draft: boolean;
};

export type EssentialsSection = {
  id: EssentialsSectionId;
  title: LocalizedText;
  hint: LocalizedText;
};

export const STALE_AFTER_DAYS = 90;

export const ESSENTIALS_SECTIONS: EssentialsSection[] = [
  {
    id: "arrive",
    title: { GR: "Άφιξη & μετακινήσεις", EN: "Getting here & around" },
    hint: {
      GR: "Λιμάνια, πλοία, αεροδρόμια, ταξί, λεωφορεία",
      EN: "Ports, ferries, airports, taxis, buses",
    },
  },
  {
    id: "roads",
    title: { GR: "Δρόμοι", EN: "Roads" },
    hint: {
      GR: "Κλειστοί ή δύσκολοι δρόμοι, εποχικές προειδοποιήσεις",
      EN: "Closed or tricky roads, seasonal warnings",
    },
  },
  {
    id: "see",
    title: { GR: "Τι να δεις", EN: "What to see" },
    hint: {
      GR: "Τα βασικά, με σύνδεση σε σημεία και διαδρομές",
      EN: "The essentials, linked to places and routes",
    },
  },
  {
    id: "watch",
    title: { GR: "Τι να προσέξεις", EN: "Watch out for" },
    hint: {
      GR: "Ζέστη, φωτιές, θάλασσα, ωράρια",
      EN: "Heat, fires, sea conditions, opening hours",
    },
  },
  {
    id: "emergency",
    title: { GR: "Έκτακτα", EN: "Emergencies" },
    hint: { GR: "Τηλέφωνα, νοσοκομεία, φαρμακεία", EN: "Numbers, hospitals, pharmacies" },
  },
];

const DRAFT_BODY: LocalizedText = {
  GR: "Πρόχειρο — το κείμενο θα γραφτεί και θα ελεγχθεί από την ομάδα.",
  EN: "Draft — the team will write and verify this card.",
};

const TEAM = "team (owner TBD)";

// Every card except 112 is a draft on purpose: the facts (ferry operators,
// closed roads, hospital locations) must come from people who checked them,
// not from code. 112 is the EU-wide emergency number, which is not in doubt.
export const ESSENTIALS_CARDS: EssentialsCard[] = [
  {
    id: "arrive-ferries",
    section: "arrive",
    region: "ilia",
    title: { GR: "Πλοία προς τα νησιά", EN: "Ferries to the islands" },
    body: DRAFT_BODY,
    lastCheckedAt: null,
    owner: TEAM,
    draft: true,
  },
  {
    id: "arrive-cruise",
    section: "arrive",
    region: "ilia",
    title: { GR: "Φτάνεις με κρουαζιερόπλοιο", EN: "Arriving by cruise ship" },
    body: DRAFT_BODY,
    lastCheckedAt: null,
    owner: TEAM,
    draft: true,
  },
  {
    id: "arrive-transport",
    section: "arrive",
    region: "ilia",
    title: { GR: "Αυτοκίνητο, ταξί, λεωφορεία", EN: "Car, taxi, buses" },
    body: DRAFT_BODY,
    lastCheckedAt: null,
    owner: TEAM,
    draft: true,
  },
  {
    id: "roads-current",
    section: "roads",
    region: "ilia",
    title: { GR: "Τι ισχύει τώρα στους δρόμους", EN: "Road conditions right now" },
    body: DRAFT_BODY,
    lastCheckedAt: null,
    owner: TEAM,
    draft: true,
  },
  {
    id: "see-first-days",
    section: "see",
    region: "ilia",
    title: { GR: "Αν έχεις λίγες μέρες", EN: "If you only have a few days" },
    body: DRAFT_BODY,
    lastCheckedAt: null,
    owner: TEAM,
    draft: true,
  },
  {
    id: "watch-heat-fire",
    section: "watch",
    region: "ilia",
    title: { GR: "Ζέστη & κίνδυνος πυρκαγιάς", EN: "Heat & fire risk" },
    body: DRAFT_BODY,
    lastCheckedAt: null,
    owner: TEAM,
    draft: true,
  },
  {
    id: "watch-sea",
    section: "watch",
    region: "ilia",
    title: { GR: "Θάλασσα & παραλίες", EN: "Sea & beaches" },
    body: DRAFT_BODY,
    lastCheckedAt: null,
    owner: TEAM,
    draft: true,
  },
  {
    id: "emergency-112",
    section: "emergency",
    region: "ilia",
    title: { GR: "Αριθμός έκτακτης ανάγκης 112", EN: "Emergency number 112" },
    body: {
      GR: "Το 112 είναι ο ενιαίος ευρωπαϊκός αριθμός έκτακτης ανάγκης και λειτουργεί δωρεάν από κάθε κινητό.",
      EN: "112 is the single European emergency number and works free of charge from any mobile phone.",
    },
    lastCheckedAt: "2026-10-11",
    owner: TEAM,
    draft: false,
  },
  {
    id: "emergency-health",
    section: "emergency",
    region: "ilia",
    title: { GR: "Νοσοκομεία & εφημερεύοντα φαρμακεία", EN: "Hospitals & on-duty pharmacies" },
    body: DRAFT_BODY,
    lastCheckedAt: null,
    owner: TEAM,
    draft: true,
  },
];

export type CardFreshness = "fresh" | "stale" | "unchecked";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How much to trust a card today. Invalid dates count as unchecked. */
export function cardFreshness(
  card: Pick<EssentialsCard, "lastCheckedAt">,
  now: number = Date.now(),
  staleAfterDays: number = STALE_AFTER_DAYS,
): CardFreshness {
  if (!card.lastCheckedAt) return "unchecked";
  const checked = Date.parse(card.lastCheckedAt);
  if (Number.isNaN(checked)) return "unchecked";
  return now - checked > staleAfterDays * DAY_MS ? "stale" : "fresh";
}

/** Sections in display order, each with its cards for one region. Empty sections are dropped. */
export function essentialsBySection(
  cards: EssentialsCard[],
  region: string,
  sections: EssentialsSection[] = ESSENTIALS_SECTIONS,
): { section: EssentialsSection; cards: EssentialsCard[] }[] {
  return sections
    .map((section) => ({
      section,
      cards: cards.filter((card) => card.region === region && card.section === section.id),
    }))
    .filter((group) => group.cards.length > 0);
}

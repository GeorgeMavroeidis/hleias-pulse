/**
 * Cultural events domain types (theater, concerts, festivals).
 *
 * Ticketing is deliberately out of scope: the "buy tickets" action always
 * redirects to an external ticket_url. There is no payment flow here.
 */

export type CulturalEventType = "theater" | "concert" | "festival" | "other";

export type OrganizerVerificationStatus = "pending" | "verified" | "rejected";

export interface CulturalEvent {
  id: string;
  title: string;
  greekTitle: string;
  eventType: CulturalEventType;
  venueName: string;
  area: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  eventDate: string;
  organizerName: string;
  organizerId: string | null;
  descriptionEl: string;
  descriptionEn: string | null;
  posterUrl: string;
  ticketUrl: string | null;
  isPastEvent: boolean;
  isOfficial: boolean;
  likesCount: number;
  moderationStatus?: string;
  userId?: string | null;
  createdAt: string;
}

export interface CreateCulturalEventInput {
  title: string;
  greekTitle: string;
  eventType: CulturalEventType;
  venueName: string;
  area: string;
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  eventDate: string;
  descriptionEl: string;
  descriptionEn?: string;
  posterUrl: string;
  ticketUrl?: string;
}

export interface OrganizerStatus {
  id: string;
  displayName: string;
  bio: string;
  verificationStatus: OrganizerVerificationStatus;
}

export const CULTURAL_EVENT_TYPE_META: Record<
  CulturalEventType,
  { label: { GR: string; EN: string }; short: string; tone: string }
> = {
  theater: {
    label: { GR: "Θέατρο", EN: "Theater" },
    short: "THEATER",
    tone: "var(--hp-purple)",
  },
  concert: {
    label: { GR: "Συναυλία", EN: "Concert" },
    short: "MUSIC",
    tone: "var(--hp-sunset)",
  },
  festival: {
    label: { GR: "Φεστιβάλ", EN: "Festival" },
    short: "FEST",
    tone: "var(--hp-olive)",
  },
  other: {
    label: { GR: "Εκδήλωση", EN: "Event" },
    short: "EVENT",
    tone: "var(--hp-deep)",
  },
};

export const CULTURAL_EVENT_TYPES = Object.keys(CULTURAL_EVENT_TYPE_META) as CulturalEventType[];

export const DEFAULT_ORGANIZER_BIO = "Cultural events organizer in Ilia.";

export type { Lang } from "./i18n";
export { tr } from "./i18n";

export const CULTURAL_EVENTS_STRINGS = {
  screenTitle: { GR: "Πολιτιστικές Εκδηλώσεις", EN: "Cultural Events" },
  screenSubtitle: {
    GR: "Θέατρο, συναυλίες και φεστιβάλ στην Ηλεία.",
    EN: "Theater, concerts, and festivals in Ilia.",
  },
  upcoming: { GR: "Επερχόμενες", EN: "Upcoming" },
  past: { GR: "Παλιότερες", EN: "Past" },
  emptyTitle: { GR: "Καμία εκδήλωση εδώ", EN: "No events here" },
  emptyBody: {
    GR: "Δοκίμασε άλλο φίλτρο, ή ξαναέλα σύντομα.",
    EN: "Try another filter, or check back soon.",
  },
  addEvent: { GR: "Νέα εκδήλωση", EN: "New event" },
  buyTickets: { GR: "Αγορά εισιτηρίων", EN: "Buy tickets" },
  comingSoon: { GR: "Σύντομα διαθέσιμο", EN: "Coming soon" },
  officialEvent: { GR: "Επίσημη εκδήλωση", EN: "Official event" },
  completed: { GR: "Ολοκληρώθηκε", EN: "Completed" },
  today: { GR: "Σήμερα", EN: "Today" },
  tomorrow: { GR: "Αύριο", EN: "Tomorrow" },
  comments: { GR: "Σχόλια", EN: "Comments" },
  firstComment: { GR: "Γράψε το πρώτο σχόλιο.", EN: "Be the first to comment." },
  quickComment: { GR: "Γράψε ένα σχόλιο…", EN: "Quick comment…" },
  openOnMap: { GR: "Άνοιγμα στον χάρτη", EN: "Open on map" },
  close: { GR: "Κλείσιμο", EN: "Close" },
  newCulturalEvent: { GR: "Νέα πολιτιστική εκδήλωση", EN: "New cultural event" },
  reviewNotice: {
    GR: "Θα εμφανιστεί μετά από έγκριση από την ομάδα.",
    EN: "It will appear after the team approves it.",
  },
  titleField: { GR: "Τίτλος", EN: "Title" },
  greekTitleField: { GR: "Ελληνικός τίτλος", EN: "Greek title" },
  venueField: { GR: "Χώρος", EN: "Venue" },
  areaField: { GR: "Περιοχή", EN: "Area" },
  descriptionElField: { GR: "Περιγραφή (Ελληνικά)", EN: "Description (Greek)" },
  descriptionEnField: {
    GR: "Περιγραφή (Αγγλικά, προαιρετικό)",
    EN: "Description (English, optional)",
  },
  ticketUrlField: { GR: "Ticket URL (προαιρετικό)", EN: "Ticket URL (optional)" },
  submitForReview: { GR: "Υποβολή για έγκριση", EN: "Submit for review" },
  submitting: { GR: "Υποβολή…", EN: "Submitting…" },
} as const satisfies Record<string, { GR: string; EN: string }>;

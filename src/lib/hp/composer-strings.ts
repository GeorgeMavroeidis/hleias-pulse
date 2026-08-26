import type { Lang } from "./i18n";

type Dict = Record<string, { GR: string; EN: string }>;

export const COMPOSER_STRINGS = {
  closeComposer: { GR: "Κλείσιμο δημιουργίας", EN: "Close post composer" },
  addToApp: { GR: "Προσθήκη στο ΗΛΕΙΑ PULSE", EN: "Add to ΗΛΕΙΑ PULSE" },
  dialogLabel: { GR: "Δημιουργία τοπικής ανάρτησης ή μέρους", EN: "Create local post or place" },

  identityWillBeStored: {
    GR: "Η ταυτότητα του προφίλ σου θα αποθηκευτεί με αυτή τη συνεισφορά",
    EN: "Profile identity will be stored with this contribution",
  },
  signInToPost: { GR: "Συνδέσου για να δημοσιεύσεις", EN: "Sign in to post" },
  savesCanBePrivate: {
    GR: "Οι αποθηκεύσεις μπορούν να είναι ιδιωτικές, δημόσιες αναρτήσεις χρειάζονται προφίλ",
    EN: "Saves can be private, public posts need a profile",
  },
  signIn: { GR: "Σύνδεση", EN: "Sign in" },

  postingAs: { GR: "Δημοσίευση ως", EN: "Posting as" },
  location: { GR: "Τοποθεσία", EN: "Location" },
  vibe: { GR: "Ατμόσφαιρα", EN: "Vibe" },
  postTextLabel: { GR: "Κείμενο ανάρτησης", EN: "Post text" },
  postTextPlaceholder: {
    GR: "Τι συμβαίνει σε αυτό το μέρος;…",
    EN: "What's happening at this place?…",
  },
  saving: { GR: "Αποθήκευση…", EN: "Saving…" },
  post: { GR: "Δημοσίευση", EN: "Post" },

  placeName: { GR: "Όνομα μέρους", EN: "Place name" },
  area: { GR: "Περιοχή", EN: "Area" },
  type: { GR: "Τύπος", EN: "Type" },
  lat: { GR: "Γεωγρ. πλάτος", EN: "Lat" },
  lng: { GR: "Γεωγρ. μήκος", EN: "Lng" },
  photoUrl: { GR: "URL φωτογραφίας", EN: "Photo URL" },
  descriptionLabel: { GR: "Περιγραφή", EN: "Description" },
  descriptionPlaceholder: { GR: "Τι πρέπει να ξέρουν οι ντόπιοι;…", EN: "What should locals know?…" },
  tags: { GR: "Ετικέτες", EN: "Tags" },
  tagsPlaceholderPlace: { GR: "παραλία, ήσυχο, ηλιοβασίλεμα", EN: "beach, quiet, sunset" },
  crowd: { GR: "Κόσμος", EN: "Crowd" },
  budget: { GR: "Προϋπολογισμός", EN: "Budget" },
  bestTime: { GR: "Καλύτερη ώρα", EN: "Best time" },
  savePlace: { GR: "Αποθήκευση μέρους", EN: "Save place" },

  storyPreviewHint: {
    GR: "Εμφανίζεται πλήρης οθόνη, 9:16. Πρόσθεσε τη δική σου φωτογραφία αργότερα — αυτή η προεπισκόπηση χρησιμοποιεί τη φωτογραφία του μέρους.",
    EN: "Shows full-screen, 9:16. Swap in your own photo later — this previews with the place image.",
  },
  storyCaptionLabel: { GR: "Λεζάντα ιστορίας", EN: "Story caption" },
  storyCaptionPlaceholder: {
    GR: "Τι συμβαίνει εδώ αυτή τη στιγμή;…",
    EN: "What's happening here right now?…",
  },
  photo: { GR: "Φωτογραφία", EN: "Photo" },
  liveReport: { GR: "Ζωντανή αναφορά", EN: "Live report" },
  parking: { GR: "Στάθμευση", EN: "Parking" },
  condition: { GR: "Κατάσταση", EN: "Condition" },
  visibleFor: { GR: "Ορατό για", EN: "Visible for" },
  keepTip: { GR: "Μόνιμη συμβουλή", EN: "Keep tip" },
  postStory: { GR: "Δημοσίευση ιστορίας", EN: "Post story" },

  hostingAt: { GR: "Πραγματοποιείται στο", EN: "Hosting at" },
  gatheringTitle: { GR: "Τίτλος συνάντησης", EN: "Gathering title" },
  gatheringTitlePlaceholder: {
    GR: "Ηλιοβασίλεμα στη θάλασσα, tips για καφέ, ζωντανή μουσική...",
    EN: "Sunset swim, coffee tips, live music...",
  },
  when: { GR: "Πότε", EN: "When" },
  price: { GR: "Τιμή", EN: "Price" },
  capacity: { GR: "Χωρητικότητα", EN: "Capacity" },
  optional: { GR: "Προαιρετικό", EN: "Optional" },
  tagsPlaceholderEvent: { GR: "ηλιοβασίλεμα, τοπικό, δωρεάν", EN: "sunset, local, free" },
  gatheringDescriptionLabel: { GR: "Περιγραφή συνάντησης", EN: "Gathering description" },
  gatheringDescriptionPlaceholder: {
    GR: "Τι πρέπει να ξέρουν πριν συμμετάσχουν;",
    EN: "What should people know before they join?",
  },
  hosting: { GR: "Δημιουργία…", EN: "Hosting..." },
  hostGathering: { GR: "Δημιουργία συνάντησης", EN: "Host gathering" },

  errorCompleteProfile: {
    GR: "Ολοκλήρωσε το προφίλ σου πριν δημοσιεύσεις.",
    EN: "Complete your profile before posting.",
  },
  errorSignInBeforePosting: { GR: "Συνδέσου πριν δημοσιεύσεις.", EN: "Sign in before posting." },
  errorSavePost: { GR: "Δεν ήταν δυνατή η αποθήκευση της ανάρτησης. Δοκίμασε ξανά.", EN: "Could not save post. Try again." },
  errorPlaceFields: {
    GR: "Συμπλήρωσε το όνομα, την περιοχή, την περιγραφή και το URL φωτογραφίας.",
    EN: "Fill the place name, area, description, and photo URL.",
  },
  errorLatLng: { GR: "Χρησιμοποίησε έγκυρο γεωγραφικό πλάτος και μήκος.", EN: "Use valid latitude and longitude." },
  errorSavePlace: { GR: "Δεν ήταν δυνατή η αποθήκευση του μέρους. Δοκίμασε ξανά.", EN: "Could not save place. Try again." },
  errorSaveStory: { GR: "Δεν ήταν δυνατή η αποθήκευση της ιστορίας. Δοκίμασε ξανά.", EN: "Could not save story. Try again." },
  errorEventFields: {
    GR: "Πρόσθεσε τίτλο, μέρος και σύντομη περιγραφή.",
    EN: "Add a title, place, and short description.",
  },
  errorEventDate: { GR: "Επίλεξε έγκυρη ημερομηνία και ώρα.", EN: "Choose a valid date and time." },
  errorEventCapacity: {
    GR: "Η χωρητικότητα πρέπει να είναι κενή ή τουλάχιστον 2.",
    EN: "Capacity must be empty or at least 2.",
  },
  errorHostGathering: { GR: "Δεν ήταν δυνατή η δημιουργία της συνάντησης. Δοκίμασε ξανά.", EN: "Could not host this gathering. Try again." },

  searchPlaceLocation: { GR: "Αναζήτηση τοποθεσίας ανάρτησης", EN: "Search post location" },
  searchLocationPlaceholder: {
    GR: "Αναζήτηση τοποθεσίας, περιοχής, ετικέτας...",
    EN: "Search location, area, tag...",
  },
  selected: { GR: "Επιλεγμένο", EN: "Selected" },
  locations: { GR: "Τοποθεσίες", EN: "Locations" },
  noLocationMatch: { GR: "Καμία τοποθεσία δεν ταιριάζει με αυτή την αναζήτηση.", EN: "No location matches that search." },
} as const satisfies Dict;

export const COMPOSER_MODE_LABELS: Record<"post" | "place" | "story" | "event", { GR: string; EN: string }> = {
  post: { GR: "Ανάρτηση", EN: "Post" },
  place: { GR: "Μέρος", EN: "Place" },
  story: { GR: "Ιστορία", EN: "Story" },
  event: { GR: "Συνάντηση", EN: "Event" },
};

export const POSTING_IDENTITY_LABELS: Record<"LOCAL" | "TOURIST" | "GUIDE", { GR: string; EN: string }> = {
  LOCAL: { GR: "Ντόπιος", EN: "Local" },
  TOURIST: { GR: "Τουρίστας", EN: "Tourist" },
  GUIDE: { GR: "Ξεναγός", EN: "Guide" },
};

export const POSTING_IDENTITY_HELPERS: Record<"LOCAL" | "TOURIST" | "GUIDE", { GR: string; EN: string }> = {
  LOCAL: { GR: "Ξέρω την περιοχή", EN: "I know the area" },
  TOURIST: { GR: "Επισκέπτομαι", EN: "I am visiting" },
  GUIDE: { GR: "Μπορώ να προτείνω", EN: "I can recommend" },
};

export const CROWD_OPTION_LABELS: Record<"low" | "medium" | "high", { GR: string; EN: string }> = {
  low: { GR: "χαμηλός", EN: "low" },
  medium: { GR: "μέτριος", EN: "medium" },
  high: { GR: "υψηλός", EN: "high" },
};

export const BUDGET_OPTION_LABELS: Record<"free" | "€" | "€€" | "€€€", { GR: string; EN: string }> = {
  free: { GR: "δωρεάν", EN: "free" },
  "€": { GR: "€", EN: "€" },
  "€€": { GR: "€€", EN: "€€" },
  "€€€": { GR: "€€€", EN: "€€€" },
};

export const PARKING_OPTION_LABELS: Record<"easy" | "tight" | "full", { GR: string; EN: string }> = {
  easy: { GR: "εύκολη", EN: "easy" },
  tight: { GR: "δύσκολη", EN: "tight" },
  full: { GR: "γεμάτη", EN: "full" },
};

export const STORY_CONDITION_LABELS: Record<"clean" | "windy" | "busy" | "quiet" | "event", { GR: string; EN: string }> = {
  clean: { GR: "καθαρά", EN: "clean" },
  windy: { GR: "αέρας", EN: "windy" },
  busy: { GR: "κίνηση", EN: "busy" },
  quiet: { GR: "ησυχία", EN: "quiet" },
  event: { GR: "εκδήλωση", EN: "event" },
};

export const PLACE_TYPE_LABELS: Record<
  "beach" | "culture" | "nature" | "food" | "local" | "village" | "night" | "sunset",
  { GR: string; EN: string }
> = {
  beach: { GR: "παραλία", EN: "beach" },
  culture: { GR: "πολιτισμός", EN: "culture" },
  nature: { GR: "φύση", EN: "nature" },
  food: { GR: "φαγητό", EN: "food" },
  local: { GR: "τοπικό", EN: "local" },
  village: { GR: "χωριό", EN: "village" },
  night: { GR: "βραδινό", EN: "night" },
  sunset: { GR: "ηλιοβασίλεμα", EN: "sunset" },
};

export function usingPlaceImageLabel(lang: Lang, name: string) {
  return lang === "GR" ? `Χρήση φωτογραφίας ${name}` : `Using ${name} image`;
}

export function storyPhotoUsingLabel(lang: Lang, name: string) {
  return lang === "GR" ? `Φωτογραφία ιστορίας · με φωτογραφία ${name}` : `Story photo · using ${name} image`;
}

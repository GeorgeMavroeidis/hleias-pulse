import type { Lang } from "./i18n";

type Dict = Record<string, { GR: string; EN: string }>;

export const ACCOUNT_BUBBLE_STRINGS = {
  openAccountSettings: { GR: "Άνοιγμα ρυθμίσεων λογαριασμού", EN: "Open account settings" },
  signIn: { GR: "Σύνδεση", EN: "Sign in" },
} as const satisfies Dict;

export const PROFILE_IDENTITY_LABELS: Record<"LOCAL" | "TOURIST" | "GUIDE", { GR: string; EN: string }> = {
  LOCAL: { GR: "Ντόπιος", EN: "Local" },
  TOURIST: { GR: "Τουρίστας", EN: "Tourist" },
  GUIDE: { GR: "Ξεναγός", EN: "Guide" },
};

export const PROFILE_IDENTITY_HELPERS: Record<"LOCAL" | "TOURIST" | "GUIDE", { GR: string; EN: string }> = {
  LOCAL: { GR: "Σήμα περιοχής", EN: "Area signal" },
  TOURIST: { GR: "Προβολή επισκέπτη", EN: "Visitor view" },
  GUIDE: { GR: "Προτάσεις και διαδρομές", EN: "Recs and routes" },
};

export const ACCOUNT_IDENTITY_LABELS: Record<"LOCAL" | "TOURIST" | "GUIDE" | "BUSINESS", { GR: string; EN: string }> = {
  LOCAL: { GR: "ΝΤΌΠΙΟΣ", EN: "LOCAL" },
  TOURIST: { GR: "ΤΟΥΡΊΣΤΑΣ", EN: "TOURIST" },
  GUIDE: { GR: "ΞΕΝΑΓΌΣ", EN: "GUIDE" },
  BUSINESS: { GR: "ΕΠΙΧΕΊΡΗΣΗ", EN: "BUSINESS" },
};

export const AUTH_SHEET_STRINGS = {
  closeAuthentication: { GR: "Κλείσιμο σύνδεσης", EN: "Close authentication" },
  signInTitle: { GR: "Σύνδεση", EN: "Sign in" },
  createProfileTitle: { GR: "Δημιουργία προφίλ", EN: "Create profile" },
  subtitle: { GR: "Οι αναρτήσεις και τα σχόλια θα χρησιμοποιούν αυτή την ταυτότητα.", EN: "Posts and comments will use this identity." },
  signInTab: { GR: "Σύνδεση", EN: "Sign in" },
  newTab: { GR: "Νέος λογαριασμός", EN: "New" },
  displayName: { GR: "Όνομα εμφάνισης", EN: "Display name" },
  handle: { GR: "Όνομα χρήστη", EN: "Handle" },
  defaultIdentity: { GR: "Προεπιλεγμένη ταυτότητα", EN: "Default identity" },
  displayNamePlaceholder: { GR: "Θόδωρος από τον Πύργο", EN: "Theo from Pyrgos" },
  handlePlaceholder: { GR: "ilia.local", EN: "ilia.local" },
  email: { GR: "Email", EN: "Email" },
  emailPlaceholder: { GR: "you@example.com", EN: "you@example.com" },
  password: { GR: "Κωδικός", EN: "Password" },
  passwordPlaceholder: { GR: "Τουλάχιστον 6 χαρακτήρες", EN: "Minimum 6 characters" },
  working: { GR: "Επεξεργασία…", EN: "Working..." },
  createAccount: { GR: "Δημιουργία λογαριασμού", EN: "Create account" },
  errorDisplayNameLength: { GR: "Χρησιμοποίησε όνομα εμφάνισης με τουλάχιστον 2 χαρακτήρες.", EN: "Use a display name with at least 2 characters." },
  errorHandleLength: { GR: "Χρησιμοποίησε όνομα χρήστη με τουλάχιστον 3 γράμματα, αριθμούς, τελείες ή κάτω παύλες.", EN: "Use a handle with at least 3 letters, numbers, dots, or underscores." },
  errorAutoSignInFailed: { GR: "Ο λογαριασμός δημιουργήθηκε, αλλά η αυτόματη σύνδεση απέτυχε. Δοκίμασε να συνδεθείς.", EN: "Account created, but automatic sign-in failed. Try signing in." },
  errorAuthFailed: { GR: "Η ταυτοποίηση απέτυχε.", EN: "Authentication failed." },
  errorAuthDidNotStart: { GR: "Η ταυτοποίηση δεν ξεκίνησε. Δοκίμασε να συνδεθείς ξανά.", EN: "Authentication did not start. Try signing in again." },
} as const satisfies Dict;

export const ORGANIZER_SECTION_STRINGS = {
  verifiedOrganizer: { GR: "Επαληθευμένος διοργανωτής", EN: "Verified organizer" },
  submitCulturalEvent: { GR: "Υποβολή πολιτιστικής εκδήλωσης", EN: "Submit a cultural event" },
  pendingApproval: { GR: "Το αίτημά σου να γίνεις Organizer εκδηλώσεων είναι σε αναμονή έγκρισης.", EN: "Your request to become an events organizer is pending approval." },
  promptTitle: { GR: "Διοργανώνεις εκδηλώσεις;", EN: "Do you organize events?" },
  promptBody: { GR: "Γίνε Organizer για να υποβάλλεις θεατρικές παραστάσεις, συναυλίες και φεστιβάλ.", EN: "Become an organizer to submit theater shows, concerts, and festivals." },
  rejected: { GR: "Το προηγούμενο αίτημά σου απορρίφθηκε.", EN: "Your previous request was rejected." },
  errorSendApplication: { GR: "Δεν ήταν δυνατή η αποστολή της αίτησης.", EN: "Could not send application." },
  submitting: { GR: "Υποβολή…", EN: "Submitting…" },
  becomeOrganizer: { GR: "Γίνε Organizer", EN: "Become an organizer" },
} as const satisfies Dict;

export function openTeamToolsLabel(lang: Lang, role: string) {
  return lang === "GR" ? `Άνοιγμα εργαλείων ομάδας · ${role}` : `Open team tools · ${role}`;
}

export const ACCOUNT_SHEET_STRINGS = {
  closeAccountSettings: { GR: "Κλείσιμο ρυθμίσεων λογαριασμού", EN: "Close account settings" },
  accountSettingsDialog: { GR: "Ρυθμίσεις λογαριασμού", EN: "Account settings" },
  completeProfile: { GR: "Ολοκλήρωση προφίλ", EN: "Complete profile" },
  account: { GR: "Λογαριασμός", EN: "Account" },
  subtitle: { GR: "Η ορατή ταυτότητά σου σε αναρτήσεις και σχόλια.", EN: "Your visible identity across posts and comments." },
  signInToCreateProfile: { GR: "Συνδέσου για να δημιουργήσεις προφίλ", EN: "Sign in to create a profile" },
  savedCanStayPrivate: { GR: "Οι αποθηκεύσεις μπορούν να μείνουν ιδιωτικές, αλλά η δημοσίευση χρειάζεται πραγματικό προφίλ.", EN: "Saved items can stay private, but posting needs a real profile." },
  signIn: { GR: "Σύνδεση", EN: "Sign in" },
  uploadProfileImage: { GR: "Μεταφόρτωση φωτογραφίας προφίλ", EN: "Upload profile image" },
  adminWorkspace: { GR: "Χώρος εργασίας διαχειριστή", EN: "Admin workspace" },
  postingIdentity: { GR: "Ταυτότητα δημοσίευσης", EN: "Posting identity" },
  homeArea: { GR: "Περιοχή κατοικίας", EN: "Home area" },
  homeAreaPlaceholder: { GR: "Πύργος, Κατάκολο, Αρχαία Ολυμπία...", EN: "Pyrgos, Katakolo, Ancient Olympia..." },
  bio: { GR: "Βιογραφικό", EN: "Bio" },
  bioPlaceholder: { GR: "Μια γραμμή για το γούστο σου στην Ηλεία.", EN: "One line about your Ilia taste." },
  posts: { GR: "Αναρτήσεις", EN: "Posts" },
  tips: { GR: "Συμβουλές", EN: "Tips" },
  going: { GR: "Έρχομαι", EN: "Going" },
  routes: { GR: "Διαδρομές", EN: "Routes" },
  saved: { GR: "Αποθηκευμένα", EN: "Saved" },
  profileSaved: { GR: "Το προφίλ αποθηκεύτηκε.", EN: "Profile saved." },
  errorDisplayNameLength: { GR: "Χρησιμοποίησε όνομα εμφάνισης με τουλάχιστον 2 χαρακτήρες.", EN: "Use a display name with at least 2 characters." },
  errorHandleLength: { GR: "Χρησιμοποίησε όνομα χρήστη με τουλάχιστον 3 γράμματα, αριθμούς, τελείες ή κάτω παύλες.", EN: "Use a handle with at least 3 letters, numbers, dots, or underscores." },
  errorSaveProfile: { GR: "Δεν ήταν δυνατή η αποθήκευση του προφίλ.", EN: "Could not save profile." },
  errorSignOut: { GR: "Δεν ήταν δυνατή η αποσύνδεση.", EN: "Could not sign out." },
  saving: { GR: "Αποθήκευση…", EN: "Saving..." },
  saveProfile: { GR: "Αποθήκευση προφίλ", EN: "Save profile" },
  signOut: { GR: "Αποσύνδεση", EN: "Sign out" },
  signedIn: { GR: "Συνδεδεμένος", EN: "Signed in" },
} as const satisfies Dict;

export function savedSummaryLabel(lang: Lang, placeCount: number, postCount: number, routeCount: number) {
  if (lang === "GR") {
    const places = `${placeCount} ${placeCount === 1 ? "μέρος" : "μέρη"}`;
    const posts = `${postCount} ${postCount === 1 ? "ανάρτηση" : "αναρτήσεις"}`;
    const routes = `${routeCount} ${routeCount === 1 ? "διαδρομή" : "διαδρομές"}`;
    return `${places} · ${posts} · ${routes}`;
  }
  const places = `${placeCount} place${placeCount === 1 ? "" : "s"}`;
  const posts = `${postCount} post${postCount === 1 ? "" : "s"}`;
  const routes = `${routeCount} route${routeCount === 1 ? "" : "s"}`;
  return `${places} · ${posts} · ${routes}`;
}

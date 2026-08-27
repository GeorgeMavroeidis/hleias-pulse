import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppLanguage = "GR" | "EN";
export type TranslationParams = Record<string, string | number>;

const STORAGE_KEY = "ilia-pulse-language";

const EL: Record<string, string> = {
  "Local spots, routes, and tips.": "Τοπικά σημεία, διαδρομές και συμβουλές.",
  "Open search": "Άνοιγμα αναζήτησης",
  "Close search": "Κλείσιμο αναζήτησης",
  "Toggle language": "Αλλαγή γλώσσας",
  Map: "Χάρτης",
  Pulse: "Ροή",
  Routes: "Διαδρομές",
  Meet: "Συναντήσεις",
  Saved: "Αποθηκευμένα",
  "Tonight's pulse": "Ο παλμός της βραδιάς",
  "Tap a bubble to see what's happening.": "Πάτησε ένα σημείο για να δεις τι συμβαίνει.",
  "Search routes, budget, area...": "Αναζήτησε διαδρομές, κόστος ή περιοχή…",
  "Search routes": "Αναζήτηση διαδρομών",
  "No routes match": "Δεν βρέθηκαν διαδρομές",
  "Try another filter or search term.": "Δοκίμασε διαφορετικό φίλτρο ή αναζήτηση.",
  "Curated local routes with practical stops.":
    "Επιλεγμένες τοπικές διαδρομές με χρήσιμες στάσεις.",
  "Your private little list.": "Η προσωπική σου λίστα.",
  "Nothing saved yet": "Δεν έχεις αποθηκεύσει κάτι ακόμη",
  "Save places, posts, and routes to find them here.":
    "Αποθήκευσε σημεία, δημοσιεύσεις και διαδρομές για να τα βρεις εδώ.",
  "Add a local note…": "Πρόσθεσε μια τοπική σημείωση…",
  "Quick comment…": "Γρήγορο σχόλιο…",
  Comments: "Σχόλια",
  Share: "Κοινοποίηση",
  Directions: "Οδηγίες",
  Close: "Κλείσιμο",
  Save: "Αποθήκευση",
  Unsave: "Αφαίρεση από αποθηκευμένα",
  Like: "Μου αρέσει",
  Unlike: "Αφαίρεση μου αρέσει",
  Continue: "Συνέχεια",
  Skip: "Παράλειψη",
  Finish: "Ολοκλήρωση",
  "Feel the pulse": "Νιώσε τον παλμό",
  "See what's hot right now — beaches, sunsets, village nights and panigyri, live.":
    "Δες τι συμβαίνει τώρα — παραλίες, ηλιοβασιλέματα, βραδιές στα χωριά και πανηγύρια.",
  "Discover around you": "Ανακάλυψε γύρω σου",
  "We show what's moving nearby, so you never miss the thing happening tonight.":
    "Βρες τι συμβαίνει κοντά σου, για να μη χάνεις όσα γίνονται σήμερα.",
  "Meet up, easily": "Συναντηθείτε εύκολα",
  "RSVP to gatherings or host your own. Say you're in — see who's going.":
    "Δήλωσε συμμετοχή ή οργάνωσε τη δική σου συνάντηση και δες ποιοι έρχονται.",
  "What's your vibe?": "Ποιο είναι το vibe σου;",
  "Pick a few — we'll tune your feed.": "Διάλεξε μερικά για να προσαρμόσουμε τη ροή σου.",
  "Loading vibes…": "Φόρτωση επιλογών…",
  "Location on": "Η τοποθεσία ενεργοποιήθηκε",
  "Enable location": "Ενεργοποίηση τοποθεσίας",
  "Enter ΗΛΕΙΑ PULSE": "Μπες στο ΗΛΕΙΑ PULSE",
  Mine: "Τα δικά μου",
  "Gatherings & plans — say you're in.": "Συναντήσεις και σχέδια — δήλωσε συμμετοχή.",
  "Nothing planned yet": "Δεν έχεις προγραμματίσει κάτι",
  "No gatherings here": "Δεν υπάρχουν συναντήσεις εδώ",
  "RSVP to something, or host your own — a swim, a coffee, a panigyri.":
    "Δήλωσε συμμετοχή ή οργάνωσε κάτι δικό σου — μπάνιο, καφέ ή πανηγύρι.",
  "Be the first to host something in this vibe.":
    "Γίνε ο πρώτος που οργανώνει κάτι σε αυτή την κατηγορία.",
  Host: "Δημιουργία",
  "Host a gathering": "Δημιουργία συνάντησης",
  "Sign in": "Σύνδεση",
  "Create profile": "Δημιουργία προφίλ",
  "Create account": "Δημιουργία λογαριασμού",
  New: "Νέος λογαριασμός",
  "Posts and comments will use this identity.":
    "Οι δημοσιεύσεις και τα σχόλια θα χρησιμοποιούν αυτή την ταυτότητα.",
  "Display name": "Εμφανιζόμενο όνομα",
  Handle: "Όνομα χρήστη",
  "Default identity": "Προεπιλεγμένη ταυτότητα",
  Email: "Email",
  Password: "Κωδικός πρόσβασης",
  "Minimum 6 characters": "Τουλάχιστον 6 χαρακτήρες",
  "Working...": "Γίνεται επεξεργασία…",
  Local: "Ντόπιος",
  Tourist: "Επισκέπτης",
  Guide: "Οδηγός",
  Business: "Επιχείρηση",
  "Area signal": "Γνώση της περιοχής",
  "Visitor view": "Ματιά επισκέπτη",
  "Recs and routes": "Προτάσεις και διαδρομές",
  "Use a display name with at least 2 characters.":
    "Χρησιμοποίησε όνομα με τουλάχιστον 2 χαρακτήρες.",
  "Use a handle with at least 3 letters, numbers, dots, or underscores.":
    "Το όνομα χρήστη χρειάζεται τουλάχιστον 3 γράμματα, αριθμούς, τελείες ή κάτω παύλες.",
  "Account created. Check your email to confirm it, then sign in.":
    "Ο λογαριασμός δημιουργήθηκε. Επιβεβαίωσε το email σου και μετά συνδέσου.",
  "This account needs email verification before it can sign in.":
    "Αυτός ο λογαριασμός χρειάζεται επιβεβαίωση email πριν συνδεθεί.",
  "Account settings": "Ρυθμίσεις λογαριασμού",
  "Sign in to create a profile": "Συνδέσου για να δημιουργήσεις προφίλ",
  "Your saves and contributions will sync across devices.":
    "Τα αποθηκευμένα και οι συνεισφορές σου θα συγχρονίζονται σε όλες τις συσκευές.",
  Profile: "Προφίλ",
  "Home area": "Περιοχή κατοικίας",
  Bio: "Σύντομη περιγραφή",
  "Profile saved.": "Το προφίλ αποθηκεύτηκε.",
  "Save profile": "Αποθήκευση προφίλ",
  "Sign out": "Αποσύνδεση",
  "Complete your profile first": "Ολοκλήρωσε πρώτα το προφίλ σου",
  "Share opened": "Άνοιξε η κοινοποίηση",
  "Link copied": "Ο σύνδεσμος αντιγράφηκε",
  "Could not share link": "Δεν ήταν δυνατή η κοινοποίηση",
  "Removed from saved": "Αφαιρέθηκε από τα αποθηκευμένα",
  "Could not save": "Δεν ήταν δυνατή η αποθήκευση",
  "Comment posted": "Το σχόλιο δημοσιεύτηκε",
  "Could not post comment": "Δεν ήταν δυνατή η δημοσίευση του σχολίου",
  "Post saved": "Η δημοσίευση αποθηκεύτηκε",
  "Place saved": "Το σημείο αποθηκεύτηκε",
  "Story added": "Το story προστέθηκε",
  "Gathering hosted": "Η συνάντηση δημιουργήθηκε",
  "RSVP removed": "Η συμμετοχή αφαιρέθηκε",
  "You are in": "Συμμετέχεις",
  "Marked maybe": "Σημειώθηκε ως ίσως",
  "Could not save RSVP": "Δεν ήταν δυνατή η αποθήκευση συμμετοχής",
  "No gathering there yet": "Δεν υπάρχει συνάντηση εκεί ακόμη",
  "Route opened on map": "Η διαδρομή άνοιξε στον χάρτη",
  "Location is not available": "Η τοποθεσία δεν είναι διαθέσιμη",
  "Location enabled": "Η τοποθεσία ενεργοποιήθηκε",
  "Location skipped": "Η τοποθεσία παραλείφθηκε",
  "Drop a new spot": "Πρόσθεσε νέο σημείο",
  "Loading pulse data…": "Φόρτωση δεδομένων…",
  "Could not load pulse data.": "Δεν ήταν δυνατή η φόρτωση των δεδομένων.",
  "Try again": "Δοκιμή ξανά",
  "Add to ΗΛΕΙΑ PULSE": "Πρόσθεσε στο ΗΛΕΙΑ PULSE",
  "What's happening at this place?…": "Τι συμβαίνει σε αυτό το μέρος;…",
  "What should locals know?…": "Τι πρέπει να γνωρίζουν οι ντόπιοι;…",
  "What's happening here right now?…": "Τι συμβαίνει εδώ τώρα;…",
  "Keep tip": "Διατήρηση συμβουλής",
  "Sunset swim, coffee tips, live music...": "Μπάνιο στο ηλιοβασίλεμα, καφές, ζωντανή μουσική…",
  "What should people know before they join?": "Τι πρέπει να γνωρίζουν πριν συμμετάσχουν;",
  "Page not found": "Η σελίδα δεν βρέθηκε",
  "The page you're looking for doesn't exist or has been moved.":
    "Η σελίδα που αναζητάς δεν υπάρχει ή έχει μετακινηθεί.",
  "Go home": "Επιστροφή στην αρχική",
  "This page didn't load": "Η σελίδα δεν φορτώθηκε",
  "Something went wrong on our end. You can try refreshing or head back home.":
    "Κάτι πήγε στραβά. Δοκίμασε ξανά ή επέστρεψε στην αρχική.",
  Overview: "Επισκόπηση",
  Places: "Σημεία",
  Stories: "Stories",
  "Meet events": "Συναντήσεις",
  Moderation: "Έλεγχος περιεχομένου",
  Team: "Ομάδα",
  "Admin workspace": "Χώρος διαχείρισης",
  "Sign in first": "Συνδέσου πρώτα",
  "No admin access": "Δεν έχεις πρόσβαση διαχειριστή",
  "Loading admin workspace…": "Φόρτωση χώρου διαχείρισης…",
  "Needs review": "Χρειάζονται έλεγχο",
  "Published items": "Δημοσιευμένα",
  "Map places": "Σημεία χάρτη",
  "Admin members": "Μέλη διαχείρισης",
  "Recent admin activity": "Πρόσφατη δραστηριότητα διαχείρισης",
  "Safe publishing workflow": "Ασφαλής ροή δημοσίευσης",
  "Search places, areas, types…": "Αναζήτηση σημείων, περιοχών ή τύπων…",
  "Edit place": "Επεξεργασία σημείου",
  "New place": "Νέο σημείο",
  "Edit story": "Επεξεργασία story",
  "New story": "Νέο story",
  "Edit Meet event": "Επεξεργασία συνάντησης",
  "New Meet event": "Νέα συνάντηση",
  "Edit route": "Επεξεργασία διαδρομής",
  "New route": "Νέα διαδρομή",
  Search: "Αναζήτηση",
  Publish: "Δημοσίευση",
  Hide: "Απόκρυψη",
  Pending: "Σε αναμονή",
  Published: "Δημοσιευμένο",
  Hidden: "Κρυφό",
  "Add an existing user": "Προσθήκη υπάρχοντος χρήστη",
  "Member role": "Ρόλος μέλους",
  "Remove member": "Αφαίρεση μέλους",
  "Remove this admin member?": "Να αφαιρεθεί αυτό το μέλος από τη διαχείριση;",
  "No team members yet.": "Δεν υπάρχουν ακόμη μέλη διαχείρισης.",
  "A user must have signed in and completed a profile once before appearing here.":
    "Ο χρήστης πρέπει πρώτα να έχει συνδεθεί και να έχει ολοκληρώσει το προφίλ του.",
  "Add to team": "Προσθήκη στην ομάδα",
  "profile incomplete": "μη ολοκληρωμένο προφίλ",
  "Click the map or drag the pin to set the exact location.":
    "Πάτησε στον χάρτη ή σύρε την καρφίτσα για να ορίσεις την ακριβή θέση.",
  "Page {page} of {pages}": "Σελίδα {page} από {pages}",
  All: "Όλα",
  place: "σημείο",
  post: "δημοσίευση",
  comment: "σχόλιο",
  story: "story",
  "meet event": "συνάντηση",
  "No content yet.": "Δεν υπάρχει περιεχόμενο ακόμη.",
  "Image URL": "URL εικόνας",
  Time: "Ώρα",
  "Stop title": "Τίτλος στάσης",
  Stops: "Στάσεις",
  Description: "Περιγραφή",
  "Choose the place position on the map": "Επίλεξε τη θέση του σημείου στον χάρτη",
  "Good morning": "Καλημέρα",
  "A clear view of your local content operations.":
    "Καθαρή εικόνα της διαχείρισης τοπικού περιεχομένου.",
  "Map locations and their public details.": "Σημεία χάρτη και δημόσιες πληροφορίες.",
  "Live editorial reports and time-limited updates.":
    "Editorial αναφορές και ενημερώσεις περιορισμένου χρόνου.",
  "Events hosted by the community and editorial team.":
    "Συναντήσεις από την κοινότητα και την editorial ομάδα.",
  "Editorial itineraries and their stop-by-stop guides.":
    "Επιμελημένες διαδρομές με αναλυτικές στάσεις.",
  "Review submissions before they appear in the public app.":
    "Έλεγξε τις υποβολές πριν εμφανιστούν στην εφαρμογή.",
  "Team access": "Πρόσβαση ομάδας",
  "Only Owners can add, change, or remove admin roles.":
    "Μόνο οι Owners μπορούν να αλλάζουν τους ρόλους διαχείρισης.",
  "New event": "Νέα συνάντηση",
  "Save place": "Αποθήκευση σημείου",
  "Save story": "Αποθήκευση story",
  "Save event": "Αποθήκευση συνάντησης",
  "Save route": "Αποθήκευση διαδρομής",
  "Saving…": "Αποθήκευση…",
  "Add stop": "Προσθήκη στάσης",
  "Save text": "Αποθήκευση κειμένου",
  "Edit text": "Επεξεργασία κειμένου",
  "Cancel editing": "Ακύρωση επεξεργασίας",
  "Add member": "Προσθήκη μέλους",
  Name: "Όνομα",
  "Greek name": "Ελληνικό όνομα",
  Area: "Περιοχή",
  Type: "Τύπος",
  Latitude: "Γεωγραφικό πλάτος",
  Longitude: "Γεωγραφικό μήκος",
  Mood: "Διάθεση",
  "Tags (comma-separated)": "Tags (χωρισμένα με κόμμα)",
  Visibility: "Ορατότητα",
  Crowd: "Κόσμος",
  Budget: "Κόστος",
  "Best time": "Καλύτερη ώρα",
  Image: "Εικόνα",
  Place: "Σημείο",
  Label: "Ετικέτα",
  Caption: "Λεζάντα",
  "Story type": "Τύπος story",
  "Visible for hours": "Ορατό για ώρες",
  Author: "Συντάκτης",
  Title: "Τίτλος",
  "Starts at": "Έναρξη",
  Category: "Κατηγορία",
  Price: "Τιμή",
  Vibe: "Vibe",
  "Cover image": "Εικόνα εξωφύλλου",
  Summary: "Σύνοψη",
  Duration: "Διάρκεια",
  Tags: "Tags",
  Role: "Ρόλος",
  Owner: "Owner",
  Editor: "Editor",
  Moderator: "Moderator",
  "No places match this search.": "Δεν βρέθηκαν σημεία.",
  "No items in this queue.": "Δεν υπάρχουν στοιχεία στην ουρά.",
  "Choose a profile…": "Επίλεξε προφίλ…",
  "Actions taken by admins will appear here.": "Οι ενέργειες των διαχειριστών θα εμφανίζονται εδώ.",
  "Interactive map of Ilia": "Διαδραστικός χάρτης της Ηλείας",
  "Loading map": "Φόρτωση χάρτη",
  "Back to previous map view": "Πίσω στην προηγούμενη προβολή χάρτη",
  "Top map areas": "Κύριες περιοχές χάρτη",
  "Zoom in map": "Μεγέθυνση χάρτη",
  "Zoom out map": "Σμίκρυνση χάρτη",
  "Find my location": "Εντοπισμός τοποθεσίας μου",
  "Show Ilia overview": "Προβολή ολόκληρης της Ηλείας",
  Beach: "Παραλία",
  Nature: "Φύση",
  Culture: "Πολιτισμός",
  "No car": "Χωρίς αυτοκίνητο",
  Free: "Δωρεάν",
  Photo: "Φωτογραφία",
  Report: "Αναφορά",
  Parking: "Πάρκινγκ",
  low: "λίγος",
  medium: "μέτριος",
  high: "πολύς",
  easy: "εύκολο",
  tight: "δύσκολο",
  full: "γεμάτο",
  Now: "Τώρα",
  Tonight: "Απόψε",
  Weekend: "Σαββατοκύριακο",
  "Local tips": "Τοπικές συμβουλές",
  "No posts match this filter yet.": "Δεν υπάρχουν ακόμη δημοσιεύσεις για αυτό το φίλτρο.",
  "Unsave post": "Αφαίρεση αποθήκευσης δημοσίευσης",
  "Save post": "Αποθήκευση δημοσίευσης",
  "Unlike post": "Αφαίρεση like",
  "Like post": "Like στη δημοσίευση",
  "Open comments": "Άνοιγμα σχολίων",
  "Share post": "Κοινοποίηση δημοσίευσης",
  "open on map": "άνοιγμα στον χάρτη",
  "Trending now: {place}. Open details.": "Δημοφιλές τώρα: {place}. Άνοιγμα λεπτομερειών.",
  tonight: "απόψε",
  Quiet: "Ήσυχα",
  "Warming up": "Αρχίζει να κινείται",
  Busy: "Πολύς κόσμος",
  Packed: "Γεμάτο",
  "{count} here recently": "{count} πρόσφατες αλληλεπιδράσεις εδώ",
  "I'm going": "Θα πάω",
  "Search ΗΛΕΙΑ PULSE": "Αναζήτηση στο ΗΛΕΙΑ PULSE",
  "Set sheet to {position}": "Μετακίνηση πλαισίου στη θέση: {position}",
  collapsed: "κλειστό",
  preview: "προεπισκόπηση",
  "Open {place} in OpenStreetMap": "Άνοιγμα του {place} στο OpenStreetMap",
  "Share {place}": "Κοινοποίηση: {place}",
  "Post story": "Δημοσίευση story",
  "Hosting at": "Τοποθεσία συνάντησης",
  "Gathering title": "Τίτλος συνάντησης",
  Location: "Τοποθεσία",
  When: "Πότε",
  Capacity: "Χωρητικότητα",
  Optional: "Προαιρετικό",
  "Gathering description": "Περιγραφή συνάντησης",
  "Create local post": "Δημιουργία τοπικής δημοσίευσης",
  "Open saved place {place}": "Άνοιγμα αποθηκευμένου σημείου {place}",
  "Open saved post at {place}": "Άνοιγμα αποθηκευμένης δημοσίευσης στο {place}",
  "Open saved route {route}": "Άνοιγμα αποθηκευμένης διαδρομής {route}",
  "Open stories from {place}": "Άνοιγμα stories από {place}",
  "Quick comment on post": "Γρήγορο σχόλιο στη δημοσίευση",
  "Post comment": "Δημοσίευση σχολίου",
  "Quick comment on route": "Γρήγορο σχόλιο στη διαδρομή",
  "Post route comment": "Δημοσίευση σχολίου στη διαδρομή",
  "Share route": "Κοινοποίηση διαδρομής",
  Panigyri: "Πανηγύρι",
  Music: "Μουσική",
  Sunset: "Ηλιοβασίλεμα",
  Sport: "Άθληση",
  Cleanup: "Καθαρισμός",
  Food: "Φαγητό",
  Social: "Παρέα",
  // Cultural events
  Community: "Κοινότητα",
  Events: "Εκδηλώσεις",
  "Organizer application sent": "Η αίτηση διοργανωτή στάλθηκε",
  "Event submitted for review": "Η εκδήλωση υποβλήθηκε για έλεγχο",
  "Could not send application.": "Δεν ήταν δυνατή η αποστολή της αίτησης.",
  "Verified organizer": "Επαληθευμένος διοργανωτής",
  "Submit a cultural event": "Υπόβαλε μια πολιτιστική εκδήλωση",
  "Do you organize events?": "Διοργανώνεις εκδηλώσεις;",
  "Become an organizer to submit theater shows, concerts, and festivals.":
    "Γίνε διοργανωτής για να υποβάλλεις θεατρικές παραστάσεις, συναυλίες και φεστιβάλ.",
  "Your previous request was rejected.": "Το προηγούμενο αίτημά σου απορρίφθηκε.",
  "Your request to become an events organizer is pending approval.":
    "Το αίτημά σου να γίνεις διοργανωτής εκδηλώσεων είναι σε αναμονή έγκρισης.",
  "Become an organizer": "Γίνε διοργανωτής",
  "Submitting…": "Υποβολή…",
  // Tourist "Must-see today" deck (top of the Routes tab)
  "Must-see today": "Πρέπει να δεις σήμερα",
  "A quick first look for visitors — the spots to begin with.":
    "Μια πρώτη ματιά για επισκέπτες — τα σημεία για να ξεκινήσεις.",
  "Open {place}": "Άνοιγμα {place}",
  // Local "Έχεις πάει;" exploration card (top of the Pulse feed)
  "Have you been?": "Έχεις πάει;",
  "Discover north-west and mountain Ilia — the corners with the fewest spots.":
    "Ανακάλυψε τη ΒΔ και ορεινή Ηλεία — τις γωνιές με τα λιγότερα σημεία.",
  "{covered}/{total} places": "{covered}/{total} μέρη",
  "Discovery progress": "Πρόοδος εξερεύνησης",
  "You've been everywhere on this list. Respect.":
    "Τα έχεις δει όλα στη λίστα. Respect.",
  "Five new places — you're really exploring now.":
    "Πέντε νέα μέρη — τώρα μάλιστα εξερευνείς!",
};

function interpolate(message: string, params?: TranslationParams) {
  if (!params) return message;
  return Object.entries(params).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    message,
  );
}

type I18nContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => AppLanguage;
  t: (message: string, params?: TranslationParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "GR";
  return window.localStorage.getItem(STORAGE_KEY) === "EN" ? "EN" : "GR";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(initialLanguage);

  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "GR" ? "el" : "en";
  }, [language]);

  const t = useCallback(
    (message: string, params?: TranslationParams) =>
      interpolate(language === "GR" ? (EL[message] ?? message) : message, params),
    [language],
  );

  const toggleLanguage = useCallback(() => {
    const next = language === "GR" ? "EN" : "GR";
    setLanguage(next);
    return next;
  }, [language, setLanguage]);

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, t }),
    [language, setLanguage, t, toggleLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Plus,
  X,
  Clock,
  MapPin,
  ImagePlus,
  LockKeyhole,
  Store,
  Camera,
  Info,
  ListChecks,
} from "lucide-react";
import { typeColor, type Place, type Post } from "@/lib/hp-model";
import { type CreatePulsePlaceInput } from "@/lib/hp-api";
import { profileAvatarUrl, profileDisplayName, type PulseAccountState } from "@/lib/hp-auth";
import { useI18n } from "@/lib/i18n";
import { defaultPlaceImage, nearestPlace, roundCoordinate } from "@/lib/hp/place-defaults";
import { ImageBox } from "./ImageBox";
import { SectionHeader, fieldClass } from "./blend-ui";
import {
  MEET_CATEGORIES,
  MEET_CATEGORY_META,
  type CreateMeetInput,
  type MeetCategory,
} from "@/lib/hp/meet-types";
import {
  type ComposerMode,
  type CreateStoryInput,
  type PostingIdentity,
  COMPOSER_MODE_ICONS,
  matchesPlaceQuery,
  readyProfile,
  composerIdentity,
} from "./pulse-shared";

const placeTypeOptions: Place["type"][] = [
  "beach",
  "culture",
  "nature",
  "food",
  "local",
  "village",
  "night",
  "sunset",
];

// English i18n keys for the place-type <option>s in the create composer.
const PLACE_TYPE_LABEL_KEYS: Record<Place["type"], string> = {
  beach: "Beach",
  culture: "Culture",
  nature: "Nature",
  food: "Food",
  local: "Local spot",
  village: "Village",
  night: "Night",
  sunset: "Sunset",
};

// Shared label style for the composer forms.
const LABEL = "mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted";

const STORY_CONDITION_OPTIONS = ["clean", "windy", "busy", "quiet", "event"] as const;

function defaultMeetDateTime() {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toISOString().slice(0, 16);
}

function tagList(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function SearchablePlacePicker({
  places,
  value,
  onChange,
  query,
  setQuery,
}: {
  places: Place[];
  value: string;
  onChange: (id: string) => void;
  query: string;
  setQuery: (query: string) => void;
}) {
  const { language } = useI18n();
  // Closed by default: most people post about the place they are already
  // looking at, so show just that and keep the search + list one tap away.
  const [expanded, setExpanded] = useState(false);
  const selected = places.find((place) => place.id === value) ?? places[0];
  const results = useMemo(() => {
    const matches = query.trim()
      ? places.filter((place) => matchesPlaceQuery(place, query))
      : places;
    return matches.slice(0, 7);
  }, [places, query]);

  if (!selected) return null;

  return (
    <div className="rounded-2xl border border-hp-ink/10 bg-hp-raised/60 p-2.5">
      <div className="flex items-center gap-2 rounded-xl bg-hp-ink/5 px-3 py-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: typeColor[selected.type] }}
        />
        <div className="min-w-0 flex-1 truncate text-[13px] font-bold text-hp-ink">
          {selected.name} <span className="font-semibold text-hp-muted">· {selected.area}</span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((on) => !on)}
          aria-expanded={expanded}
          className="shrink-0 rounded-full bg-hp-ink px-3 py-1 text-[11px] font-bold text-hp-paper"
        >
          {expanded
            ? language === "GR"
              ? "Κλείσιμο"
              : "Close"
            : language === "GR"
              ? "Αλλαγή"
              : "Change"}
        </button>
      </div>
      {expanded && (
        <div className="mt-2">
          <div className="mb-2 flex items-center gap-2 rounded-full border border-hp-ink/10 bg-hp-paper px-3 py-2">
            <Search size={13} className="text-hp-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              name="create-post-place-search"
              aria-label={language === "GR" ? "Αναζήτηση τοποθεσίας" : "Search post location"}
              autoComplete="off"
              placeholder={
                language === "GR"
                  ? "Αναζήτησε τοποθεσία, περιοχή ή tag…"
                  : "Search location, area, tag..."
              }
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-hp-muted"
            />
          </div>
          <div
            className="grid max-h-56 gap-1 overflow-y-auto pr-1"
            role="listbox"
            aria-label={language === "GR" ? "Τοποθεσίες" : "Locations"}
          >
            {results.map((placeOption) => {
              const selectedOption = placeOption.id === selected.id;
              return (
                <button
                  key={placeOption.id}
                  type="button"
                  role="option"
                  aria-selected={selectedOption}
                  onClick={() => {
                    onChange(placeOption.id);
                    setQuery("");
                    setExpanded(false);
                  }}
                  className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition ${
                    selectedOption ? "bg-hp-ink text-hp-paper" : "bg-hp-paper/75 text-hp-ink"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: typeColor[placeOption.type] }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-bold">{placeOption.name}</span>
                    <span
                      className={`block truncate text-[10px] ${
                        selectedOption ? "text-hp-paper/65" : "text-hp-muted"
                      }`}
                    >
                      {placeOption.area} · {placeOption.type}
                    </span>
                  </span>
                </button>
              );
            })}
            {results.length === 0 && (
              <div className="rounded-xl border border-dashed border-hp-ink/15 px-3 py-4 text-center text-[12px] text-hp-muted">
                {language === "GR" ? "Δεν βρέθηκε τοποθεσία." : "No location matches that search."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============== Create Modal ============== */
export function CreateComposerModal({
  open,
  initialMode = "post",
  prefillPlace,
  places,
  vibeChips,
  account,
  onClose,
  onRequireAccount,
  onPost,
  onPlace,
  onStory,
  onEvent,
  onQuestion,
}: {
  open: boolean;
  initialMode?: ComposerMode;
  prefillPlace?: { lat: number; lng: number } | null;
  places: Place[];
  vibeChips: string[];
  account: PulseAccountState;
  onClose: () => void;
  onRequireAccount: () => void;
  onPost: (payload: {
    text: string;
    placeId: string;
    vibes: string[];
    identity: PostingIdentity;
  }) => Promise<void>;
  onPlace: (payload: CreatePulsePlaceInput) => Promise<void>;
  onStory: (payload: CreateStoryInput) => Promise<void>;
  onEvent: (payload: CreateMeetInput) => Promise<void>;
  onQuestion: (payload: {
    text: string;
    placeId: string;
    identity: PostingIdentity;
  }) => Promise<void>;
}) {
  const { language, t } = useI18n();
  const [mode, setMode] = useState<ComposerMode>("post");
  const [text, setText] = useState("");
  const [place, setPlace] = useState(places[0]?.id ?? "");
  const [placeQuery, setPlaceQuery] = useState("");
  // The identity is the account's, fixed — no per-post override. (A tourist
  // picking "Local" per post defeated the point of the label.)
  const identity: PostingIdentity = composerIdentity(account);
  const [showVibes, setShowVibes] = useState(false);
  const [showPlaceMore, setShowPlaceMore] = useState(false);
  const [showEventMore, setShowEventMore] = useState(false);
  const [locating, setLocating] = useState(false);
  const [vibes, setVibes] = useState<string[]>([]);
  const [placeName, setPlaceName] = useState("");
  const [placeArea, setPlaceArea] = useState("");
  const [placeType, setPlaceType] = useState<Place["type"]>("local");
  const [placeLat, setPlaceLat] = useState("");
  const [placeLng, setPlaceLng] = useState("");
  const [placeImageUrl, setPlaceImageUrl] = useState("");
  const [placeShort, setPlaceShort] = useState("");
  const [placeTags, setPlaceTags] = useState("");
  const [placeCrowd, setPlaceCrowd] = useState("low");
  const [placeBudget, setPlaceBudget] = useState("€");
  const [placeBestTime, setPlaceBestTime] = useState("today");
  const [storyCaption, setStoryCaption] = useState("");
  const [storyKind, setStoryKind] = useState<"photo" | "report">("photo");
  const [storyCrowd, setStoryCrowd] = useState<"low" | "medium" | "high">("medium");
  const [storyParking, setStoryParking] = useState<"easy" | "tight" | "full">("easy");
  const [storyCondition, setStoryCondition] = useState<string[]>([]);
  const [storyVisibility, setStoryVisibility] = useState<number | undefined>(6);
  const [eventTitle, setEventTitle] = useState("");
  const [eventWhen, setEventWhen] = useState(defaultMeetDateTime);
  const [eventCategory, setEventCategory] = useState<MeetCategory>("social");
  const [eventVibe, setEventVibe] = useState("Friendly");
  const [eventPrice, setEventPrice] = useState("Free");
  const [eventCapacity, setEventCapacity] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventTags, setEventTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedPlace = places.find((p) => p.id === place) ?? places[0];
  const profile = readyProfile(account);
  const accountCanContribute = Boolean(profile);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError(null);
    if (prefillPlace) {
      setPlaceLat(String(Number(prefillPlace.lat.toFixed(6))));
      setPlaceLng(String(Number(prefillPlace.lng.toFixed(6))));
    }
  }, [account, initialMode, open, prefillPlace]);

  useEffect(() => {
    if (places.length > 0 && !places.some((p) => p.id === place)) {
      setPlace(places[0].id);
    }
  }, [place, places]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSaving(false);
      setStoryCaption("");
      setStoryKind("photo");
      setStoryCrowd("medium");
      setStoryParking("easy");
      setStoryCondition([]);
      setStoryVisibility(6);
      setEventWhen(defaultMeetDateTime());
    }
  }, [open]);

  const requireComposerAccount = () => {
    if (accountCanContribute) return true;
    onRequireAccount();
    setError(
      account.status === "needsProfile"
        ? language === "GR"
          ? "Ολοκλήρωσε το προφίλ σου πριν δημοσιεύσεις."
          : "Complete your profile before posting."
        : language === "GR"
          ? "Συνδέσου πριν δημοσιεύσεις."
          : "Sign in before posting.",
    );
    return false;
  };

  const handlePostSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireComposerAccount()) return;
    if (!text.trim() || !place) return;
    setSaving(true);
    setError(null);
    try {
      await onPost({ text: text.trim(), placeId: place, vibes, identity });
      setText("");
      setVibes([]);
      setPlaceQuery("");
    } catch (submitError) {
      console.warn("Could not create post.", submitError);
      setError(
        language === "GR"
          ? "Δεν ήταν δυνατή η αποθήκευση. Δοκίμασε ξανά."
          : "Could not save post. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleQuestionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireComposerAccount()) return;
    if (!text.trim() || !place) return;
    setSaving(true);
    setError(null);
    try {
      await onQuestion({ text: text.trim(), placeId: place, identity });
      setText("");
      setPlaceQuery("");
    } catch (submitError) {
      console.warn("Could not ask question.", submitError);
      setError(
        language === "GR"
          ? "Δεν ήταν δυνατή η αποθήκευση. Δοκίμασε ξανά."
          : "Could not save question. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setError(
        language === "GR"
          ? "Η συσκευή σου δεν δίνει τοποθεσία."
          : "This device cannot share its location.",
      );
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Used once, to place this spot, and not stored anywhere else.
        setPlaceLat(String(roundCoordinate(pos.coords.latitude)));
        setPlaceLng(String(roundCoordinate(pos.coords.longitude)));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError(
          language === "GR"
            ? "Δεν πήραμε την τοποθεσία σου. Έλεγξε την άδεια ή βάλε το σημείο από τον χάρτη."
            : "Could not get your location. Check the permission or add the spot from the map.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const handlePlaceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireComposerAccount()) return;
    const lat = Number(placeLat);
    const lng = Number(placeLng);
    if (!placeName.trim() || !placeShort.trim()) {
      setError(
        language === "GR"
          ? "Συμπλήρωσε όνομα και μια σύντομη περιγραφή."
          : "Fill in the place name and a short description.",
      );
      return;
    }
    if (
      placeLat.trim() === "" ||
      placeLng.trim() === "" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      setError(
        language === "GR"
          ? "Πες μας πού είναι: πάτα «Χρήση της τοποθεσίας μου» ή βάλε το σημείο από τον χάρτη."
          : "Tell us where it is: tap “Use my location” or add the spot from the map.",
      );
      return;
    }
    // Area and photo are optional for the author: borrow the nearest existing
    // place's area and a same-kind photo. Moderation still reviews the place.
    const area = placeArea.trim() || nearestPlace(lat, lng, places)?.area || "Ilia";
    const imageUrl = placeImageUrl.trim() || defaultPlaceImage(placeType, places);

    setSaving(true);
    setError(null);
    try {
      await onPlace({
        name: placeName.trim(),
        type: placeType,
        area,
        lat: roundCoordinate(lat),
        lng: roundCoordinate(lng),
        short: placeShort.trim(),
        imageUrl,
        tags: tagList(placeTags),
        crowd: placeCrowd,
        budget: placeBudget,
        bestTime: placeBestTime.trim() || "today",
      });
      setPlaceName("");
      setPlaceArea("");
      setPlaceType("local");
      setPlaceLat("");
      setPlaceLng("");
      setPlaceImageUrl("");
      setPlaceShort("");
      setPlaceTags("");
      setPlaceCrowd("low");
      setPlaceBudget("€");
      setPlaceBestTime("today");
    } catch (submitError) {
      console.warn("Could not create place.", submitError);
      setError(
        language === "GR"
          ? "Δεν ήταν δυνατή η αποθήκευση του σημείου."
          : "Could not save place. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStorySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireComposerAccount()) return;
    if (!place || !storyCaption.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onStory({
        placeId: place,
        caption: storyCaption,
        kind: storyKind,
        crowd: storyKind === "report" ? storyCrowd : undefined,
        parking: storyKind === "report" ? storyParking : undefined,
        condition: storyKind === "report" ? storyCondition : undefined,
        visibilityHours: storyVisibility,
      });
      setStoryCaption("");
      setStoryCondition([]);
    } catch (submitError) {
      const pgError = submitError as {
        message?: string;
        code?: string;
        details?: string;
        hint?: string;
      };
      console.error("Could not create story.", {
        message: pgError?.message,
        code: pgError?.code,
        details: pgError?.details,
        hint: pgError?.hint,
        raw: submitError,
      });
      setError(
        language === "GR"
          ? "Δεν ήταν δυνατή η αποθήκευση του story."
          : "Could not save story. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEventSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireComposerAccount()) return;
    const happensAt = new Date(eventWhen);
    const capacity = eventCapacity.trim() ? Number(eventCapacity) : undefined;
    if (!eventTitle.trim() || !eventDescription.trim() || !place) {
      setError(
        language === "GR"
          ? "Πρόσθεσε τίτλο, σημείο και σύντομη περιγραφή."
          : "Add a title, place, and short description.",
      );
      return;
    }
    if (!Number.isFinite(happensAt.getTime())) {
      setError(
        language === "GR" ? "Επίλεξε έγκυρη ημερομηνία και ώρα." : "Choose a valid date and time.",
      );
      return;
    }
    if (capacity !== undefined && (!Number.isFinite(capacity) || capacity < 2)) {
      setError(
        language === "GR"
          ? "Η χωρητικότητα πρέπει να είναι κενή ή τουλάχιστον 2."
          : "Capacity must be empty or at least 2.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onEvent({
        title: eventTitle.trim(),
        placeId: place,
        happensAt: happensAt.toISOString(),
        category: eventCategory,
        vibe: eventVibe.trim() || MEET_CATEGORY_META[eventCategory].label,
        price: eventPrice.trim() || "Free",
        capacity,
        description: eventDescription.trim(),
        tags: tagList(eventTags),
      });
      setEventTitle("");
      setEventWhen(defaultMeetDateTime());
      setEventCategory("social");
      setEventVibe("Friendly");
      setEventPrice("Free");
      setEventCapacity("");
      setEventDescription("");
      setEventTags("");
    } catch (submitError) {
      console.warn("Could not create event.", submitError);
      setError("Could not host this gathering. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!selectedPlace) return null;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[85] overflow-hidden"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
            aria-label={t("Close")}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            role="dialog"
            aria-modal="true"
            aria-label={
              language === "GR" ? "Δημιουργία περιεχομένου" : "Create local post or place"
            }
            className="hp-composer-sheet absolute inset-x-0 bottom-0 max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-paper p-4"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hp-ink/15" />
            <div className="mb-4 flex items-center justify-between border-b border-hp-ink/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[9px] bg-hp-sunset text-hp-paper">
                  <Plus size={14} strokeWidth={2.6} />
                </span>
                <h3 className="text-xl font-black text-hp-ink">{t("Add to ΗΛΕΙΑ PULSE")}</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-hp-ink/5 text-hp-ink"
                aria-label={t("Close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-5 gap-1 rounded-full border border-hp-ink/10 bg-hp-raised/50 p-1">
              {(["post", "question", "place", "story", "event"] as ComposerMode[]).map((option) => {
                const ModeIcon = COMPOSER_MODE_ICONS[option];
                return (
                  <button
                    key={option}
                    type="button"
                    data-testid={`composer-mode-${option}`}
                    onClick={() => {
                      setMode(option);
                      setError(null);
                    }}
                    aria-pressed={mode === option}
                    className={`flex flex-col items-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-bold capitalize transition ${
                      mode === option ? "bg-hp-ink text-hp-paper" : "text-hp-ink/65"
                    }`}
                  >
                    <ModeIcon size={14} strokeWidth={2.2} />
                    {t(option[0].toUpperCase() + option.slice(1))}
                  </button>
                );
              })}
            </div>

            <div className="hp-card-lift mb-4 flex items-center gap-2.5 rounded-2xl border border-hp-ink/10 bg-hp-paper px-3 py-2.5">
              {profile ? (
                <>
                  {profileAvatarUrl(profile) ? (
                    <img
                      src={profileAvatarUrl(profile) ?? ""}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full border border-hp-ink/10 object-cover"
                    />
                  ) : (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hp-ink text-[10px] font-black text-hp-paper">
                      {profileDisplayName(profile).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-black text-hp-ink">
                      {t("Posting as {name}", { name: profileDisplayName(profile) })}
                    </span>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                      {t(
                        identity === "TOURIST"
                          ? "Tourist"
                          : identity === "GUIDE"
                            ? "Guide"
                            : "Local",
                      )}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hp-sunset/10 text-hp-sunset">
                    <LockKeyhole size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-black text-hp-ink">
                      {t("Sign in to post")}
                    </span>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                      {t("You need an account to post and to save")}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={onRequireAccount}
                    className="shrink-0 rounded-full bg-hp-ink px-3 py-1.5 text-[11px] font-bold text-hp-paper"
                  >
                    {t("Sign in")}
                  </button>
                </>
              )}
            </div>

            {mode === "post" ? (
              <form
                data-testid="composer-post-form"
                onSubmit={handlePostSubmit}
                className="hp-stagger space-y-3"
              >
                <label htmlFor="create-post-text" className="sr-only">
                  Post text
                </label>
                <textarea
                  id="create-post-text"
                  name="create-post-text"
                  data-testid="composer-post-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoComplete="off"
                  placeholder={t("What's happening at this place?…")}
                  className={`${fieldClass()} resize-none`}
                  rows={3}
                />
                <div>
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                    {t("Location")}
                  </div>
                  <input
                    type="hidden"
                    id="create-post-place"
                    name="create-post-place"
                    data-testid="composer-post-place"
                    value={place}
                    readOnly
                  />
                  <SearchablePlacePicker
                    places={places}
                    value={place}
                    onChange={setPlace}
                    query={placeQuery}
                    setQuery={setPlaceQuery}
                  />
                </div>
                <div className="flex items-center gap-2 text-[11px] text-hp-muted">
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-hp-ink/10">
                    <ImageBox
                      src={selectedPlace.imageUrl}
                      alt={selectedPlace.name}
                      className="h-full w-full"
                      rounded="rounded-lg"
                    />
                  </span>
                  <ImagePlus size={12} className="shrink-0" />
                  <span className="min-w-0 truncate">
                    {t("Using {place} image", { place: selectedPlace.name })}
                  </span>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => setShowVibes((on) => !on)}
                    aria-expanded={showVibes}
                    className="text-[11px] font-bold text-hp-ink/70"
                  >
                    {showVibes
                      ? t("Hide vibes")
                      : vibes.length > 0
                        ? t("Vibe ({n})", { n: vibes.length })
                        : t("Add a vibe (optional)")}
                  </button>
                  <div className={`mt-2 flex flex-wrap gap-1.5 ${showVibes ? "" : "hidden"}`}>
                    {vibeChips.map((v) => {
                      const on = vibes.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setVibes((arr) => (on ? arr.filter((x) => x !== v) : [...arr, v]))
                          }
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                            on
                              ? "bg-hp-ink text-hp-paper"
                              : "border border-hp-ink/10 text-hp-ink/70"
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {error && <p className="text-[12px] font-semibold text-hp-sunset">{error}</p>}
                <button
                  type="submit"
                  data-testid="composer-post-submit"
                  disabled={!text.trim() || saving}
                  className="w-full rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper shadow-[0_10px_24px_-12px_rgba(224,106,50,0.7)] transition active:scale-[0.99] disabled:opacity-45 disabled:shadow-none"
                >
                  {saving ? t("Saving…") : t("Post")}
                </button>
              </form>
            ) : mode === "question" ? (
              <form
                data-testid="composer-question-form"
                onSubmit={handleQuestionSubmit}
                className="hp-stagger space-y-3"
              >
                <label htmlFor="create-question-text" className="sr-only">
                  Question text
                </label>
                <textarea
                  id="create-question-text"
                  name="create-question-text"
                  data-testid="composer-question-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoComplete="off"
                  placeholder={t("Ask something about this place…")}
                  className={`${fieldClass()} resize-none`}
                  rows={3}
                />
                <div>
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                    {t("Location")}
                  </div>
                  <input
                    type="hidden"
                    id="create-question-place"
                    name="create-question-place"
                    data-testid="composer-question-place"
                    value={place}
                    readOnly
                  />
                  <SearchablePlacePicker
                    places={places}
                    value={place}
                    onChange={setPlace}
                    query={placeQuery}
                    setQuery={setPlaceQuery}
                  />
                </div>
                <div className="flex items-center gap-2 text-[11px] text-hp-muted">
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-hp-ink/10">
                    <ImageBox
                      src={selectedPlace.imageUrl}
                      alt={selectedPlace.name}
                      className="h-full w-full"
                      rounded="rounded-lg"
                    />
                  </span>
                  <ImagePlus size={12} className="shrink-0" />
                  <span className="min-w-0 truncate">
                    {t("Using {place} image", { place: selectedPlace.name })}
                  </span>
                </div>
                {error && <p className="text-[12px] font-semibold text-hp-sunset">{error}</p>}
                <button
                  type="submit"
                  data-testid="composer-question-submit"
                  disabled={!text.trim() || saving}
                  className="w-full rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper shadow-[0_10px_24px_-12px_rgba(224,106,50,0.7)] transition active:scale-[0.99] disabled:opacity-45 disabled:shadow-none"
                >
                  {saving ? t("Saving…") : t("Ask")}
                </button>
              </form>
            ) : mode === "place" ? (
              <form
                data-testid="composer-place-form"
                onSubmit={handlePlaceSubmit}
                className="hp-stagger space-y-3"
              >
                <div>
                  <label htmlFor="create-place-name" className={LABEL}>
                    {t("Place name")}
                  </label>
                  <input
                    id="create-place-name"
                    name="create-place-name"
                    data-testid="composer-place-name"
                    value={placeName}
                    onChange={(e) => setPlaceName(e.target.value)}
                    autoComplete="off"
                    className={fieldClass()}
                  />
                </div>

                <div>
                  <div className={LABEL}>{t("Type")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {placeTypeOptions.map((type) => {
                      const on = placeType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setPlaceType(type)}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                            on
                              ? "bg-hp-ink text-hp-paper"
                              : "border border-hp-ink/10 text-hp-ink/70"
                          }`}
                        >
                          {t(PLACE_TYPE_LABEL_KEYS[type])}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label htmlFor="create-place-short" className={LABEL}>
                    {t("Description")}
                  </label>
                  <textarea
                    id="create-place-short"
                    name="create-place-short"
                    data-testid="composer-place-short"
                    value={placeShort}
                    onChange={(e) => setPlaceShort(e.target.value)}
                    placeholder={t("What should locals know?…")}
                    className={`${fieldClass()} resize-none`}
                    rows={3}
                  />
                </div>

                <div>
                  <div className={LABEL}>{t("Where is it?")}</div>
                  <div className="flex items-center gap-2 rounded-2xl border border-hp-ink/10 bg-hp-raised/60 p-2.5">
                    <MapPin
                      size={16}
                      className={placeLat && placeLng ? "text-hp-olive" : "text-hp-muted"}
                    />
                    <span className="min-w-0 flex-1 text-[12px] font-bold text-hp-ink">
                      {placeLat && placeLng ? t("Spot chosen") : t("Not set yet")}
                    </span>
                    <button
                      type="button"
                      onClick={useMyLocation}
                      disabled={locating}
                      className="shrink-0 rounded-full bg-hp-ink px-3 py-1.5 text-[11px] font-bold text-hp-paper disabled:opacity-50"
                    >
                      {locating ? t("Finding you…") : t("Use my location")}
                    </button>
                  </div>
                  <p className="mt-1 text-[10.5px] text-hp-muted">
                    {t("Tip: long-press the spot on the map and tap + to fill this in for you.")}
                  </p>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowPlaceMore((on) => !on)}
                    aria-expanded={showPlaceMore}
                    className="text-[11px] font-bold text-hp-ink/70"
                  >
                    {showPlaceMore ? t("Hide extra details") : t("Add more details (optional)")}
                  </button>
                  <div className={`mt-2 grid grid-cols-2 gap-2 ${showPlaceMore ? "" : "hidden"}`}>
                    <div className="col-span-2">
                      <label htmlFor="create-place-area" className={LABEL}>
                        {t("Area")}
                      </label>
                      <input
                        id="create-place-area"
                        name="create-place-area"
                        data-testid="composer-place-area"
                        value={placeArea}
                        onChange={(e) => setPlaceArea(e.target.value)}
                        autoComplete="off"
                        placeholder={t("We fill this in from the nearest place")}
                        className={fieldClass()}
                      />
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="create-place-tags" className={LABEL}>
                        {t("Tags")}
                      </label>
                      <input
                        id="create-place-tags"
                        name="create-place-tags"
                        data-testid="composer-place-tags"
                        value={placeTags}
                        onChange={(e) => setPlaceTags(e.target.value)}
                        placeholder={t("beach, quiet, sunset")}
                        className={fieldClass()}
                      />
                    </div>
                    <div>
                      <label htmlFor="create-place-crowd" className={LABEL}>
                        {t("Crowd")}
                      </label>
                      <select
                        id="create-place-crowd"
                        name="create-place-crowd"
                        data-testid="composer-place-crowd"
                        value={placeCrowd}
                        onChange={(e) => setPlaceCrowd(e.target.value)}
                        className={fieldClass()}
                      >
                        <option value="low">{t("low")}</option>
                        <option value="medium">{t("medium")}</option>
                        <option value="high">{t("high")}</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="create-place-budget" className={LABEL}>
                        {t("Budget")}
                      </label>
                      <select
                        id="create-place-budget"
                        name="create-place-budget"
                        data-testid="composer-place-budget"
                        value={placeBudget}
                        onChange={(e) => setPlaceBudget(e.target.value)}
                        className={fieldClass()}
                      >
                        <option value="free">{t("Free")}</option>
                        <option value="€">€</option>
                        <option value="€€">€€</option>
                        <option value="€€€">€€€</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="create-place-best-time" className={LABEL}>
                        {t("Best time")}
                      </label>
                      <input
                        id="create-place-best-time"
                        name="create-place-best-time"
                        data-testid="composer-place-best-time"
                        value={placeBestTime}
                        onChange={(e) => setPlaceBestTime(e.target.value)}
                        className={fieldClass()}
                      />
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="create-place-lat" className={LABEL}>
                        {t("Exact coordinates")}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          id="create-place-lat"
                          name="create-place-lat"
                          data-testid="composer-place-lat"
                          type="number"
                          inputMode="decimal"
                          step="0.000001"
                          value={placeLat}
                          onChange={(e) => setPlaceLat(e.target.value)}
                          aria-label={t("Lat")}
                          placeholder={t("Lat")}
                          className={fieldClass()}
                        />
                        <input
                          id="create-place-lng"
                          name="create-place-lng"
                          data-testid="composer-place-lng"
                          type="number"
                          inputMode="decimal"
                          step="0.000001"
                          value={placeLng}
                          onChange={(e) => setPlaceLng(e.target.value)}
                          aria-label={t("Lng")}
                          placeholder={t("Lng")}
                          className={fieldClass()}
                        />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="create-place-image" className={LABEL}>
                        {t("Photo URL")}
                      </label>
                      <input
                        id="create-place-image"
                        name="create-place-image"
                        data-testid="composer-place-image"
                        type="url"
                        value={placeImageUrl}
                        onChange={(e) => setPlaceImageUrl(e.target.value)}
                        placeholder={t("Optional — we use a photo of a similar place")}
                        className={fieldClass()}
                      />
                    </div>
                  </div>
                </div>

                <p className="text-[10.5px] text-hp-muted">
                  {t("New places are checked by our team before everyone sees them.")}
                </p>
                {error && <p className="text-[12px] font-semibold text-hp-sunset">{error}</p>}
                <button
                  type="submit"
                  data-testid="composer-place-submit"
                  disabled={saving}
                  className="w-full rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper shadow-[0_10px_24px_-12px_rgba(224,106,50,0.7)] transition active:scale-[0.99] disabled:opacity-45 disabled:shadow-none"
                >
                  {saving ? t("Saving…") : t("Save place")}
                </button>
              </form>
            ) : mode === "story" ? (
              <form
                data-testid="composer-story-form"
                onSubmit={handleStorySubmit}
                className="hp-stagger space-y-3"
              >
                <label htmlFor="create-story-caption" className="sr-only">
                  {t("Story caption")}
                </label>
                <textarea
                  id="create-story-caption"
                  name="create-story-caption"
                  data-testid="composer-story-caption"
                  value={storyCaption}
                  onChange={(e) => setStoryCaption(e.target.value)}
                  autoComplete="off"
                  placeholder={t("What's happening here right now?…")}
                  className={`${fieldClass()} resize-none`}
                  rows={3}
                />

                <div>
                  <div className={LABEL}>{t("Location")}</div>
                  <SearchablePlacePicker
                    places={places}
                    value={place}
                    onChange={setPlace}
                    query={placeQuery}
                    setQuery={setPlaceQuery}
                  />
                </div>
                <div className="flex items-center gap-2 text-[11px] text-hp-muted">
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-hp-ink/10">
                    <ImageBox
                      src={selectedPlace.imageUrl}
                      alt={selectedPlace.name}
                      className="h-full w-full"
                      rounded="rounded-lg"
                    />
                  </span>
                  <span className="min-w-0 truncate">
                    {t("Story photo · using {place} image", { place: selectedPlace.name })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-hp-ink/10 bg-hp-raised/50 p-1.5">
                  {(["photo", "report"] as const).map((option) => {
                    const active = storyKind === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        data-testid={`composer-story-kind-${option}`}
                        onClick={() => setStoryKind(option)}
                        aria-pressed={active}
                        className={`rounded-xl px-2 py-2 text-[12px] font-bold transition ${
                          active ? "bg-hp-ink text-hp-paper" : "text-hp-ink/70"
                        }`}
                      >
                        {option === "report" ? t("Live report") : t("Photo")}
                      </button>
                    );
                  })}
                </div>

                {storyKind === "report" && (
                  <div className="rounded-2xl border border-hp-ink/10 bg-hp-raised/50 p-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                          {t("Crowd")}
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {(["low", "medium", "high"] as const).map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-pressed={storyCrowd === c}
                              onClick={() => setStoryCrowd(c)}
                              className={`rounded-lg px-1 py-1.5 text-[10px] font-bold capitalize ${
                                storyCrowd === c
                                  ? "bg-hp-ink text-hp-paper"
                                  : "bg-hp-paper text-hp-ink/65"
                              }`}
                            >
                              {t(c)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                          {t("Parking")}
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {(["easy", "tight", "full"] as const).map((p) => (
                            <button
                              key={p}
                              type="button"
                              aria-pressed={storyParking === p}
                              onClick={() => setStoryParking(p)}
                              className={`rounded-lg px-1 py-1.5 text-[10px] font-bold capitalize ${
                                storyParking === p
                                  ? "bg-hp-ink text-hp-paper"
                                  : "bg-hp-paper text-hp-ink/65"
                              }`}
                            >
                              {t(p)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                        {t("Condition")}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {STORY_CONDITION_OPTIONS.map((cond) => {
                          const on = storyCondition.includes(cond);
                          return (
                            <button
                              key={cond}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                setStoryCondition((arr) =>
                                  on ? arr.filter((x) => x !== cond) : [...arr, cond],
                                )
                              }
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${
                                on
                                  ? "bg-hp-ink text-hp-paper"
                                  : "border border-hp-ink/10 text-hp-ink/70"
                              }`}
                            >
                              {t(cond[0].toUpperCase() + cond.slice(1))}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className={LABEL}>{t("Visible for")}</div>
                  <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-hp-ink/10 bg-hp-raised/50 p-1.5">
                    {(
                      [
                        { h: 6, label: "6h" },
                        { h: 24, label: "24h" },
                        { h: undefined, label: t("Keep tip") },
                      ] as const
                    ).map((opt) => {
                      const active = storyVisibility === opt.h;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setStoryVisibility(opt.h)}
                          className={`rounded-xl px-2 py-2 text-[11px] font-bold transition ${
                            active ? "bg-hp-ink text-hp-paper" : "text-hp-ink/70"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {error && <p className="text-[12px] font-semibold text-hp-sunset">{error}</p>}
                <button
                  type="submit"
                  data-testid="composer-story-submit"
                  disabled={!storyCaption.trim()}
                  className="w-full rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper shadow-[0_10px_24px_-12px_rgba(224,106,50,0.7)] transition active:scale-[0.99] disabled:opacity-45 disabled:shadow-none"
                >
                  {t("Post story")}
                </button>
              </form>
            ) : (
              <form
                data-testid="composer-event-form"
                onSubmit={handleEventSubmit}
                className="hp-stagger space-y-3"
              >
                <div>
                  <label htmlFor="create-event-title" className={LABEL}>
                    {t("Gathering title")}
                  </label>
                  <input
                    id="create-event-title"
                    name="create-event-title"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    autoComplete="off"
                    placeholder={t("Sunset swim, coffee tips, live music...")}
                    className={fieldClass()}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="create-event-when" className={LABEL}>
                      {t("When")}
                    </label>
                    <input
                      id="create-event-when"
                      name="create-event-when"
                      type="datetime-local"
                      value={eventWhen}
                      onChange={(e) => setEventWhen(e.target.value)}
                      className={`${fieldClass()} text-[12px]`}
                    />
                  </div>
                  <div>
                    <label htmlFor="create-event-category" className={LABEL}>
                      {t("Type")}
                    </label>
                    <select
                      id="create-event-category"
                      name="create-event-category"
                      value={eventCategory}
                      onChange={(e) => setEventCategory(e.target.value as MeetCategory)}
                      className={`${fieldClass()} text-[12px]`}
                    >
                      {MEET_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {t(MEET_CATEGORY_META[category].label)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className={LABEL}>{t("Location")}</div>
                  <SearchablePlacePicker
                    places={places}
                    value={place}
                    onChange={setPlace}
                    query={placeQuery}
                    setQuery={setPlaceQuery}
                  />
                </div>

                <div>
                  <label htmlFor="create-event-description" className="sr-only">
                    {t("Gathering description")}
                  </label>
                  <textarea
                    id="create-event-description"
                    name="create-event-description"
                    value={eventDescription}
                    onChange={(e) => setEventDescription(e.target.value)}
                    placeholder={t("What should people know before they join?")}
                    className={`${fieldClass()} resize-none`}
                    rows={3}
                  />
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowEventMore((on) => !on)}
                    aria-expanded={showEventMore}
                    className="text-[11px] font-bold text-hp-ink/70"
                  >
                    {showEventMore ? t("Hide extra details") : t("Add more details (optional)")}
                  </button>
                  <div className={`mt-2 grid grid-cols-2 gap-2 ${showEventMore ? "" : "hidden"}`}>
                    <div>
                      <label htmlFor="create-event-price" className={LABEL}>
                        {t("Price")}
                      </label>
                      <input
                        id="create-event-price"
                        name="create-event-price"
                        value={eventPrice}
                        onChange={(e) => setEventPrice(e.target.value)}
                        className={fieldClass()}
                      />
                    </div>
                    <div>
                      <label htmlFor="create-event-capacity" className={LABEL}>
                        {t("Capacity")}
                      </label>
                      <input
                        id="create-event-capacity"
                        name="create-event-capacity"
                        type="number"
                        inputMode="numeric"
                        min={2}
                        value={eventCapacity}
                        onChange={(e) => setEventCapacity(e.target.value)}
                        placeholder={t("Optional")}
                        className={fieldClass()}
                      />
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="create-event-vibe" className={LABEL}>
                        {t("Vibe")}
                      </label>
                      <input
                        id="create-event-vibe"
                        name="create-event-vibe"
                        value={eventVibe}
                        onChange={(e) => setEventVibe(e.target.value)}
                        className={fieldClass()}
                      />
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="create-event-tags" className={LABEL}>
                        {t("Tags")}
                      </label>
                      <input
                        id="create-event-tags"
                        name="create-event-tags"
                        value={eventTags}
                        onChange={(e) => setEventTags(e.target.value)}
                        placeholder={t("sunset, local, free")}
                        className={fieldClass()}
                      />
                    </div>
                  </div>
                </div>

                {error && <p className="text-[12px] font-semibold text-hp-sunset">{error}</p>}
                <button
                  type="submit"
                  data-testid="composer-event-submit"
                  disabled={!eventTitle.trim() || !eventDescription.trim() || saving}
                  className="w-full rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper shadow-[0_10px_24px_-12px_rgba(224,106,50,0.7)] transition active:scale-[0.99] disabled:opacity-45 disabled:shadow-none"
                >
                  {saving ? t("Hosting…") : t("Host gathering")}
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ============== Bottom Nav ============== */

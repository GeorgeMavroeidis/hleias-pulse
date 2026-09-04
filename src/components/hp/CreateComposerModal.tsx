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
import { ImageBox } from "./ImageBox";
import { IdentitySegments, SectionHeader, fieldClass } from "./blend-ui";
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
  POSTING_IDENTITIES,
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
  const selected = places.find((place) => place.id === value) ?? places[0];
  const results = useMemo(() => {
    const matches = query.trim()
      ? places.filter((place) => matchesPlaceQuery(place, query))
      : places;
    return matches.slice(0, 7);
  }, [places, query]);

  if (!selected) return null;

  return (
    <div className="rounded-2xl border border-hp-ink/10 bg-white/60 p-2.5">
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
      <div className="mb-2 rounded-xl bg-hp-ink/5 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
          {language === "GR" ? "Επιλεγμένο" : "Selected"}
        </div>
        <div className="truncate text-[13px] font-bold text-hp-ink">
          {selected.name} <span className="font-semibold text-hp-muted">· {selected.area}</span>
        </div>
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
              <span
                className={`text-[10px] font-bold ${
                  selectedOption ? "text-hp-paper/75" : "text-hp-muted"
                }`}
              >
                {placeOption.recentPostCount}
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
}) {
  const { language, t } = useI18n();
  const [mode, setMode] = useState<ComposerMode>("post");
  const [text, setText] = useState("");
  const [place, setPlace] = useState(places[0]?.id ?? "");
  const [placeQuery, setPlaceQuery] = useState("");
  const [identity, setIdentity] = useState<PostingIdentity>("LOCAL");
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
    setIdentity(composerIdentity(account));
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

  const handlePlaceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireComposerAccount()) return;
    const lat = Number(placeLat);
    const lng = Number(placeLng);
    if (!placeName.trim() || !placeArea.trim() || !placeShort.trim() || !placeImageUrl.trim()) {
      setError(
        language === "GR"
          ? "Συμπλήρωσε όνομα, περιοχή, περιγραφή και URL φωτογραφίας."
          : "Fill the place name, area, description, and photo URL.",
      );
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError(
        language === "GR"
          ? "Χρησιμοποίησε έγκυρο γεωγραφικό πλάτος και μήκος."
          : "Use valid latitude and longitude.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onPlace({
        name: placeName.trim(),
        type: placeType,
        area: placeArea.trim(),
        lat,
        lng,
        short: placeShort.trim(),
        imageUrl: placeImageUrl.trim(),
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

            <div className="mb-4 grid grid-cols-4 gap-1 rounded-full border border-hp-ink/10 bg-white/50 p-1">
              {(["post", "place", "story", "event"] as ComposerMode[]).map((option) => {
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
                      {t("Profile identity will be stored with this contribution")}
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
                      {t("Saves can be private, public posts need a profile")}
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
                <div className="hp-card-lift relative h-40 overflow-hidden rounded-2xl border border-hp-ink/10 bg-white/50">
                  <ImageBox
                    src={selectedPlace.imageUrl}
                    alt={selectedPlace.name}
                    className="h-full w-full"
                    rounded="rounded-2xl"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent" />
                  <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-bold text-hp-paper backdrop-blur">
                    <ImagePlus size={12} />
                    {t("Using {place} image", { place: selectedPlace.name })}
                  </span>
                </div>
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
                    {t("Posting as")}
                  </div>
                  <IdentitySegments
                    options={POSTING_IDENTITIES}
                    value={identity}
                    onChange={setIdentity}
                  />
                </div>
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
                <div>
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                    {t("Vibe")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
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
            ) : mode === "place" ? (
              <form
                data-testid="composer-place-form"
                onSubmit={handlePlaceSubmit}
                className="hp-stagger space-y-4"
              >
                <section>
                  <SectionHeader icon={Info} label={t("Basics")} tone="deep" />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label
                        htmlFor="create-place-name"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
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
                      <label
                        htmlFor="create-place-area"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Area")}
                      </label>
                      <input
                        id="create-place-area"
                        name="create-place-area"
                        data-testid="composer-place-area"
                        value={placeArea}
                        onChange={(e) => setPlaceArea(e.target.value)}
                        autoComplete="off"
                        className={fieldClass()}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="create-place-type"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Type")}
                      </label>
                      <select
                        id="create-place-type"
                        name="create-place-type"
                        data-testid="composer-place-type"
                        value={placeType}
                        onChange={(e) => setPlaceType(e.target.value as Place["type"])}
                        className={fieldClass()}
                      >
                        {placeTypeOptions.map((type) => (
                          <option key={type} value={type}>
                            {t(PLACE_TYPE_LABEL_KEYS[type])}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                <section>
                  <SectionHeader icon={MapPin} label={t("Place on the map")} tone="sea" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="create-place-lat"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Lat")}
                      </label>
                      <input
                        id="create-place-lat"
                        name="create-place-lat"
                        data-testid="composer-place-lat"
                        type="number"
                        inputMode="decimal"
                        step="0.000001"
                        value={placeLat}
                        onChange={(e) => setPlaceLat(e.target.value)}
                        className={fieldClass()}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="create-place-lng"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Lng")}
                      </label>
                      <input
                        id="create-place-lng"
                        name="create-place-lng"
                        data-testid="composer-place-lng"
                        type="number"
                        inputMode="decimal"
                        step="0.000001"
                        value={placeLng}
                        onChange={(e) => setPlaceLng(e.target.value)}
                        className={fieldClass()}
                      />
                    </div>
                    <div className="col-span-2">
                      <label
                        htmlFor="create-place-image"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
                        {t("Photo URL")}
                      </label>
                      <input
                        id="create-place-image"
                        name="create-place-image"
                        data-testid="composer-place-image"
                        type="url"
                        value={placeImageUrl}
                        onChange={(e) => setPlaceImageUrl(e.target.value)}
                        className={fieldClass()}
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <SectionHeader icon={ListChecks} label={t("Details")} tone="olive" />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label htmlFor="create-place-short" className="sr-only">
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
                    <div className="col-span-2">
                      <label
                        htmlFor="create-place-tags"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
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
                      <label
                        htmlFor="create-place-crowd"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
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
                      <label
                        htmlFor="create-place-budget"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
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
                      <label
                        htmlFor="create-place-best-time"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
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
                  </div>
                </section>

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
                className="hp-stagger space-y-4"
              >
                <section>
                  <SectionHeader icon={Camera} label={t("Photo & caption")} tone="sunset" />
                  <div className="hp-card-lift relative h-40 overflow-hidden rounded-2xl border border-hp-ink/10 bg-white/50">
                    <ImageBox
                      src={selectedPlace.imageUrl}
                      alt={selectedPlace.name}
                      className="h-full w-full"
                      rounded="rounded-2xl"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent" />
                    <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-bold text-hp-paper backdrop-blur">
                      <ImagePlus size={12} />
                      {t("Story photo · using {place} image", { place: selectedPlace.name })}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-hp-muted">
                    {t(
                      "Shows full-screen, 9:16. Swap in your own photo later — this previews with the place image.",
                    )}
                  </p>

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
                    className={`${fieldClass()} mt-3 resize-none`}
                    rows={3}
                  />
                </section>

                <section>
                  <SectionHeader icon={Info} label={t("Type")} tone="deep" />
                  <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-hp-ink/10 bg-white/50 p-1.5">
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
                    <div className="mt-2 rounded-2xl border border-hp-ink/10 bg-white/50 p-2.5">
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
                </section>

                <section>
                  <SectionHeader icon={Clock} label={t("Visibility & place")} tone="olive" />
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                        {t("Visible for")}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-hp-ink/10 bg-white/50 p-1.5">
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

                    <div>
                      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                        {t("Location")}
                      </div>
                      <SearchablePlacePicker
                        places={places}
                        value={place}
                        onChange={setPlace}
                        query={placeQuery}
                        setQuery={setPlaceQuery}
                      />
                    </div>
                  </div>
                </section>

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
                className="hp-stagger space-y-4"
              >
                <section>
                  <SectionHeader icon={Store} label={t("What & where")} tone="sunset" />
                  <div className="hp-card-lift relative h-36 overflow-hidden rounded-2xl border border-hp-ink/10 bg-white/50">
                    <ImageBox
                      src={selectedPlace.imageUrl}
                      alt={selectedPlace.name}
                      className="h-full w-full"
                      rounded="rounded-2xl"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 text-hp-paper">
                      <div className="text-[10px] font-bold uppercase">{t("Hosting at")}</div>
                      <div className="text-[15px] font-black leading-tight">
                        {selectedPlace.name}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label
                        htmlFor="create-event-title"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
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
                    <div className="col-span-2">
                      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                        {t("Location")}
                      </div>
                      <SearchablePlacePicker
                        places={places}
                        value={place}
                        onChange={setPlace}
                        query={placeQuery}
                        setQuery={setPlaceQuery}
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <SectionHeader icon={Clock} label={t("When & kind")} tone="deep" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="create-event-when"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
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
                      <label
                        htmlFor="create-event-category"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
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
                    <div className="col-span-2">
                      <label
                        htmlFor="create-event-vibe"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
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
                  </div>
                </section>

                <section>
                  <SectionHeader icon={ListChecks} label={t("Details")} tone="olive" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="create-event-price"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
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
                      <label
                        htmlFor="create-event-capacity"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
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
                      <label
                        htmlFor="create-event-tags"
                        className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-hp-muted"
                      >
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
                    <div className="col-span-2">
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
                  </div>
                </section>

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

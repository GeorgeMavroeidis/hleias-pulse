import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, LocateFixed } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { thumbnailUrl } from "@/lib/hp/explore-media";

interface Props {
  open: boolean;
  vibeChips: string[];
  onClose: () => void;
  onRequestLocation: () => void;
}

// Ilia's own light carries the welcome: the same Wikimedia photos the places use.
const SLIDES = [
  {
    photo:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/Katakolo-sunset.jpg/1280px-Katakolo-sunset.jpg",
    place: "Katakolo",
    title: "Feel the pulse",
    body: "See what's hot right now — beaches, sunsets, village nights and panigyri, live.",
  },
  {
    photo:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/28/Aerial_view_of_the_archaeological_site_of_Ancient_Olympia%2C_Greece_%2851223832734%29.jpg/1280px-Aerial_view_of_the_archaeological_site_of_Ancient_Olympia%2C_Greece_%2851223832734%29.jpg",
    place: "Ancient Olympia",
    title: "Discover around you",
    body: "We show what's moving nearby, so you never miss the thing happening tonight.",
  },
  {
    photo:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/07/Sunset_in_Kourouta%2C_western_Peloponnese%2C_Greece.jpg/1280px-Sunset_in_Kourouta%2C_western_Peloponnese%2C_Greece.jpg",
    place: "Kourouta",
    title: "Meet up, easily",
    body: "RSVP to gatherings or host your own. Say you're in — see who's going.",
  },
];

export function OnboardingGate({ open, vibeChips, onClose, onRequestLocation }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [locRequested, setLocRequested] = useState(false);

  const isIntro = step < SLIDES.length;
  const isVibes = step === SLIDES.length;

  const finish = () => {
    onClose();
  };

  const toggleVibe = (v: string) =>
    setPicked((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="ob-root"
          data-step={isVibes ? "vibes" : "photo"}
        >
          {/* Ilia in full bleed; each slide crossfades to the next. */}
          <AnimatePresence initial={false}>
            {isIntro && (
              <motion.div
                key={`photo-${step}`}
                className="ob-photo"
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden="true"
              >
                <img src={thumbnailUrl(SLIDES[step].photo, 960)} alt="" />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="ob-shade" aria-hidden="true" />

          {/* Story-style progress */}
          <div className="ob-progress" aria-hidden="true">
            {[...SLIDES, "vibes"].map((_, i) => (
              <span key={i} data-state={i < step ? "done" : i === step ? "now" : "next"} />
            ))}
          </div>

          <div className="ob-body">
            <AnimatePresence mode="wait">
              {isIntro && (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="ob-copy"
                >
                  <span className="ob-place">{SLIDES[step].place}</span>
                  <h2>{t(SLIDES[step].title)}</h2>
                  <p>{t(SLIDES[step].body)}</p>
                </motion.div>
              )}

              {isVibes && (
                <motion.div
                  key="vibes"
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  className="ob-copy ob-copy--vibes"
                >
                  <h2>{t("What's your vibe?")}</h2>
                  <p>{t("Pick a few — we'll tune your feed.")}</p>
                  <div className="ob-vibes">
                    {vibeChips.map((v) => {
                      const on = picked.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => toggleVibe(v)}
                          aria-pressed={on}
                          className="ob-vibe"
                        >
                          {on && <Check size={14} strokeWidth={2.6} aria-hidden="true" />}
                          {v}
                        </button>
                      );
                    })}
                    {vibeChips.length === 0 && <p className="ob-loading">{t("Loading vibes…")}</p>}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onRequestLocation();
                      setLocRequested(true);
                    }}
                    className="ob-location"
                    data-on={locRequested ? "true" : "false"}
                  >
                    {locRequested ? <Check size={16} /> : <LocateFixed size={16} />}
                    {t(locRequested ? "Location on" : "Enable location")}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer controls */}
          <div className="ob-footer">
            <button type="button" onClick={finish} className="ob-skip">
              {t(isVibes ? "Finish" : "Skip")}
            </button>
            <button
              type="button"
              onClick={() => (isVibes ? finish() : setStep((s) => s + 1))}
              className="ob-next"
            >
              {t(isVibes ? "Enter ΗΛΕΙΑ PULSE" : "Continue")}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

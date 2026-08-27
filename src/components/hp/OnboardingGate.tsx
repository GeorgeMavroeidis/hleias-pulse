import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, Radio, Users, Check, LocateFixed } from "lucide-react";

interface Props {
  open: boolean;
  vibeChips: string[];
  onClose: () => void;
  onRequestLocation: () => void;
}

const SLIDES = [
  {
    Icon: Radio,
    tint: "var(--hp-sunset)",
    title: "Feel the pulse",
    body: "See what's hot right now — beaches, sunsets, village nights and panigyri, live.",
  },
  {
    Icon: MapPin,
    tint: "var(--hp-sea)",
    title: "Discover around you",
    body: "We show what's moving nearby, so you never miss the thing happening tonight.",
  },
  {
    Icon: Users,
    tint: "var(--hp-purple)",
    title: "Meet up, easily",
    body: "RSVP to gatherings or host your own. Say you're in — see who's going.",
  },
];

export function OnboardingGate({ open, vibeChips, onClose, onRequestLocation }: Props) {
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
          className="absolute inset-0 z-[90] flex flex-col bg-hp-bg"
        >
          {/* progress dots */}
          <div className="flex justify-center gap-1.5 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
            {[...SLIDES, "vibes"].map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-hp-ink" : "w-1.5 bg-hp-ink/20"
                }`}
              />
            ))}
          </div>

          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <AnimatePresence mode="wait">
              {isIntro && (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 18, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -18, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="flex max-w-sm flex-col items-center"
                >
                  <span
                    className="mb-6 grid h-20 w-20 place-items-center rounded-3xl text-hp-paper shadow-lg"
                    style={{ background: SLIDES[step].tint }}
                  >
                    {(() => {
                      const Icon = SLIDES[step].Icon;
                      return <Icon size={34} strokeWidth={2.2} />;
                    })()}
                  </span>
                  <h2 className="text-[26px] font-black leading-tight text-hp-ink">
                    {SLIDES[step].title}
                  </h2>
                  <p className="mt-2 text-[14px] leading-relaxed text-hp-muted">
                    {SLIDES[step].body}
                  </p>
                </motion.div>
              )}

              {isVibes && (
                <motion.div
                  key="vibes"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  className="flex w-full max-w-sm flex-col items-center"
                >
                  <h2 className="text-[24px] font-black leading-tight text-hp-ink">
                    What's your vibe?
                  </h2>
                  <p className="mt-1.5 text-[13px] text-hp-muted">
                    Pick a few — we'll tune your feed.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {vibeChips.map((v) => {
                      const on = picked.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => toggleVibe(v)}
                          className={`rounded-full px-3.5 py-2 text-[12.5px] font-bold transition active:scale-95 ${
                            on
                              ? "bg-hp-ink text-hp-paper"
                              : "border border-hp-ink/12 bg-hp-paper text-hp-ink/70"
                          }`}
                        >
                          {on ? "✓ " : ""}
                          {v}
                        </button>
                      );
                    })}
                    {vibeChips.length === 0 && (
                      <p className="text-[12px] text-hp-muted">Loading vibes…</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onRequestLocation();
                      setLocRequested(true);
                    }}
                    className={`mt-6 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-bold transition active:scale-95 ${
                      locRequested
                        ? "bg-hp-olive/15 text-hp-olive"
                        : "border border-hp-ink/15 text-hp-ink"
                    }`}
                  >
                    {locRequested ? <Check size={15} /> : <LocateFixed size={15} />}
                    {locRequested ? "Location on" : "Enable location"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer controls */}
          <div className="flex items-center justify-between gap-3 px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2">
            <button
              type="button"
              onClick={finish}
              className="text-[12.5px] font-bold text-hp-muted"
            >
              {isVibes ? "Finish" : "Skip"}
            </button>
            <button
              type="button"
              onClick={() => (isVibes ? finish() : setStep((s) => s + 1))}
              className="rounded-full bg-hp-ink px-6 py-3 text-[13px] font-black text-hp-paper transition active:scale-95"
            >
              {isVibes ? "Enter ΗΛΕΑ PULSE" : "Continue"}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

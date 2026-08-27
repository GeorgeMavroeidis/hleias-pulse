import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, Ticket, X } from "lucide-react";
import {
  CULTURAL_EVENTS_STRINGS,
  CULTURAL_EVENT_TYPES,
  CULTURAL_EVENT_TYPE_META,
  tr,
  type CreateCulturalEventInput,
  type CulturalEventType,
  type Lang,
} from "@/lib/hp/cultural-events-types";
import { uploadCulturalEventPoster } from "@/lib/hp-api";

function fieldClass() {
  return "w-full rounded-2xl border border-hp-ink/10 bg-white/60 px-3 py-2.5 text-[13px] text-hp-ink outline-none placeholder:text-hp-muted";
}

interface Props {
  open: boolean;
  lang: Lang;
  onClose: () => void;
  onSubmit: (input: CreateCulturalEventInput) => Promise<void>;
}

export function OrganizerEventComposer({ open, lang, onClose, onSubmit }: Props) {
  const s = CULTURAL_EVENTS_STRINGS;
  const [title, setTitle] = useState("");
  const [greekTitle, setGreekTitle] = useState("");
  const [eventType, setEventType] = useState<CulturalEventType>(CULTURAL_EVENT_TYPES[0]);
  const [venueName, setVenueName] = useState("");
  const [area, setArea] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [descriptionEl, setDescriptionEl] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setGreekTitle("");
    setEventType(CULTURAL_EVENT_TYPES[0]);
    setVenueName("");
    setArea("");
    setEventDate("");
    setDescriptionEl("");
    setDescriptionEn("");
    setTicketUrl("");
    setPosterUrl("");
    setSaving(false);
    setError(null);
  }, [open]);

  const upload = async (file: File | null) => {
    if (!file) return;
    try {
      setSaving(true);
      setPosterUrl(await uploadCulturalEventPoster(file));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : tr(lang, s.posterUploadError));
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !title.trim() ||
      !greekTitle.trim() ||
      !venueName.trim() ||
      !area.trim() ||
      !eventDate ||
      !descriptionEl.trim() ||
      !posterUrl.trim()
    ) {
      setError(tr(lang, s.formIncomplete));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        greekTitle: greekTitle.trim(),
        eventType,
        venueName: venueName.trim(),
        area: area.trim(),
        eventDate: new Date(eventDate).toISOString(),
        descriptionEl: descriptionEl.trim(),
        descriptionEn: descriptionEn.trim() || undefined,
        posterUrl: posterUrl.trim(),
        ticketUrl: ticketUrl.trim() || undefined,
      });
      onClose();
    } catch (submitErr) {
      setError(submitErr instanceof Error ? submitErr.message : tr(lang, s.submitError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[88] overflow-hidden"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
            aria-label={tr(lang, s.close)}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 240 }}
            role="dialog"
            aria-modal="true"
            aria-label={tr(lang, s.newCulturalEvent)}
            className="hp-composer-sheet absolute inset-x-0 bottom-0 max-h-[90%] max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-bg p-4"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hp-ink/15" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-black text-hp-ink">
                  <Ticket size={18} /> {tr(lang, s.newCulturalEvent)}
                </h3>
                <p className="mt-0.5 text-[11px] text-hp-muted">{tr(lang, s.reviewNotice)}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-hp-ink/5 text-hp-ink"
                aria-label={tr(lang, s.close)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={submit} className="grid gap-3">
              <input
                className={fieldClass()}
                placeholder={tr(lang, s.titleField)}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                className={fieldClass()}
                placeholder={tr(lang, s.greekTitleField)}
                value={greekTitle}
                onChange={(e) => setGreekTitle(e.target.value)}
              />
              <select
                className={fieldClass()}
                value={eventType}
                onChange={(e) => setEventType(e.target.value as CulturalEventType)}
              >
                {CULTURAL_EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {tr(lang, CULTURAL_EVENT_TYPE_META[type].label)}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={fieldClass()}
                  placeholder={tr(lang, s.venueField)}
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                />
                <input
                  className={fieldClass()}
                  placeholder={tr(lang, s.areaField)}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                />
              </div>
              <input
                className={fieldClass()}
                type="datetime-local"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
              <textarea
                className={fieldClass()}
                rows={3}
                placeholder={tr(lang, s.descriptionElField)}
                value={descriptionEl}
                onChange={(e) => setDescriptionEl(e.target.value)}
              />
              <textarea
                className={fieldClass()}
                rows={2}
                placeholder={tr(lang, s.descriptionEnField)}
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
              />
              <input
                className={fieldClass()}
                placeholder={tr(lang, s.ticketUrlField)}
                value={ticketUrl}
                onChange={(e) => setTicketUrl(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <input
                  className={fieldClass()}
                  placeholder={tr(lang, s.posterUrlField)}
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                />
                <label className="shrink-0 cursor-pointer rounded-2xl border border-hp-ink/10 bg-white/60 px-3 py-2.5 text-hp-ink">
                  <ImagePlus size={16} />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => void upload(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              {posterUrl && (
                <img className="h-28 w-full rounded-2xl object-cover" src={posterUrl} alt="" />
              )}
              {error && <p className="text-[12px] font-semibold text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={saving}
                className="mt-1 w-full rounded-full bg-hp-ink py-3 text-[13px] font-black text-hp-paper disabled:opacity-60"
              >
                {saving ? tr(lang, s.submitting) : tr(lang, s.submitForReview)}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

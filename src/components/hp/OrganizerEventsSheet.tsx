import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { Lock, Pencil, Ticket, X } from "lucide-react";
import {
  CULTURAL_EVENTS_STRINGS,
  tr,
  type CulturalEvent,
  type Lang,
} from "@/lib/hp/cultural-events-types";
import { ImageBox } from "./ImageBox";

interface Props {
  open: boolean;
  lang: Lang;
  events: CulturalEvent[];
  onClose: () => void;
  onEdit: (event: CulturalEvent) => void;
}

// Same palette as the admin OrganizersPanel status badges.
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-600/15",
  published: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  hidden: "bg-slate-100 text-slate-600 ring-slate-500/15",
};

function statusLabel(lang: Lang, status: string | undefined): string {
  const s = CULTURAL_EVENTS_STRINGS;
  if (status === "published") return tr(lang, s.statusPublished);
  if (status === "hidden") return tr(lang, s.statusHidden);
  return tr(lang, s.statusPending);
}

export function OrganizerEventsSheet({ open, lang, events, onClose, onEdit }: Props) {
  const s = CULTURAL_EVENTS_STRINGS;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[86] overflow-hidden"
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
            aria-label={tr(lang, s.myEvents)}
            className="hp-composer-sheet absolute inset-x-0 bottom-0 max-h-[85%] max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-bg p-4"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hp-ink/15" />
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-black text-hp-ink">
                <Ticket size={18} /> {tr(lang, s.myEvents)}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-hp-ink/5 text-hp-ink"
                aria-label={tr(lang, s.close)}
              >
                <X size={16} />
              </button>
            </div>

            {events.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-hp-ink/15 bg-hp-paper/60 px-4 py-8 text-center text-[12px] text-hp-muted">
                {tr(lang, s.myEventsEmpty)}
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {events.map((ev) => {
                  const editable = ev.moderationStatus === "pending";
                  const heading = lang === "EN" ? ev.title : ev.greekTitle;
                  return (
                    <li
                      key={ev.id}
                      className="flex items-center gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-2.5"
                    >
                      <ImageBox
                        src={ev.posterUrl}
                        alt=""
                        className="h-12 w-12 shrink-0"
                        rounded="rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold text-hp-ink">{heading}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                              STATUS_STYLE[ev.moderationStatus ?? "pending"] ?? STATUS_STYLE.pending
                            }`}
                          >
                            {statusLabel(lang, ev.moderationStatus)}
                          </span>
                          <span className="text-[10.5px] text-hp-muted">
                            {format(new Date(ev.eventDate), "d MMM yyyy")}
                          </span>
                        </div>
                      </div>
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => onEdit(ev)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-hp-ink px-3 py-1.5 text-[11px] font-bold text-hp-paper transition active:scale-95"
                        >
                          <Pencil size={12} /> {tr(lang, s.edit)}
                        </button>
                      ) : (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-hp-muted"
                          title={tr(lang, s.editLockedCaption)}
                        >
                          <Lock size={11} /> {tr(lang, s.editLockedCaption)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

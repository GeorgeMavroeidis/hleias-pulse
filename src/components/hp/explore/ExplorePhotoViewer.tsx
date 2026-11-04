import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import type { ExploreMedia } from "@/lib/hp/explore-media";
import { useI18n } from "@/lib/i18n";

/** Full-screen photo pager for the photos pinned on the map. */
export function ExplorePhotoViewer({
  items,
  startIndex,
  title,
  onClose,
  onOpenPlace,
}: {
  items: ExploreMedia[];
  startIndex: number;
  title: string;
  onClose: () => void;
  onOpenPlace: () => void;
}) {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    const track = trackRef.current;
    if (track) track.scrollLeft = startIndex * track.clientWidth;
    closeRef.current?.focus();
  }, [startIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const track = trackRef.current;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (track && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        const next = Math.max(
          0,
          Math.min(items.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)),
        );
        track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, items.length, onClose]);

  const current = items[index];
  // Rendered into the app shell: the map's own stacking context would otherwise
  // leave the navigation bar drawn over a "full-screen" viewer.
  const host = document.querySelector<HTMLElement>(".hp-app-shell") ?? document.body;
  return createPortal(
    <motion.div
      className="xp-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        ref={trackRef}
        className="xp-viewer__track hp-no-scrollbar"
        onScroll={(event) => {
          const track = event.currentTarget;
          setIndex(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
        }}
      >
        {items.map((item, itemIndex) => (
          <figure key={item.id} className="xp-viewer__slide">
            <img
              src={item.url}
              alt={item.caption ?? ""}
              loading={Math.abs(itemIndex - startIndex) <= 1 ? "eager" : "lazy"}
              decoding="async"
            />
          </figure>
        ))}
      </div>
      <div className="xp-viewer__top">
        <span className="xp-viewer__count">
          {index + 1} / {items.length}
        </span>
        <button
          ref={closeRef}
          type="button"
          className="xp-viewer__close"
          onClick={onClose}
          aria-label={t("Close")}
        >
          <X size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
      <div className="xp-viewer__bottom">
        <div className="xp-viewer__copy">
          <strong>{title}</strong>
          {current?.caption && <span>{current.caption}</span>}
          {current?.credit &&
            (current.sourceUrl ? (
              <a href={current.sourceUrl} target="_blank" rel="noopener noreferrer">
                {t("Photo: {credit}", { credit: current.credit })}
              </a>
            ) : (
              <small>{t("Photo: {credit}", { credit: current.credit })}</small>
            ))}
        </div>
        <button type="button" className="xp-viewer__open" onClick={onOpenPlace}>
          {t("Open place")}
          <ArrowUpRight size={16} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
    </motion.div>,
    host,
  );
}

import { motion } from "framer-motion";
import { Flame, MapPin, Users } from "lucide-react";
import type { Place } from "@/lib/hp-model";
import { ImageBox } from "./ImageBox";

interface Props {
  place: Place;
  index: number;
  onOpen: (place: Place) => void;
  onGoing: (place: Place) => void;
}

const STATUS_LABEL: Record<Place["status"], string> = {
  quiet: "Quiet",
  active: "Warming up",
  popular: "Busy",
  busy: "Packed",
};

/**
 * Big "trending tonight" hero above the feed. Bridges Map ↔ Feed ↔ Meet: tapping
 * the card opens the place; "I'm going" writes an RSVP. The crowd gauge + stacked
 * avatars are the social-proof engine.
 */
export function TrendingHero({ place, index, onOpen, onGoing }: Props) {
  const isHot = place.status === "busy" || place.status === "popular";
  const gauge = Math.min(1, place.hotness / 10);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="group relative mb-4 block w-full overflow-hidden rounded-3xl border border-hp-ink/10 text-left shadow-[0_12px_30px_rgba(23,20,17,0.12)]"
    >
      <button
        type="button"
        onClick={() => onOpen(place)}
        aria-label={`Trending now: ${place.name}. Open details.`}
        className="relative block h-52 w-full text-left"
      >
        <ImageBox
          src={place.imageUrl}
          alt={place.name}
          className="h-full w-full"
          rounded="rounded-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/18 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

        {/* Hot badge */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-hp-sunset px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-hp-paper shadow-lg">
            <Flame size={11} /> #{index + 1} tonight
          </span>
        </div>

        {/* Crowd gauge (top-right) */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">
          <Users size={11} />
          <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-white/30">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-hp-sunset"
              style={{ width: `${Math.round(gauge * 100)}%` }}
            />
          </span>
          <span>{STATUS_LABEL[place.status]}</span>
        </div>

        {/* Title block */}
        <div className="absolute bottom-3 left-3.5 right-3.5 text-hp-paper">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-bold text-hp-paper/85">
            <MapPin size={11} /> {place.area}
          </div>
          <h3 className="text-[22px] font-black leading-none drop-shadow-sm">{place.name}</h3>
          <p className="mt-1 line-clamp-1 text-[12px] font-medium text-hp-paper/85">
            {place.short}
          </p>

          {/* Stacked avatars */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex -space-x-2">
              {place.avatars.slice(0, 4).map((a, i) => (
                <img
                  key={i}
                  src={a}
                  alt=""
                  loading="lazy"
                  className="h-6 w-6 rounded-full border-2 border-black/30 object-cover"
                />
              ))}
            </div>
            <span className="text-[11px] font-bold text-hp-paper/90">
              {place.recentPostCount + place.commentCount} here recently
            </span>
          </div>
        </div>
      </button>

      {/* CTA bar */}
      <div className="flex items-center gap-2 bg-hp-paper px-3 py-2.5">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide ${
            isHot ? "text-hp-sunset" : "text-hp-olive"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isHot ? "bg-hp-sunset" : "bg-hp-olive"}`} />
          {place.hotness.toFixed(1)} pulse
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onGoing(place);
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-hp-ink px-3.5 py-2 text-[12px] font-bold text-hp-paper transition active:scale-95 max-[360px]:mr-12"
        >
          I&apos;m going
        </button>
      </div>
    </motion.article>
  );
}

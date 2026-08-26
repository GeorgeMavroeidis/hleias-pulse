import { motion } from "framer-motion";
import { ImageBox } from "./ImageBox";
import { toneStyle, type PlaceStoryGroup } from "@/lib/hp/place-stories";
import { useLang } from "@/lib/hp/language-context";
import { STORY_LIVE_BADGE, openStoriesAriaLabel } from "@/lib/hp/pulse-strings";

interface Props {
  groups: PlaceStoryGroup[];
  onOpen: (placeId: string, storyId?: string) => void;
}

/**
 * Horizontal rail of place-story bubbles. Each bubble = a place; the ring encodes
 * its tone (sea/olive/purple/sunset) and dims once every story has been seen.
 */
export function PlaceStoryRail({ groups, onOpen }: Props) {
  const { lang } = useLang();
  if (groups.length === 0) return null;

  return (
    <div
      className="hp-no-scrollbar -mx-4 mb-4 flex gap-3 overflow-x-auto px-4"
      role="list"
      aria-label={lang === "GR" ? "Ιστορίες μερών" : "Place stories"}
    >
      {groups.map((group) => {
        const tone = toneStyle(group.hasUnseen ? group.tone : "muted");
        const lead = group.stories[0];
        return (
          <motion.button
            key={group.placeId}
            type="button"
            role="listitem"
            whileTap={{ scale: 0.93 }}
            onClick={() => onOpen(group.placeId)}
            aria-label={openStoriesAriaLabel(lang, group.count, group.placeName)}
            className="hp-story-bubble flex w-[4.25rem] shrink-0 flex-col items-center gap-1 text-center"
          >
            <div className="hp-story-bubble__ring" style={{ background: tone.gradient }}>
              <div className="hp-story-bubble__thumb h-14 w-14">
                <ImageBox
                  src={lead.mediaUrl}
                  alt={group.placeName}
                  className="h-full w-full"
                  rounded="rounded-full"
                />
              </div>
              {group.live && <span className="hp-story-bubble__live">{STORY_LIVE_BADGE[lang]}</span>}
              {group.count > 1 && (
                <span className="hp-story-bubble__count" aria-hidden="true">
                  {group.count}
                </span>
              )}
            </div>
            <span
              className="block w-full truncate text-[10px] font-bold text-hp-ink/85"
              title={group.placeName}
            >
              {group.placeName}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

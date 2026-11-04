import { motion } from "framer-motion";
import { ImageBox } from "./ImageBox";
import { toneStyle, type PlaceStoryGroup } from "@/lib/hp/place-stories";
import { useI18n } from "@/lib/i18n";

interface Props {
  groups: PlaceStoryGroup[];
  onOpen: (placeId: string, storyId?: string) => void;
}

/**
 * Horizontal rail of place-story bubbles. Each bubble = a place; the ring encodes
 * its tone (sea/olive/purple/sunset) and dims once every story has been seen.
 */
export function PlaceStoryRail({ groups, onOpen }: Props) {
  const { language, t } = useI18n();
  if (groups.length === 0) return null;

  return (
    <div
      className="hp-no-scrollbar -mx-4 mb-4 flex gap-3 overflow-x-auto px-4"
      role="list"
      aria-label={language === "GR" ? "Stories ανά σημείο" : "Place stories"}
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
            aria-label={
              language === "GR"
                ? `Άνοιγμα ${group.count} stories για ${group.placeName}`
                : `Open ${group.count} stor${group.count === 1 ? "y" : "ies"} for ${group.placeName}`
            }
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
              {group.live && <span className="hp-story-bubble__live">{t("Live")}</span>}
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

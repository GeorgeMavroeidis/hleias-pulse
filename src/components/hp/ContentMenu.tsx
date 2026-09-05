import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellOff, Bell, Flag, MoreHorizontal, UserX, UserCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useModeration, type ModerationTarget } from "./use-moderation";

/**
 * The "..." overflow attached to every piece of user-generated content:
 * report, block, mute. One component so the six entry points stay identical
 * and there is a single place to change the wording or the order.
 *
 * Block and mute need an author user id. Seeded content has none, so those two
 * rows hide themselves rather than render a dead button; report always shows.
 */
export function ContentMenu({
  target,
  tone = "ink",
  className = "",
  placement = "below",
  onOpenChange,
}: {
  target: ModerationTarget;
  /** "ink" on paper backgrounds, "light" over photography. */
  tone?: "ink" | "light";
  className?: string;
  /** "above" for triggers near the bottom of the screen, so the menu stays on screen. */
  placement?: "below" | "above";
  /** Lets a host pause itself while the menu is up — the story player uses this. */
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const moderation = useModeration();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const notifyOpen = useRef(onOpenChange);
  notifyOpen.current = onOpenChange;
  useEffect(() => {
    notifyOpen.current?.(open);
  }, [open]);

  // Dismiss on Escape or a pointer press outside. A backdrop element would be
  // the obvious choice, but these menus sit inside framer-motion cards whose
  // transforms turn `position: fixed` into the card's own box, so a full-screen
  // backdrop cannot be trusted here.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  const authorUserId = target.authorUserId ?? null;
  const isOwnContent = Boolean(
    authorUserId && moderation.currentUserId && authorUserId === moderation.currentUserId,
  );
  const canBlock = Boolean(authorUserId) && !isOwnContent;
  const blocked = moderation.isBlocked(authorUserId);
  const muted = moderation.isMuted(authorUserId);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const rows: {
    id: string;
    icon: typeof Flag;
    label: string;
    danger?: boolean;
    run: () => void;
  }[] = [
    {
      id: "report",
      icon: Flag,
      label: t("Report"),
      run: () => moderation.openReport(target),
    },
  ];

  if (canBlock) {
    rows.push({
      id: "mute",
      icon: muted ? Bell : BellOff,
      label: t(muted ? "Unmute account" : "Mute account"),
      run: () => moderation.mute(target),
    });
    rows.push({
      id: "block",
      icon: blocked ? UserCheck : UserX,
      label: t(blocked ? "Unblock account" : "Block account"),
      danger: !blocked,
      run: () => moderation.block(target),
    });
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("More options")}
        className={`grid h-8 w-8 place-items-center rounded-full transition active:scale-90 ${
          tone === "light"
            ? "border border-white/30 text-white backdrop-blur-sm"
            : "text-hp-ink/45 hover:text-hp-ink"
        }`}
      >
        <MoreHorizontal size={tone === "light" ? 15 : 17} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.94, y: placement === "above" ? 4 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: placement === "above" ? 4 : -4 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
            className={`absolute right-0 z-[90] w-[212px] overflow-hidden rounded-2xl border border-hp-ink/10 bg-hp-paper p-1 shadow-[0_18px_40px_-16px_rgba(23,20,17,0.45)] ${
              placement === "above" ? "bottom-11 origin-bottom-right" : "top-9 origin-top-right"
            }`}
          >
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <button
                  key={row.id}
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    run(row.run);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[12.5px] font-bold transition active:scale-[0.98] hover:bg-hp-ink/5 ${
                    row.danger ? "text-hp-sunset" : "text-hp-ink"
                  }`}
                >
                  <Icon size={14} strokeWidth={2.2} />
                  {row.label}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Flame,
  Trophy,
  Bookmark,
  ChevronRight,
  BadgeCheck,
  Radio,
  Sun,
  Music2,
  Route,
  type LucideIcon,
} from "lucide-react";
import type { StreakState } from "@/lib/hp/meet-store";

interface Badge {
  id: string;
  label: string;
  icon: "radio" | "sun" | "music" | "route" | "flame";
  desc: string;
  earned: boolean;
  progress: number;
}

interface LeaderRow {
  name: string;
  avatar: string;
  points: number;
  you?: boolean;
}

const BADGE_ICONS: Record<Badge["icon"], LucideIcon> = {
  radio: Radio,
  sun: Sun,
  music: Music2,
  route: Route,
  flame: Flame,
};

interface SavedRefs {
  placeCount: number;
  postCount: number;
  routeCount: number;
  onOpenSaved: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  handle: string;
  badges: Badge[];
  streak: StreakState;
  leaderboard: LeaderRow[];
  stats: { posts: number; tips: number; rsvps: number; routesSaved: number };
  saved: SavedRefs;
}

export function ProfileSheet({
  open,
  onClose,
  handle,
  badges,
  streak,
  leaderboard,
  stats,
  saved,
}: Props) {
  const earned = badges.filter((b) => b.earned).length;
  const rank = leaderboard.findIndex((r) => r.you) + 1;

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
            aria-label="Close profile"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 240 }}
            role="dialog"
            aria-modal="true"
            aria-label="Your profile"
            className="hp-composer-sheet absolute inset-x-0 bottom-0 max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-bg p-4"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hp-ink/15" />
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-hp-ink">Your profile</h3>
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-hp-ink/5 text-hp-ink"
                aria-label="Close profile"
              >
                <X size={16} />
              </button>
            </div>

            {/* Identity */}
            <div className="flex items-center gap-3 rounded-3xl border border-hp-ink/10 bg-hp-paper p-3.5">
              <img
                src="https://i.pravatar.cc/120?img=22"
                alt={handle}
                className="h-14 w-14 rounded-full border border-hp-ink/10 object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-[15px] font-black text-hp-ink">
                    Local Explorer
                  </span>
                  <BadgeCheck size={15} className="shrink-0 text-hp-sea" />
                </div>
                <div className="text-[11.5px] font-bold text-hp-muted">@{handle}</div>
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-hp-sunset/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-hp-sunset">
                  <Flame size={10} /> {streak.count}-day streak
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[
                { n: stats.posts, l: "Posts" },
                { n: stats.tips, l: "Tips" },
                { n: stats.rsvps, l: "Going" },
                { n: earned, l: "Badges" },
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-2xl border border-hp-ink/10 bg-hp-paper p-2.5 text-center"
                >
                  <div className="text-[18px] font-black leading-none text-hp-ink">{s.n}</div>
                  <div className="mt-1 text-[9.5px] font-bold uppercase tracking-wide text-hp-muted">
                    {s.l}
                  </div>
                </div>
              ))}
            </div>

            {/* Badges */}
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-hp-muted">
                <Trophy size={12} /> Badges
              </div>
              <div className="grid grid-cols-5 gap-2">
                {badges.map((b) => {
                  const Icon = BADGE_ICONS[b.icon];
                  return (
                    <div
                      key={b.id}
                      className={`flex flex-col items-center gap-1 rounded-2xl border p-2 text-center transition ${
                        b.earned
                          ? "border-hp-sunset/30 bg-hp-sunset/5 text-hp-sunset"
                          : "border-hp-ink/8 bg-hp-paper text-hp-ink/45"
                      }`}
                      title={b.desc}
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-current/10">
                        <Icon size={15} strokeWidth={2.5} />
                      </span>
                      <span className="text-[8px] font-bold leading-tight text-hp-ink/80">
                        {b.label}
                      </span>
                      {!b.earned && (
                        <span className="mt-0.5 h-0.5 w-full overflow-hidden rounded-full bg-hp-ink/10">
                          <span
                            className="block h-full bg-hp-sunset"
                            style={{ width: `${Math.round(b.progress * 100)}%` }}
                          />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Leaderboard */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-hp-muted">
                  <Trophy size={12} /> This week in your area
                </div>
                <span className="text-[10px] font-bold text-hp-muted">You · #{rank || "—"}</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-hp-ink/10 bg-hp-paper">
                {leaderboard.map((row, i) => (
                  <div
                    key={row.name}
                    className={`flex items-center gap-2.5 px-3 py-2 ${i > 0 ? "border-t border-hp-ink/6" : ""} ${
                      row.you ? "bg-hp-sunset/8" : ""
                    }`}
                  >
                    <span
                      className={`w-4 text-center text-[12px] font-black ${i < 3 ? "text-hp-sunset" : "text-hp-muted"}`}
                    >
                      {i + 1}
                    </span>
                    <img
                      src={row.avatar}
                      alt=""
                      className="h-7 w-7 rounded-full border border-hp-ink/10 object-cover"
                      loading="lazy"
                    />
                    <span
                      className={`flex-1 truncate text-[12.5px] font-bold ${row.you ? "text-hp-sunset" : "text-hp-ink"}`}
                    >
                      {row.name}
                    </span>
                    <span className="text-[11px] font-black text-hp-ink/70">{row.points} pts</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Saved (demoted from nav) */}
            <button
              type="button"
              onClick={saved.onOpenSaved}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-3 text-left transition active:scale-[0.99]"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-hp-ink/5 text-hp-ink">
                <Bookmark size={16} />
              </span>
              <div className="flex-1">
                <div className="text-[13px] font-black text-hp-ink">Saved</div>
                <div className="text-[11px] text-hp-muted">
                  {saved.placeCount} places · {saved.postCount} posts · {saved.routeCount} routes
                </div>
              </div>
              <ChevronRight size={16} className="text-hp-muted" />
            </button>

            <p className="mt-4 text-center text-[10px] text-hp-muted">
              ΗΛΕΙΑ PULSE · ο λογαριασμός σου συγχρονίζεται με ασφάλεια
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

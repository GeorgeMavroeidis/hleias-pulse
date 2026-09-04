import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Map as MapIcon,
  Bookmark,
  X,
  MessageCircle,
  Share2,
  Clock,
  Wallet,
  Send,
  ExternalLink,
} from "lucide-react";
import {
  authorTypeColor,
  type Author,
  type Place,
  type Post,
  type Comment,
  type RouteItem,
} from "@/lib/hp-model";
import { useI18n } from "@/lib/i18n";
import { ImageBox } from "./ImageBox";
import { openStreetMapUrl } from "./pulse-shared";

export function RouteArticleModal({
  route,
  onClose,
  onOpenMap,
  onMapRoute,
  saved,
  comments,
  onSave,
  onShare,
  onComment,
  findPlace,
  findAuthor,
}: {
  route: RouteItem | null;
  onClose: () => void;
  onOpenMap: (id: string) => void;
  onMapRoute: (route: RouteItem) => void;
  saved: boolean;
  comments: Comment[];
  onSave: () => void;
  onShare: () => void;
  onComment: (text: string) => void;
  findPlace: (id: string) => Place | undefined;
  findAuthor: (id: string) => Author;
}) {
  const [text, setText] = useState("");
  const { language, t } = useI18n();
  return (
    <AnimatePresence>
      {route &&
        (() => {
          const a = findAuthor(route.authorId);
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[80] overflow-hidden"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/65"
                onClick={onClose}
                aria-label={t("Close")}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 240 }}
                role="dialog"
                aria-modal="true"
                aria-label={`Route: ${route.title}`}
                className="hp-fullscreen-modal absolute inset-x-0 bottom-0 flex w-full max-w-full flex-col overflow-hidden bg-hp-paper"
              >
                <div className="relative">
                  <ImageBox
                    src={route.imageUrl}
                    alt={route.title}
                    className="h-72 w-full"
                    rounded="rounded-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
                  <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-hp-paper/95 text-hp-ink"
                    aria-label={t("Close")}
                  >
                    <X size={16} />
                  </button>
                  <div className="absolute bottom-3 left-4 right-4 text-hp-paper">
                    <div className="mb-1 flex gap-1.5">
                      {route.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-white/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <h2 className="text-2xl font-black leading-tight">{route.title}</h2>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-4">
                  <div className="flex items-center gap-2">
                    <img
                      src={a.avatarUrl}
                      alt={a.name}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full border border-hp-ink/10 object-cover"
                      loading="lazy"
                    />
                    <div>
                      <div className="text-[13px] font-bold text-hp-ink">{a.name}</div>
                      <div
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: authorTypeColor[a.type] }}
                      >
                        {a.type}
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-3 text-[11px] text-hp-muted">
                      <span className="inline-flex items-center gap-0.5">
                        <Clock size={11} />
                        {route.duration}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <Wallet size={11} />
                        {route.budget}
                      </span>
                    </div>
                  </div>
                  <p className="mt-4 text-[15px] leading-relaxed text-hp-ink">{route.lede}</p>

                  <h3 className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wider text-hp-muted">
                    Timeline
                  </h3>
                  <ol className="relative space-y-3 border-l-2 border-hp-ink/10 pl-4">
                    {route.stops.map((s, i) => {
                      const p = findPlace(s.placeId);
                      return (
                        <li key={i} className="relative">
                          <span className="absolute -left-[22px] top-1 grid h-4 w-4 place-items-center rounded-full bg-hp-sunset text-[8px] font-bold text-hp-paper">
                            {i + 1}
                          </span>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-hp-sunset">
                            {s.time}
                          </div>
                          <div className="text-[14px] font-bold text-hp-ink">
                            {p?.name ?? s.title}
                          </div>
                          <div className="text-[12px] text-hp-muted">{s.title}</div>
                          <p className="mt-1 text-[13px] leading-snug text-hp-ink/90">{s.body}</p>
                          {p && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onOpenMap(p.id);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-hp-ink/15 px-3 py-1 text-[11px] font-semibold text-hp-ink"
                              >
                                <MapIcon size={11} /> Open on map
                              </button>
                              <a
                                href={openStreetMapUrl(p)}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={t("Open {place} in OpenStreetMap", { place: p.name })}
                                className="inline-grid h-7 w-7 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
                              >
                                <ExternalLink size={11} />
                              </a>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  <div className="mt-6 flex items-center gap-3 text-[12px] text-hp-ink/70">
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle size={14} />
                      {route.commentCount + comments.length}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${saved ? "text-hp-sunset" : ""}`}
                    >
                      <Bookmark size={14} />
                      {route.saves + (saved ? 1 : 0)}
                    </span>
                  </div>
                  <div className="mt-4 border-t border-hp-ink/10 pt-3">
                    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-hp-muted">
                      {t("Comments")}
                    </h4>
                    <div className="flex flex-col gap-2">
                      {comments.map((c, i) => (
                        <div key={i} className="rounded-2xl bg-hp-ink/5 px-3 py-2 text-[12px]">
                          <span className="font-bold text-hp-ink">{c.author}</span>{" "}
                          <span className="text-hp-ink/80">{c.text}</span>
                        </div>
                      ))}
                      {comments.length === 0 && (
                        <div className="text-[12px] text-hp-muted">
                          {language === "GR"
                            ? "Δεν υπάρχουν σχόλια ακόμη."
                            : "No route comments yet."}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2 rounded-full border border-hp-ink/10 bg-white/70 px-3 py-2">
                      <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        name={`route-comment-${route.id}`}
                        aria-label={t("Quick comment on route")}
                        autoComplete="off"
                        placeholder={
                          language === "GR"
                            ? "Πρόσθεσε σημείωση για τη διαδρομή…"
                            : "Add a route note…"
                        }
                        className="w-full bg-transparent text-[12px] outline-none placeholder:text-hp-muted"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && text.trim()) {
                            onComment(text.trim());
                            setText("");
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (text.trim()) {
                            onComment(text.trim());
                            setText("");
                          }
                        }}
                        className="grid h-7 w-7 place-items-center rounded-full bg-hp-ink text-hp-paper disabled:opacity-40"
                        disabled={!text.trim()}
                        aria-label={t("Post route comment")}
                      >
                        <Send size={12} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 flex gap-2 border-t border-hp-ink/10 bg-hp-paper/95 p-3 backdrop-blur">
                  <button
                    type="button"
                    onClick={() => onMapRoute(route)}
                    className="flex-1 rounded-full bg-hp-ink py-3 text-[12px] font-bold text-hp-paper"
                  >
                    <MapIcon size={13} className="mr-1 inline" /> Map route
                  </button>
                  <button
                    type="button"
                    onClick={onSave}
                    className={`flex-1 rounded-full border border-hp-ink/15 py-3 text-[12px] font-bold ${saved ? "bg-hp-sunset/10 text-hp-sunset" : "text-hp-ink"}`}
                  >
                    <Bookmark
                      size={13}
                      className="mr-1 inline"
                      fill={saved ? "currentColor" : "none"}
                    />{" "}
                    {saved ? "Saved" : "Save route"}
                  </button>
                  <button
                    type="button"
                    onClick={onShare}
                    className="grid h-11 w-11 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
                    aria-label={t("Share route")}
                  >
                    <Share2 size={15} />
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
    </AnimatePresence>
  );
}

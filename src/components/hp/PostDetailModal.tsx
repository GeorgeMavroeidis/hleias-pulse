import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Map as MapIcon,
  Bookmark,
  X,
  Heart,
  MessageCircle,
  Share2,
  MapPin,
  Send,
  ExternalLink,
} from "lucide-react";
import { authorTypeColor, type Author, type Place, type Post, type Comment } from "@/lib/hp-model";
import { useI18n } from "@/lib/i18n";
import { ImageBox } from "./ImageBox";
import { openStreetMapUrl } from "./pulse-shared";
import { ContentMenu } from "./ContentMenu";

export function PostDetailModal({
  post,
  onClose,
  onOpenMap,
  onLike,
  liked,
  likeCount,
  comments,
  onComment,
  saved,
  onSave,
  onShare,
  findPlace,
  findAuthor,
  findPostAuthor,
}: {
  post: Post | null;
  onClose: () => void;
  onOpenMap: (id: string) => void;
  onLike: () => void;
  liked: boolean;
  likeCount: number;
  comments: Comment[];
  onComment: (t: string) => void;
  saved: boolean;
  onSave: () => void;
  onShare: (post: Post) => void;
  findPlace: (id: string) => Place | undefined;
  findAuthor: (id: string) => Author;
  findPostAuthor: (post: Post) => Author;
}) {
  const [text, setText] = useState("");
  const { language, t } = useI18n();
  return (
    <AnimatePresence>
      {post &&
        (() => {
          const p = findPlace(post.placeId);
          const a = findPostAuthor(post);
          if (!p) return null;
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
                aria-label={`Post at ${p.name}`}
                className="hp-fullscreen-modal absolute inset-x-0 bottom-0 flex w-full max-w-full flex-col overflow-hidden bg-hp-paper"
              >
                <div className="relative">
                  <ImageBox
                    src={post.imageUrl}
                    alt={`${p.name} post`}
                    className="h-72 w-full"
                    rounded="rounded-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent" />
                  <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-hp-paper/95 text-hp-ink"
                    aria-label={t("Close")}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-3">
                  <div className="flex items-center gap-2">
                    <img
                      src={a.avatarUrl}
                      alt={a.name}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full border border-hp-ink/10 object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-hp-ink">{a.name}</span>
                        <span
                          className="rounded-sm px-1 py-[1px] text-[8px] font-bold uppercase tracking-wider text-hp-paper"
                          style={{ background: authorTypeColor[a.type] }}
                        >
                          {a.type}
                        </span>
                      </div>
                      <div className="text-[10px] text-hp-muted">
                        <MapPin size={9} className="mr-0.5 inline" />
                        {p.name} · {post.time}
                      </div>
                    </div>
                    <ContentMenu
                      target={{
                        type: "post",
                        id: post.id,
                        authorUserId: post.userId,
                        authorName: a.name,
                        authorAvatarUrl: a.avatarUrl,
                        summary: post.text,
                      }}
                    />
                  </div>
                  <p className="mt-3 text-[14px] leading-snug text-hp-ink">{post.text}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {post.tags.map((t) => (
                      <span key={t} className="text-[11px] font-semibold text-hp-deep/80">
                        #{t}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-[12px] text-hp-ink/70">
                    <button
                      type="button"
                      onClick={onLike}
                      className={`inline-flex items-center gap-1 ${liked ? "text-hp-sunset" : ""}`}
                      aria-label={t(liked ? "Unlike post" : "Like post")}
                    >
                      <Heart size={16} fill={liked ? "currentColor" : "none"} /> {likeCount}
                    </button>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle size={16} /> {comments.length}
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
                            ? "Γίνε ο πρώτος που σχολιάζει."
                            : "Be the first to comment."}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 border-t border-hp-ink/10 bg-hp-paper/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
                  <div className="mb-2 flex items-center gap-2 rounded-full border border-hp-ink/10 bg-white/70 px-3 py-2">
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      name={`post-comment-${post.id}`}
                      aria-label={t("Quick comment on post")}
                      autoComplete="off"
                      placeholder={t("Quick comment…")}
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
                      aria-label={t("Post comment")}
                    >
                      <Send size={12} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenMap(p.id);
                      }}
                      className="flex-1 rounded-full bg-hp-ink py-2.5 text-[12px] font-bold text-hp-paper"
                    >
                      <MapIcon size={13} className="mr-1 inline" /> Open on map
                    </button>
                    <a
                      href={openStreetMapUrl(p)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("Open {place} in OpenStreetMap", { place: p.name })}
                      className="grid h-10 w-10 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
                    >
                      <ExternalLink size={14} />
                    </a>
                    <button
                      type="button"
                      onClick={onSave}
                      className={`grid h-10 w-10 place-items-center rounded-full border border-hp-ink/15 ${saved ? "text-hp-sunset" : "text-hp-ink"}`}
                      aria-label={t(saved ? "Unsave post" : "Save post")}
                    >
                      <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onShare(post)}
                      className="grid h-10 w-10 place-items-center rounded-full border border-hp-ink/15 text-hp-ink"
                      aria-label={t("Share post")}
                    >
                      <Share2 size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
    </AnimatePresence>
  );
}

/* ============== Route Article Modal ============== */

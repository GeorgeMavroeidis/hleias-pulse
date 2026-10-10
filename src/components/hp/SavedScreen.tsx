import { useEffect, useRef, useState } from "react";
import { Bookmark, RefreshCw } from "lucide-react";
import type { Place, Post, RouteItem } from "@/lib/hp-model";
import { loadSavedItems, setSavedItem } from "@/lib/hp-api";
import {
  createSavedItemsStore,
  initialSavedItemsState,
  savedTargetAvailable,
  savedTargetKey,
  type SavedContent,
  type SavedTarget,
} from "@/lib/hp/saved-items";
import { useI18n } from "@/lib/i18n";
import { ImageBox } from "./ImageBox";

interface Props {
  userId: string | null;
  onOpenPlace: (place: Place, context: SavedContent) => void;
  onOpenPost: (post: Post, context: SavedContent) => void;
  onOpenRoute: (route: RouteItem, context: SavedContent) => void;
  onRemoved: (target: SavedTarget) => void;
  onBrowsePlaces: () => void;
}

export function SavedScreen(props: Props) {
  const [state, setState] = useState(initialSavedItemsState);
  const storeRef = useRef<ReturnType<typeof createSavedItemsStore> | null>(null);
  const onRemovedRef = useRef(props.onRemoved);
  onRemovedRef.current = props.onRemoved;
  useEffect(() => {
    const store = createSavedItemsStore({
      load: () => loadSavedItems(props.userId),
      remove: (target) => setSavedItem(target, false, props.userId),
      onRemoved: (target) => onRemovedRef.current(target),
      onChange: setState,
    });
    storeRef.current = store;
    void store.refresh();
    return () => {
      store.dispose();
      storeRef.current = null;
    };
  }, [props.userId]);
  return (
    <SavedItemsView
      {...props}
      {...state}
      onRefresh={() => {
        void storeRef.current?.refresh();
      }}
      onRemove={(target) => {
        void storeRef.current?.remove(target);
      }}
    />
  );
}

export function SavedItemsView({
  content,
  status,
  removing,
  removeError,
  onRefresh,
  onRemove,
  onOpenPlace,
  onOpenPost,
  onOpenRoute,
  onBrowsePlaces,
}: Omit<Props, "onRemoved" | "userId"> & {
  content: SavedContent | null;
  status: "loading" | "ready" | "error";
  removing: string[];
  removeError: boolean;
  onRefresh: () => void;
  onRemove: (target: SavedTarget) => void;
}) {
  const { language, t } = useI18n();
  const targets = content?.targets ?? [];
  return (
    <div className="px-4 pb-28 pt-3" aria-busy={status === "loading"}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="mb-1 text-2xl font-black text-hp-ink">{t("Saved")}</h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={status === "loading"}
          className="inline-flex items-center gap-1 rounded-full border border-hp-ink/15 px-3 py-2 text-xs font-bold text-hp-ink"
        >
          <RefreshCw size={12} aria-hidden="true" />
          {t("Refresh")}
        </button>
      </div>
      <p className="mb-4 text-[12px] text-hp-muted">{t("Your private little list.")}</p>
      {status === "loading" && (
        <p role="status" className="mb-4 text-sm text-hp-muted">
          {t("Loading saved items…")}
        </p>
      )}
      {status === "error" && (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-hp-ink/15 bg-hp-paper p-4 text-sm"
        >
          <p>{t("Could not load saved items. Your bookmarks have not been removed.")}</p>
          <button
            type="button"
            onClick={onRefresh}
            className="mt-3 rounded-full bg-hp-ink px-4 py-2 text-xs font-bold text-hp-paper"
          >
            {t("Retry")}
          </button>
        </div>
      )}
      {removeError && (
        <p role="alert" className="mb-4 text-sm text-hp-sunset">
          {t("Could not remove this bookmark. Try Remove again.")}
        </p>
      )}
      {status === "ready" && targets.length === 0 && (
        <div className="mt-12 rounded-3xl border border-dashed border-hp-ink/15 bg-hp-paper/60 p-8 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-hp-sunset/10 text-hp-sunset">
            <Bookmark size={20} aria-hidden="true" />
          </div>
          <h3 className="text-[15px] font-bold text-hp-ink">{t("Nothing saved yet")}</h3>
          <p className="mt-1 text-[12px] text-hp-muted">
            {t("Save places, posts, and routes to find them here.")}
          </p>
          <button
            type="button"
            onClick={onBrowsePlaces}
            className="mt-4 rounded-full border border-hp-ink/15 px-4 py-2 text-xs font-bold text-hp-ink"
          >
            {t("Browse places")}
          </button>
        </div>
      )}
      {content && targets.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label={t("Saved items")}>
          {targets.map((target) => {
            const key = savedTargetKey(target);
            const available = savedTargetAvailable(target, content);
            const place =
              target.type === "place"
                ? content.places.find((item) => item.id === target.id)
                : undefined;
            const post =
              target.type === "post"
                ? content.posts.find((item) => item.id === target.id)
                : undefined;
            const route =
              target.type === "route"
                ? content.routes.find((item) => item.id === target.id)
                : undefined;
            const title = place
              ? language === "GR"
                ? place.greekName || place.name
                : place.name
              : (route?.title ??
                (post
                  ? post.text
                  : t("Saved {kind}", {
                      kind: t(
                        target.type === "place"
                          ? "place"
                          : target.type === "post"
                            ? "post"
                            : "route",
                      ),
                    })));
            const image = place?.imageUrl ?? post?.imageUrl ?? route?.imageUrl;
            const open = () => {
              if (!available) return;
              if (place) onOpenPlace(place, content);
              if (post) onOpenPost(post, content);
              if (route) onOpenRoute(route, content);
            };
            return (
              <li key={key} className="rounded-2xl border border-hp-ink/10 bg-hp-paper p-3">
                {available ? (
                  <button
                    type="button"
                    onClick={open}
                    className="flex w-full min-w-0 gap-3 text-left"
                    aria-label={t("Open saved item: {title}", { title })}
                  >
                    {image && (
                      <ImageBox
                        src={image}
                        alt=""
                        className="h-16 w-16 shrink-0"
                        rounded="rounded-xl"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-hp-muted">
                        {t(
                          target.type === "place"
                            ? "Places"
                            : target.type === "post"
                              ? "Posts"
                              : "Routes",
                        )}
                      </span>
                      <span className="line-clamp-2 text-[12px] font-bold text-hp-ink">
                        {title}
                      </span>
                      <span className="line-clamp-1 text-[11px] text-hp-muted">
                        {place?.area ??
                          route?.lede ??
                          (post
                            ? content.places.find((item) => item.id === post.placeId)?.name
                            : "")}
                      </span>
                    </span>
                  </button>
                ) : (
                  <div>
                    <h3 className="text-sm font-bold text-hp-ink">{t("Saved item unavailable")}</h3>
                    <p className="mt-1 text-xs text-hp-muted">
                      {t("It may have been removed or you may no longer have access.")}
                    </p>
                    <p className="mt-1 text-[10px] text-hp-muted">
                      {t(
                        target.type === "place"
                          ? "Places"
                          : target.type === "post"
                            ? "Posts"
                            : "Routes",
                      )}
                    </p>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  {!available && (
                    <button
                      type="button"
                      onClick={onRefresh}
                      disabled={status === "loading"}
                      className="rounded-full border border-hp-ink/15 px-3 py-2 text-xs font-bold text-hp-ink"
                    >
                      {t("Refresh")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(target)}
                    disabled={removing.includes(key)}
                    aria-label={t("Remove saved item: {title}", {
                      title: available ? title : t("Saved item unavailable"),
                    })}
                    className="rounded-full border border-hp-ink/15 px-3 py-2 text-xs font-bold text-hp-ink"
                  >
                    {t(removing.includes(key) ? "Removing…" : "Remove")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

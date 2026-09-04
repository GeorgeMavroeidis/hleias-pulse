import { type ReactNode } from "react";
import { Bookmark } from "lucide-react";
import { typeColor, type Author, type Place, type Post, type RouteItem } from "@/lib/hp-model";
import { useI18n } from "@/lib/i18n";
import { ImageBox } from "./ImageBox";

export function SavedScreen({
  savedPlaceIds,
  savedPostIds,
  savedRouteIds,
  places,
  posts,
  routes,
  onOpenPlace,
  onOpenPost,
  onOpenRoute,
  onUnsavePlace,
  onUnsavePost,
  onUnsaveRoute,
  findPlace,
  findAuthor,
  findPostAuthor,
}: {
  savedPlaceIds: string[];
  savedPostIds: string[];
  savedRouteIds: string[];
  places: Place[];
  posts: Post[];
  routes: RouteItem[];
  onOpenPlace: (p: Place) => void;
  onOpenPost: (p: Post) => void;
  onOpenRoute: (r: RouteItem) => void;
  onUnsavePlace: (id: string) => void;
  onUnsavePost: (id: string) => void;
  onUnsaveRoute: (id: string) => void;
  findPlace: (id: string) => Place | undefined;
  findAuthor: (id: string) => Author;
  findPostAuthor: (post: Post) => Author;
}) {
  const { language, t } = useI18n();
  const savedPlaces = places.filter((p) => savedPlaceIds.includes(p.id));
  const savedPostsList = posts.filter((p) => savedPostIds.includes(p.id));
  const savedRoutesList = routes.filter((r) => savedRouteIds.includes(r.id));
  const total = savedPlaces.length + savedPostsList.length + savedRoutesList.length;
  return (
    <div className="px-4 pb-28 pt-3">
      <h2 className="mb-1 text-2xl font-black text-hp-ink">{t("Saved")}</h2>
      <p className="mb-4 text-[12px] text-hp-muted">{t("Your private little list.")}</p>
      {total === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-hp-ink/15 bg-hp-paper/60 p-8 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-hp-sunset/10 text-hp-sunset">
            <Bookmark size={20} />
          </div>
          <h3 className="text-[15px] font-bold text-hp-ink">{t("Nothing saved yet")}</h3>
          <p className="mt-1 text-[12px] text-hp-muted">
            {t("Save places, posts, and routes to find them here.")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {savedPlaces.length > 0 && (
            <SavedSection title="Places">
              <div className="grid grid-cols-2 gap-3">
                {savedPlaces.map((p) => (
                  <div
                    key={p.id}
                    className="overflow-hidden rounded-2xl border border-hp-ink/10 bg-hp-paper"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenPlace(p)}
                      className="block w-full text-left"
                      aria-label={t("Open saved place {place}", { place: p.name })}
                    >
                      <ImageBox
                        src={p.imageUrl}
                        alt={p.name}
                        className="h-28 w-full"
                        rounded="rounded-none"
                      />
                      <div className="p-2">
                        <div
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: typeColor[p.type] }}
                        >
                          {p.type}
                        </div>
                        <div className="line-clamp-1 text-[12px] font-bold text-hp-ink">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-hp-muted">{p.area}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onUnsavePlace(p.id)}
                      className="mx-2 mb-2 rounded-full border border-hp-ink/10 px-2 py-1 text-[10px] font-bold text-hp-ink/70"
                    >
                      {t("Unsave")}
                    </button>
                  </div>
                ))}
              </div>
            </SavedSection>
          )}

          {savedPostsList.length > 0 && (
            <SavedSection title="Posts">
              <div className="flex flex-col gap-2">
                {savedPostsList.map((post) => {
                  const place = findPlace(post.placeId);
                  const author = findPostAuthor(post);
                  if (!place) return null;
                  return (
                    <div
                      key={post.id}
                      className="flex gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-2"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenPost(post)}
                        className="flex min-w-0 flex-1 gap-3 text-left"
                        aria-label={t("Open saved post at {place}", { place: place.name })}
                      >
                        <ImageBox
                          src={post.imageUrl}
                          alt={`${place.name} post`}
                          className="h-16 w-16 shrink-0"
                          rounded="rounded-xl"
                        />
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                            {author.name} · {place.name}
                          </div>
                          <div className="line-clamp-2 text-[12px] font-semibold text-hp-ink">
                            {post.text}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onUnsavePost(post.id)}
                        className="self-start rounded-full border border-hp-ink/10 px-2 py-1 text-[10px] font-bold text-hp-ink/70"
                      >
                        {t("Unsave")}
                      </button>
                    </div>
                  );
                })}
              </div>
            </SavedSection>
          )}

          {savedRoutesList.length > 0 && (
            <SavedSection title="Routes">
              <div className="flex flex-col gap-2">
                {savedRoutesList.map((route) => (
                  <div
                    key={route.id}
                    className="flex gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-2"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenRoute(route)}
                      className="flex min-w-0 flex-1 gap-3 text-left"
                      aria-label={t("Open saved route {route}", { route: route.title })}
                    >
                      <ImageBox
                        src={route.imageUrl}
                        alt={route.title}
                        className="h-16 w-16 shrink-0"
                        rounded="rounded-xl"
                      />
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                          {route.duration} · {route.budget}
                        </div>
                        <div className="line-clamp-1 text-[12px] font-bold text-hp-ink">
                          {route.title}
                        </div>
                        <div className="line-clamp-1 text-[11px] text-hp-muted">{route.lede}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onUnsaveRoute(route.id)}
                      className="self-start rounded-full border border-hp-ink/10 px-2 py-1 text-[10px] font-bold text-hp-ink/70"
                    >
                      {t("Unsave")}
                    </button>
                  </div>
                ))}
              </div>
            </SavedSection>
          )}
        </div>
      )}
    </div>
  );
}

function SavedSection({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-hp-muted">
        {t(title)}
      </h3>
      {children}
    </section>
  );
}

/* ============== Place Detail Modal ============== */

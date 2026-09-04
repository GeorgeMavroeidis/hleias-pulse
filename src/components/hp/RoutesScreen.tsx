import { MustSeeTodayDeck } from "./PulseFeed";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Bookmark, X, MessageCircle, Clock, Wallet } from "lucide-react";
import {
  authorTypeColor,
  type Author,
  type Place,
  type Comment,
  type RouteItem,
} from "@/lib/hp-model";
import { useI18n } from "@/lib/i18n";
import { ImageBox } from "./ImageBox";
import { ROUTE_FILTERS, type RouteFilter } from "./pulse-shared";

function routeMatchesQuery(route: RouteItem, author: Author, query: string) {
  if (!query.trim()) return true;
  const normalizedQuery = query.toLowerCase();
  return [
    route.title,
    route.lede,
    route.duration,
    route.budget,
    author.name,
    author.type,
    ...route.tags,
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function routeMatchesFilter(route: RouteItem, filter: RouteFilter) {
  if (filter === "All") return true;
  if (filter === "Beach")
    return route.tags.some((tag) => ["beach", "party", "sunset"].includes(tag));
  if (filter === "Nature")
    return route.tags.some((tag) => ["nature", "shade", "village"].includes(tag));
  if (filter === "Culture")
    return route.tags.some((tag) => ["culture", "roadtrip", "views"].includes(tag));
  if (filter === "No car") return route.tags.includes("no car") || route.tags.includes("walk");
  return route.budget.toLowerCase() === "free" || route.tags.includes("free");
}

function RouteCard({
  route,
  author,
  saved,
  commentCount,
  onOpenRoute,
}: {
  route: RouteItem;
  author: Author;
  saved: boolean;
  commentCount: number;
  onOpenRoute: (route: RouteItem) => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onOpenRoute(route)}
      aria-label={`Read route ${route.title}`}
      className="overflow-hidden rounded-3xl border border-hp-ink/10 bg-hp-paper text-left"
    >
      <div className="relative">
        <ImageBox
          src={route.imageUrl}
          alt={route.title}
          className="h-48 w-full"
          rounded="rounded-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-2 left-3 right-3 text-hp-paper">
          <div className="mb-1 flex gap-1.5">
            {route.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur"
              >
                {tag}
              </span>
            ))}
          </div>
          <h3 className="text-xl font-black leading-tight">{route.title}</h3>
        </div>
      </div>
      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <img
            src={author.avatarUrl}
            alt={author.name}
            width={28}
            height={28}
            className="h-7 w-7 rounded-full border border-hp-ink/10 object-cover"
            loading="lazy"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold text-hp-ink">{author.name}</div>
            <div
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: authorTypeColor[author.type] }}
            >
              {author.type}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-hp-ink/85">{route.lede}</p>
        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-hp-muted">
          <span className="inline-flex items-center gap-1">
            <Clock size={11} />
            {route.duration}
          </span>
          <span className="inline-flex items-center gap-1">
            <Wallet size={11} />
            {route.budget}
          </span>
          <span>{route.stops.length} stops</span>
          <span className="ml-auto inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5">
              <MessageCircle size={11} />
              {commentCount}
            </span>
            <span className={`inline-flex items-center gap-0.5 ${saved ? "text-hp-sunset" : ""}`}>
              <Bookmark size={11} />
              {route.saves + (saved ? 1 : 0)}
            </span>
          </span>
        </div>
        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-hp-ink px-4 py-2 text-[12px] font-bold text-hp-paper">
          Read route
        </div>
      </div>
    </motion.button>
  );
}

function RouteSection({
  title,
  eyebrow,
  routes,
  savedRoutes,
  routeComments,
  findAuthor,
  onOpenRoute,
}: {
  title: string;
  eyebrow: string;
  routes: RouteItem[];
  savedRoutes: Record<string, boolean>;
  routeComments: Record<string, Comment[]>;
  findAuthor: (id: string) => Author;
  onOpenRoute: (route: RouteItem) => void;
}) {
  if (routes.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-hp-muted">
          {eyebrow}
        </div>
        <h3 className="text-[17px] font-black text-hp-ink">{title}</h3>
      </div>
      {routes.map((route) => {
        const author = findAuthor(route.authorId);
        const saved = savedRoutes[route.id];
        const commentCount = route.commentCount + (routeComments[route.id]?.length ?? 0);
        return (
          <RouteCard
            key={route.id}
            route={route}
            author={author}
            saved={!!saved}
            commentCount={commentCount}
            onOpenRoute={onOpenRoute}
          />
        );
      })}
    </section>
  );
}

export function RoutesScreen({
  routes,
  onOpenRoute,
  savedRoutes,
  routeComments,
  findAuthor,
  showMustSee,
  places,
  onOpenPlace,
}: {
  routes: RouteItem[];
  onOpenRoute: (r: RouteItem) => void;
  savedRoutes: Record<string, boolean>;
  routeComments: Record<string, Comment[]>;
  findAuthor: (id: string) => Author;
  showMustSee: boolean;
  places: Place[];
  onOpenPlace: (place: Place) => void;
}) {
  const { language, t } = useI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RouteFilter>("All");
  const visibleRoutes = useMemo(
    () =>
      routes.filter((route) => {
        const author = findAuthor(route.authorId);
        return routeMatchesQuery(route, author, query) && routeMatchesFilter(route, filter);
      }),
    [filter, findAuthor, query, routes],
  );
  const recommendedRoutes = visibleRoutes.filter((route) =>
    findAuthor(route.authorId).type.includes("EDITOR"),
  );
  const localRoutes = visibleRoutes.filter(
    (route) => !findAuthor(route.authorId).type.includes("EDITOR"),
  );

  return (
    <div className="px-4 pb-28 pt-3">
      <h2 className="mb-1 text-2xl font-black text-hp-ink">{t("Routes")}</h2>
      <p className="mb-4 text-[12px] text-hp-muted">
        {t("Curated local routes with practical stops.")}
      </p>
      {showMustSee && <MustSeeTodayDeck places={places} onOpenPlace={onOpenPlace} />}
      <div className="mb-3 rounded-2xl border border-hp-ink/10 bg-white/60 p-2.5">
        <div className="flex items-center gap-2 rounded-full border border-hp-ink/10 bg-hp-paper px-3 py-2">
          <Search size={13} className="text-hp-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            name="route-search"
            aria-label={t("Search routes")}
            autoComplete="off"
            placeholder={t("Search routes, budget, area...")}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-hp-muted"
          />
        </div>
        <div className="hp-no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1">
          {ROUTE_FILTERS.map((option) => {
            const active = filter === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                aria-pressed={active}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${
                  active
                    ? "bg-hp-ink text-hp-paper"
                    : "border border-hp-ink/10 bg-hp-paper text-hp-ink/70"
                }`}
              >
                {t(option)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <RouteSection
          title={language === "GR" ? "Οι προτάσεις μας" : "What we recommend"}
          eyebrow={
            language === "GR"
              ? `${recommendedRoutes.length} επιλεγμένες`
              : `${recommendedRoutes.length} curated`
          }
          routes={recommendedRoutes}
          savedRoutes={savedRoutes}
          routeComments={routeComments}
          findAuthor={findAuthor}
          onOpenRoute={onOpenRoute}
        />
        <RouteSection
          title={language === "GR" ? "Προτείνουν οι ντόπιοι" : "Locals recommend"}
          eyebrow={
            language === "GR"
              ? `${localRoutes.length} από την κοινότητα`
              : `${localRoutes.length} community`
          }
          routes={localRoutes}
          savedRoutes={savedRoutes}
          routeComments={routeComments}
          findAuthor={findAuthor}
          onOpenRoute={onOpenRoute}
        />
        {visibleRoutes.length === 0 && (
          <div className="rounded-3xl border border-dashed border-hp-ink/15 bg-hp-paper/60 p-8 text-center">
            <h3 className="text-[15px] font-bold text-hp-ink">{t("No routes match")}</h3>
            <p className="mt-1 text-[12px] text-hp-muted">
              {t("Try another filter or search term.")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ActiveRouteGuide({
  route,
  stopIndex,
  findPlace,
  onOpenStop,
  onNext,
  onClose,
}: {
  route: RouteItem;
  stopIndex: number;
  findPlace: (id: string) => Place | undefined;
  onOpenStop: (placeId: string, index: number) => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { language, t } = useI18n();
  const stop = route.stops[stopIndex] ?? route.stops[0];
  const place = stop ? findPlace(stop.placeId) : null;
  const total = route.stops.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute left-4 right-4 top-[6.75rem] z-30 rounded-2xl border border-hp-ink/10 bg-hp-paper/96 p-3 shadow-[0_12px_32px_rgba(23,20,17,0.16)] backdrop-blur"
    >
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-hp-sunset text-[13px] font-black text-hp-paper">
          {stopIndex + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase text-hp-muted">
            {language === "GR" ? "Ενεργή διαδρομή · στάση" : "Active route · stop"} {stopIndex + 1}/
            {total}
          </div>
          <h3 className="truncate text-[14px] font-black leading-tight text-hp-ink">
            {place?.name ?? stop?.title ?? route.title}
          </h3>
          <p className="line-clamp-2 text-[11.5px] leading-snug text-hp-muted">
            {stop?.body ?? route.lede}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hp-ink/5 text-hp-ink"
          aria-label={t("Close")}
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        {stop && (
          <button
            type="button"
            onClick={() => onOpenStop(stop.placeId, stopIndex)}
            className="flex-1 rounded-full border border-hp-ink/15 px-3 py-2 text-[11.5px] font-bold text-hp-ink"
          >
            {language === "GR" ? "Κέντρο στη στάση" : "Center stop"}
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-full bg-hp-ink px-3 py-2 text-[11.5px] font-bold text-hp-paper"
        >
          {language === "GR"
            ? stopIndex >= total - 1
              ? "Από την αρχή"
              : "Επόμενη στάση"
            : stopIndex >= total - 1
              ? "Restart"
              : "Next stop"}
        </button>
      </div>
    </motion.div>
  );
}

/* ============== Saved ============== */

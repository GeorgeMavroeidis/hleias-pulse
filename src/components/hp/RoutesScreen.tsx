import { MustSeeTodayDeck } from "./PulseFeed";
import { AddToTripButton } from "./AddToTripButton";
import { Capacitor } from "@capacitor/core";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Bookmark, X, MessageCircle, Clock, Wallet, Navigation } from "lucide-react";
import { type Author, type Place, type Comment, type RouteItem } from "@/lib/hp-model";
import { useI18n } from "@/lib/i18n";
import type { NavigationProvider } from "@/lib/hp/route-navigation";
import { formatRouteDistance, formatRouteDuration } from "@/lib/hp/route-preview";
import { ImageBox } from "./ImageBox";
import { AUTHOR_ROLE_LABEL, ROUTE_FILTERS, roleKey, type RouteFilter } from "./pulse-shared";

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
  const { t } = useI18n();
  const role = roleKey(author.type);
  return (
    // An article, not a button: it holds two controls ("Read route" and "Add to
    // my trip"). Tapping anywhere else on the card still opens the route.
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onOpenRoute(route)}
      className="cursor-pointer text-left"
    >
      <div className="relative overflow-hidden rounded-[22px] shadow-[var(--hp-shadow-card)]">
        <ImageBox
          src={route.imageUrl}
          alt={route.title}
          className="aspect-[16/10] w-full"
          rounded="rounded-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
        <div className="absolute bottom-3.5 left-4 right-4 text-hp-on-media">
          <h3 className="text-[21px] font-bold leading-[1.12] tracking-[-0.025em]">
            {route.title}
          </h3>
          <p className="mt-1 flex items-center gap-2.5 text-[12.5px] font-medium text-white/85">
            <span className="inline-flex items-center gap-1">
              <Clock size={12} strokeWidth={2.2} aria-hidden="true" />
              {route.duration}
            </span>
            <span className="inline-flex items-center gap-1">
              <Wallet size={12} strokeWidth={2.2} aria-hidden="true" />
              {route.budget}
            </span>
            <span>{t("{n} stops", { n: route.stops.length })}</span>
          </p>
        </div>
      </div>
      <div className="px-1 pt-3">
        <div className="flex items-center gap-2.5">
          <img
            src={author.avatarUrl}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-full object-cover shadow-[0_0_0_0.5px_var(--hp-border)]"
            loading="lazy"
          />
          <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-hp-ink">
            {author.name}{" "}
            <span className="font-medium text-hp-muted">
              · {t(AUTHOR_ROLE_LABEL[role] ?? "Local")}
            </span>
          </div>
          <span className="inline-flex items-center gap-2.5 text-[12.5px] font-medium text-hp-muted">
            <span className="inline-flex items-center gap-1">
              <MessageCircle size={13} strokeWidth={2} aria-hidden="true" />
              {commentCount}
            </span>
            <span className={`inline-flex items-center gap-1 ${saved ? "text-hp-sunset" : ""}`}>
              <Bookmark size={13} strokeWidth={2} aria-hidden="true" />
              {route.saves + (saved ? 1 : 0)}
            </span>
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-[14px] leading-snug text-hp-ink/80">{route.lede}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenRoute(route);
            }}
            aria-label={t("Read route {route}", { route: route.title })}
            className="inline-flex h-10 items-center rounded-full bg-hp-ink px-4 text-[13.5px] font-semibold text-hp-bg active:scale-95"
          >
            {t("Read route")}
          </button>
          <AddToTripButton kind="route" id={route.id} name={route.title} className="px-4" />
        </div>
      </div>
    </motion.article>
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
    <section className="flex flex-col gap-5">
      <h3 className="hp-section-title">
        {title}
        <small>{eyebrow}</small>
      </h3>
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
    <div className="px-4 pb-28 pt-4">
      <h2 className="hp-screen-title mb-5">{t("Routes")}</h2>
      {showMustSee && <MustSeeTodayDeck places={places} onOpenPlace={onOpenPlace} />}
      <div className="mb-6 flex flex-col gap-3">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-hp-fill px-3.5">
          <Search
            size={16}
            strokeWidth={2.2}
            className="shrink-0 text-hp-muted"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            name="route-search"
            aria-label={t("Search routes")}
            autoComplete="off"
            placeholder={t("Search routes, budget, area...")}
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-hp-muted"
          />
        </label>
        <div className="hp-pill-row">
          {ROUTE_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className="hp-pill"
            >
              {t(option)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-9">
        <RouteSection
          title={language === "GR" ? "Οι προτάσεις μας" : "What we recommend"}
          eyebrow={String(recommendedRoutes.length)}
          routes={recommendedRoutes}
          savedRoutes={savedRoutes}
          routeComments={routeComments}
          findAuthor={findAuthor}
          onOpenRoute={onOpenRoute}
        />
        <RouteSection
          title={language === "GR" ? "Προτείνουν οι ντόπιοι" : "Locals recommend"}
          eyebrow={String(localRoutes.length)}
          routes={localRoutes}
          savedRoutes={savedRoutes}
          routeComments={routeComments}
          findAuthor={findAuthor}
          onOpenRoute={onOpenRoute}
        />
        {visibleRoutes.length === 0 && (
          <div className="fd-empty">
            <strong>{t("No routes match")}</strong>
            <p>{t("Try another filter or search term.")}</p>
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
  onNavigate,
  onClose,
}: {
  route: RouteItem;
  stopIndex: number;
  findPlace: (id: string) => Place | undefined;
  onOpenStop: (placeId: string, index: number) => void;
  onNext: () => void;
  onNavigate: (placeId: string, provider: NavigationProvider) => void;
  onClose: () => void;
}) {
  const { language, t } = useI18n();
  const stop = route.stops[stopIndex] ?? route.stops[0];
  const place = stop ? findPlace(stop.placeId) : null;
  const total = route.stops.length;
  const distance = formatRouteDistance(route.routeDistanceMeters);
  const duration = formatRouteDuration(route.routeDurationSeconds);
  const isIos = Capacitor.getPlatform() === "ios";

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
          <p className="mt-0.5 text-[10.5px] font-semibold text-hp-muted">
            {distance && duration
              ? `${route.routingProfile === "foot-walking" ? "Walk" : "Drive"} · ${distance} · ${duration}`
              : language === "GR"
                ? "Πρόχειρη ευθεία διαδρομή · χωρίς ETA"
                : "Stop-to-stop preview · no ETA"}
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
      {stop && (
        <div className="mt-2 flex items-center gap-2 border-t border-hp-ink/10 pt-2">
          <span className="mr-auto flex items-center gap-1 text-[10.5px] font-bold text-hp-muted">
            <Navigation size={12} />{" "}
            {language === "GR" ? "Πλοήγηση στη στάση" : "Navigate to next stop"}
          </span>
          {isIos && (
            <button
              type="button"
              onClick={() => onNavigate(stop.placeId, "apple")}
              className="rounded-full border border-hp-ink/15 px-2.5 py-1.5 text-[10.5px] font-bold text-hp-ink"
            >
              Apple Maps
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate(stop.placeId, "google")}
            className="rounded-full border border-hp-ink/15 px-2.5 py-1.5 text-[10.5px] font-bold text-hp-ink"
          >
            Google Maps
          </button>
        </div>
      )}
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

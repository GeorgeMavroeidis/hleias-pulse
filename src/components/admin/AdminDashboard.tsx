import { Children, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FilePenLine,
  ImagePlus,
  LayoutDashboard,
  MapPin,
  RefreshCw,
  Route,
  ShieldCheck,
  Ticket,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { AdminMapPicker } from "./AdminMapPicker";
import {
  EMPTY_ADMIN_DATA,
  type AdminComment,
  type AdminCulturalEvent,
  type AdminData,
  type AdminMeetEvent,
  type AdminOrganizer,
  type AdminPlace,
  type AdminPost,
  type AdminProfile,
  type AdminRole,
  type AdminRoute,
  type AdminRouteStop,
  type AdminStory,
  type ModerationTarget,
  type OrganizerVerificationStatus,
  editAdminComment,
  editAdminPost,
  getAdminRole,
  loadAdminData,
  moderateContent,
  removeAdminMember,
  replaceAdminRouteStops,
  saveAdminCulturalEvent,
  createAdminOrganizer,
  saveAdminMeetEvent,
  saveAdminPlace,
  saveAdminRoute,
  saveAdminStory,
  setAdminMember,
  setOrganizerVerification,
  uploadContentMedia,
} from "@/lib/admin-api";
import { getCurrentPulseAccount, type PulseAccountState } from "@/lib/hp-auth";
import { useI18n } from "@/lib/i18n";
import { CULTURAL_EVENT_TYPES, CULTURAL_EVENT_TYPE_META, tr } from "@/lib/hp/cultural-events-types";

type AdminTab =
  | "overview"
  | "places"
  | "stories"
  | "meet"
  | "cultural"
  | "organizers"
  | "routes"
  | "moderation"
  | "team";
type Notice = { tone: "success" | "error"; message: string } | null;
type ModerationItem = {
  type: ModerationTarget;
  id: string;
  title: string;
  detail: string;
  status: string;
  createdAt: string;
};

const PAGE_SIZE = 12;
const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100";
const labelClass = "text-xs font-bold uppercase tracking-[0.12em] text-slate-500";

const TABS: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "places", label: "Places", icon: MapPin },
  { id: "stories", label: "Stories", icon: ImagePlus },
  { id: "meet", label: "Meet events", icon: Clock3 },
  { id: "cultural", label: "Cultural events", icon: Ticket },
  { id: "organizers", label: "Organizers", icon: UserCheck },
  { id: "routes", label: "Routes", icon: Route },
  { id: "moderation", label: "Moderation", icon: ShieldCheck },
  { id: "team", label: "Team", icon: Users },
];

function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function slug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "new-item"
  );
}

function tags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function placeCoordinates(lat: number, lng: number) {
  const x = ((lng - 19.9) / (23.25 - 19.9)) * 100;
  const y = ((39.15 - lat) / (39.15 - 36.35)) * 100;
  return {
    x: Math.round(Math.max(0, Math.min(100, x))),
    y: Math.round(Math.max(0, Math.min(100, y))),
  };
}

function formatDate(value: string | null | undefined, language: "GR" | "EN" = "GR") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "GR" ? "el-GR" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const palette =
    status === "published"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15"
      : status === "hidden"
        ? "bg-slate-100 text-slate-600 ring-slate-500/15"
        : "bg-amber-50 text-amber-800 ring-amber-600/15";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ring-1 ${palette}`}
    >
      {t(status[0].toUpperCase() + status.slice(1))}
    </span>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
      {typeof children === "string" ? t(children) : children}
    </div>
  );
}

function SectionHeader({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-black tracking-tight text-slate-950">{t(title)}</h2>
        <p className="mt-1 text-sm text-slate-500">{t(detail)}</p>
      </div>
      {action}
    </div>
  );
}

function ActionButton({
  children,
  tone = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "muted" | "danger" }) {
  const { t } = useI18n();
  const classes =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      : tone === "muted"
        ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        : "border-orange-600 bg-orange-600 text-white hover:bg-orange-700";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
      {...props}
    >
      {Children.map(children, (child) => {
        if (typeof child !== "string") return child;
        const label = child.trim();
        return label ? child.replace(label, t(label)) : child;
      })}
    </button>
  );
}

export function AdminDashboard() {
  const { language, toggleLanguage, t } = useI18n();
  const [account, setAccount] = useState<PulseAccountState>({ status: "loading" });
  const [role, setRole] = useState<AdminRole | null>(null);
  const [data, setData] = useState<AdminData>(EMPTY_ADMIN_DATA);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [tab, setTab] = useState<AdminTab>("overview");

  const load = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const nextAccount = await getCurrentPulseAccount();
      setAccount(nextAccount);
      if (nextAccount.status !== "ready") {
        setRole(null);
        setData(EMPTY_ADMIN_DATA);
        return;
      }
      const nextRole = await getAdminRole();
      setRole(nextRole);
      if (!nextRole) {
        setData(EMPTY_ADMIN_DATA);
        return;
      }
      setData(await loadAdminData());
    } catch (error) {
      console.error("Could not load admin data.", error);
      setNotice({
        tone: "error",
        message: describeError(error, t("Could not load admin data.")),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const canEdit = role === "owner" || role === "editor";
  const isOwner = role === "owner";

  if (loading) return <AdminLoading />;
  if (account.status !== "ready") return <AdminSignIn />;
  if (!role) return <AdminDenied />;

  return (
    <main className="min-h-[100dvh] bg-slate-100 text-slate-900">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1600px] lg:grid-cols-[248px_1fr]">
        <aside className="border-b border-slate-800 bg-slate-950 px-4 py-5 text-slate-100 lg:border-b-0 lg:border-r">
          <a href="/" className="mb-8 flex items-center gap-3 px-2 text-left">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500 font-black text-white">
              HP
            </span>
            <span>
              <span className="block text-sm font-black tracking-tight">ΗΛΕΙΑ PULSE</span>
              <span className="block text-[11px] font-semibold text-slate-400">
                {t("Admin workspace")}
              </span>
            </span>
          </a>
          <nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-1 lg:overflow-visible">
            {TABS.filter((item) =>
              item.id === "team"
                ? isOwner
                : item.id === "places" ||
                    item.id === "stories" ||
                    item.id === "meet" ||
                    item.id === "cultural" ||
                    item.id === "organizers" ||
                    item.id === "routes"
                  ? canEdit
                  : true,
            ).map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition lg:w-full ${active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
                >
                  <Icon size={17} />
                  {t(item.label)}
                </button>
              );
            })}
          </nav>
          <div className="mt-8 hidden rounded-xl border border-white/10 bg-white/5 p-3 lg:block">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {language === "GR" ? "Συνδεδεμένος ως" : "Signed in as"}
            </div>
            <div className="mt-1 truncate text-sm font-bold">
              {account.profile.displayName || account.email}
            </div>
            <StatusBadge status={role} />
          </div>
        </aside>

        <section className="min-w-0 px-4 py-6 sm:px-7 lg:px-10">
          <header className="mb-7 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-500">
              {language === "GR" ? "Διαχείριση περιεχομένου" : "Content operations"}
            </div>
            <div className="flex items-center gap-2">
              <ActionButton tone="muted" onClick={toggleLanguage} aria-label={t("Toggle language")}>
                {language === "GR" ? "GR / en" : "gr / EN"}
              </ActionButton>
              <ActionButton tone="muted" onClick={() => void load()}>
                <RefreshCw size={15} /> {language === "GR" ? "Ανανέωση" : "Refresh"}
              </ActionButton>
            </div>
          </header>
          {notice && (
            <div
              className={`mb-5 rounded-xl border px-4 py-3 text-sm font-semibold ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
            >
              {notice.message}
            </div>
          )}
          {tab === "overview" && (
            <Overview data={data} onOpenModeration={() => setTab("moderation")} />
          )}
          {tab === "places" && canEdit && (
            <PlacesPanel data={data} onSaved={load} setNotice={setNotice} />
          )}
          {tab === "stories" && canEdit && (
            <StoriesPanel data={data} onSaved={load} setNotice={setNotice} />
          )}
          {tab === "meet" && canEdit && (
            <MeetPanel data={data} onSaved={load} setNotice={setNotice} />
          )}
          {tab === "cultural" && canEdit && (
            <CulturalEventsPanel data={data} onSaved={load} setNotice={setNotice} />
          )}
          {tab === "organizers" && canEdit && (
            <OrganizersPanel data={data} onSaved={load} setNotice={setNotice} />
          )}
          {tab === "routes" && canEdit && (
            <RoutesPanel data={data} onSaved={load} setNotice={setNotice} />
          )}
          {tab === "moderation" && (
            <ModerationPanel data={data} canEdit={canEdit} onSaved={load} setNotice={setNotice} />
          )}
          {tab === "team" && isOwner && (
            <TeamPanel data={data} onSaved={load} setNotice={setNotice} />
          )}
        </section>
      </div>
    </main>
  );
}

function AdminLoading() {
  const { t } = useI18n();
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-slate-100 text-sm font-bold text-slate-500">
      {t("Loading admin workspace…")}
    </main>
  );
}

function AdminSignIn() {
  const { language, t } = useI18n();
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-slate-100 p-5">
      <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <ShieldCheck className="mx-auto h-10 w-10 text-orange-500" />
        <h1 className="mt-4 text-2xl font-black text-slate-950">{t("Sign in first")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {language === "GR"
            ? "Ο χώρος διαχείρισης είναι διαθέσιμος μόνο σε εγκεκριμένα μέλη της ομάδας."
            : "The admin workspace is available only to an approved, signed-in team member."}
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
        >
          <ArrowLeft size={16} /> {language === "GR" ? "Μετάβαση στην εφαρμογή" : "Go to the app"}
        </a>
      </div>
    </main>
  );
}

function AdminDenied() {
  const { language, t } = useI18n();
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-slate-100 p-5">
      <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <CircleAlert className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-2xl font-black text-slate-950">{t("No admin access")}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {language === "GR"
            ? "Ο λογαριασμός σου είναι συνδεδεμένος, αλλά δεν ανήκει ακόμη στην ομάδα διαχείρισης."
            : "Your account is signed in, but it is not a member of the admin team yet. Ask an Owner to add your profile."}
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
        >
          <ArrowLeft size={16} /> {language === "GR" ? "Πίσω στην εφαρμογή" : "Back to the app"}
        </a>
      </div>
    </main>
  );
}

function Overview({ data, onOpenModeration }: { data: AdminData; onOpenModeration: () => void }) {
  const { language, t } = useI18n();
  const pending = [
    data.places,
    data.posts,
    data.comments,
    data.stories,
    data.meetEvents,
    data.culturalEvents,
  ]
    .flat()
    .filter((item) => item.moderation_status === "pending").length;
  const published = [
    data.places,
    data.posts,
    data.comments,
    data.stories,
    data.meetEvents,
    data.culturalEvents,
  ]
    .flat()
    .filter((item) => item.moderation_status === "published").length;
  const metrics = [
    { label: "Needs review", value: pending, tone: "text-amber-700 bg-amber-50" },
    { label: "Published items", value: published, tone: "text-emerald-700 bg-emerald-50" },
    {
      label: "Map places",
      value: data.places.filter((place) => place.moderation_status === "published").length,
      tone: "text-sky-700 bg-sky-50",
    },
    { label: "Admin members", value: data.members.length, tone: "text-violet-700 bg-violet-50" },
  ];
  return (
    <>
      <SectionHeader
        title="Good morning"
        detail="A clear view of your local content operations."
        action={
          <ActionButton onClick={onOpenModeration}>
            <ShieldCheck size={16} /> {language === "GR" ? "Έλεγχος ουράς" : "Review queue"}
          </ActionButton>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className={`rounded-2xl p-5 ${metric.tone}`}>
            <div className="text-3xl font-black">{metric.value}</div>
            <div className="mt-1 text-sm font-bold">{t(metric.label)}</div>
          </div>
        ))}
      </div>
      <div className="mt-7 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-base font-black">{t("Recent admin activity")}</h3>
          <div className="mt-4 divide-y divide-slate-100">
            {data.auditLogs.length ? (
              data.auditLogs.slice(0, 8).map((log) => (
                <div key={log.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500">
                    <FilePenLine size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-bold text-slate-800">
                      {log.action.replaceAll("_", " ")}
                    </span>
                    <span className="ml-1 text-slate-500">
                      {log.entity_type}
                      {log.entity_id ? ` · ${log.entity_id}` : ""}
                    </span>
                  </span>
                  <time className="shrink-0 text-xs text-slate-400">
                    {formatDate(log.created_at, language)}
                  </time>
                </div>
              ))
            ) : (
              <EmptyState>
                {language === "GR"
                  ? "Οι ενέργειες των διαχειριστών θα εμφανίζονται εδώ."
                  : "Actions taken by admins will appear here."}
              </EmptyState>
            )}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
          <h3 className="text-base font-black">{t("Safe publishing workflow")}</h3>
          <ol className="mt-4 space-y-3 text-sm text-slate-300">
            <li className="flex gap-3">
              <span className="font-black text-orange-400">01</span>{" "}
              {language === "GR"
                ? "Το περιεχόμενο χρηστών μπαίνει στην ουρά ελέγχου."
                : "User content enters the pending queue."}
            </li>
            <li className="flex gap-3">
              <span className="font-black text-orange-400">02</span>{" "}
              {language === "GR"
                ? "Ένας moderator ελέγχει στοιχεία και εικόνες."
                : "A moderator verifies the details and media."}
            </li>
            <li className="flex gap-3">
              <span className="font-black text-orange-400">03</span>{" "}
              {language === "GR"
                ? "Η δημοσίευση το εμφανίζει στο app, ενώ η απόκρυψη το διατηρεί ανακτήσιμο."
                : "Publish makes it visible in the public app; Hide keeps it recoverable."}
            </li>
          </ol>
        </div>
      </div>
    </>
  );
}

function PlacesPanel({ data, onSaved, setNotice }: PanelProps) {
  const [selected, setSelected] = useState<AdminPlace | null>(null);
  const [query, setQuery] = useState("");
  const visible = data.places.filter((item) =>
    `${item.name} ${item.area} ${item.type}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
      <div>
        <SectionHeader
          title="Places"
          detail="Map locations and their public details."
          action={
            <ActionButton onClick={() => setSelected(null)}>
              <MapPin size={16} /> Add place
            </ActionButton>
          }
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Search places, areas, types…" />
        <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            {visible.length ? (
              visible.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => setSelected(place)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <img
                    className="h-11 w-11 rounded-lg object-cover bg-slate-100"
                    src={place.image_url}
                    alt=""
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{place.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {place.area} · {place.type}
                    </span>
                  </span>
                  <StatusBadge status={place.moderation_status} />
                  <ChevronRight size={16} className="text-slate-400" />
                </button>
              ))
            ) : (
              <EmptyState>No places match this search.</EmptyState>
            )}
          </div>
        </div>
      </div>
      <PlaceEditor
        key={selected?.id ?? "new"}
        place={selected}
        onSaved={onSaved}
        setNotice={setNotice}
      />
    </div>
  );
}

function PlaceEditor({
  place,
  onSaved,
  setNotice,
}: {
  place: AdminPlace | null;
  onSaved: () => Promise<void>;
  setNotice: (notice: Notice) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(place?.name ?? "");
  const [greekName, setGreekName] = useState(place?.greek_name ?? "");
  const [area, setArea] = useState(place?.area ?? "");
  const [type, setType] = useState(place?.type ?? "beach");
  const [lat, setLat] = useState(place?.lat ?? 37.68);
  const [lng, setLng] = useState(place?.lng ?? 21.52);
  const [short, setShort] = useState(place?.short ?? "");
  const [mood, setMood] = useState(place?.mood ?? "");
  const [imageUrl, setImageUrl] = useState(place?.image_url ?? "");
  const [tagText, setTagText] = useState(place?.tags.join(", ") ?? "");
  const [crowd, setCrowd] = useState(place?.crowd ?? "medium");
  const [budget, setBudget] = useState(place?.budget ?? "free");
  const [bestTime, setBestTime] = useState(place?.best_time ?? "sunset");
  const [pulse, setPulse] = useState(place?.pulse ?? 5);
  const [status, setStatus] = useState(place?.moderation_status ?? "published");
  const [saving, setSaving] = useState(false);
  const upload = async (file: File | null) => {
    if (!file) return;
    try {
      setSaving(true);
      setImageUrl(await uploadContentMedia(file, "places"));
      setNotice({ tone: "success", message: t("Image uploaded. Save the place to attach it.") });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not upload image."),
      });
    } finally {
      setSaving(false);
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !area.trim() || !short.trim() || !imageUrl.trim()) {
      setNotice({ tone: "error", message: t("Name, area, description, and image are required.") });
      return;
    }
    try {
      setSaving(true);
      const point = placeCoordinates(lat, lng);
      await saveAdminPlace({
        id: place?.id ?? `place-${slug(name)}`,
        name: name.trim(),
        greek_name: greekName.trim() || name.trim(),
        area: area.trim(),
        type,
        lat,
        lng,
        ...point,
        pulse: Number(pulse),
        mood: mood.trim() || short.trim(),
        crowd,
        budget,
        best_time: bestTime,
        tags: tags(tagText),
        short: short.trim(),
        image_url: imageUrl.trim(),
        hotness: Number(pulse),
        comment_count: place?.comment_count ?? 0,
        recent_post_count: place?.recent_post_count ?? 0,
        status: Number(pulse) >= 9 ? "busy" : Number(pulse) >= 7 ? "popular" : "active",
        moderation_status: status,
        created_by_identity: "LOCAL",
      });
      await onSaved();
      setNotice({ tone: "success", message: t("Place saved.") });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not save place."),
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      onSubmit={save}
      className="self-start rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <h3 className="text-base font-black">{t(place ? "Edit place" : "New place")}</h3>
      <div className="mt-4 grid gap-3">
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Greek name">
          <input
            className={inputClass}
            value={greekName}
            onChange={(event) => setGreekName(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Area">
            <input
              className={inputClass}
              value={area}
              onChange={(event) => setArea(event.target.value)}
            />
          </Field>
          <Field label="Type">
            <select
              className={inputClass}
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {["beach", "culture", "food", "local", "nature", "night", "sunset", "village"].map(
                (item) => (
                  <option key={item}>{item}</option>
                ),
              )}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <input
              className={inputClass}
              type="number"
              step="any"
              value={lat}
              onChange={(event) => setLat(Number(event.target.value))}
            />
          </Field>
          <Field label="Longitude">
            <input
              className={inputClass}
              type="number"
              step="any"
              value={lng}
              onChange={(event) => setLng(Number(event.target.value))}
            />
          </Field>
        </div>
        <AdminMapPicker
          lat={lat}
          lng={lng}
          onChange={(nextLat, nextLng) => {
            setLat(Number(nextLat.toFixed(6)));
            setLng(Number(nextLng.toFixed(6)));
          }}
        />
        <Field label="Description">
          <textarea
            className={inputClass}
            rows={3}
            value={short}
            onChange={(event) => setShort(event.target.value)}
          />
        </Field>
        <Field label="Mood">
          <input
            className={inputClass}
            value={mood}
            onChange={(event) => setMood(event.target.value)}
          />
        </Field>
        <Field label="Tags (comma-separated)">
          <input
            className={inputClass}
            value={tagText}
            onChange={(event) => setTagText(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pulse">
            <input
              className={inputClass}
              type="number"
              min="1"
              max="10"
              value={pulse}
              onChange={(event) => setPulse(Number(event.target.value))}
            />
          </Field>
          <Field label="Visibility">
            <select
              className={inputClass}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="published">{t("Published")}</option>
              <option value="pending">{t("Pending")}</option>
              <option value="hidden">{t("Hidden")}</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Crowd">
            <input
              className={inputClass}
              value={crowd}
              onChange={(event) => setCrowd(event.target.value)}
            />
          </Field>
          <Field label="Budget">
            <input
              className={inputClass}
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </Field>
          <Field label="Best time">
            <input
              className={inputClass}
              value={bestTime}
              onChange={(event) => setBestTime(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Image">
          <div className="mt-1 flex items-center gap-2">
            <input
              className={inputClass}
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder={t("Image URL")}
            />
            <label className="shrink-0 cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
              <ImagePlus size={16} />
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => void upload(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </Field>
        {imageUrl && (
          <img className="h-28 w-full rounded-lg object-cover" src={imageUrl} alt={t("Preview")} />
        )}
        <ActionButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save place"}
        </ActionButton>
      </div>
    </form>
  );
}

function StoriesPanel({ data, onSaved, setNotice }: PanelProps) {
  const { language } = useI18n();
  const [selected, setSelected] = useState<AdminStory | null>(null);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div>
        <SectionHeader
          title="Stories"
          detail="Live editorial reports and time-limited updates."
          action={
            <ActionButton onClick={() => setSelected(null)}>
              <ImagePlus size={16} /> Add story
            </ActionButton>
          }
        />
        <ContentList
          items={data.stories}
          selectedId={selected?.id}
          onSelect={setSelected}
          title={(item) => item.label}
          subtitle={(item) => `${item.kind} · ${formatDate(item.created_at, language)}`}
          image={(item) => item.media_url}
        />
      </div>
      <StoryEditor
        key={selected?.id ?? "new"}
        story={selected}
        places={data.places}
        onSaved={onSaved}
        setNotice={setNotice}
      />
    </div>
  );
}

function StoryEditor({
  story,
  places,
  onSaved,
  setNotice,
}: {
  story: AdminStory | null;
  places: AdminPlace[];
  onSaved: () => Promise<void>;
  setNotice: (notice: Notice) => void;
}) {
  const { t } = useI18n();
  const [placeId, setPlaceId] = useState(story?.place_id ?? places[0]?.id ?? "");
  const [label, setLabel] = useState(story?.label ?? "");
  const [caption, setCaption] = useState(story?.caption ?? "");
  const [mediaUrl, setMediaUrl] = useState(story?.media_url ?? "");
  const [kind, setKind] = useState(story?.kind ?? "report");
  const [authorName, setAuthorName] = useState(story?.author_name ?? "ΗΛΕΙΑ PULSE");
  const [hours, setHours] = useState(story?.expires_after_hours ?? 24);
  const [status, setStatus] = useState(story?.moderation_status ?? "published");
  const [saving, setSaving] = useState(false);
  const upload = async (file: File | null) => {
    if (!file) return;
    try {
      setSaving(true);
      setMediaUrl(await uploadContentMedia(file, "stories"));
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not upload image."),
      });
    } finally {
      setSaving(false);
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!placeId || !label.trim() || !mediaUrl.trim())
      return setNotice({ tone: "error", message: t("Place, label, and image are required.") });
    try {
      setSaving(true);
      await saveAdminStory({
        id: story?.id ?? `story-${slug(label)}-${Date.now()}`,
        label: label.trim(),
        place_id: placeId,
        position: story?.position ?? Math.floor(Date.now() / 1000),
        kind,
        author_name: authorName.trim() || "ΗΛΕΙΑ PULSE",
        author_type: "EDITOR",
        author_avatar_url: story?.author_avatar_url ?? "https://i.pravatar.cc/120?img=47",
        media_url: mediaUrl.trim(),
        caption: caption.trim() || "Live update",
        expires_after_hours: Number(hours),
        crowd: story?.crowd ?? null,
        parking: story?.parking ?? null,
        condition: story?.condition ?? [],
        moderation_status: status,
      });
      await onSaved();
      setNotice({ tone: "success", message: t("Story saved.") });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not save story."),
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      onSubmit={save}
      className="self-start rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <h3 className="text-base font-black">{t(story ? "Edit story" : "New story")}</h3>
      <div className="mt-4 grid gap-3">
        <Field label="Place">
          <select
            className={inputClass}
            value={placeId}
            onChange={(event) => setPlaceId(event.target.value)}
          >
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Label">
          <input
            className={inputClass}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
        <Field label="Caption">
          <textarea
            className={inputClass}
            rows={3}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Story type">
            <select
              className={inputClass}
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              {[
                "report",
                "photo",
                "beach_status",
                "business_status",
                "editor_note",
                "event",
                "route_tease",
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Visible for hours">
            <input
              className={inputClass}
              type="number"
              min="1"
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
            />
          </Field>
        </div>
        <Field label="Author">
          <input
            className={inputClass}
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
          />
        </Field>
        <Field label="Visibility">
          <select
            className={inputClass}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="published">{t("Published")}</option>
            <option value="pending">{t("Pending")}</option>
            <option value="hidden">{t("Hidden")}</option>
          </select>
        </Field>
        <Field label="Image">
          <div className="mt-1 flex gap-2">
            <input
              className={inputClass}
              value={mediaUrl}
              onChange={(event) => setMediaUrl(event.target.value)}
            />
            <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2">
              <ImagePlus size={16} />
              <input
                className="hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => void upload(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </Field>
        {mediaUrl && (
          <img className="h-28 w-full rounded-lg object-cover" src={mediaUrl} alt={t("Preview")} />
        )}
        <ActionButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save story"}
        </ActionButton>
      </div>
    </form>
  );
}

function MeetPanel({ data, onSaved, setNotice }: PanelProps) {
  const { language } = useI18n();
  const [selected, setSelected] = useState<AdminMeetEvent | null>(null);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div>
        <SectionHeader
          title="Meet events"
          detail="Events hosted by the community and editorial team."
          action={
            <ActionButton onClick={() => setSelected(null)}>
              <Clock3 size={16} /> Add event
            </ActionButton>
          }
        />
        <ContentList
          items={data.meetEvents}
          selectedId={selected?.id}
          onSelect={setSelected}
          title={(item) => item.title}
          subtitle={(item) => formatDate(item.starts_at, language)}
          image={(item) => item.cover_url}
        />
      </div>
      <MeetEditor
        key={selected?.id ?? "new"}
        event={selected}
        places={data.places}
        onSaved={onSaved}
        setNotice={setNotice}
      />
    </div>
  );
}

function MeetEditor({
  event,
  places,
  onSaved,
  setNotice,
}: {
  event: AdminMeetEvent | null;
  places: AdminPlace[];
  onSaved: () => Promise<void>;
  setNotice: (notice: Notice) => void;
}) {
  const { t } = useI18n();
  const [placeId, setPlaceId] = useState(event?.place_id ?? places[0]?.id ?? "");
  const [title, setTitle] = useState(event?.title ?? "");
  const [startsAt, setStartsAt] = useState(event?.starts_at ? event.starts_at.slice(0, 16) : "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [coverUrl, setCoverUrl] = useState(event?.cover_url ?? "");
  const [category, setCategory] = useState(event?.category ?? "social");
  const [vibe, setVibe] = useState(event?.vibe ?? "Local");
  const [price, setPrice] = useState(event?.price ?? "Free");
  const [status, setStatus] = useState(event?.moderation_status ?? "published");
  const [saving, setSaving] = useState(false);
  const upload = async (file: File | null) => {
    if (!file) return;
    try {
      setSaving(true);
      setCoverUrl(await uploadContentMedia(file, "meet"));
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not upload image."),
      });
    } finally {
      setSaving(false);
    }
  };
  const save = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!placeId || !title.trim() || !startsAt || !description.trim() || !coverUrl.trim())
      return setNotice({
        tone: "error",
        message: t("Place, title, time, description, and image are required."),
      });
    try {
      setSaving(true);
      await saveAdminMeetEvent({
        id: event?.id ?? `meet-${slug(title)}-${Date.now()}`,
        place_id: placeId,
        title: title.trim(),
        host_name: event?.host_name ?? "ΗΛΕΙΑ PULSE",
        host_avatar_url: event?.host_avatar_url ?? "https://i.pravatar.cc/120?img=47",
        host_type: event?.host_type ?? "GUIDE",
        starts_at: new Date(startsAt).toISOString(),
        duration_min: event?.duration_min ?? 120,
        category,
        vibe,
        price,
        capacity: event?.capacity ?? null,
        description: description.trim(),
        cover_url: coverUrl.trim(),
        tags: event?.tags ?? [],
        seed_going_count: event?.seed_going_count ?? 0,
        seed_maybe_count: event?.seed_maybe_count ?? 0,
        going_count: event?.going_count ?? 0,
        maybe_count: event?.maybe_count ?? 0,
        hot: event?.hot ?? false,
        attendee_avatar_urls: event?.attendee_avatar_urls ?? [],
        moderation_status: status,
      });
      await onSaved();
      setNotice({ tone: "success", message: t("Meet event saved.") });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not save event."),
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      onSubmit={save}
      className="self-start rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <h3 className="text-base font-black">{t(event ? "Edit Meet event" : "New Meet event")}</h3>
      <div className="mt-4 grid gap-3">
        <Field label="Place">
          <select
            className={inputClass}
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
          >
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Starts at">
          <input
            className={inputClass}
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <input
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </Field>
          <Field label="Price">
            <input
              className={inputClass}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Vibe">
          <input className={inputClass} value={vibe} onChange={(e) => setVibe(e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea
            className={inputClass}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Visibility">
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="published">{t("Published")}</option>
            <option value="pending">{t("Pending")}</option>
            <option value="hidden">{t("Hidden")}</option>
          </select>
        </Field>
        <Field label="Cover image">
          <div className="mt-1 flex gap-2">
            <input
              className={inputClass}
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
            />
            <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2">
              <ImagePlus size={16} />
              <input
                className="hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void upload(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </Field>
        {coverUrl && (
          <img className="h-28 w-full rounded-lg object-cover" src={coverUrl} alt={t("Preview")} />
        )}
        <ActionButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save event"}
        </ActionButton>
      </div>
    </form>
  );
}

function CulturalEventsPanel({ data, onSaved, setNotice }: PanelProps) {
  const { language } = useI18n();
  const [selected, setSelected] = useState<AdminCulturalEvent | null>(null);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div>
        <SectionHeader
          title="Cultural events"
          detail="Theater, concerts, and festivals across Ilia."
          action={
            <ActionButton onClick={() => setSelected(null)}>
              <Ticket size={16} /> Add event
            </ActionButton>
          }
        />
        <ContentList
          items={data.culturalEvents}
          selectedId={selected?.id}
          onSelect={setSelected}
          title={(item) => item.title}
          subtitle={(item) => `${item.venue_name} · ${formatDate(item.event_date, language)}`}
          image={(item) => item.poster_url}
        />
      </div>
      <CulturalEventEditor
        key={selected?.id ?? "new"}
        event={selected}
        places={data.places}
        organizers={data.organizers}
        onSaved={onSaved}
        setNotice={setNotice}
      />
    </div>
  );
}

function CulturalEventEditor({
  event,
  places,
  organizers,
  onSaved,
  setNotice,
}: {
  event: AdminCulturalEvent | null;
  places: AdminPlace[];
  organizers: AdminOrganizer[];
  onSaved: () => Promise<void>;
  setNotice: (notice: Notice) => void;
}) {
  const { language, t } = useI18n();
  const [title, setTitle] = useState(event?.title ?? "");
  const [greekTitle, setGreekTitle] = useState(event?.greek_title ?? "");
  const [eventType, setEventType] = useState(event?.event_type ?? CULTURAL_EVENT_TYPES[0]);
  const [venueName, setVenueName] = useState(event?.venue_name ?? "");
  const [area, setArea] = useState(event?.area ?? "");
  const [placeId, setPlaceId] = useState(event?.place_id ?? "");
  const [eventDate, setEventDate] = useState(
    event?.event_date ? event.event_date.slice(0, 16) : "",
  );
  const [organizerId, setOrganizerId] = useState(event?.organizer_id ?? "");
  const [organizerName, setOrganizerName] = useState(event?.organizer_name ?? "");
  const [descriptionEl, setDescriptionEl] = useState(event?.description_el ?? "");
  const [descriptionEn, setDescriptionEn] = useState(event?.description_en ?? "");
  const [posterUrl, setPosterUrl] = useState(event?.poster_url ?? "");
  const [ticketUrl, setTicketUrl] = useState(event?.ticket_url ?? "");
  const [isPastEvent, setIsPastEvent] = useState(event?.is_past_event ?? false);
  const [isOfficial, setIsOfficial] = useState(event?.is_official ?? true);
  const [status, setStatus] = useState(event?.moderation_status ?? "published");
  const [saving, setSaving] = useState(false);
  const upload = async (file: File | null) => {
    if (!file) return;
    try {
      setSaving(true);
      setPosterUrl(await uploadContentMedia(file, "cultural-events"));
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not upload poster."),
      });
    } finally {
      setSaving(false);
    }
  };
  const save = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (
      !title.trim() ||
      !greekTitle.trim() ||
      !venueName.trim() ||
      !area.trim() ||
      !eventDate ||
      !organizerName.trim() ||
      !descriptionEl.trim() ||
      !posterUrl.trim()
    ) {
      setNotice({
        tone: "error",
        message: t(
          "Title, venue, area, date, organizer, Greek description, and poster are required.",
        ),
      });
      return;
    }
    try {
      setSaving(true);
      const place = places.find((item) => item.id === placeId);
      await saveAdminCulturalEvent({
        id: event?.id ?? `cultural-event-${slug(title)}-${Date.now()}`,
        title: title.trim(),
        greek_title: greekTitle.trim(),
        event_type: eventType,
        venue_name: venueName.trim(),
        area: area.trim(),
        place_id: placeId || null,
        lat: place?.lat ?? null,
        lng: place?.lng ?? null,
        event_date: new Date(eventDate).toISOString(),
        organizer_id: organizerId || null,
        organizer_name: organizerName.trim(),
        description_el: descriptionEl.trim(),
        description_en: descriptionEn.trim() || null,
        poster_url: posterUrl.trim(),
        ticket_url: ticketUrl.trim() || null,
        is_past_event: isPastEvent,
        is_official: isOfficial,
        moderation_status: status,
      });
      await onSaved();
      setNotice({ tone: "success", message: t("Cultural event saved.") });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not save cultural event."),
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      onSubmit={save}
      className="self-start rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <h3 className="text-base font-black">
        {t(event ? "Edit cultural event" : "New cultural event")}
      </h3>
      <div className="mt-4 grid gap-3">
        <Field label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Greek title">
          <input
            className={inputClass}
            value={greekTitle}
            onChange={(e) => setGreekTitle(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select
              className={inputClass}
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            >
              {CULTURAL_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {tr(language, CULTURAL_EVENT_TYPE_META[type].label)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Event date">
            <input
              className={inputClass}
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Venue name">
            <input
              className={inputClass}
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
            />
          </Field>
          <Field label="Area">
            <input className={inputClass} value={area} onChange={(e) => setArea(e.target.value)} />
          </Field>
        </div>
        <Field label="Linked place (optional)">
          <select
            className={inputClass}
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
          >
            <option value="">{t("No linked place")}</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Organizer (optional link)">
          <select
            className={inputClass}
            value={organizerId}
            onChange={(e) => {
              const nextId = e.target.value;
              setOrganizerId(nextId);
              const organizer = organizers.find((item) => item.id === nextId);
              if (organizer) setOrganizerName(organizer.display_name);
            }}
          >
            <option value="">{t("No linked organizer account")}</option>
            {organizers.map((organizer) => (
              <option key={organizer.id} value={organizer.id}>
                {organizer.display_name} · {organizer.verification_status}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Organizer display name">
          <input
            className={inputClass}
            value={organizerName}
            onChange={(e) => setOrganizerName(e.target.value)}
            placeholder="e.g. Δήμος Ήλιδας"
          />
        </Field>
        <Field label="Description (Greek)">
          <textarea
            className={inputClass}
            rows={3}
            value={descriptionEl}
            onChange={(e) => setDescriptionEl(e.target.value)}
          />
        </Field>
        <Field label="Description (English, optional)">
          <textarea
            className={inputClass}
            rows={3}
            value={descriptionEn}
            onChange={(e) => setDescriptionEn(e.target.value)}
          />
        </Field>
        <Field label="Ticket URL (optional)">
          <input
            className={inputClass}
            value={ticketUrl}
            onChange={(e) => setTicketUrl(e.target.value)}
            placeholder="https://viva.com/…"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={isPastEvent}
              onChange={(e) => setIsPastEvent(e.target.checked)}
            />
            {t("Past event")}
          </label>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={isOfficial}
              onChange={(e) => setIsOfficial(e.target.checked)}
            />
            {t("Official event")}
          </label>
        </div>
        <Field label="Visibility">
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="published">{t("Published")}</option>
            <option value="pending">{t("Pending")}</option>
            <option value="hidden">{t("Hidden")}</option>
          </select>
        </Field>
        <Field label="Poster">
          <div className="mt-1 flex gap-2">
            <input
              className={inputClass}
              value={posterUrl}
              onChange={(e) => setPosterUrl(e.target.value)}
            />
            <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2">
              <ImagePlus size={16} />
              <input
                className="hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => void upload(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </Field>
        {posterUrl && (
          <img className="h-28 w-full rounded-lg object-cover" src={posterUrl} alt={t("Preview")} />
        )}
        <ActionButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save event"}
        </ActionButton>
      </div>
    </form>
  );
}

function OrganizersPanel({ data, onSaved, setNotice }: PanelProps) {
  const { language, t } = useI18n();
  const organizerUserIds = new Set(data.organizers.map((organizer) => organizer.user_id));
  const [selectedId, setSelectedId] = useState("");
  const [adding, setAdding] = useState(false);
  const eligibleProfiles = data.profiles.filter(
    (profile) => profile.profile_completed_at && !organizerUserIds.has(profile.id),
  );

  const act = async (organizer: AdminOrganizer, status: OrganizerVerificationStatus) => {
    try {
      await setOrganizerVerification(organizer.id, status);
      await onSaved();
      setNotice({
        tone: "success",
        message: t(status === "verified" ? "Organizer verified." : "Organizer rejected."),
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not update organizer."),
      });
    }
  };

  const addDirect = async () => {
    const profile = data.profiles.find((item) => item.id === selectedId);
    if (!profile) return;
    try {
      setAdding(true);
      await createAdminOrganizer(profile.id, profile.display_name || profile.handle || "Organizer");
      await onSaved();
      setSelectedId("");
      setNotice({ tone: "success", message: t("Organizer added and verified.") });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not add organizer."),
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <SectionHeader
        title="Organizers"
        detail="Verify accounts before they can submit cultural events."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            {data.organizers.length ? (
              data.organizers.map((organizer) => (
                <div key={organizer.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{organizer.display_name}</span>
                      <StatusBadge status={organizer.verification_status} />
                    </div>
                    <p className="mt-1 max-w-2xl text-sm text-slate-600">{organizer.bio}</p>
                    <time className="mt-1 block text-xs text-slate-400">
                      {t("Applied")} {formatDate(organizer.created_at, language)}
                    </time>
                  </div>
                  <div className="flex items-center gap-2">
                    {organizer.verification_status !== "verified" && (
                      <ActionButton onClick={() => void act(organizer, "verified")}>
                        <Check size={15} /> Verify
                      </ActionButton>
                    )}
                    {organizer.verification_status !== "rejected" && (
                      <ActionButton tone="muted" onClick={() => void act(organizer, "rejected")}>
                        Reject
                      </ActionButton>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>No organizer applications yet.</EmptyState>
            )}
          </div>
        </div>
        <div className="self-start rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 className="font-black">{t("Add an organizer directly")}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {t("Skip the self-service application and verify an existing user right away.")}
          </p>
          <div className="mt-4 grid gap-3">
            <Field label="Profile">
              <select
                className={inputClass}
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                <option value="">{t("Choose a profile…")}</option>
                {eligibleProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.display_name || profile.handle} · @{profile.handle}
                  </option>
                ))}
              </select>
            </Field>
            {eligibleProfiles.length === 0 && (
              <p className="text-xs text-slate-400">
                {t(
                  "No eligible profiles — a user needs to complete their profile (display name + handle) before they can be added here.",
                )}
              </p>
            )}
            <ActionButton onClick={() => void addDirect()} disabled={!selectedId || adding}>
              {adding ? "Adding…" : "Add & verify organizer"}
            </ActionButton>
          </div>
        </div>
      </div>
    </>
  );
}

function RoutesPanel({ data, onSaved, setNotice }: PanelProps) {
  const [selected, setSelected] = useState<AdminRoute | null>(null);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_470px]">
      <div>
        <SectionHeader
          title="Routes"
          detail="Editorial itineraries and their stop-by-stop guides."
          action={
            <ActionButton onClick={() => setSelected(null)}>
              <Route size={16} /> Add route
            </ActionButton>
          }
        />
        <ContentList
          items={data.routes}
          selectedId={selected?.id}
          onSelect={setSelected}
          title={(item) => item.title}
          subtitle={(item) => `${item.duration} · ${item.budget}`}
          image={(item) => item.image_url}
        />
      </div>
      <RouteEditor
        key={selected?.id ?? "new"}
        route={selected}
        places={data.places}
        routeStops={data.routeStops}
        onSaved={onSaved}
        setNotice={setNotice}
      />
    </div>
  );
}

function RouteEditor({
  route,
  places,
  routeStops,
  onSaved,
  setNotice,
}: {
  route: AdminRoute | null;
  places: AdminPlace[];
  routeStops: AdminRouteStop[];
  onSaved: () => Promise<void>;
  setNotice: (notice: Notice) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(route?.title ?? "");
  const [lede, setLede] = useState(route?.lede ?? "");
  const [duration, setDuration] = useState(route?.duration ?? "");
  const [budget, setBudget] = useState(route?.budget ?? "Free");
  const [imageUrl, setImageUrl] = useState(route?.image_url ?? "");
  const [tagText, setTagText] = useState(route?.tags.join(", ") ?? "");
  const [stops, setStops] = useState(() =>
    route
      ? routeStops.filter((stop) => stop.route_id === route.id).map((stop) => ({ ...stop }))
      : [],
  );
  const [saving, setSaving] = useState(false);
  const upload = async (file: File | null) => {
    if (!file) return;
    try {
      setSaving(true);
      setImageUrl(await uploadContentMedia(file, "routes"));
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not upload image."),
      });
    } finally {
      setSaving(false);
    }
  };
  const addStop = () =>
    setStops((items) => [
      ...items,
      {
        route_id: route?.id ?? "",
        position: items.length,
        display_time: "",
        place_id: places[0]?.id ?? "",
        title: "",
        body: "",
      },
    ]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !lede.trim() || !duration.trim() || !imageUrl.trim())
      return setNotice({
        tone: "error",
        message: t("Title, summary, duration, and image are required."),
      });
    const routeId = route?.id ?? `route-${slug(title)}-${Date.now()}`;
    try {
      setSaving(true);
      await saveAdminRoute({
        id: routeId,
        title: title.trim(),
        author_id: route?.author_id ?? "you",
        lede: lede.trim(),
        duration: duration.trim(),
        budget: budget.trim(),
        tags: tags(tagText),
        image_url: imageUrl.trim(),
        comment_count: route?.comment_count ?? 0,
        saves_count: route?.saves_count ?? 0,
        sort_order: route?.sort_order ?? Date.now(),
      });
      await replaceAdminRouteStops(
        routeId,
        stops.map((stop, position) => ({ ...stop, route_id: routeId, position })),
      );
      await onSaved();
      setNotice({ tone: "success", message: t("Route and stops saved.") });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not save route."),
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      onSubmit={save}
      className="self-start rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
    >
      <h3 className="text-base font-black">{t(route ? "Edit route" : "New route")}</h3>
      <div className="mt-4 grid gap-3">
        <Field label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Summary">
          <textarea
            className={inputClass}
            rows={3}
            value={lede}
            onChange={(e) => setLede(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration">
            <input
              className={inputClass}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </Field>
          <Field label="Budget">
            <input
              className={inputClass}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Tags">
          <input
            className={inputClass}
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
          />
        </Field>
        <Field label="Image">
          <div className="mt-1 flex gap-2">
            <input
              className={inputClass}
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2">
              <ImagePlus size={16} />
              <input
                className="hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void upload(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </Field>
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <span className={labelClass}>{t("Stops")}</span>
            <ActionButton tone="muted" onClick={addStop}>
              Add stop
            </ActionButton>
          </div>
          <div className="mt-3 space-y-3">
            {stops.map((stop, index) => (
              <div key={index} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-500">
                    {t("Stop {n}", { n: index + 1 })}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setStops((items) => items.filter((_, itemIndex) => itemIndex !== index))
                    }
                    className="text-slate-400 hover:text-red-600"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="mt-2 grid gap-2">
                  <input
                    className={inputClass}
                    placeholder={t("Time")}
                    value={stop.display_time}
                    onChange={(e) =>
                      setStops((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, display_time: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <select
                    className={inputClass}
                    value={stop.place_id}
                    onChange={(e) =>
                      setStops((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, place_id: e.target.value } : item,
                        ),
                      )
                    }
                  >
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    placeholder={t("Stop title")}
                    value={stop.title}
                    onChange={(e) =>
                      setStops((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, title: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <textarea
                    className={inputClass}
                    placeholder={t("Description")}
                    value={stop.body}
                    onChange={(e) =>
                      setStops((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, body: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <ActionButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save route"}
        </ActionButton>
      </div>
    </form>
  );
}

function ModerationPanel({ data, canEdit, onSaved, setNotice }: PanelProps & { canEdit: boolean }) {
  const { language, t } = useI18n();
  const [filter, setFilter] = useState("pending");
  const [page, setPage] = useState(0);
  const content = useMemo<ModerationItem[]>(
    () =>
      (
        [
          ...data.places.map((item) => ({
            type: "place" as const,
            id: item.id,
            title: item.name,
            detail: item.short,
            status: item.moderation_status,
            createdAt: item.created_at,
          })),
          ...data.posts.map((item) => ({
            type: "post" as const,
            id: item.id,
            title: item.author_id,
            detail: item.text,
            status: item.moderation_status,
            createdAt: item.created_at,
          })),
          ...data.comments.map((item) => ({
            type: "comment" as const,
            id: item.id,
            title: item.author_name,
            detail: item.text,
            status: item.moderation_status,
            createdAt: item.created_at,
          })),
          ...data.stories.map((item) => ({
            type: "story" as const,
            id: item.id,
            title: item.label,
            detail: item.caption,
            status: item.moderation_status,
            createdAt: item.created_at,
          })),
          ...data.meetEvents.map((item) => ({
            type: "meet_event" as const,
            id: item.id,
            title: item.title,
            detail: item.description,
            status: item.moderation_status,
            createdAt: item.created_at,
          })),
          ...data.culturalEvents.map((item) => ({
            type: "cultural_event" as const,
            id: item.id,
            title: item.title,
            detail: item.description_el,
            status: item.moderation_status,
            createdAt: item.created_at,
          })),
        ] as ModerationItem[]
      )
        .filter((item) => filter === "all" || item.status === filter)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data, filter],
  );
  const pageItems = content.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const act = async (item: ModerationItem, status: "published" | "hidden") => {
    const action = status === "hidden" ? "Hide" : "Publish";
    const itemType = t(item.type.replace("_", " "));
    const confirmation =
      language === "GR"
        ? `${t(action)} για ${itemType};`
        : `${action} this ${item.type.replace("_", " ")}?`;
    if (!window.confirm(confirmation)) return;
    try {
      await moderateContent(item.type, item.id, status);
      await onSaved();
      setNotice({
        tone: "success",
        message: t(status === "published" ? "{item} published." : "{item} hidden.", {
          item: t(item.type.replace("_", " ")),
        }),
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not update moderation status."),
      });
    }
  };
  return (
    <>
      <SectionHeader
        title="Moderation"
        detail="Review submissions before they appear in the public app."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {["pending", "published", "hidden", "all"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setFilter(item);
              setPage(0);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-bold ${filter === item ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {t(item[0].toUpperCase() + item.slice(1))}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="divide-y divide-slate-100">
          {pageItems.length ? (
            pageItems.map((item) => (
              <ModerationRow
                key={`${item.type}-${item.id}`}
                item={item}
                canEdit={canEdit}
                onAction={act}
                onEdited={onSaved}
                setNotice={setNotice}
              />
            ))
          ) : (
            <EmptyState>No items in this queue.</EmptyState>
          )}
        </div>
      </div>
      {content.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {t("Page {page} of {pages}", {
              page: page + 1,
              pages: Math.ceil(content.length / PAGE_SIZE),
            })}
          </span>
          <div className="flex gap-2">
            <ActionButton
              tone="muted"
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </ActionButton>
            <ActionButton
              tone="muted"
              disabled={(page + 1) * PAGE_SIZE >= content.length}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </ActionButton>
          </div>
        </div>
      )}
    </>
  );
}

function ModerationRow({
  item,
  canEdit,
  onAction,
  onEdited,
  setNotice,
}: {
  item: ModerationItem;
  canEdit: boolean;
  onAction: (item: ModerationItem, status: "published" | "hidden") => void;
  onEdited: () => Promise<void>;
  setNotice: (notice: Notice) => void;
}) {
  const { language, t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.detail);
  const saveText = async () => {
    try {
      if (item.type === "post") await editAdminPost(item.id, text);
      if (item.type === "comment") await editAdminComment(item.id, text);
      await onEdited();
      setEditing(false);
      setNotice({ tone: "success", message: t("Content text updated.") });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not update content text."),
      });
    }
  };
  return (
    <div className="flex flex-wrap gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400">
            {t(item.type.replace("_", " "))}
          </span>
          <StatusBadge status={item.status} />
        </div>
        <div className="mt-1 font-bold text-slate-900">{item.title}</div>
        {editing ? (
          <div className="mt-2 flex gap-2">
            <textarea
              className={inputClass}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <ActionButton onClick={() => void saveText()}>Save text</ActionButton>
          </div>
        ) : (
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{item.detail}</p>
        )}
        <time className="mt-2 block text-xs text-slate-400">
          {formatDate(item.createdAt, language)}
        </time>
      </div>
      <div className="flex items-start gap-2">
        {canEdit && (item.type === "post" || item.type === "comment") && (
          <ActionButton tone="muted" onClick={() => setEditing((value) => !value)}>
            Edit
          </ActionButton>
        )}
        {item.status !== "published" && (
          <ActionButton onClick={() => onAction(item, "published")}>
            <Check size={15} /> {t("Publish")}
          </ActionButton>
        )}
        {item.status !== "hidden" && (
          <ActionButton tone="muted" onClick={() => onAction(item, "hidden")}>
            Hide
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function TeamPanel({ data, onSaved, setNotice }: PanelProps) {
  const { t } = useI18n();
  const memberIds = new Set(data.members.map((member) => member.user_id));
  const [selectedId, setSelectedId] = useState("");
  const [selectedRole, setSelectedRole] = useState<AdminRole>("editor");
  const profiles = data.profiles.filter((profile) => profile.profile_completed_at);
  const add = async () => {
    if (!selectedId) return;
    try {
      await setAdminMember(selectedId, selectedRole);
      await onSaved();
      setSelectedId("");
      setNotice({ tone: "success", message: t("Team role saved.") });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : t("Could not save team role."),
      });
    }
  };
  const profileFor = (id: string) => data.profiles.find((profile) => profile.id === id);
  return (
    <>
      <SectionHeader
        title="Team access"
        detail="Only Owners can add, change, or remove admin roles."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            {data.members.length ? (
              data.members.map((member) => {
                const profile = profileFor(member.user_id);
                return (
                  <div key={member.user_id} className="flex items-center gap-3 p-4">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 font-black text-slate-500">
                      {(profile?.display_name || profile?.handle || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">
                        {profile?.display_name || profile?.handle || member.user_id}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        @{profile?.handle || t("profile incomplete")}
                      </div>
                    </div>
                    <select
                      aria-label={t("Member role")}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold"
                      value={member.role}
                      onChange={(event) =>
                        void setAdminMember(member.user_id, event.target.value as AdminRole)
                          .then(onSaved)
                          .catch((error) =>
                            setNotice({
                              tone: "error",
                              message:
                                error instanceof Error ? error.message : t("Could not change role."),
                            }),
                          )
                      }
                    >
                      {["owner", "editor", "moderator"].map((role) => (
                        <option key={role} value={role}>
                          {t(role[0].toUpperCase() + role.slice(1))}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(t("Remove this admin member?")))
                          void removeAdminMember(member.user_id)
                            .then(onSaved)
                            .catch((error) =>
                              setNotice({
                                tone: "error",
                                message:
                                  error instanceof Error
                                    ? error.message
                                    : t("Could not remove member."),
                              }),
                            );
                      }}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={t("Remove member")}
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })
            ) : (
              <EmptyState>{t("No team members yet.")}</EmptyState>
            )}
          </div>
        </div>
        <div className="self-start rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 className="font-black">{t("Add an existing user")}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {t("A user must have signed in and completed a profile once before appearing here.")}
          </p>
          <div className="mt-4 grid gap-3">
            <Field label="Profile">
              <select
                className={inputClass}
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                <option value="">{t("Choose a profile…")}</option>
                {profiles
                  .filter((profile) => !memberIds.has(profile.id))
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.display_name || profile.handle} · @{profile.handle}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Role">
              <select
                className={inputClass}
                value={selectedRole}
                onChange={(event) => setSelectedRole(event.target.value as AdminRole)}
              >
                <option value="owner">{t("Owner")}</option>
                <option value="editor">{t("Editor")}</option>
                <option value="moderator">{t("Moderator")}</option>
              </select>
            </Field>
            <ActionButton onClick={() => void add()} disabled={!selectedId}>
              {t("Add to team")}
            </ActionButton>
          </div>
        </div>
      </div>
    </>
  );
}

function ContentList<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  title,
  subtitle,
  image,
}: {
  items: T[];
  selectedId?: string;
  onSelect: (item: T) => void;
  title: (item: T) => string;
  subtitle: (item: T) => string;
  image: (item: T) => string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="divide-y divide-slate-100">
        {items.length ? (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${selectedId === item.id ? "bg-orange-50" : ""}`}
            >
              <img
                src={image(item)}
                alt=""
                className="h-11 w-11 rounded-lg bg-slate-100 object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{title(item)}</span>
                <span className="block truncate text-xs text-slate-500">{subtitle(item)}</span>
              </span>
              {"moderation_status" in item && (
                <StatusBadge status={String(item.moderation_status)} />
              )}
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ))
        ) : (
          <EmptyState>No content yet.</EmptyState>
        )}
      </div>
    </div>
  );
}
function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const { t } = useI18n();
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-orange-500"
      placeholder={t(placeholder)}
    />
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <label className="block">
      <span className={labelClass}>{t(label)}</span>
      {children}
    </label>
  );
}
type PanelProps = {
  data: AdminData;
  onSaved: () => Promise<void>;
  setNotice: (notice: Notice) => void;
};

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  Camera,
  LockKeyhole,
  LogOut,
  Mail,
  Save,
  ShieldCheck,
  Store,
  Ticket,
  UserCircle2,
  X,
} from "lucide-react";
import type { AdminRole } from "@/lib/admin-api";
import type { OrganizerStatus } from "@/lib/hp/cultural-events-types";
import type { BusinessStatus } from "@/lib/hp/business-types";
import { useI18n } from "@/lib/i18n";
import {
  normalizeHandle,
  profileAvatarUrl,
  profileDisplayName,
  profileInitials,
  savePulseProfile,
  signInWithPassword,
  signOutPulseAccount,
  signUpWithPassword,
  uploadPulseAvatar,
  type AccountIdentity,
  type PulseAccountProfile,
  type PulseAccountState,
} from "@/lib/hp-auth";

const PROFILE_IDENTITIES: { id: AccountIdentity; label: string; helper: string }[] = [
  { id: "LOCAL", label: "Local", helper: "Area signal" },
  { id: "TOURIST", label: "Tourist", helper: "Visitor view" },
  { id: "GUIDE", label: "Guide", helper: "Recs and routes" },
];

function accountProfile(account: PulseAccountState) {
  return account.status === "ready" || account.status === "needsProfile" ? account.profile : null;
}

function accountUserId(account: PulseAccountState) {
  return account.status === "ready" || account.status === "needsProfile" ? account.userId : null;
}

function accountEmail(account: PulseAccountState) {
  return account.status === "ready" || account.status === "needsProfile" ? account.email : null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-hp-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function fieldClass() {
  return "w-full rounded-2xl border border-hp-ink/10 bg-white/60 px-3 py-2.5 text-[13px] text-hp-ink outline-none placeholder:text-hp-muted";
}

function authErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Authentication failed.";
  return /confirm|confirmation|verify|verification/i.test(message)
    ? "This account needs email verification before it can sign in."
    : message;
}

export function AccountBubble({
  account,
  onOpenAccount,
  onOpenAuth,
}: {
  account: PulseAccountState;
  onOpenAccount: () => void;
  onOpenAuth: () => void;
}) {
  const { t } = useI18n();
  const profile = accountProfile(account);
  const avatarUrl = profileAvatarUrl(profile);
  const needsProfile = account.status === "needsProfile";
  const signedIn = account.status === "ready" || needsProfile;
  const loading = account.status === "loading";

  return (
    <button
      type="button"
      onClick={signedIn ? onOpenAccount : onOpenAuth}
      className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-hp-ink/10 bg-hp-paper text-hp-ink/70"
      aria-label={t(signedIn ? "Account settings" : "Sign in")}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : signedIn ? (
        <span className="grid h-full w-full place-items-center bg-hp-ink text-[11px] font-black text-hp-paper">
          {profileInitials(profile)}
        </span>
      ) : loading ? (
        <span className="h-4 w-4 rounded-full border-2 border-hp-ink/15 border-t-hp-sunset" />
      ) : (
        <UserCircle2 size={17} />
      )}
      {needsProfile && (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-hp-paper bg-hp-sunset" />
      )}
    </button>
  );
}

export function AuthSheet({
  open,
  onClose,
  onAuthenticated,
}: {
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [identity, setIdentity] = useState<AccountIdentity>("LOCAL");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSaving(false);
      setMessage(null);
      setError(null);
    }
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      if (mode === "signIn") {
        await signInWithPassword(email, password);
        await onAuthenticated();
        onClose();
        return;
      }

      const normalizedHandle = normalizeHandle(handle);
      if (displayName.trim().length < 2) {
        setError(t("Use a display name with at least 2 characters."));
        return;
      }
      if (normalizedHandle.length < 3) {
        setError(t("Use a handle with at least 3 letters, numbers, dots, or underscores."));
        return;
      }

      const result = await signUpWithPassword({
        email,
        password,
        displayName,
        defaultIdentity: identity,
      });

      if (result.status === "needsConfirmation") {
        setMessage(t("Account created. Check your email to confirm it, then sign in."));
        setMode("signIn");
        return;
      }

      if (result.user?.id) {
        await savePulseProfile(result.user.id, {
          displayName,
          handle: normalizedHandle,
          defaultIdentity: identity,
        });
      }
      await onAuthenticated();
      onClose();
    } catch (submitError) {
      console.warn("Could not authenticate.", submitError);
      setError(t(authErrorMessage(submitError)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[89] overflow-hidden"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
            aria-label={t("Close")}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 240 }}
            role="dialog"
            aria-modal="true"
            aria-label={t(mode === "signIn" ? "Sign in" : "Create account")}
            className="hp-composer-sheet absolute inset-x-0 bottom-0 max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-paper p-4"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hp-ink/15" />
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-hp-ink">
                  {t(mode === "signIn" ? "Sign in" : "Create profile")}
                </h3>
                <p className="mt-0.5 text-[11px] text-hp-muted">
                  {t("Posts and comments will use this identity.")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-hp-ink/5 text-hp-ink"
                aria-label={t("Close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-3 grid grid-cols-2 rounded-full border border-hp-ink/10 bg-white/50 p-1">
              {[
                { id: "signIn" as const, label: t("Sign in") },
                { id: "signUp" as const, label: t("New") },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setMode(option.id);
                    setError(null);
                    setMessage(null);
                  }}
                  aria-pressed={mode === option.id}
                  className={`rounded-full px-3 py-2 text-[12px] font-bold ${
                    mode === option.id ? "bg-hp-ink text-hp-paper" : "text-hp-ink/65"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === "signUp" && (
                <>
                  <Field label={t("Display name")}>
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      autoComplete="name"
                      className={fieldClass()}
                      placeholder={t("Theo from Pyrgos")}
                    />
                  </Field>
                  <Field label={t("Handle")}>
                    <input
                      value={handle}
                      onChange={(event) => setHandle(normalizeHandle(event.target.value))}
                      autoComplete="username"
                      className={fieldClass()}
                      placeholder="ilia.local"
                    />
                  </Field>
                  <div>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                      {t("Default identity")}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-hp-ink/10 bg-white/50 p-1.5">
                      {PROFILE_IDENTITIES.map((option) => {
                        const active = identity === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setIdentity(option.id)}
                            aria-pressed={active}
                            className={`rounded-xl px-2 py-2 text-left transition ${
                              active ? "bg-hp-ink text-hp-paper" : "text-hp-ink/70"
                            }`}
                          >
                            <span className="block text-[11px] font-black">{t(option.label)}</span>
                            <span
                              className={`block truncate text-[9px] font-semibold ${
                                active ? "text-hp-paper/65" : "text-hp-muted"
                              }`}
                            >
                              {t(option.helper)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <Field label={t("Email")}>
                <div className="flex items-center gap-2 rounded-2xl border border-hp-ink/10 bg-white/60 px-3 py-2.5">
                  <Mail size={14} className="text-hp-muted" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    className="w-full bg-transparent text-[13px] text-hp-ink outline-none placeholder:text-hp-muted"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </Field>
              <Field label={t("Password")}>
                <div className="flex items-center gap-2 rounded-2xl border border-hp-ink/10 bg-white/60 px-3 py-2.5">
                  <LockKeyhole size={14} className="text-hp-muted" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                    className="w-full bg-transparent text-[13px] text-hp-ink outline-none placeholder:text-hp-muted"
                    placeholder={t("Minimum 6 characters")}
                    minLength={6}
                    required
                  />
                </div>
              </Field>

              {message && (
                <p className="rounded-2xl bg-hp-olive/10 px-3 py-2 text-[12px] font-semibold text-hp-olive">
                  {message}
                </p>
              )}
              {error && <p className="text-[12px] font-semibold text-hp-sunset">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper disabled:opacity-45"
              >
                {saving ? t("Working...") : t(mode === "signIn" ? "Sign in" : "Create account")}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function OrganizerSection({
  status,
  myEventsCount,
  onApply,
  onOpenComposer,
  onOpenMyEvents,
}: {
  status: OrganizerStatus | null;
  myEventsCount: number;
  onApply: () => Promise<void>;
  onOpenComposer: () => void;
  onOpenMyEvents: () => void;
}) {
  const { t } = useI18n();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      await onApply();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : t("Could not send application."));
    } finally {
      setApplying(false);
    }
  };

  if (status?.verificationStatus === "verified") {
    return (
      <div className="mb-3 rounded-2xl border border-hp-sunset/20 bg-hp-sunset/10 p-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-hp-sunset text-hp-paper">
            <Ticket size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-black text-hp-ink">
              {t("Verified organizer")}
            </span>
            <span className="block text-[11px] text-hp-muted">{t("Submit a cultural event")}</span>
          </span>
        </div>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={onOpenComposer}
            className="flex-1 rounded-full bg-hp-ink py-2 text-[12px] font-bold text-hp-paper transition active:scale-[0.98]"
          >
            {t("Submit a cultural event")}
          </button>
          <button
            type="button"
            onClick={onOpenMyEvents}
            className="flex-1 rounded-full border border-hp-ink/15 py-2 text-[12px] font-bold text-hp-ink transition active:scale-[0.98]"
          >
            {t("My events")} ({myEventsCount})
          </button>
        </div>
      </div>
    );
  }

  if (status?.verificationStatus === "pending") {
    return (
      <div className="mb-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-3 text-[12px] font-semibold text-hp-muted">
        {t("Your request to become an events organizer is pending approval.")}
      </div>
    );
  }

  // Open to every identity: helping a local festival / society is a plausible
  // one-off contribution for a visitor, not a claim of permanent presence.
  return (
    <div className="mb-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-3">
      <div className="text-[13px] font-black text-hp-ink">{t("Do you organize events?")}</div>
      <p className="mt-0.5 text-[11px] text-hp-muted">
        {t("Become an organizer to submit theater shows, concerts, and festivals.")}
      </p>
      {status?.verificationStatus === "rejected" && (
        <p className="mt-1 text-[11px] font-semibold text-red-600">
          {t("Your previous request was rejected.")}
        </p>
      )}
      {error && <p className="mt-1 text-[11px] font-semibold text-red-600">{error}</p>}
      <button
        type="button"
        onClick={() => void apply()}
        disabled={applying}
        className="mt-2 w-full rounded-full border border-hp-ink/15 bg-transparent py-2 text-[12px] font-bold text-hp-ink transition active:scale-[0.98] disabled:opacity-60"
      >
        {applying ? t("Submitting…") : t("Become an organizer")}
      </button>
    </div>
  );
}

function BusinessSection({
  status,
  myPlacesCount,
  onApply,
  onOpenPlaces,
}: {
  status: BusinessStatus | null;
  myPlacesCount: number;
  onApply: () => Promise<void>;
  onOpenPlaces: () => void;
}) {
  const { t } = useI18n();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      await onApply();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : t("Could not send application."));
    } finally {
      setApplying(false);
    }
  };

  if (status?.verificationStatus === "verified") {
    return (
      <div className="mb-3 rounded-2xl border border-hp-sunset/20 bg-hp-sunset/10 p-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-hp-sunset text-hp-paper">
            <Store size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-black text-hp-ink">
              {t("Verified business")}
            </span>
            <span className="block text-[11px] text-hp-muted">
              {t("Claim your place and add hours, menu, and photos.")}
            </span>
          </span>
        </div>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={onOpenPlaces}
            className="flex-1 rounded-full bg-hp-ink py-2 text-[12px] font-bold text-hp-paper transition active:scale-[0.98]"
          >
            {t("Claim a place")}
          </button>
          <button
            type="button"
            onClick={onOpenPlaces}
            className="flex-1 rounded-full border border-hp-ink/15 py-2 text-[12px] font-bold text-hp-ink transition active:scale-[0.98]"
          >
            {t("My places")} ({myPlacesCount})
          </button>
        </div>
      </div>
    );
  }

  if (status?.verificationStatus === "pending") {
    return (
      <div className="mb-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-3 text-[12px] font-semibold text-hp-muted">
        {t("Your request to register a business is pending approval.")}
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-3">
      <div className="text-[13px] font-black text-hp-ink">{t("Do you run a local business?")}</div>
      <p className="mt-0.5 text-[11px] text-hp-muted">
        {t("Register to claim your place on the map and keep its details up to date.")}
      </p>
      {status?.verificationStatus === "rejected" && (
        <p className="mt-1 text-[11px] font-semibold text-red-600">
          {t("Your previous request was rejected.")}
        </p>
      )}
      {error && <p className="mt-1 text-[11px] font-semibold text-red-600">{error}</p>}
      <button
        type="button"
        onClick={() => void apply()}
        disabled={applying}
        className="mt-2 w-full rounded-full border border-hp-ink/15 bg-transparent py-2 text-[12px] font-bold text-hp-ink transition active:scale-[0.98] disabled:opacity-60"
      >
        {applying ? t("Submitting…") : t("Register a business")}
      </button>
    </div>
  );
}

export function AccountSheet({
  open,
  account,
  stats,
  saved,
  onClose,
  onSaved,
  onOpenAuth,
  adminRole,
  onOpenAdmin,
  organizerStatus,
  organizerEventCount,
  onApplyOrganizer,
  onOpenOrganizerComposer,
  onOpenOrganizerEvents,
  businessStatus,
  businessPlaceCount,
  onApplyBusiness,
  onOpenBusinessPlaces,
}: {
  open: boolean;
  account: PulseAccountState;
  stats: { posts: number; tips: number; rsvps: number; routesSaved: number };
  saved: {
    placeCount: number;
    postCount: number;
    routeCount: number;
    onOpenSaved: () => void;
  };
  onClose: () => void;
  onSaved: () => Promise<void>;
  onOpenAuth: () => void;
  adminRole: AdminRole | null;
  onOpenAdmin: () => void;
  organizerStatus: OrganizerStatus | null;
  organizerEventCount: number;
  onApplyOrganizer: () => Promise<void>;
  onOpenOrganizerComposer: () => void;
  onOpenOrganizerEvents: () => void;
  businessStatus: BusinessStatus | null;
  businessPlaceCount: number;
  onApplyBusiness: () => Promise<void>;
  onOpenBusinessPlaces: () => void;
}) {
  const { t } = useI18n();
  const profile = accountProfile(account);
  const userId = accountUserId(account);
  const email = accountEmail(account);
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [identity, setIdentity] = useState<AccountIdentity>("LOCAL");
  const [homeArea, setHomeArea] = useState("");
  const [bio, setBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(profile?.displayName ?? "");
    setHandle(profile?.handle ?? "");
    setIdentity(profile?.defaultIdentity ?? "LOCAL");
    setHomeArea(profile?.homeArea ?? "");
    setBio(profile?.bio ?? "");
    setAvatarFile(null);
    setAvatarPreview(null);
    setSaving(false);
    setMessage(null);
    setError(null);
  }, [open, profile]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;
    const normalizedHandle = normalizeHandle(handle);
    if (displayName.trim().length < 2) {
      setError(t("Use a display name with at least 2 characters."));
      return;
    }
    if (normalizedHandle.length < 3) {
      setError(t("Use a handle with at least 3 letters, numbers, dots, or underscores."));
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      let avatar: Pick<PulseAccountProfile, "avatarPath" | "avatarUrl"> | null = null;
      if (avatarFile) avatar = await uploadPulseAvatar(userId, avatarFile);
      await savePulseProfile(userId, {
        displayName,
        handle: normalizedHandle,
        defaultIdentity: identity,
        homeArea,
        bio,
        avatarPath: avatar?.avatarPath,
        avatarUrl: avatar?.avatarUrl,
      });
      await onSaved();
      setMessage(t("Profile saved."));
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (submitError) {
      console.warn("Could not save profile.", submitError);
      setError(submitError instanceof Error ? submitError.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    setSaving(true);
    setError(null);
    try {
      await signOutPulseAccount();
      await onSaved();
      onClose();
    } catch (signOutError) {
      console.warn("Could not sign out.", signOutError);
      setError(signOutError instanceof Error ? signOutError.message : "Could not sign out.");
    } finally {
      setSaving(false);
    }
  };

  const avatarUrl = avatarPreview ?? profileAvatarUrl(profile);

  // Live picker value (not the persisted profile) so the section reacts the
  // moment the identity toggle changes, before a save. Tourists never see the
  // Community roles section — not the apply CTAs, not an existing pending or
  // verified standing. Switching to Tourist hides it wholesale, by design.
  const showCommunityRoles = identity !== "TOURIST";
  const identityLabel =
    PROFILE_IDENTITIES.find((option) => option.id === identity)?.label ?? identity;

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
            aria-label={t("Close")}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 240 }}
            role="dialog"
            aria-modal="true"
            aria-label={t("Account settings")}
            className="hp-composer-sheet absolute inset-x-0 bottom-0 max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-bg p-4"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hp-ink/15" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-hp-ink">
                  {t(account.status === "needsProfile" ? "Complete profile" : "Account settings")}
                </h3>
                <p className="mt-0.5 text-[11px] text-hp-muted">
                  {t("Your visible identity across posts and comments.")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-hp-ink/5 text-hp-ink"
                aria-label={t("Close")}
              >
                <X size={16} />
              </button>
            </div>

            {!userId ? (
              <div className="rounded-3xl border border-hp-ink/10 bg-hp-paper p-4 text-center">
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-hp-sunset text-hp-paper">
                  <UserCircle2 size={24} />
                </div>
                <h4 className="text-[15px] font-black text-hp-ink">
                  {t("Sign in to create a profile")}
                </h4>
                <p className="mt-1 text-[12px] text-hp-muted">
                  Saved items can stay private, but posting needs a real profile.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                  className="mt-4 w-full rounded-full bg-hp-ink py-3 text-[13px] font-bold text-hp-paper"
                >
                  {t("Sign in")}
                </button>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-3 rounded-3xl border border-hp-ink/10 bg-hp-paper p-3.5">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-hp-ink/10 bg-hp-ink text-hp-paper"
                    aria-label={t("Upload profile image")}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[15px] font-black">{profileInitials(profile)}</span>
                    )}
                    <span className="absolute bottom-0 right-0 grid h-6 w-6 place-items-center rounded-full border-2 border-hp-paper bg-hp-sunset">
                      <Camera size={12} />
                    </span>
                  </button>

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setAvatarFile(file);
                      setAvatarPreview(file ? URL.createObjectURL(file) : null);
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[15px] font-black text-hp-ink">
                        {profileDisplayName(profile)}
                      </span>
                      {account.status === "ready" && (
                        <BadgeCheck size={15} className="shrink-0 text-hp-sea" />
                      )}
                    </div>
                    <div className="truncate text-[11.5px] font-bold text-hp-muted">
                      {email ?? "Signed in"}
                    </div>
                    <div className="mt-1 block w-fit max-w-full truncate rounded-full bg-hp-sunset/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-hp-sunset">
                      {t(identityLabel)}
                    </div>
                  </div>
                </div>

                {adminRole && (
                  <button
                    type="button"
                    onClick={onOpenAdmin}
                    className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-hp-sunset/20 bg-hp-sunset/10 p-3 text-left transition active:scale-[0.99]"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-hp-sunset text-hp-paper">
                      <ShieldCheck size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-black text-hp-ink">
                        {t("Admin workspace")}
                      </span>
                      <span className="block text-[11px] text-hp-muted">
                        Open team tools · {adminRole}
                      </span>
                    </span>
                  </button>
                )}

                <form onSubmit={submit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t("Display name")}>
                      <input
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        autoComplete="name"
                        className={fieldClass()}
                      />
                    </Field>
                    <Field label={t("Handle")}>
                      <input
                        value={handle}
                        onChange={(event) => setHandle(normalizeHandle(event.target.value))}
                        autoComplete="username"
                        className={fieldClass()}
                      />
                    </Field>
                  </div>

                  <div>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                      {t("Default identity")}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-hp-ink/10 bg-white/50 p-1.5">
                      {PROFILE_IDENTITIES.map((option) => {
                        const active = identity === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setIdentity(option.id)}
                            aria-pressed={active}
                            className={`rounded-xl px-2 py-2 text-left transition ${
                              active ? "bg-hp-ink text-hp-paper" : "text-hp-ink/70"
                            }`}
                          >
                            <span className="block text-[11px] font-black">{t(option.label)}</span>
                            <span
                              className={`block truncate text-[9px] font-semibold ${
                                active ? "text-hp-paper/65" : "text-hp-muted"
                              }`}
                            >
                              {t(option.helper)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Field label={t("Home area")}>
                    <input
                      value={homeArea}
                      onChange={(event) => setHomeArea(event.target.value)}
                      autoComplete="address-level2"
                      placeholder={t("Pyrgos, Katakolo, Ancient Olympia…")}
                      className={fieldClass()}
                    />
                  </Field>

                  <Field label={t("Bio")}>
                    <textarea
                      value={bio}
                      onChange={(event) => setBio(event.target.value)}
                      rows={3}
                      maxLength={240}
                      placeholder={t("One line about your Ilia taste.")}
                      className={`${fieldClass()} resize-none`}
                    />
                  </Field>

                  {showCommunityRoles && (
                    <div className="rounded-2xl border border-hp-ink/10 bg-hp-paper/40 p-2.5 [&>*:last-child]:mb-0">
                      <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                        {t("Community roles")}
                      </div>
                      <OrganizerSection
                        status={organizerStatus}
                        myEventsCount={organizerEventCount}
                        onApply={onApplyOrganizer}
                        onOpenComposer={onOpenOrganizerComposer}
                        onOpenMyEvents={onOpenOrganizerEvents}
                      />
                      <BusinessSection
                        status={businessStatus}
                        myPlacesCount={businessPlaceCount}
                        onApply={onApplyBusiness}
                        onOpenPlaces={onOpenBusinessPlaces}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { n: stats.posts, l: "Posts" },
                      { n: stats.tips, l: "Tips" },
                      { n: stats.rsvps, l: "Going" },
                      { n: stats.routesSaved, l: "Routes" },
                    ].map((stat) => (
                      <div
                        key={stat.l}
                        className="rounded-2xl border border-hp-ink/10 bg-hp-paper p-2.5 text-center"
                      >
                        <div className="text-[18px] font-black leading-none text-hp-ink">
                          {stat.n}
                        </div>
                        <div className="mt-1 text-[9.5px] font-bold uppercase tracking-wide text-hp-muted">
                          {t(stat.l)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={saved.onOpenSaved}
                    className="flex w-full items-center gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-3 text-left transition active:scale-[0.99]"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-hp-ink/5 text-hp-ink">
                      <Save size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-black text-hp-ink">{t("Saved")}</span>
                      <span className="block text-[11px] text-hp-muted">
                        {saved.placeCount} places · {saved.postCount} posts · {saved.routeCount}{" "}
                        routes
                      </span>
                    </span>
                  </button>

                  {message && (
                    <p className="rounded-2xl bg-hp-olive/10 px-3 py-2 text-[12px] font-semibold text-hp-olive">
                      {message}
                    </p>
                  )}
                  {error && <p className="text-[12px] font-semibold text-hp-sunset">{error}</p>}

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-full bg-hp-sunset py-3 text-[13px] font-bold text-hp-paper disabled:opacity-45"
                    >
                      {saving ? t("Working...") : t("Save profile")}
                    </button>
                    <button
                      type="button"
                      onClick={signOut}
                      disabled={saving}
                      className="grid h-11 w-11 place-items-center rounded-full border border-hp-ink/15 text-hp-ink disabled:opacity-45"
                      aria-label={t("Sign out")}
                    >
                      <LogOut size={15} />
                    </button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

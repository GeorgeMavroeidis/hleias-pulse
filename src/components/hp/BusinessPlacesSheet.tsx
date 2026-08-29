import { useMemo, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gift, Lock, Plus, Store, Ticket, X } from "lucide-react";
import type { Place } from "@/lib/hp-model";
import {
  DEAL_CODE_LENGTH,
  DEAL_TEXT_MAX_LENGTH,
  type DealRedemptionStats,
  type PlaceBusinessProfileFields,
  type PlaceClaim,
} from "@/lib/hp/business-types";
import { useI18n } from "@/lib/i18n";
import { ImageBox } from "./ImageBox";

interface Props {
  open: boolean;
  onClose: () => void;
  places: Place[];
  claims: PlaceClaim[];
  // Place ids that already carry an approved claim (by any business); hidden
  // from the "claim a place" search. The DB partial unique index is still the
  // real guard.
  otherClaimedPlaceIds: string[];
  onClaim: (placeId: string) => Promise<void>;
  onSaveProfile: (claimId: string, fields: Partial<PlaceBusinessProfileFields>) => Promise<void>;
  onUploadPhoto: (file: File) => Promise<string>;
  // Deal write path (stage B2): works even on an APPROVED claim, unlike
  // onSaveProfile which is locked once the claim leaves 'pending'.
  onSaveDeal: (claimId: string, dealText: string | null, dealActive: boolean) => Promise<void>;
  // Coupon redemptions (stage B3).
  dealStats: DealRedemptionStats[];
  onRedeemCode: (code: string) => Promise<void>;
}

// Same palette as the admin panel status badges.
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-600/15",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  rejected: "bg-slate-100 text-slate-600 ring-slate-500/15",
};

type Draft = {
  hoursText: string;
  phone: string;
  websiteUrl: string;
  menuUrl: string;
  photos: string[];
};

function draftFromClaim(claim: PlaceClaim): Draft {
  return {
    hoursText: claim.hoursText ?? "",
    phone: claim.phone ?? "",
    websiteUrl: claim.websiteUrl ?? "",
    menuUrl: claim.menuUrl ?? "",
    photos: claim.photos ?? [],
  };
}

function fieldClass() {
  return "w-full rounded-2xl border border-hp-ink/10 bg-white/70 px-3 py-2 text-[12px] text-hp-ink outline-none placeholder:text-hp-muted";
}

type DealDraft = { text: string; active: boolean };

export function BusinessPlacesSheet({
  open,
  onClose,
  places,
  claims,
  otherClaimedPlaceIds,
  onClaim,
  onSaveProfile,
  onUploadPhoto,
  onSaveDeal,
  dealStats,
  onRedeemCode,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingDealId, setSavingDealId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dealDrafts, setDealDrafts] = useState<Record<string, DealDraft>>({});
  const [codeDrafts, setCodeDrafts] = useState<Record<string, string>>({});
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemFeedback, setRedeemFeedback] = useState<
    Record<string, { ok: boolean; text: string }>
  >({});

  const statsByClaim = useMemo(
    () => new Map(dealStats.map((entry) => [entry.claimId, entry])),
    [dealStats],
  );

  const redeem = async (claimId: string) => {
    const code = (codeDrafts[claimId] ?? "").trim().toUpperCase();
    if (code.length < DEAL_CODE_LENGTH) return;
    setRedeemingId(claimId);
    setRedeemFeedback((current) => {
      const next = { ...current };
      delete next[claimId];
      return next;
    });
    try {
      await onRedeemCode(code);
      setCodeDrafts((current) => ({ ...current, [claimId]: "" }));
      setRedeemFeedback((current) => ({
        ...current,
        [claimId]: { ok: true, text: t("Redeemed ✓") },
      }));
    } catch (redeemError) {
      // The RPC's own message is "Code not found or already used"; any other
      // failure (network, unverified) collapses to the same user-facing line.
      const raw =
        redeemError && typeof redeemError === "object" && "message" in redeemError
          ? String((redeemError as { message: unknown }).message)
          : "";
      setRedeemFeedback((current) => ({
        ...current,
        [claimId]: {
          ok: false,
          text:
            raw && raw !== "Code not found or already used"
              ? raw
              : t("Code not found or already used"),
        },
      }));
    } finally {
      setRedeemingId(null);
    }
  };

  const placeById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);
  const unavailablePlaceIds = useMemo(
    () =>
      new Set([
        ...claims.filter((claim) => claim.status !== "rejected").map((claim) => claim.placeId),
        ...otherClaimedPlaceIds,
      ]),
    [claims, otherClaimedPlaceIds],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return places
      .filter((place) => !unavailablePlaceIds.has(place.id))
      .filter((place) =>
        [place.name, place.greekName, place.area].some((value) => value.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [places, query, unavailablePlaceIds]);

  const draftFor = (claim: PlaceClaim) => drafts[claim.id] ?? draftFromClaim(claim);
  const patchDraft = (claim: PlaceClaim, patch: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [claim.id]: { ...draftFor(claim), ...patch } }));

  const dealDraftFor = (claim: PlaceClaim): DealDraft =>
    dealDrafts[claim.id] ?? { text: claim.dealText ?? "", active: claim.dealActive };
  const patchDealDraft = (claim: PlaceClaim, patch: Partial<DealDraft>) =>
    setDealDrafts((current) => ({
      ...current,
      [claim.id]: { ...dealDraftFor(claim), ...patch },
    }));

  const saveDeal = async (target: PlaceClaim) => {
    const draft = dealDraftFor(target);
    setSavingDealId(target.id);
    setError(null);
    try {
      await onSaveDeal(target.id, draft.text.trim() || null, draft.active);
      setDealDrafts((current) => {
        const next = { ...current };
        delete next[target.id];
        return next;
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("Could not save the deal."));
    } finally {
      setSavingDealId(null);
    }
  };

  const claim = async (placeId: string) => {
    setClaimingId(placeId);
    setError(null);
    try {
      await onClaim(placeId);
      setQuery("");
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : t("Could not send the claim."));
    } finally {
      setClaimingId(null);
    }
  };

  const save = async (target: PlaceClaim) => {
    const draft = draftFor(target);
    setSavingId(target.id);
    setError(null);
    try {
      await onSaveProfile(target.id, {
        hoursText: draft.hoursText,
        phone: draft.phone,
        websiteUrl: draft.websiteUrl,
        menuUrl: draft.menuUrl,
        photos: draft.photos,
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[target.id];
        return next;
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("Could not save the details."));
    } finally {
      setSavingId(null);
    }
  };

  const addPhoto = async (target: PlaceClaim, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const url = await onUploadPhoto(file);
      patchDraft(target, { photos: [...draftFor(target).photos, url] });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : t("Could not upload the photo."),
      );
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[86] overflow-hidden"
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
            aria-label={t("My places")}
            className="hp-composer-sheet absolute inset-x-0 bottom-0 max-h-[85%] max-w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-hp-bg p-4"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hp-ink/15" />
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-black text-hp-ink">
                <Store size={18} /> {t("My places")}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-hp-ink/5 text-hp-ink"
                aria-label={t("Close")}
              >
                <X size={16} />
              </button>
            </div>

            {error && (
              <p className="mb-3 rounded-2xl bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
                {error}
              </p>
            )}

            {claims.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-hp-ink/15 bg-hp-paper/60 px-4 py-6 text-center text-[12px] text-hp-muted">
                {t("You haven't claimed a place yet.")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {claims.map((entry) => {
                  const place = placeById.get(entry.placeId);
                  const editable = entry.status === "pending";
                  const draft = draftFor(entry);
                  return (
                    <li
                      key={entry.id}
                      className="rounded-2xl border border-hp-ink/10 bg-hp-paper p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-hp-ink">
                          {place?.name ?? entry.placeId}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                            STATUS_STYLE[entry.status] ?? STATUS_STYLE.pending
                          }`}
                        >
                          {t(
                            entry.status === "approved"
                              ? "Approved"
                              : entry.status === "rejected"
                                ? "Rejected"
                                : "Pending",
                          )}
                        </span>
                      </div>

                      {entry.status === "approved" &&
                        (() => {
                          const dealDraft = dealDraftFor(entry);
                          return (
                            <div className="mt-3 rounded-2xl border border-hp-sunset/25 bg-hp-sunset/5 p-2.5">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-sunset">
                                <Gift size={12} /> {t("Deal")}
                              </div>
                              <textarea
                                value={dealDraft.text}
                                onChange={(event) =>
                                  patchDealDraft(entry, {
                                    text: event.target.value.slice(0, DEAL_TEXT_MAX_LENGTH),
                                  })
                                }
                                rows={2}
                                maxLength={DEAL_TEXT_MAX_LENGTH}
                                placeholder={t("Show the app, get your 2nd coffee free")}
                                className={`${fieldClass()} mt-1.5 resize-none`}
                              />
                              <div className="mt-1 flex items-center justify-between">
                                <span className="text-[10px] font-semibold text-hp-muted">
                                  {dealDraft.text.length}/{DEAL_TEXT_MAX_LENGTH}
                                </span>
                                <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-hp-ink">
                                  <input
                                    type="checkbox"
                                    checked={dealDraft.active}
                                    onChange={(event) =>
                                      patchDealDraft(entry, { active: event.target.checked })
                                    }
                                    className="h-3.5 w-3.5 accent-hp-sunset"
                                  />
                                  {t("Deal active")}
                                </label>
                              </div>
                              <button
                                type="button"
                                onClick={() => void saveDeal(entry)}
                                disabled={savingDealId === entry.id}
                                className="mt-2 w-full rounded-full bg-hp-sunset py-2 text-[12px] font-bold text-hp-paper disabled:opacity-50"
                              >
                                {savingDealId === entry.id ? t("Saving…") : t("Save deal")}
                              </button>
                            </div>
                          );
                        })()}

                      {entry.status === "approved" &&
                        entry.dealText &&
                        (() => {
                          const stats = statsByClaim.get(entry.id);
                          const feedback = redeemFeedback[entry.id];
                          const draft = codeDrafts[entry.id] ?? "";
                          return (
                            <div className="mt-3 rounded-2xl border border-hp-ink/10 bg-white/60 p-2.5">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                                <Ticket size={12} /> {t("Verify a code")}
                              </div>
                              <div className="mt-1.5 flex gap-2">
                                <input
                                  value={draft}
                                  onChange={(event) =>
                                    setCodeDrafts((current) => ({
                                      ...current,
                                      [entry.id]: event.target.value
                                        .toUpperCase()
                                        .replace(/[^A-Z0-9]/g, "")
                                        .slice(0, DEAL_CODE_LENGTH),
                                    }))
                                  }
                                  maxLength={DEAL_CODE_LENGTH}
                                  autoCapitalize="characters"
                                  autoCorrect="off"
                                  spellCheck={false}
                                  placeholder={"".padEnd(DEAL_CODE_LENGTH, "X")}
                                  className={`${fieldClass()} font-mono tracking-[0.3em]`}
                                />
                                <button
                                  type="button"
                                  onClick={() => void redeem(entry.id)}
                                  disabled={
                                    redeemingId === entry.id || draft.length < DEAL_CODE_LENGTH
                                  }
                                  className="shrink-0 rounded-full bg-hp-ink px-3 py-2 text-[12px] font-bold text-hp-paper disabled:opacity-40"
                                >
                                  {redeemingId === entry.id ? t("Working...") : t("Redeem")}
                                </button>
                              </div>
                              {feedback && (
                                <p
                                  className={`mt-1.5 text-[11px] font-semibold ${
                                    feedback.ok ? "text-hp-olive" : "text-red-600"
                                  }`}
                                >
                                  {feedback.text}
                                </p>
                              )}
                              <p className="mt-2 text-[11px] font-semibold text-hp-muted">
                                🎟️ {stats?.redeemedTotal ?? 0} {t("redemptions")} ·{" "}
                                {stats?.issuedLive ?? 0} {t("pending")}
                              </p>
                            </div>
                          );
                        })()}

                      {entry.status !== "rejected" && (
                        <div className="mt-3 flex flex-col gap-2">
                          {!editable && (
                            <p className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-hp-muted">
                              <Lock size={11} />{" "}
                              {t("Locked after approval — the team edits it now.")}
                            </p>
                          )}
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                              {t("Opening hours")}
                            </span>
                            <textarea
                              value={draft.hoursText}
                              onChange={(event) =>
                                patchDraft(entry, { hoursText: event.target.value })
                              }
                              rows={2}
                              disabled={!editable}
                              placeholder={t("Mon–Sat 9:00–17:00, Sun closed")}
                              className={`${fieldClass()} resize-none disabled:opacity-70`}
                            />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                                {t("Phone")}
                              </span>
                              <input
                                value={draft.phone}
                                onChange={(event) =>
                                  patchDraft(entry, { phone: event.target.value })
                                }
                                disabled={!editable}
                                inputMode="tel"
                                className={`${fieldClass()} disabled:opacity-70`}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                                {t("Website")}
                              </span>
                              <input
                                value={draft.websiteUrl}
                                onChange={(event) =>
                                  patchDraft(entry, { websiteUrl: event.target.value })
                                }
                                disabled={!editable}
                                inputMode="url"
                                placeholder="https://"
                                className={`${fieldClass()} disabled:opacity-70`}
                              />
                            </label>
                          </div>
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                              {t("Menu link")}
                            </span>
                            <input
                              value={draft.menuUrl}
                              onChange={(event) =>
                                patchDraft(entry, { menuUrl: event.target.value })
                              }
                              disabled={!editable}
                              inputMode="url"
                              placeholder="https://"
                              className={`${fieldClass()} disabled:opacity-70`}
                            />
                          </label>

                          <div>
                            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-hp-muted">
                              {t("Photos")}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {draft.photos.map((url) => (
                                <div key={url} className="relative h-16 w-16">
                                  <ImageBox
                                    src={url}
                                    alt=""
                                    className="h-16 w-16"
                                    rounded="rounded-xl"
                                  />
                                  {editable && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        patchDraft(entry, {
                                          photos: draft.photos.filter((item) => item !== url),
                                        })
                                      }
                                      aria-label={t("Remove photo")}
                                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-hp-paper bg-hp-ink text-hp-paper"
                                    >
                                      <X size={11} />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {editable && (
                                <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-xl border border-dashed border-hp-ink/25 text-hp-muted">
                                  <Plus size={16} />
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={(event) => void addPhoto(entry, event)}
                                  />
                                </label>
                              )}
                            </div>
                          </div>

                          {editable && (
                            <button
                              type="button"
                              onClick={() => void save(entry)}
                              disabled={savingId === entry.id}
                              className="mt-1 w-full rounded-full bg-hp-sunset py-2 text-[12px] font-bold text-hp-paper disabled:opacity-50"
                            >
                              {savingId === entry.id ? t("Saving…") : t("Save details")}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-5">
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-hp-muted">
                {t("Claim a place")}
              </h4>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search by name or area…")}
                className={fieldClass()}
              />
              {matches.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {matches.map((place) => (
                    <li key={place.id}>
                      <button
                        type="button"
                        onClick={() => void claim(place.id)}
                        disabled={claimingId === place.id}
                        className="flex w-full items-center gap-3 rounded-2xl border border-hp-ink/10 bg-hp-paper p-2.5 text-left transition active:scale-[0.99] disabled:opacity-50"
                      >
                        <ImageBox
                          src={place.imageUrl}
                          alt=""
                          className="h-10 w-10 shrink-0"
                          rounded="rounded-xl"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-bold text-hp-ink">
                            {place.name}
                          </span>
                          <span className="block truncate text-[10.5px] text-hp-muted">
                            {place.area}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] font-bold text-hp-sunset">
                          {claimingId === place.id ? t("Sending…") : t("Claim")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim() && matches.length === 0 && (
                <p className="mt-2 text-[11px] text-hp-muted">{t("No places match.")}</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

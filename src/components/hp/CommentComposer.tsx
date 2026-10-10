import { Send } from "lucide-react";
import type { Comment } from "@/lib/hp-model";
import type { CommentDraftBinding } from "@/lib/hp/comment-drafts";
import { useI18n } from "@/lib/i18n";

export function CommentComposer({
  binding,
  inputId,
  label,
  placeholder,
  submitLabel,
}: {
  binding?: CommentDraftBinding;
  inputId: string;
  label: string;
  placeholder: string;
  submitLabel: string;
}) {
  const { t } = useI18n();
  const draft = binding?.draft;
  const saving = draft?.status === "saving";
  const disabled = !binding || binding.disabled || saving || !draft?.text.trim();
  const messages = {
    saving: "Submitting comment…",
    error: "Could not submit. Your draft is saved. Try again.",
    "auth-required": "Your draft is saved. Sign in, then send it when you are ready.",
    "profile-required":
      "Your draft is saved. Complete your profile, then send it when you are ready.",
    submitted: "Submitted for review",
  };
  const statusMessage = draft && draft.status !== "idle" ? messages[draft.status] : null;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) void binding?.onSubmit();
      }}
      aria-busy={saving || undefined}
    >
      <div className="flex items-center gap-2 rounded-full border border-hp-ink/10 bg-white/70 px-3 py-2">
        <input
          id={inputId}
          name={inputId}
          value={draft?.text ?? ""}
          onChange={(event) => binding?.onChange(event.target.value)}
          aria-label={label}
          aria-describedby={statusMessage ? `${inputId}-status` : undefined}
          disabled={!binding || binding.disabled}
          autoComplete="off"
          placeholder={placeholder}
          className="w-full bg-transparent text-[12px] outline-none placeholder:text-hp-muted"
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          }}
        />
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-full bg-hp-ink px-2 text-[11px] font-bold text-hp-paper disabled:opacity-40"
          aria-label={draft?.status === "error" ? t("Retry comment") : submitLabel}
        >
          <Send size={12} aria-hidden="true" />
          {draft?.status === "error" && t("Retry")}
        </button>
      </div>
      {statusMessage && (
        <p id={`${inputId}-status`} role="status" className="mt-1 text-[11px] text-hp-muted">
          {t(statusMessage)}
        </p>
      )}
      {Boolean(draft?.otherTexts?.length) && (
        <button
          type="button"
          disabled={saving}
          onClick={binding?.onUseGuestDraft}
          className="mt-1 text-[11px] font-bold text-hp-deep underline"
        >
          {t("Switch to your other saved draft")}
        </button>
      )}
    </form>
  );
}

export function CommentReviewStatus({ comment }: { comment: Comment }) {
  const { t } = useI18n();
  return comment.moderationStatus === "pending" ? (
    <span className="mt-1 block text-[10px] text-hp-muted">{t("Submitted for review")}</span>
  ) : null;
}

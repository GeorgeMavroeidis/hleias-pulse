import { useEffect, useState, useSyncExternalStore } from "react";
import {
  CommentDraftStore,
  type CommentDraftBinding,
  type CommentSubmissionResult,
  type CommentTarget,
} from "@/lib/hp/comment-drafts";

export function useCommentDrafts(userId: string | null, loading = false) {
  const [store] = useState(() => new CommentDraftStore());
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    if (!loading) store.setViewer(userId);
  }, [loading, store, userId]);

  return (
    target: CommentTarget | null,
    write: (target: CommentTarget, text: string) => Promise<CommentSubmissionResult>,
  ): CommentDraftBinding | undefined =>
    target
      ? {
          draft: store.get(userId, target),
          disabled: loading,
          onChange: (text) => store.setText(userId, target, text),
          onSubmit: () => store.submit(userId, target, (text) => write(target, text)),
          onUseGuestDraft: () => store.useGuestDraft(userId, target),
        }
      : undefined;
}

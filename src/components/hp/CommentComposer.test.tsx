// Rendering checks only. Browser keyboard/authentication journeys run against the local harness.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CommentDraftStatus } from "@/lib/hp/comment-drafts";
import { I18nProvider } from "@/lib/i18n";
import { CommentComposer, CommentReviewStatus } from "./CommentComposer";

function render(status: CommentDraftStatus, text = "My retained note") {
  return renderToStaticMarkup(
    createElement(I18nProvider, {
      children: createElement(CommentComposer, {
        inputId: "post-comment-one",
        label: "Quick comment on post",
        placeholder: "Quick comment",
        submitLabel: "Post comment",
        binding: {
          draft: { status, text, revision: 1 },
          onChange: () => undefined,
          onSubmit: async () => undefined,
          onUseGuestDraft: () => undefined,
        },
      }),
    }),
  );
}

test("saving presentation blocks submit, keeps editable text, and announces status", () => {
  const markup = render("saving");
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /value="My retained note"/);
  assert.match(markup, /type="submit" disabled=""/);
  assert.match(markup, /aria-describedby="post-comment-one-status"/);
  assert.match(markup, /role="status"/);
  assert.doesNotMatch(markup, /<input[^>]+disabled=/);
});

test("error presentation retains the draft and exposes an enabled retry", () => {
  const markup = render("error");
  assert.match(markup, /value="My retained note"/);
  assert.match(markup, /Επανάληψη υποβολής σχολίου/);
  assert.doesNotMatch(markup, /type="submit" disabled=""/);
});

test("acknowledged pending content says it is submitted for review", () => {
  const markup = renderToStaticMarkup(
    createElement(I18nProvider, {
      children: createElement(CommentReviewStatus, {
        comment: { author: "Me", text: "Pending note", moderationStatus: "pending" },
      }),
    }),
  );
  assert.match(markup, /Υποβλήθηκε για έλεγχο/);
  assert.equal(
    renderToStaticMarkup(
      createElement(I18nProvider, {
        children: createElement(CommentReviewStatus, {
          comment: { author: "Me", text: "Published note", moderationStatus: "published" },
        }),
      }),
    ),
    "",
  );
});

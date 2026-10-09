import assert from "node:assert/strict";
import { env } from "node:process";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/lib/i18n";
import type { Place } from "@/lib/hp-model";
import type { ComposerMode } from "./pulse-shared";

async function loadComposer() {
  const originalUrl = env.SUPABASE_URL;
  const originalKey = env.SUPABASE_PUBLISHABLE_KEY;
  env.SUPABASE_URL = "http://127.0.0.1:54321";
  env.SUPABASE_PUBLISHABLE_KEY = "local-test-public-key";
  try {
    // The component transitively imports the real client; never let this test
    // initialize it with the hosted defaults, even when no request is made.
    return await import("./CreateComposerModal");
  } finally {
    if (originalUrl === undefined) delete env.SUPABASE_URL;
    else env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete env.SUPABASE_PUBLISHABLE_KEY;
    else env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
}

const { CreateComposerModal } = await loadComposer();

const places = [
  {
    id: "one",
    name: "First place",
    area: "Pyrgos",
    type: "local",
    imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
    recentPostCount: 0,
  },
  {
    id: "two",
    name: "Chosen beach",
    area: "Katakolo",
    type: "beach",
    imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
    recentPostCount: 0,
  },
] as Place[];

function renderComposer(initialMode: ComposerMode, initialPlaceId?: string, options = places) {
  return renderToStaticMarkup(
    createElement(I18nProvider, {
      children: createElement(CreateComposerModal, {
        open: true,
        initialMode,
        initialPlaceId,
        places: options,
        vibeChips: [],
        account: { status: "signedOut" },
        onClose() {},
        onRequireAccount() {},
        onPost: async () => {},
        onPlace: async () => {},
        onStory: async () => {},
        onEvent: async () => {},
        onQuestion: async () => {},
      }),
    }),
  );
}

test("all four contribution modes render with no automatic place selection", () => {
  for (const mode of ["post", "question", "story", "event"] as const) {
    const html = renderComposer(mode);
    assert.match(html, new RegExp(`data-testid="composer-${mode}-form"`));
    assert.match(html, /Επίλεξε τοποθεσία/);
    assert.doesNotMatch(html, /aria-selected="true"/);
    assert.match(html, new RegExp(`data-testid="composer-${mode}-submit"[^>]*disabled=""`));
    assert.doesNotMatch(html, /src=""/);
  }
});

test("contextual place selection uses only the given valid place ID", () => {
  const html = renderComposer("post", "two");
  assert.match(html, /data-testid="composer-post-place"[^>]*value="two"/);
  assert.match(html, /Chosen beach/);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.doesNotMatch(renderComposer("post", "missing"), /aria-selected="true"/);
});

test("empty places keep the composer available and allow adding a new place", () => {
  const contribution = renderComposer("post", undefined, []);
  assert.match(contribution, /role="dialog"/);
  assert.match(contribution, /data-testid="composer-post-submit"[^>]*disabled=""/);
  const addPlace = renderComposer("place", undefined, []);
  assert.match(addPlace, /data-testid="composer-place-form"/);
  assert.match(addPlace, /data-testid="composer-place-submit"/);
});

test("Meet input labels its Athens timezone and explains the local time", () => {
  const html = renderComposer("event");
  assert.match(html, /Europe\/Athens/);
  assert.match(html, /type="datetime-local"[^>]*aria-describedby="create-event-timezone"/);
  assert.match(html, /id="create-event-timezone"/);
  assert.match(html, /Τοπική ώρα Ηλείας/);
});

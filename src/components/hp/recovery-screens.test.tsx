import assert from "node:assert/strict";
import { after, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../lib/i18n";
import type { SavedContent } from "../../lib/hp/saved-items";
// Rendering only: imported containers reach the app client, but these checks
// must remain offline and must never initialize it against the hosted project.
process.env.HLEIAS_LOCAL_ONLY = "1";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISHABLE_KEY = "local-recovery-render-test";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Recovery rendering tests must not make network requests");
};
after(() => {
  globalThis.fetch = originalFetch;
});
const { SavedItemsView } = await import("./SavedScreen");
const { DealsScreen } = await import("./DealsScreen");
const { TopBar } = await import("./PulseTopBar");

const noop = () => {};
const empty: SavedContent = {
  targets: [],
  places: [],
  posts: [],
  routes: [],
  authors: [],
  profiles: [],
  placeComments: {},
  routeComments: {},
};
const saved = (status: "loading" | "error" | "ready", content: SavedContent | null = null) =>
  renderToStaticMarkup(
    <I18nProvider>
      <SavedItemsView
        content={content}
        status={status}
        removing={[]}
        removeError={false}
        onRefresh={noop}
        onRemove={noop}
        onOpenPlace={noop}
        onOpenPost={noop}
        onOpenRoute={noop}
        onBrowsePlaces={noop}
      />
    </I18nProvider>,
  );

test("Saved never calls loading or failed reads empty", () => {
  assert.doesNotMatch(saved("loading"), /Δεν έχεις αποθηκεύσει/);
  const failed = saved("error");
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Δοκίμασε ξανά/);
  assert.doesNotMatch(failed, /Δεν έχεις αποθηκεύσει/);
  assert.match(saved("ready", empty), /Δεν έχεις αποθηκεύσει/);
});

test("all unavailable Saved targets remain visible with Refresh and Remove", () => {
  const html = saved("ready", {
    ...empty,
    targets: [
      { type: "place", id: "hidden-place" },
      { type: "post", id: "hidden-post" },
      { type: "route", id: "hidden-route" },
    ],
  });
  assert.equal((html.match(/<li /g) ?? []).length, 3);
  assert.equal((html.match(/aria-label="Αφαίρεση αποθηκευμένου:/g) ?? []).length, 3);
  assert.match(html, /Ανανέωση/);
  assert.doesNotMatch(html, /Δεν έχεις αποθηκεύσει/);
  assert.doesNotMatch(html, /hidden-place|hidden-post|hidden-route/);
});

test("Deals distinguishes loading, failure and successful empty; recovery actions are buttons", () => {
  const render = (status: "loading" | "error" | "ready") =>
    renderToStaticMarkup(
      <I18nProvider>
        <DealsScreen
          status={status}
          deals={[]}
          places={[]}
          onOpenPlace={noop}
          onRetry={noop}
          onBrowsePlaces={noop}
        />
      </I18nProvider>,
    );
  assert.doesNotMatch(render("loading"), /Δεν υπάρχουν ενεργές προσφορές/);
  const error = render("error");
  assert.match(error, /role="alert"/);
  assert.match(error, /Δοκίμασε ξανά/);
  assert.doesNotMatch(error, /Δεν υπάρχουν ενεργές προσφορές/);
  const ready = render("ready");
  assert.match(ready, /Δεν υπάρχουν ενεργές προσφορές αυτή τη στιγμή/);
  assert.match(ready, /Εξερεύνηση σημείων/);
  assert.doesNotMatch(ready, /Check back soon/);
});

test("collapsed search keeps the query and a dedicated accessible clear control", () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <TopBar
        query="quiet beach"
        setQuery={noop}
        onSetLanguage={noop}
        animationTheme="calm"
        onSetAnimationTheme={noop}
        appearanceOpen={false}
        setAppearanceOpen={noop}
        showSearch={false}
        setShowSearch={noop}
        account={{ status: "signedOut" }}
        onOpenAccount={noop}
        onOpenAuth={noop}
        onOpenDeals={noop}
      />
    </I18nProvider>,
  );
  assert.match(html, /Αναζήτηση: quiet beach/);
  assert.match(html, /aria-label="Καθαρισμός αναζήτησης"/);
  assert.doesNotMatch(html, /name="hp-search"/);
});

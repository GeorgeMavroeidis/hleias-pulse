import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/lib/i18n";
import { DirectionsLink } from "./DirectionsLink";

test("a guest gets a real, translated Google Maps link without an account or location read", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    for (const language of ["GR", "EN"]) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { localStorage: { getItem: () => language } },
      });
      const markup = renderToStaticMarkup(
        createElement(I18nProvider, {
          children: createElement(DirectionsLink, {
            destination: { lat: 37.7704, lng: 21.2936, label: "Kourouta Beach" },
          }),
        }),
      );
      assert.match(
        markup,
        /href="https:\/\/www.google.com\/maps\/dir\/\?api=1&amp;destination=37.7704%2C21.2936&amp;travelmode=driving"/,
      );
      assert.match(markup, /target="_blank" rel="noopener noreferrer"/);
      assert.ok(markup.includes(language === "GR" ? "Οδηγίες" : "Directions"));
      assert.match(markup, /aria-label="[^"]*Kourouta Beach[^"]*Google Maps"/);
    }
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

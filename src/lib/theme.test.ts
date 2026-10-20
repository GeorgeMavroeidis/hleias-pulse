import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parseThemePreference, resolveColorScheme } from "./theme";

test("server rendering exposes unresolved appearance without consulting browser state", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ThemeProvider, useTheme } = await import("./theme-provider");
  function Readiness() {
    const { ready, colorScheme } = useTheme();
    return createElement("output", { "data-ready": String(ready) }, colorScheme);
  }
  const html = renderToStaticMarkup(
    createElement(ThemeProvider, { children: createElement(Readiness) }),
  );
  assert.equal(html, '<output data-ready="false">light</output>');
});

const bootstrap = readFileSync(new URL("../../public/theme-init.js", import.meta.url), "utf8");
for (const stored of [null, "invalid", "system", "light", "dark"]) {
  for (const systemDark of [false, true]) {
    test(`first paint agrees with provider: saved=${stored}, systemDark=${systemDark}`, () => {
      let dark = false;
      let background = "";
      const style: Record<string, string> = {};
      runInNewContext(bootstrap, {
        localStorage: { getItem: () => stored },
        window: { matchMedia: () => ({ matches: systemDark }) },
        document: {
          documentElement: {
            style,
            classList: {
              toggle: (_: string, value: boolean) => {
                dark = value;
              },
            },
          },
          querySelector: () => ({
            setAttribute: (_: string, value: string) => {
              background = value;
            },
          }),
        },
      });
      const resolved = resolveColorScheme(parseThemePreference(stored), systemDark);
      assert.equal(dark, resolved === "dark");
      assert.equal(style.colorScheme, resolved);
      assert.equal(background, style.backgroundColor);
    });
  }
}
test("blocked storage does not prevent system dark first paint", () => {
  const style: Record<string, string> = {};
  runInNewContext(bootstrap, {
    localStorage: {
      getItem: () => {
        throw new Error("blocked");
      },
    },
    window: { matchMedia: () => ({ matches: true }) },
    document: { documentElement: { style, classList: { toggle() {} } }, querySelector: () => null },
  });
  assert.equal(style.colorScheme, "dark");
});
test("manual choice overrides system changes; system tracks them", () => {
  for (const dark of [false, true]) {
    assert.equal(resolveColorScheme("light", dark), "light");
    assert.equal(resolveColorScheme("dark", dark), "dark");
    assert.equal(resolveColorScheme("system", dark), dark ? "dark" : "light");
  }
});

test("preference storage survives reads and safely tolerates unavailable storage", async () => {
  const { readThemePreference, saveThemePreference, THEME_STORAGE_KEY } = await import("./theme");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    saveThemePreference("dark");
    assert.equal(readThemePreference(), "dark");
    assert.equal(values.get(THEME_STORAGE_KEY), "dark");
    saveThemePreference("system");
    assert.equal(readThemePreference(), "system");
    values.set(THEME_STORAGE_KEY, "broken");
    assert.equal(readThemePreference(), "system");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    assert.equal(readThemePreference(), "system");
    assert.doesNotThrow(() => saveThemePreference("light"));
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

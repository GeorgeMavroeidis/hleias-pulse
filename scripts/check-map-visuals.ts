import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  childMarkerSize,
  markerPresenceScale,
  markerMotionPhase,
  markerViewportDensity,
  markerWaveStrength,
  markerMapFillScale,
  MAX_MARKER_CORE_BEAT,
  type ScreenMarker,
} from "../src/lib/hp/map-visuals";

const tiers = ["quiet", "moving", "hot", "live"] as const;
const expected = [
  [9.25, 1, 1, 1, 1],
  [11.5, 1.16, 1.2, 1.24, 1.26],
  [12.5, 1.18, 1.22, 1.26, 1.28],
  [14.25, 1.18, 1.22, 1.26, 1.28],
  [15.5, 1.15, 1.2, 1.24, 1.26],
];
for (const [zoom, ...values] of expected) {
  for (const [index, tier] of tiers.entries()) {
    assert.equal(markerPresenceScale(zoom, tier), values[index]);
    assert.ok(
      Math.abs(markerPresenceScale(zoom - 0.001, tier) - markerPresenceScale(zoom + 0.001, tier)) <
        0.0001,
    );
  }
}
for (const tier of tiers) {
  assert.equal(markerPresenceScale(8, tier), 1);
  assert.equal(markerPresenceScale(18, tier), markerPresenceScale(15.5, tier));
}
assert.deepEqual(tiers.map(childMarkerSize), [48, 54, 60, 60]);
console.log("Map visual profiles: zoom anchors, continuity and tier sizes passed.");

const fillAnchors = [
  [9.25, 1.4],
  [11.5, 1.38],
  [12.5, 1.35],
  [14.25, 1.3],
  [15.5, 1.25],
];
for (const [zoom, gain] of fillAnchors) {
  assert.equal(markerMapFillScale(zoom), gain);
  assert.ok(
    Math.abs(markerMapFillScale(zoom - 0.001) - markerMapFillScale(zoom + 0.001)) < 0.00001,
  );
  for (const tier of tiers) {
    for (const dense of [false, true]) {
      for (const selected of [false, true]) {
        const presence =
          dense && !selected
            ? Math.min(1.08, markerPresenceScale(zoom, tier))
            : markerPresenceScale(zoom, tier);
        const oldScale = presence * (selected ? 1.1 : 1);
        const newScale = oldScale * markerMapFillScale(zoom);
        assert.ok(newScale / oldScale >= 1.25 - 1e-9, "Density must not cancel the map-fill gain");
        assert.ok((newScale / oldScale) ** 2 >= 1.5625 - 1e-9);
      }
    }
  }
}
assert.equal(markerMapFillScale(8), 1.4);
assert.equal(markerMapFillScale(18), 1.25);
for (let zoom = 8; zoom <= 18; zoom += 0.05) {
  assert.ok(markerMapFillScale(zoom) >= markerMapFillScale(zoom + 0.01));
}
console.log(
  "Map fill: +25–40% diameter, +56–96% footprint, smooth zoom curve and dense/selected invariants passed.",
);

const pin = (id: string, overrides: Partial<ScreenMarker> = {}): ScreenMarker => ({
  id,
  x: 24,
  y: 24,
  opacity: 1,
  tier: "moving",
  score: 1,
  selected: false,
  ...overrides,
});
for (const count of [1, 12, 36, 37, 80]) {
  const nodes = Array.from({ length: count }, (_, i) =>
    pin(`pin-${i}`, { x: (i % 10) * 96 + 12, y: Math.floor(i / 10) * 96 + 12 }),
  );
  const result = markerViewportDensity(nodes, 1000, 1000);
  assert.equal(result.visible.size, count);
  assert.equal(result.dense.size, count > 36 ? count : 0);
  assert.equal(result.suppressed.size, 0);
}
const crowd = [
  pin("moving", { score: 99 }),
  pin("hot", { tier: "hot", score: 100 }),
  pin("live", { tier: "live" }),
  pin("selected", { selected: true }),
];
const local = markerViewportDensity(crowd, 390, 400);
assert.deepEqual([...local.suppressed].sort(), ["hot", "moving"]);
assert.ok(!local.dense.has("selected"));
assert.deepEqual(markerViewportDensity([...crowd].reverse(), 390, 400), local);
const ties = markerViewportDensity([pin("z"), pin("a"), pin("m")], 390, 400);
assert.ok(!ties.suppressed.has("a"));
const clipped = markerViewportDensity(
  [
    pin("onscreen"),
    pin("behind-sheet", { y: 400 }),
    pin("outside", { x: -1 }),
    pin("crossfade", { opacity: 0.08 }),
  ],
  390,
  400,
);
assert.deepEqual([...clipped.visible], ["onscreen"]);
assert.equal(clipped.dense.size, 0);
for (const id of ["a", "place-123", "Πύργος", "cluster-99"]) {
  assert.equal(markerMotionPhase(id), markerMotionPhase(id));
  assert.ok(markerMotionPhase(id) >= 0 && markerMotionPhase(id) < 1);
}
console.log(
  "Marker density: viewport clipping, 1/12/36/37/80 nodes, tier priority, stable ties and selected exemption passed.",
);

// Source contracts complement (not replace) real browser visual/DOM checks.
// styles.css is an index of per-surface partials. Inline them in import order
// so these contracts keep auditing the whole cascade rather than the entry file.
const stylesUrl = new URL("../src/styles.css", import.meta.url);
const css = readFileSync(stylesUrl, "utf8").replace(
  /^@import "(\.[^"]+)";$/gm,
  (_match, specifier: string) => readFileSync(new URL(specifier, stylesUrl), "utf8"),
);
const mapSource = readFileSync(
  new URL("../src/components/hp/SocialMap.tsx", import.meta.url),
  "utf8",
);
const markerKeyframes = [...css.matchAll(/@keyframes (hp-marker-[\w-]+)\s*\{([\s\S]*?)\n\}/g)];
assert.ok(markerKeyframes.length >= 10);
for (const [, name, body] of markerKeyframes) {
  for (const [, property] of body.matchAll(/([\w-]+)\s*:/g)) {
    assert.ok(["opacity", "transform"].includes(property), `${name} animates ${property}`);
  }
}
assert.ok(
  !/:is\([^)]*::(?:before|after)/s.test(css),
  "Pseudo-elements must not appear inside :is()",
);
const signature = mapSource.match(/const sig = \[([\s\S]*?)\]\.join\("\|"\)/)?.[1];
assert.ok(signature);
assert.ok(
  !/selected|theme|lens|prominence/i.test(signature),
  "Selection/theme/lens prominence must not rebuild image content",
);
assert.ok(mapSource.includes('"--hp-marker-lens-opacity-target"'));
assert.ok(mapSource.includes('"--hp-marker-lens-scale-target"'));
for (const layer of ["beacon", "sweep", "core", "core-beat"]) {
  const idle = markerKeyframes.find(([, name]) => name === `hp-marker-signal-${layer}`)?.[2];
  const selected = markerKeyframes.find(
    ([, name]) => name === `hp-marker-signal-selected-${layer}`,
  )?.[2];
  assert.ok(idle);
  assert.equal(idle, selected, "Selected restarts the same coordinated sequence");
}
console.log(
  "Source contracts: compositor-only marker animations, valid pseudo-element selectors and content-only icon signatures passed.",
);

// Audit the real stylesheet tokens, not a second copy of implementation values.
const cssRules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const renderScaleRule = cssRules.find(([, , body]) =>
  body.includes("--hp-marker-render-scale: calc("),
);
assert.ok(renderScaleRule);
const renderScaleExpression = renderScaleRule[2].match(
  /--hp-marker-render-scale:\s*calc\(([^;]+)\);/,
)?.[1];
assert.ok(renderScaleExpression?.includes("var(--hp-map-fill-scale, 1)"));
assert.ok(!renderScaleExpression?.includes("min("), "Fill belongs outside the density cap");
assert.ok(
  renderScaleRule[2].includes("pointer-events: inherit;"),
  "The enlarged core must retain pointer input",
);
assert.ok(
  mapSource.includes(
    'node.style.setProperty("--hp-map-fill-scale", markerMapFillScale(zoom).toFixed(4))',
  ),
);
assert.match(mapSource, /function markerCoreRadius[\s\S]*?markerMapFillScale\(zoom\) \*/);
assert.equal(
  cssRules.filter(([, , body]) => /--hp-map-fill-scale\s*:/.test(body)).length,
  1,
  "Density/theme/selection must not reset the common fill scale",
);
assert.ok(
  cssRules.find(
    ([, selector, body]) =>
      selector.trim() === ".hp-animation-theme-preview" &&
      body.includes("--hp-marker-render-scale: 1;"),
  ),
  "Menu previews must stay compact",
);
const themeTokens = (theme: string) => {
  const rule = cssRules.find(
    ([, selector, body]) =>
      selector.includes(`data-theme-preview="${theme}"`) && body.includes("--hp-effect-primary:"),
  );
  assert.ok(rule, `Missing shared ${theme} palette`);
  assert.ok(rule[1].includes(`data-marker-animation-theme="${theme}"] :where(.hp-real-map)`));
  assert.ok(rule[1].includes(`data-active-theme="${theme}"`));
  return Object.fromEntries(
    [...rule[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, key, value]) => [
      key,
      value.trim(),
    ]),
  );
};
const profiles = {
  pulse: {
    colors: ["#ff6848", "#ffb547"],
    cycles: [3.6, 2.8, 2.2, 2.4],
    peaks: [0.82, 0.88, 0.92, 0.96],
    beats: [1.025, 1.04, 1.05, 1.055],
    extents: [1.65, 1.85, 2, 2.05],
  },
  signal: {
    colors: ["#9b78ff", "#34d9e8"],
    cycles: [4.8, 3.8, 3.2, 3.4],
    peaks: [0.82, 0.86, 0.9, 0.94],
    beats: [1.02, 1.03, 1.04, 1.05],
    extents: [1.85, 1.85, 1.85, 1.85],
  },
};
const states = ["moving", "hot", "live", "selected"];
for (const [theme, profile] of Object.entries(profiles)) {
  const tokens = themeTokens(theme);
  assert.deepEqual(
    [tokens["--hp-effect-primary"], tokens["--hp-effect-secondary"]],
    profile.colors,
  );
  for (const [index, state] of states.entries()) {
    assert.equal(parseFloat(tokens[`--hp-${state}-cycle`]), profile.cycles[index]);
    assert.equal(Number(tokens[`--hp-${state}-peak`]), profile.peaks[index]);
    assert.equal(Number(tokens[`--hp-${state}-beat`]), profile.beats[index]);
    assert.equal(Number(tokens[`--hp-${state}-extent`]), profile.extents[index]);
    assert.ok(Number(tokens[`--hp-${state}-beat`]) <= MAX_MARKER_CORE_BEAT);
    const far = state === "selected" ? 0.74 : 0.64;
    for (const zoom of [8, 9.25, 10.5, 11.5, 12.5, 14.25, 15.5]) {
      const opacity = far + (profile.peaks[index] - far) * markerWaveStrength(zoom);
      assert.ok(opacity >= far && opacity <= profile.peaks[index]);
      if (zoom <= 9.25) assert.equal(opacity, far);
      if (zoom >= 11.5) assert.equal(opacity, profile.peaks[index]);
    }
  }
}
const calm = themeTokens("calm");
assert.deepEqual(
  [calm["--hp-effect-primary"], calm["--hp-effect-secondary"]],
  ["#35bdb2", "#bdece4"],
);
assert.deepEqual(
  states.map((state) => parseFloat(calm[`--hp-${state}-cycle`])),
  [8, 7.2, 6.4, 5.4],
);
assert.equal(markerWaveStrength(9.25), 0);
assert.equal(markerWaveStrength(11.5), 1);
assert.ok(Math.abs(markerWaveStrength(11.499) - markerWaveStrength(11.501)) < 0.00001);

// Adjacent IDs must be stable but spread across the cycle, not nearly in sync.
const phaseBuckets = new Set(
  Array.from({ length: 32 }, (_, i) => Math.floor(markerMotionPhase(`place-${i}`) * 8)),
);
assert.ok(phaseBuckets.size >= 6);
const keyframeNames = new Set(markerKeyframes.map(([, name]) => name));
for (const [, name] of css.matchAll(/animation(?:-name)?:\s*(hp-marker-[\w-]+)/g))
  assert.ok(keyframeNames.has(name), `Missing ${name}`);
for (const [, selector, body] of cssRules) {
  if (/animation(?:-name)?:\s*hp-marker-/.test(body)) {
    assert.match(selector, /is-pulse-|is-selected/, "Quiet markers must not get an activity loop");
    assert.ok(
      !(selector.includes('data-theme-preview="calm"') && selector.includes(".hp-marker-core")),
      "Calm core must stay still",
    );
  }
  // Otherwise the active map theme could accidentally animate every preview.
  if (selector.includes("data-theme-preview") && selector.includes("data-marker-animation-theme")) {
    assert.ok(!/data-marker-animation-theme="[\w-]+"\](?! :where\(\.hp-real-map\))/.test(selector));
  }
}
const pauseRule = cssRules.find(
  ([, selector, body]) =>
    selector.includes("is-viewport-paused") &&
    body.includes("animation-play-state: paused !important"),
);
assert.ok(pauseRule?.[1].includes(".hp-marker-core"));
assert.ok(pauseRule?.[1].includes(".hp-marker-wave::before"));
assert.ok(pauseRule?.[1].includes(".hp-marker-wave::after"));
const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
assert.ok(
  /:is\(\.hp-marker-core,[^{}]+\{\s*animation: none !important/s.test(reduced),
  "Reduced motion must stop both cores and decorative layers",
);
assert.match(css, /is-motion-suppressed:not\(\.is-selected\)[\s\S]+animation: none;/);
assert.ok(
  !/hp-animation-preview-|hp-map-effect-opacity|hp-map-secondary-opacity|hp-pulse-delay|hp-signal-phase/.test(
    css + mapSource,
  ),
);

// The app shell was split out of PulseApp.tsx: the theme picker markup now
// lives in PulseTopBar.tsx and the theme table in pulse-shared.ts. These
// assertions are unchanged - only the files they read moved.
const sharedSource = readFileSync(
  new URL("../src/components/hp/pulse-shared.ts", import.meta.url),
  "utf8",
);
const appSource =
  readFileSync(new URL("../src/components/hp/PulseApp.tsx", import.meta.url), "utf8") +
  readFileSync(new URL("../src/components/hp/PulseTopBar.tsx", import.meta.url), "utf8") +
  sharedSource;
assert.ok(appSource.includes("hp-animation-theme-preview is-pulse-hot"));
assert.ok(appSource.includes("hp-marker-core hp-animation-theme-preview__core"));
assert.ok(appSource.includes("hp.marker-animation-theme.v1"));
const themeOptions = sharedSource.slice(
  sharedSource.indexOf("MARKER_ANIMATION_THEMES"),
  sharedSource.indexOf("function", sharedSource.indexOf("MARKER_ANIMATION_THEMES")),
);
assert.deepEqual(
  [...themeOptions.matchAll(/id: "(pulse|signal|calm)"/g)].map(([, id]) => id),
  ["pulse", "signal", "calm"],
);
console.log(
  "Motion identities: exact palettes/timings/peaks/beats, zoom budget, phase spread, safety selectors and shared preview contracts passed.",
);

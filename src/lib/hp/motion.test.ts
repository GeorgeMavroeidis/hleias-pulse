import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HP_MOTION, HP_EASE_OUT, HP_EASE_STANDARD, HP_TRANSITION } from "./motion";
import {
  HP_TRANSITION as SHARED_TRANSITION,
  HP_EASE_OUT as SHARED_EASE_OUT,
} from "../../components/hp/pulse-shared";

test("CSS and component transitions share durations and easing", () => {
  const css = readFileSync(new URL("../../styles/theme.css", import.meta.url), "utf8");
  for (const name of ["press", "state", "content", "panel", "selection"] as const) {
    assert.ok(css.includes(`--hp-motion-${name}: ${HP_MOTION[name]}ms;`), name);
  }
  assert.ok(css.includes(`--hp-ease-standard: cubic-bezier(${HP_EASE_STANDARD.join(", ")});`));
  assert.ok(css.includes(`--hp-ease-out: cubic-bezier(${HP_EASE_OUT.join(", ")});`));
  assert.equal(HP_TRANSITION.panel.duration * 1000, HP_MOTION.panel);
  assert.equal(HP_TRANSITION.sheetContent.duration * 1000, HP_MOTION.content);
  assert.equal(HP_TRANSITION.state.duration * 1000, HP_MOTION.state);
});

test("existing component imports resolve to the shared motion contract", () => {
  assert.equal(SHARED_TRANSITION, HP_TRANSITION);
  assert.equal(SHARED_EASE_OUT, HP_EASE_OUT);
  assert.deepEqual(HP_TRANSITION.press.ease, HP_EASE_STANDARD);
  assert.deepEqual(HP_TRANSITION.tab.ease, HP_EASE_OUT);
});

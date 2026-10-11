import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGACY_MARKER_THEME_STORAGE_KEY,
  MARKER_MOTION_STORAGE_KEY,
  readMarkerMotionPreference,
} from "./marker-motion";

test("a saved motion choice takes precedence over the older visual theme", () => {
  const values = new Map([
    [MARKER_MOTION_STORAGE_KEY, "pulse"],
    [LEGACY_MARKER_THEME_STORAGE_KEY, "calm"],
  ]);
  assert.equal(readMarkerMotionPreference({ getItem: (key) => values.get(key) ?? null }), "pulse");
  values.set(MARKER_MOTION_STORAGE_KEY, "calm");
  values.set(LEGACY_MARKER_THEME_STORAGE_KEY, "signal");
  assert.equal(readMarkerMotionPreference({ getItem: (key) => values.get(key) ?? null }), "calm");
});

test("the older calm preference survives migration while other themes use Pulse", () => {
  for (const legacy of ["calm", "signal", "pulse", "unknown", null]) {
    assert.equal(
      readMarkerMotionPreference({
        getItem: (key) => (key === LEGACY_MARKER_THEME_STORAGE_KEY ? legacy : null),
      }),
      legacy === "calm" ? "calm" : "pulse",
    );
  }
});

test("unavailable or blocked preference storage leaves the map usable", () => {
  assert.equal(readMarkerMotionPreference(), "pulse");
  assert.equal(
    readMarkerMotionPreference({
      getItem() {
        throw new Error("Storage denied");
      },
    }),
    "pulse",
  );
});

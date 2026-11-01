import assert from "node:assert/strict";
import test from "node:test";
import { AREA_DEFINITIONS } from "./area-catalog";
import { REGION_INTROS, regionIntro } from "./region-intros";

test("every curated area has a one-line intro in Greek and English", () => {
  for (const area of AREA_DEFINITIONS) {
    const intro = REGION_INTROS[area.id];
    assert.ok(intro, `missing intro for ${area.id}`);
    assert.ok(intro.GR.trim() && intro.EN.trim(), `empty intro for ${area.id}`);
  }
});

test("intros only exist for real areas, and standalone areas get none", () => {
  const ids = new Set(AREA_DEFINITIONS.map((area) => area.id));
  for (const id of Object.keys(REGION_INTROS)) assert.ok(ids.has(id), `unknown area ${id}`);
  assert.equal(regionIntro("solo-lechaina", "GR"), null);
});

test("an unchecked intro reports itself as unreviewed", () => {
  assert.equal(regionIntro("olympia", "EN")?.reviewed, false);
});

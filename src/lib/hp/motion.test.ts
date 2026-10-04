import { createMapFrame } from "./map-frame";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HP_MOTION, HP_EASE_OUT, HP_EASE_STANDARD, HP_TRANSITION } from "./motion";
import { createMarkerExits } from "./marker-exit";
import { createMapLocationRequest, type MapLocationStatus } from "./map-location";

function clock() {
  let time = 0;
  let serial = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    timers,
    now: () => time,
    schedule: (run: () => void, delay: number) => {
      timers.set(++serial, { at: time + delay, run });
      return serial as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: (id: ReturnType<typeof setTimeout>) => {
      timers.delete(id as unknown as number);
    },
    advance(ms: number) {
      time += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at > time) continue;
        timers.delete(id);
        timer.run();
      }
    },
  };
}

test("CSS and component motion share duration and easing contracts", () => {
  const css = readFileSync(new URL("../../styles/theme.css", import.meta.url), "utf8");
  for (const name of ["press", "state", "content", "panel", "selection"] as const) {
    assert.ok(css.includes(`--hp-motion-${name}: ${HP_MOTION[name]}ms;`), name);
  }
  assert.ok(css.includes(`--hp-ease-standard: cubic-bezier(${HP_EASE_STANDARD.join(", ")});`));
  assert.ok(css.includes(`--hp-ease-out: cubic-bezier(${HP_EASE_OUT.join(", ")});`));
  assert.equal(HP_TRANSITION.panel.duration * 1000, HP_MOTION.panel);
});

test("500 exits share one timer; a reappearing marker cannot be removed by its old exit", () => {
  const c = clock();
  const exits = createMarkerExits(c.schedule, c.cancel, c.now);
  const removed: string[] = [];
  for (let i = 0; i < 500; i++) exits.start(String(i), () => removed.push(String(i)));
  assert.equal(c.timers.size, 1);
  assert.equal(exits.cancel("4"), true);
  c.advance(HP_MOTION.state);
  assert.equal(removed.length, 499);
  assert.ok(!removed.includes("4"));
  assert.equal(c.timers.size, 0);
});

test("repeated exit reconciliation does not extend deadlines; later exits get their full duration", () => {
  const c = clock();
  const exits = createMarkerExits(c.schedule, c.cancel, c.now);
  const removed: string[] = [];
  exits.start("a", () => removed.push("a"));
  c.advance(80);
  exits.start("a", () => removed.push("wrong"));
  exits.start("b", () => removed.push("b"));
  c.advance(80);
  assert.deepEqual(removed, ["a"]);
  c.advance(80);
  assert.deepEqual(removed, ["a", "b"]);
});

test("reduced motion and teardown flush exits once and leave no timers", () => {
  const c = clock();
  const exits = createMarkerExits(c.schedule, c.cancel, c.now);
  let removed = 0;
  exits.start("a", () => removed++);
  exits.flush();
  exits.flush();
  c.advance(1000);
  assert.equal(removed, 1);
  assert.equal(c.timers.size, 0);
});

function locationFixture() {
  const states: MapLocationStatus[] = [];
  const callbacks: {
    success: PositionCallback;
    error: PositionErrorCallback | null | undefined;
  }[] = [];
  let locations = 0;
  const request = createMapLocationRequest(
    (state) => states.push(state),
    () => locations++,
  );
  const geo = {
    getCurrentPosition(success: PositionCallback, error?: PositionErrorCallback | null) {
      callbacks.push({ success, error });
    },
  };
  return { request, geo, states, callbacks, locations: () => locations };
}

test("location ignores duplicate requests and callbacks from a torn-down map", () => {
  const f = locationFixture();
  f.request.start(f.geo);
  f.request.start(f.geo);
  assert.equal(f.callbacks.length, 1);
  f.request.cancel();
  f.callbacks[0].success({} as GeolocationPosition);
  assert.deepEqual(f.states, ["pending"]);
  assert.equal(f.locations(), 0);
  f.request.start(f.geo);
  f.callbacks[0].error?.({ code: 1 } as GeolocationPositionError);
  f.callbacks[1].success({} as GeolocationPosition);
  assert.deepEqual(f.states, ["pending", "pending", "found"]);
  assert.equal(f.locations(), 1);
});

test("location distinguishes denied, timeout, unavailable and permits retry", () => {
  const f = locationFixture();
  for (const code of [1, 3, 2]) {
    f.request.start(f.geo);
    f.callbacks.at(-1)?.error?.({ code } as GeolocationPositionError);
  }
  f.request.start();
  f.request.start({
    getCurrentPosition() {
      throw new Error("unsupported");
    },
  });
  assert.deepEqual(f.states, [
    "pending",
    "denied",
    "pending",
    "timeout",
    "pending",
    "unavailable",
    "unavailable",
    "pending",
    "unavailable",
  ]);
});

test("viewport bursts coalesce and a callback already queued at teardown stays inert", () => {
  let callback: FrameRequestCallback | undefined;
  let requests = 0,
    updates = 0,
    cancels = 0;
  const frame = createMapFrame(
    () => updates++,
    (next) => {
      callback = next;
      return ++requests;
    },
    () => {
      cancels++;
    },
  );
  frame.schedule();
  frame.schedule();
  frame.schedule();
  assert.equal(requests, 1);
  callback?.(0);
  assert.equal(updates, 1);
  frame.schedule();
  frame.dispose();
  callback?.(1);
  frame.schedule();
  assert.equal(updates, 1);
  assert.equal(requests, 2);
  assert.equal(cancels, 1);
});

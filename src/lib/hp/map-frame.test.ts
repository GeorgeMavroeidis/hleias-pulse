import assert from "node:assert/strict";
import test from "node:test";
import { createMapFrame } from "./map-frame";

function frames() {
  let serial = 0;
  const queued = new Map<number, FrameRequestCallback>();
  const canceled: number[] = [];
  return {
    queued,
    canceled,
    request: (callback: FrameRequestCallback) => {
      queued.set(++serial, callback);
      return serial;
    },
    cancel: (id: number) => {
      canceled.push(id);
      queued.delete(id);
    },
    flush: () => {
      const callbacks = [...queued.values()];
      queued.clear();
      callbacks.forEach((callback) => callback(0));
    },
  };
}

test("geometry bursts coalesce and a later geometry change receives a new frame", () => {
  const f = frames();
  let updates = 0;
  const frame = createMapFrame(() => updates++, f.request, f.cancel);
  for (let i = 0; i < 100; i++) frame.schedule();
  assert.equal(f.queued.size, 1);
  f.flush();
  assert.equal(updates, 1);
  frame.schedule();
  f.flush();
  assert.equal(updates, 2);
  frame.dispose();
  assert.deepEqual(f.canceled, []);
});

test("a callback already delivered at teardown cannot touch the removed map", () => {
  const f = frames();
  let updates = 0;
  const frame = createMapFrame(() => updates++, f.request, f.cancel);
  frame.schedule();
  const callback = [...f.queued.values()][0];
  frame.dispose();
  frame.dispose();
  callback(0);
  frame.schedule();
  assert.equal(updates, 0);
  assert.equal(f.queued.size, 0);
  assert.deepEqual(f.canceled, [1]);
});

test("an update can schedule its next correction without losing the frame", () => {
  const f = frames();
  let updates = 0;
  const frame = createMapFrame(
    () => {
      updates++;
      if (updates < 3) frame.schedule();
    },
    f.request,
    f.cancel,
  );
  frame.schedule();
  f.flush();
  f.flush();
  f.flush();
  assert.equal(updates, 3);
  assert.equal(f.queued.size, 0);
  frame.dispose();
});

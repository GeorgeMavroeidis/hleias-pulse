import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { isFatalBasemapError } from "./map-core";
import {
  MAP_INITIALIZATION_TIMEOUT_MS,
  createMapViewportSync,
  localMapFault,
  loadMapStyleForAcceptance,
  startMapInitialization,
  uniqueMapPlaces,
  type MapAttempt,
  type MapAttemptState,
} from "./map-initialization";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

class DeadlineClock {
  now = 0;
  nextId = 0;
  timers = new Map<number, { due: number; callback: () => void }>();
  schedule = (callback: () => void, delayMs: number) => {
    const id = this.nextId++;
    this.timers.set(id, { due: this.now + delayMs, callback });
    return () => {
      this.timers.delete(id);
    };
  };
  advance(ms: number) {
    this.now += ms;
    for (const [id, timer] of this.timers) {
      if (timer.due <= this.now) {
        this.timers.delete(id);
        timer.callback();
      }
    }
  }
}

class FakeMap {
  removed = 0;
  listeners = new Map<string, (sourceId?: string) => void>();
  emit(event: string, sourceId?: string) {
    this.listeners.get(event)?.(sourceId);
  }
}

function harness(
  overrides: {
    attempt?: number;
    clock?: DeadlineClock;
    loadLibrary?: () => Promise<string>;
    loadStyle?: (signal: AbortSignal) => Promise<string>;
    createMap?: () => FakeMap;
    prepareMap?: (map: FakeMap, attempt: MapAttempt) => void;
  } = {},
) {
  const clock = overrides.clock ?? new DeadlineClock();
  const states: MapAttemptState[] = [];
  const maps: FakeMap[] = [];
  let requestedSignal: AbortSignal | undefined;
  const attempt = startMapInitialization({
    attempt: overrides.attempt ?? 0,
    onStateChange: (state) => states.push(state),
    loadLibrary: overrides.loadLibrary ?? (() => Promise.resolve("maplibre")),
    loadStyle: (signal) => {
      requestedSignal = signal;
      return overrides.loadStyle?.(signal) ?? Promise.resolve("style");
    },
    createMap: () => {
      const map = overrides.createMap?.() ?? new FakeMap();
      maps.push(map);
      return map;
    },
    prepareMap: (map, _library, lifecycle) => {
      if (overrides.prepareMap) {
        overrides.prepareMap(map, lifecycle);
        return;
      }
      let loaded = false;
      map.listeners.set("load", () => {
        loaded = true;
        lifecycle.ready();
      });
      map.listeners.set("error", (sourceId) => {
        if (isFatalBasemapError(loaded, sourceId)) lifecycle.fail();
      });
      lifecycle.addCleanup(() => map.listeners.clear());
    },
    removeMap: (map) => {
      map.removed++;
    },
    scheduleDeadline: clock.schedule,
  });
  return { attempt, clock, states, maps, signal: () => requestedSignal };
}

for (const failedStage of [
  "style request",
  "style JSON",
  "library import",
  "WebGL constructor",
  "map setup",
] as const) {
  test(`a rejected ${failedStage} becomes recoverable error and aborts the attempt`, async () => {
    const reject = () => Promise.reject(new Error("internal implementation details"));
    const h = harness({
      ...(failedStage.startsWith("style") ? { loadStyle: reject } : {}),
      ...(failedStage === "library import" ? { loadLibrary: reject } : {}),
      ...(failedStage === "WebGL constructor"
        ? {
            createMap: () => {
              throw new Error("WebGL unavailable");
            },
          }
        : {}),
      ...(failedStage === "map setup"
        ? {
            prepareMap: () => {
              throw new Error("setup failed");
            },
          }
        : {}),
    });
    await setImmediate();
    assert.deepEqual(h.states, [
      { attempt: 0, status: "loading" },
      { attempt: 0, status: "error", failure: "unavailable" },
    ]);
    assert.equal(h.signal()?.aborted, true);
    assert.equal(h.clock.timers.size, 0);
    assert.equal(h.attempt.isActive(), false);
    if (failedStage === "map setup") assert.equal(h.maps[0].removed, 1);
    h.attempt.dispose();
    h.attempt.ready();
    assert.equal(h.states.length, 2);
  });
}

for (const hangingStage of ["style request", "library import", "map load"] as const) {
  test(`the ten-second deadline also covers a hanging ${hangingStage}`, async () => {
    const stalled = deferred<string>();
    const h = harness({
      ...(hangingStage === "style request" ? { loadStyle: () => stalled.promise } : {}),
      ...(hangingStage === "library import" ? { loadLibrary: () => stalled.promise } : {}),
    });
    await setImmediate();
    h.clock.advance(MAP_INITIALIZATION_TIMEOUT_MS - 1);
    assert.equal(h.states.at(-1)?.status, "loading");
    h.clock.advance(1);
    assert.deepEqual(h.states.at(-1), { attempt: 0, status: "error", failure: "timeout" });
    assert.equal(h.signal()?.aborted, true);
    assert.equal(h.clock.timers.size, 0);
    if (hangingStage === "map load") assert.equal(h.maps[0].removed, 1);
    stalled.resolve("late result");
    await setImmediate();
    assert.equal(h.maps.length, hangingStage === "map load" ? 1 : 0);
    assert.equal(h.states.length, 2);
  });
}

test("a pre-load style error fails, removes map resources and ignores stale load callbacks", async () => {
  const h = harness();
  await setImmediate();
  const map = h.maps[0];
  const lateLoad = map.listeners.get("load")!;
  map.emit("error");
  assert.equal(h.states.at(-1)?.status, "error");
  assert.equal(map.removed, 1);
  assert.equal(map.listeners.size, 0);
  lateLoad();
  assert.equal(h.states.at(-1)?.status, "error");
  assert.equal(h.states.length, 2);
});

test("source-tile errors leave loading bounded, and ordinary errors after load remain nonfatal", async () => {
  const h = harness();
  await setImmediate();
  const map = h.maps[0];
  map.emit("error", "vector-tiles");
  assert.equal(h.states.at(-1)?.status, "loading");
  assert.equal(h.clock.timers.size, 1);
  map.emit("load");
  assert.equal(h.states.at(-1)?.status, "ready");
  assert.equal(h.clock.timers.size, 0);
  map.emit("error", "vector-tiles");
  map.emit("error");
  h.clock.advance(20_000);
  assert.equal(h.states.at(-1)?.status, "ready");
  assert.equal(map.removed, 0);
  h.attempt.dispose();
  assert.equal(map.removed, 1);
});

test("repeated retries create independent attempts and late results cannot replace the current map", async () => {
  const firstStyle = deferred<string>();
  const first = harness({ attempt: 0, loadStyle: () => firstStyle.promise });
  await setImmediate();
  first.clock.advance(10_000);
  const second = harness({ attempt: 1 });
  await setImmediate();
  const secondLateLoad = second.maps[0].listeners.get("load")!;
  second.maps[0].emit("error");
  const third = harness({ attempt: 2 });
  await setImmediate();
  third.maps[0].emit("load");
  firstStyle.resolve("late style");
  secondLateLoad();
  await setImmediate();
  assert.equal(first.maps.length, 0);
  assert.equal(second.maps[0].removed, 1);
  assert.deepEqual(third.states, [
    { attempt: 2, status: "loading" },
    { attempt: 2, status: "ready" },
  ]);
  assert.equal(third.maps[0].removed, 0);
  third.attempt.dispose();
});

test("unmount aborts a pending fetch and blocks map creation after a delayed import", async () => {
  const library = deferred<string>();
  const h = harness({ loadLibrary: () => library.promise });
  await setImmediate();
  h.attempt.dispose();
  assert.equal(h.signal()?.aborted, true);
  assert.equal(h.clock.timers.size, 0);
  library.resolve("late import");
  await setImmediate();
  assert.equal(h.maps.length, 0);
  assert.deepEqual(h.states, [{ attempt: 0, status: "loading" }]);
});

test("an immediately disposed attempt never starts asynchronous work", async () => {
  let libraryCalls = 0;
  let styleCalls = 0;
  const h = harness({
    loadLibrary: () => {
      libraryCalls++;
      return Promise.resolve("library");
    },
    loadStyle: () => {
      styleCalls++;
      return Promise.resolve("style");
    },
  });
  h.attempt.dispose();
  await setImmediate();
  assert.equal(libraryCalls, 0);
  assert.equal(styleCalls, 0);
  assert.equal(h.maps.length, 0);
  assert.equal(h.clock.timers.size, 0);
});

test("unmount cleans ready maps and every resource once even if one cleanup throws", async () => {
  const h = harness();
  await setImmediate();
  h.maps[0].emit("load");
  const cleaned: string[] = [];
  h.attempt.addCleanup(() => {
    cleaned.push("observer");
  });
  h.attempt.addCleanup(() => {
    cleaned.push("broken canvas");
    throw new Error("context already lost");
  });
  h.attempt.addCleanup(() => {
    cleaned.push("animation frame");
  });
  h.attempt.dispose();
  h.attempt.dispose();
  assert.deepEqual(cleaned, ["animation frame", "broken canvas", "observer"]);
  assert.equal(h.maps[0].removed, 1);
  assert.equal(h.maps[0].listeners.size, 0);
  h.attempt.ready();
  h.attempt.fail();
  assert.equal(h.states.at(-1)?.status, "ready");
});

test("the fallback list preserves the filtered order, removes duplicate places, and does not invent data", () => {
  const a = { id: "a", name: "Katakolo harbour" };
  const b = { id: "b", name: "Pyrgos square" };
  assert.deepEqual(uniqueMapPlaces([[a, b], [a]]), [a, b]);
  assert.deepEqual(uniqueMapPlaces([[b]]), [b]);
  assert.deepEqual(uniqueMapPlaces([[], []]), []);
});

test("fault URLs require explicit local-only opt-in, a test build and a loopback browser origin", () => {
  const env = { DEV: true, MODE: "development", VITE_HLEIAS_LOCAL_ONLY: "1" };
  for (const hostname of ["localhost", "127.0.0.1", "::1", "[::1]"]) {
    assert.equal(localMapFault(env, hostname, "?localMapFault=reject", 0), "reject");
    assert.equal(
      localMapFault({ ...env, DEV: false, MODE: "local-test" }, hostname, "?localMapFault=hang", 0),
      "hang",
    );
  }
  for (const blockedEnv of [
    {},
    { DEV: true },
    { DEV: true, VITE_HLEIAS_LOCAL_ONLY: "true" },
    { DEV: false, MODE: "production" },
    { DEV: false, MODE: "production", VITE_HLEIAS_LOCAL_ONLY: "1" },
    { DEV: false, MODE: "local-test" },
  ]) {
    for (const fault of ["reject", "reject-once", "hang"]) {
      assert.equal(localMapFault(blockedEnv, "localhost", `?localMapFault=${fault}`, 0), null);
    }
  }
  for (const hostname of [
    "",
    "example.com",
    "localhost.example.com",
    "127.0.0.1.example.com",
    "localhost.",
    "192.168.1.10",
  ]) {
    assert.equal(localMapFault(env, hostname, "?localMapFault=reject", 0), null);
  }
});

test("local reject-once affects only the initial attempt and unknown faults are ignored", () => {
  const env = { DEV: true, VITE_HLEIAS_LOCAL_ONLY: "1" };
  assert.equal(localMapFault(env, "localhost", "?localMapFault=reject-once", 0), "reject");
  for (const attempt of [1, 2, 3]) {
    assert.equal(localMapFault(env, "localhost", "?localMapFault=reject-once", attempt), null);
    assert.equal(localMapFault(env, "localhost", "?localMapFault=reject", attempt), "reject");
    assert.equal(localMapFault(env, "localhost", "?localMapFault=hang", attempt), "hang");
  }
  for (const search of ["", "?localMapFault=unknown", "?localMapFault=", "?other=reject"]) {
    assert.equal(localMapFault(env, "localhost", search, 0), null);
  }
});

test("local rejection skips the network loader while normal attempts use it", async () => {
  const controller = new AbortController();
  let calls = 0;
  const load = () => {
    calls++;
    return Promise.resolve("actual style");
  };
  await assert.rejects(
    loadMapStyleForAcceptance("reject", controller.signal, load),
    /acceptance rejection/,
  );
  assert.equal(calls, 0);
  assert.equal(await loadMapStyleForAcceptance(null, controller.signal, load), "actual style");
  assert.equal(calls, 1);
});

test("local hanging styles time out through the real lifecycle and abort without a network request", async () => {
  let networkCalls = 0;
  let settled = false;
  const h = harness({
    loadStyle: (signal) =>
      loadMapStyleForAcceptance("hang", signal, () => {
        networkCalls++;
        return Promise.resolve("unexpected style");
      }).finally(() => {
        settled = true;
      }),
  });
  await setImmediate();
  assert.equal(networkCalls, 0);
  assert.equal(settled, false);
  h.clock.advance(MAP_INITIALIZATION_TIMEOUT_MS);
  await setImmediate();
  assert.equal(h.states.at(-1)?.failure, "timeout");
  assert.equal(h.signal()?.aborted, true);
  assert.equal(settled, true);
  assert.equal(h.maps.length, 0);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    loadMapStyleForAcceptance("hang", aborted.signal, () => Promise.resolve("unused")),
    /attempt aborted/,
  );
});

function viewportFrames() {
  let nextId = 0;
  const pending = new Map<number, () => void>();
  const cancelled: number[] = [];
  return {
    pending,
    cancelled,
    request: (callback: () => void) => {
      const id = ++nextId;
      pending.set(id, callback);
      return id;
    },
    cancel: (id: number) => {
      cancelled.push(id);
      pending.delete(id);
    },
  };
}

test("queued viewport work after teardown cannot read a removed map or publish stale discovery", () => {
  const frames = viewportFrames();
  let removed = false;
  let reads = 0;
  const map = {
    getCenter: () => {
      reads++;
      if (removed) throw new Error("removed map accessed");
      return { lat: 37.68, lng: 21.52 };
    },
  };
  const published: Array<{ lat: number; lng: number }> = [];
  const viewport = createMapViewportSync({
    map,
    getCurrentMap: () => map,
    readViewport: (instance) => instance.getCenter(),
    publishViewport: (value) => published.push(value),
    requestFrame: frames.request,
    cancelFrame: frames.cancel,
  });
  viewport.schedule();
  viewport.schedule();
  assert.equal(frames.pending.size, 1);
  const [frame, queuedCallback] = [...frames.pending.entries()][0];
  viewport.dispose();
  removed = true;
  assert.deepEqual(frames.cancelled, [frame]);
  assert.equal(frames.pending.size, 0);
  // Deliver an already-queued callback despite successful cancellation. The
  // removed-map read would throw, and any published value would leak to the shell.
  assert.doesNotThrow(queuedCallback);
  assert.equal(reads, 0);
  assert.deepEqual(published, []);
  viewport.schedule();
  assert.equal(frames.pending.size, 0);
});

test("a queued viewport from a replaced map cannot touch the old map", () => {
  const frames = viewportFrames();
  const oldMap = { id: "old" };
  const replacement = { id: "new" };
  let current = oldMap;
  let reads = 0;
  const published: string[] = [];
  const viewport = createMapViewportSync({
    map: oldMap,
    getCurrentMap: () => current,
    readViewport: (instance) => {
      reads++;
      return instance.id;
    },
    publishViewport: (value) => published.push(value),
    requestFrame: frames.request,
    cancelFrame: frames.cancel,
  });
  viewport.schedule();
  const queuedCallback = [...frames.pending.values()][0];
  current = replacement;
  queuedCallback();
  assert.equal(reads, 0);
  assert.deepEqual(published, []);
  viewport.dispose();
});

test("viewport publication checks map identity again after reads and normal coalesced reads still publish", () => {
  const frames = viewportFrames();
  const map = { id: "current" };
  const replacement = { id: "replacement" };
  let current = map;
  let replaceDuringRead = false;
  const published: string[] = [];
  const viewport = createMapViewportSync({
    map,
    getCurrentMap: () => current,
    readViewport: (instance) => {
      if (replaceDuringRead) current = replacement;
      return instance.id;
    },
    publishViewport: (value) => published.push(value),
    requestFrame: frames.request,
    cancelFrame: frames.cancel,
  });
  viewport.schedule();
  viewport.schedule();
  assert.equal(frames.pending.size, 1);
  const [firstId, firstCallback] = [...frames.pending.entries()][0];
  frames.pending.delete(firstId);
  firstCallback();
  assert.deepEqual(published, ["current"]);
  replaceDuringRead = true;
  viewport.schedule();
  const secondCallback = [...frames.pending.values()][0];
  secondCallback();
  assert.deepEqual(published, ["current"]);
  viewport.dispose();
});

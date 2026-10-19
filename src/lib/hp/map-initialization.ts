import { isLoopbackHost, type BrowserBuildEnv } from "../supabase/browser-local-config";

export const MAP_INITIALIZATION_TIMEOUT_MS = 10_000;

export type MapAttemptState = {
  attempt: number;
  status: "loading" | "ready" | "error";
  failure?: "unavailable" | "timeout";
};

export type MapAttempt = {
  signal: AbortSignal;
  isActive: () => boolean;
  ready: () => void;
  fail: (failure?: "unavailable" | "timeout") => void;
  addCleanup: (cleanup: () => void) => void;
  dispose: () => void;
};

type InitializationOptions<Library, Style, Map> = {
  attempt: number;
  onStateChange: (state: MapAttemptState) => void;
  loadLibrary: () => Promise<Library>;
  loadStyle: (signal: AbortSignal) => Promise<Style>;
  createMap: (library: Library, style: Style) => Map;
  prepareMap: (map: Map, library: Library, attempt: MapAttempt) => void;
  removeMap: (map: Map) => void;
  scheduleDeadline?: (callback: () => void, delayMs: number) => () => void;
};

/**
 * One deadline covers imports, style fetch/JSON, WebGL construction and load.
 * A disposed attempt cannot create a map or publish state after retry/unmount.
 * Successful attempts stay active for guarded map callbacks until disposal.
 */
export function startMapInitialization<Library, Style, Map>({
  attempt,
  onStateChange,
  loadLibrary,
  loadStyle,
  createMap,
  prepareMap,
  removeMap,
  scheduleDeadline = (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
}: InitializationOptions<Library, Style, Map>): MapAttempt {
  const controller = new AbortController();
  const cleanups: Array<() => void> = [];
  let status: MapAttemptState["status"] = "loading";
  let disposed = false;
  let cancelDeadline = () => {};
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    cancelDeadline();
    // Removing map-owned listeners before removing the map avoids callbacks
    // from remove() reaching resources that have already been torn down.
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch {
        // A broken WebGL resource must not prevent the remaining cleanup.
      }
    }
    cleanups.length = 0;
  };
  const lifecycle: MapAttempt = {
    signal: controller.signal,
    isActive: () => !disposed,
    ready: () => {
      if (disposed || status !== "loading") return;
      status = "ready";
      cancelDeadline();
      onStateChange({ attempt, status });
    },
    fail: (failure = "unavailable") => {
      if (disposed || status !== "loading") return;
      status = "error";
      dispose();
      onStateChange({ attempt, status, failure });
    },
    addCleanup: (cleanup) => {
      if (disposed) cleanup();
      else cleanups.push(cleanup);
    },
    dispose,
  };
  onStateChange({ attempt, status });
  cancelDeadline = scheduleDeadline(() => lifecycle.fail("timeout"), MAP_INITIALIZATION_TIMEOUT_MS);
  // Starting both operations inside the promise also catches synchronous import
  // wrappers and fetch failures, rather than letting them escape the effect.
  void Promise.resolve()
    .then(async () => {
      if (!lifecycle.isActive()) return;
      const [library, style] = await Promise.all([loadLibrary(), loadStyle(controller.signal)]);
      if (!lifecycle.isActive()) return;
      const map = createMap(library, style);
      lifecycle.addCleanup(() => removeMap(map));
      if (!lifecycle.isActive()) return;
      prepareMap(map, library, lifecycle);
    })
    .catch(() => lifecycle.fail());
  return lifecycle;
}

/** Coalesce viewport reads while keeping queued frames bound to one live map. */
export function createMapViewportSync<Map, Viewport>({
  map,
  getCurrentMap,
  readViewport,
  publishViewport,
  requestFrame,
  cancelFrame,
}: {
  map: Map;
  getCurrentMap: () => Map | null;
  readViewport: (map: Map) => Viewport | null;
  publishViewport: (viewport: Viewport) => void;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
}) {
  let active = true;
  let frame: number | null = null;
  const isCurrent = () => active && getCurrentMap() === map;
  const schedule = () => {
    if (!isCurrent() || frame !== null) return;
    frame = requestFrame(() => {
      frame = null;
      // A frame may already have entered the browser queue when cancelled.
      if (!isCurrent()) return;
      const viewport = readViewport(map);
      // Reads may cause a synchronous map replacement; never publish its old
      // viewport into the new map's discovery state.
      if (viewport !== null && isCurrent()) publishViewport(viewport);
    });
  };
  return {
    schedule,
    isCurrent,
    dispose: () => {
      active = false;
      if (frame !== null) cancelFrame(frame);
      frame = null;
    },
  };
}

/** Keep the fallback list unique while preserving the filtered map order. */
export function uniqueMapPlaces<T extends { id: string }>(groups: readonly (readonly T[])[]): T[] {
  const unique = new Map<string, T>();
  groups.forEach((places) =>
    places.forEach((place) => {
      if (!unique.has(place.id)) unique.set(place.id, place);
    }),
  );
  return [...unique.values()];
}

export type LocalMapFault = "reject" | "hang" | null;

/** URL fault injection is available only in explicitly opted-in local checks. */
export function localMapFault(
  env: Pick<BrowserBuildEnv, "DEV" | "MODE" | "VITE_HLEIAS_LOCAL_ONLY">,
  hostname: string,
  search: string,
  attempt: number,
): LocalMapFault {
  if (
    env.VITE_HLEIAS_LOCAL_ONLY !== "1" ||
    !(env.DEV === true || env.MODE === "local-test") ||
    !isLoopbackHost(hostname)
  )
    return null;
  const fault = new URLSearchParams(search).get("localMapFault");
  if (fault === "reject" || fault === "hang") return fault;
  return fault === "reject-once" && attempt === 0 ? "reject" : null;
}

/** A stalled local style rejects on abort, using the real attempt deadline. */
export function loadMapStyleForAcceptance<Style>(
  fault: LocalMapFault,
  signal: AbortSignal,
  loadStyle: () => Promise<Style>,
): Promise<Style> {
  if (fault === "reject") return Promise.reject(new Error("Local map acceptance rejection"));
  if (fault === "hang") {
    return new Promise<Style>((_resolve, reject) => {
      const onAbort = () => reject(new Error("Local map acceptance attempt aborted"));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  return loadStyle();
}

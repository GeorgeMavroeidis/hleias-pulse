import type { DiscoveryLens } from "./discovery";
import type { MapDiscoveryViewport } from "./regional-discovery";

export type MapSelection =
  | { kind: "idle" }
  | { kind: "regionSelected"; regionId: string }
  | { kind: "placeSelected"; regionId: string; placeId: string };
export type SheetSnap = "collapsed" | "preview" | "expanded";
export type MapCameraSnapshot = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  /** Route framing already applied when this camera was captured. */
  framedRouteRevision?: number | null;
};
type SelectionSnapshot = { selection: MapSelection; snap: SheetSnap };
export type MapDiscoveryState = SelectionSnapshot & {
  activeLens: DiscoveryLens | null;
  viewport: MapDiscoveryViewport | null;
  camera: MapCameraSnapshot | null;
  routeFrameRevision: number;
  history: SelectionSnapshot[];
};
export const initialMapDiscoveryState: MapDiscoveryState = {
  selection: { kind: "idle" },
  snap: "collapsed",
  activeLens: null,
  viewport: null,
  camera: null,
  routeFrameRevision: 0,
  history: [],
};
export type MapDiscoveryAction =
  | { type: "select"; selection: Exclude<MapSelection, { kind: "idle" }>; remember?: boolean }
  | { type: "snap"; snap: SheetSnap }
  | { type: "clear" }
  | { type: "back" }
  | { type: "frameRoute" }
  | { type: "lens"; lens: DiscoveryLens | null }
  | { type: "viewport"; viewport: MapDiscoveryViewport }
  | { type: "leaveMap"; camera: MapCameraSnapshot | null }
  | { type: "validate"; placeIds: ReadonlySet<string>; regionIds: ReadonlySet<string> };

const sameSelection = (a: MapSelection, b: MapSelection) =>
  a.kind === b.kind &&
  (a.kind === "idle" ||
    (b.kind !== "idle" &&
      a.regionId === b.regionId &&
      (a.kind !== "placeSelected" || (b.kind === "placeSelected" && a.placeId === b.placeId))));
function clear(state: MapDiscoveryState): MapDiscoveryState {
  if (state.selection.kind === "idle" && state.snap === "collapsed" && !state.history.length)
    return state;
  return { ...state, selection: { kind: "idle" }, snap: "collapsed", history: [] };
}
export function mapDiscoveryReducer(
  state: MapDiscoveryState,
  action: MapDiscoveryAction,
): MapDiscoveryState {
  switch (action.type) {
    case "select": {
      const history =
        action.remember !== false && !sameSelection(state.selection, action.selection)
          ? [...state.history, { selection: state.selection, snap: state.snap }].slice(-12)
          : state.history;
      return { ...state, selection: action.selection, snap: "preview", history };
    }
    case "snap":
      return action.snap === "collapsed" ? clear(state) : { ...state, snap: action.snap };
    case "clear":
      return clear(state);
    case "back": {
      if (state.selection.kind === "idle") return clear(state);
      if (state.snap === "expanded") return { ...state, snap: "preview" };
      const previous = state.history.at(-1);
      return previous
        ? { ...state, ...previous, history: state.history.slice(0, -1) }
        : clear(state);
    }
    case "frameRoute":
      return { ...state, routeFrameRevision: state.routeFrameRevision + 1 };
    case "lens":
      return action.lens === state.activeLens ? state : { ...state, activeLens: action.lens };
    case "viewport":
      return {
        ...state,
        viewport: action.viewport,
        camera: {
          center: [action.viewport.center.lng, action.viewport.center.lat],
          zoom: action.viewport.zoom,
          bearing: action.viewport.bearing,
          pitch: action.viewport.pitch,
        },
      };
    case "leaveMap":
      return { ...clear(state), viewport: null, camera: action.camera ?? state.camera };
    case "validate": {
      const valid = (selection: MapSelection) =>
        selection.kind === "idle" ||
        (action.regionIds.has(selection.regionId) &&
          (selection.kind !== "placeSelected" || action.placeIds.has(selection.placeId)));
      if (!valid(state.selection)) return clear(state);
      const history = state.history.filter((item) => valid(item.selection));
      return history.length === state.history.length ? state : { ...state, history };
    }
  }
}

export type SheetSnapHeights = Record<SheetSnap, number>;
export function discoverySheetHeights(
  stageHeight: number,
  collapsedHeight: number,
  mode: MapSelection["kind"],
): SheetSnapHeights {
  const height = Math.max(1, stageHeight);
  const collapsed = Math.min(height, Math.max(72, Math.ceil(collapsedHeight)));
  // Short landscape stages need a scrollable body as well as a usable map.
  const minimumMap = Math.min(188, Math.max(72, height - collapsed - 112));
  const expanded = Math.max(collapsed, Math.min(Math.round(height * 0.62), height - minimumMap));
  const preferred =
    mode === "placeSelected"
      ? Math.min(300, Math.max(252, Math.round(height * 0.42)))
      : Math.min(276, Math.max(220, Math.round(height * 0.38)));
  return { collapsed, preview: Math.min(expanded, Math.max(collapsed, preferred)), expanded };
}
export function sheetSnapPoints(heights: SheetSnapHeights) {
  return (["collapsed", "preview", "expanded"] as const).filter(
    (snap, index, all) => index === 0 || heights[snap] > heights[all[index - 1]] + 1,
  );
}
export function releaseSheetSnap(
  height: number,
  velocityY: number,
  heights: SheetSnapHeights,
): SheetSnap {
  const points = sheetSnapPoints(heights);
  if (velocityY < -180) return points.find((snap) => heights[snap] > height + 4) ?? points.at(-1)!;
  if (velocityY > 180)
    return [...points].reverse().find((snap) => heights[snap] < height - 4) ?? "collapsed";
  return points.reduce((closest, snap) =>
    Math.abs(heights[snap] - height) < Math.abs(heights[closest] - height) ? snap : closest,
  );
}

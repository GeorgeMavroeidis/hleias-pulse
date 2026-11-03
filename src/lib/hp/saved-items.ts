import type { Author, Comment, Place, Post, RouteItem } from "../hp-model";
import type { PulseProfileSummary } from "../hp-api";

export type SavedTarget = { type: "place" | "post" | "route"; id: string };

export interface SavedContent {
  targets: SavedTarget[];
  places: Place[];
  posts: Post[];
  routes: RouteItem[];
  authors: Author[];
  profiles: PulseProfileSummary[];
  placeComments: Record<string, Comment[]>;
  routeComments: Record<string, Comment[]>;
}

export function savedTargetKey(target: SavedTarget): string {
  return `${target.type}:${target.id}`;
}

// A missing permission-checked row is deliberately indistinguishable from a
// removed row. Do not reveal the reason a target is no longer readable.
export function savedTargetAvailable(target: SavedTarget, content: SavedContent): boolean {
  const places = new Set(content.places.map((place) => place.id));
  if (target.type === "place") return places.has(target.id);
  if (target.type === "post") {
    const post = content.posts.find((item) => item.id === target.id);
    return Boolean(post && places.has(post.placeId));
  }
  const route = content.routes.find((item) => item.id === target.id);
  return Boolean(route && route.stops.every((stop) => places.has(stop.placeId)));
}

export function savedTargetsFromRows(
  rows: {
    target_type: string;
    place_id: string | null;
    post_id: string | null;
    route_id: string | null;
  }[],
): SavedTarget[] {
  const targets = new Map<string, SavedTarget>();
  for (const row of rows) {
    const type = row.target_type;
    if (type !== "place" && type !== "post" && type !== "route") continue;
    const id = row[`${type}_id`];
    if (!id) continue;
    const target: SavedTarget = { type, id };
    targets.set(savedTargetKey(target), target);
  }
  return [...targets.values()];
}

export interface SavedItemsState {
  content: SavedContent | null;
  status: "loading" | "ready" | "error";
  removing: string[];
  removeError: boolean;
}

export function initialSavedItemsState(): SavedItemsState {
  return { content: null, status: "loading", removing: [], removeError: false };
}

/** Session-scoped loader. Only acknowledged removals change the list, and
 * stale reads cannot restore a bookmark removed while that read was pending.
 */
export function createSavedItemsStore(dependencies: {
  load: () => Promise<SavedContent>;
  remove: (target: SavedTarget) => Promise<void>;
  onRemoved: (target: SavedTarget) => void;
  onChange: (state: SavedItemsState) => void;
}) {
  let state = initialSavedItemsState();
  let requestId = 0;
  let disposed = false;
  let removalVersion = 0;
  const removedAt = new Map<string, number>();
  const pending = new Set<string>();
  const update = (next: Partial<SavedItemsState>) => {
    if (disposed) return;
    state = { ...state, ...next };
    dependencies.onChange(state);
  };
  return {
    async refresh() {
      if (disposed) return;
      const request = ++requestId;
      const startedAtRemovalVersion = removalVersion;
      update({ status: "loading" });
      try {
        const content = await dependencies.load();
        if (disposed || request !== requestId) return;
        update({
          content: {
            ...content,
            targets: content.targets.filter(
              (target) => (removedAt.get(savedTargetKey(target)) ?? 0) <= startedAtRemovalVersion,
            ),
          },
          status: "ready",
        });
      } catch {
        if (!disposed && request === requestId) update({ status: "error" });
      }
    },
    async remove(target: SavedTarget) {
      const key = savedTargetKey(target);
      if (disposed || pending.has(key)) return;
      pending.add(key);
      update({ removing: [...pending], removeError: false });
      try {
        await dependencies.remove(target);
        if (disposed) return;
        removedAt.set(key, ++removalVersion);
        update({
          content: state.content
            ? {
                ...state.content,
                targets: state.content.targets.filter((item) => savedTargetKey(item) !== key),
              }
            : null,
        });
        dependencies.onRemoved(target);
      } catch {
        update({ removeError: true });
      } finally {
        pending.delete(key);
        update({ removing: [...pending] });
      }
    },
    dispose() {
      disposed = true;
      requestId += 1;
    },
  };
}

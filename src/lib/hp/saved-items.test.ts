import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSavedItemsStore,
  initialSavedItemsState,
  savedTargetAvailable,
  savedTargetsFromRows,
  type SavedContent,
  type SavedItemsState,
} from "./saved-items";
import type { Place, Post, RouteItem } from "../hp-model";

const target = { type: "post" as const, id: "outside-feed" };
const content = (): SavedContent => ({
  targets: [target],
  places: [{ id: "place" } as Place],
  posts: [{ id: target.id, placeId: "place" } as Post],
  routes: [],
  authors: [],
  profiles: [],
  placeComments: {},
  routeComments: {},
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function setup(load: () => Promise<SavedContent>, remove: () => Promise<void> = async () => {}) {
  let state: SavedItemsState = initialSavedItemsState();
  let acknowledgements = 0;
  let changes = 0;
  const store = createSavedItemsStore({
    load,
    remove,
    onRemoved: () => {
      acknowledgements += 1;
    },
    onChange: (next) => {
      state = next;
      changes += 1;
    },
  });
  return {
    store,
    state: () => state,
    acknowledgements: () => acknowledgements,
    changes: () => changes,
  };
}

test("stored target IDs survive partial/all target unavailability and deduplicate by type", () => {
  const rows = [
    { target_type: "post", post_id: "outside-feed", place_id: null, route_id: null },
    { target_type: "post", post_id: "outside-feed", place_id: null, route_id: null },
    { target_type: "place", post_id: null, place_id: "outside-feed", route_id: null },
  ];
  assert.deepEqual(savedTargetsFromRows(rows), [target, { type: "place", id: "outside-feed" }]);
  assert.equal(savedTargetAvailable(target, content()), true);
  assert.equal(savedTargetAvailable(target, { ...content(), posts: [] }), false);
  assert.equal(savedTargetAvailable(target, { ...content(), places: [] }), false);
  const route = { id: "route", stops: [{ placeId: "place" }, { placeId: "hidden" }] } as RouteItem;
  assert.equal(
    savedTargetAvailable({ type: "route", id: "route" }, { ...content(), routes: [route] }),
    false,
  );
});

test("initial and retained read failures are errors, never successful empty lists; retry recovers", async () => {
  let fail = true;
  const fixture = setup(async () => {
    if (fail) throw Error("read failed");
    return content();
  });
  await fixture.store.refresh();
  assert.equal(fixture.state().status, "error");
  assert.equal(fixture.state().content, null);
  fail = false;
  await fixture.store.refresh();
  assert.equal(fixture.state().status, "ready");
  fail = true;
  await fixture.store.refresh();
  assert.equal(fixture.state().status, "error");
  assert.deepEqual(fixture.state().content?.targets, [target]);
});

test("failed removal preserves the bookmark and explicit retry succeeds", async () => {
  let fail = true;
  const fixture = setup(
    async () => content(),
    async () => {
      if (fail) throw Error("write failed");
    },
  );
  await fixture.store.refresh();
  await fixture.store.remove(target);
  assert.equal(fixture.state().removeError, true);
  assert.deepEqual(fixture.state().content?.targets, [target]);
  assert.equal(fixture.acknowledgements(), 0);
  fail = false;
  await fixture.store.remove(target);
  assert.deepEqual(fixture.state().content?.targets, []);
  assert.equal(fixture.acknowledgements(), 1);
});

test("duplicate removals send once and loading cannot resurrect an acknowledged removal", async () => {
  let reads = 0;
  let writes = 0;
  const refresh = deferred<SavedContent>();
  const removal = deferred<void>();
  const fixture = setup(
    () => (++reads === 1 ? Promise.resolve(content()) : refresh.promise),
    () => {
      writes += 1;
      return removal.promise;
    },
  );
  await fixture.store.refresh();
  const pendingRefresh = fixture.store.refresh();
  const pendingRemove = fixture.store.remove(target);
  await fixture.store.remove(target);
  assert.equal(writes, 1);
  removal.resolve();
  await pendingRemove;
  refresh.resolve(content());
  await pendingRefresh;
  assert.deepEqual(fixture.state().content?.targets, []);
});

test("a refresh while removal fails retains the bookmark", async () => {
  const removal = deferred<void>();
  const fixture = setup(
    async () => content(),
    () => removal.promise,
  );
  await fixture.store.refresh();
  const pendingRemove = fixture.store.remove(target);
  await fixture.store.refresh();
  assert.deepEqual(fixture.state().content?.targets, [target]);
  removal.reject(Error("rejected"));
  await pendingRemove;
  assert.deepEqual(fixture.state().content?.targets, [target]);
});

test("later refresh accepts an explicitly re-saved target", async () => {
  const fixture = setup(async () => content());
  await fixture.store.refresh();
  await fixture.store.remove(target);
  await fixture.store.refresh();
  assert.deepEqual(fixture.state().content?.targets, [target]);
});

test("newer reads win; unmount/account change suppresses reads and removal callbacks", async () => {
  const old = deferred<SavedContent>();
  let reads = 0;
  const removal = deferred<void>();
  const fixture = setup(
    () => (++reads === 1 ? old.promise : Promise.resolve({ ...content(), targets: [] })),
    () => removal.promise,
  );
  const oldRead = fixture.store.refresh();
  await fixture.store.refresh();
  old.resolve(content());
  await oldRead;
  assert.deepEqual(fixture.state().content?.targets, []);
  const pendingRemove = fixture.store.remove(target);
  fixture.store.dispose();
  const count = fixture.changes();
  removal.resolve();
  await pendingRemove;
  assert.equal(fixture.changes(), count);
  assert.equal(fixture.acknowledgements(), 0);
});

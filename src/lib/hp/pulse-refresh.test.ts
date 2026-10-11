import assert from "node:assert/strict";
import test from "node:test";
import { buildTrafficPreviewScene } from "./traffic-preview";
import {
  PulseRefreshController,
  commentsById,
  reconcileOpenDetail,
  reconcilePosts,
  reconcilePulseData,
  visibleDetail,
} from "./pulse-refresh";
import { buildPulseActivitySnapshot } from "./pulse-activity";
import { buildPlaceStoryGroups } from "./place-stories";
import { subscribeFreshnessClock } from "./freshness";
import { buildActivityTicks } from "./activity-data";
import type { PulseData } from "../hp-api";
import type { RouteItem } from "../hp-model";
import type { CulturalEvent } from "./cultural-events-types";
import { CommentDraftStore, type CommentTarget } from "./comment-drafts";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const OWNER = "preview-owner-a";
const OTHER_VIEWER = "preview-owner-b";

function detailFixtures() {
  const data = buildTrafficPreviewScene("live", NOW).data;
  const place = { ...data.places[0], moderationStatus: "published" };
  const post = { ...data.posts[0], moderationStatus: "published" };
  const route: RouteItem = {
    id: "preview-kourouta-walk",
    title: "A walk beside Kourouta Beach",
    authorId: data.authors[0].id,
    lede: "Start at the boardwalk and follow the shore.",
    duration: "30 minutes",
    budget: "Free",
    stops: [{ time: "Start", placeId: place.id, title: place.name, body: place.short }],
    tags: ["walk", "beach"],
    imageUrl: place.imageUrl,
    commentCount: 0,
    saves: 0,
    routingProfile: "foot-walking",
    routeGeometry: null,
    routeDistanceMeters: null,
    routeDurationSeconds: null,
    routeInputHash: null,
    routeGeneratedAt: null,
  };
  const cultural: CulturalEvent = {
    id: "preview-kourouta-concert",
    title: "Kourouta community concert",
    greekTitle: "Συναυλία στην Κουρούτα",
    eventType: "concert",
    venueName: place.name,
    area: place.area,
    placeId: place.id,
    lat: place.lat,
    lng: place.lng,
    eventDate: new Date(NOW + 6 * 3_600_000).toISOString(),
    organizerName: "Kourouta cultural association",
    organizerId: null,
    descriptionEl: "Μουσική δίπλα στην παραλία.",
    descriptionEn: "Music beside the beach.",
    posterUrl: place.imageUrl,
    ticketUrl: null,
    isPastEvent: false,
    isOfficial: false,
    likesCount: 0,
    moderationStatus: "published",
    createdAt: new Date(NOW - 60_000).toISOString(),
  };
  return { data, place, post, route, cultural };
}

function deferred() {
  let resolve!: (data: PulseData) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<PulseData>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("latest full response wins; duplicate IDs reconcile once across public surfaces", async () => {
  const first = deferred();
  const second = deferred();
  let call = 0;
  const accepted: PulseData[] = [];
  const controller = new PulseRefreshController(
    () => [first.promise, second.promise][call++],
    { nowMs: () => NOW },
    {
      accepted: (data) => accepted.push(data),
      failed: () => assert.fail("stale failure reached UI"),
      aged: () => {},
    },
  );
  const older = controller.refresh();
  const newer = controller.refresh();
  const live = buildTrafficPreviewScene("live", NOW).data;
  second.resolve({
    ...live,
    posts: [...live.posts, { ...live.posts[0], text: "Published update" }],
  });
  await newer;
  first.resolve(buildTrafficPreviewScene("quiet", NOW).data);
  await older;
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].posts.length, live.posts.length);
  assert.equal(
    accepted[0].posts.find((post) => post.id === live.posts[0].id)?.text,
    "Published update",
  );
  assert.equal(accepted[0].stories.length, live.stories.length);
  assert.equal(accepted[0].meetEvents.length, live.meetEvents.length);
});

test("failed refresh ages retained data and resume immediately removes present-tense claims", async () => {
  const live = buildTrafficPreviewScene("live", NOW);
  let nowMs = NOW;
  let accepted = live.data;
  let aged = NOW;
  let fetchedAt = NOW;
  let failures = 0;
  const controller = new PulseRefreshController(
    async () => {
      throw new Error("offline");
    },
    { nowMs: () => nowMs },
    {
      accepted: (data, at) => {
        accepted = data;
        fetchedAt = at;
      },
      failed: () => {
        failures += 1;
      },
      aged: (at) => {
        aged = at;
      },
    },
  );
  nowMs += 3 * 3_600_000 + 10 * 60_000;
  await controller.refresh();
  assert.equal(accepted, live.data);
  assert.equal(fetchedAt, NOW);
  assert.equal(failures, 1);
  assert.equal(aged, nowMs);
  assert.equal(buildPulseActivitySnapshot(accepted, aged)[live.focusPlaceId].score, 0);
  assert.equal(
    buildPlaceStoryGroups(accepted.places, new Set(), accepted.stories, aged)[0].live,
    false,
  );
  assert.equal(
    buildActivityTicks(
      accepted.posts,
      new Map(accepted.places.map((place) => [place.id, place])),
      accepted.meetEvents,
      { nowMs: aged },
    ).length,
    0,
  );
});

test("unmount/account invalidation and stale rejected requests cannot alter accepted state", async () => {
  const request = deferred();
  let calls = 0;
  const controller = new PulseRefreshController(
    () => request.promise,
    { nowMs: () => NOW },
    {
      accepted: () => {
        calls++;
      },
      failed: () => {
        calls++;
      },
      aged: () => {},
    },
  );
  const refresh = controller.refresh();
  controller.invalidate();
  request.reject(new Error("expired"));
  await refresh;
  assert.equal(calls, 0);
});

test("publication supersedes local write acknowledgement and later public absence removes it", () => {
  const data = buildTrafficPreviewScene("live", NOW).data;
  const local = { ...data.posts[0], moderationStatus: "pending", text: "Pending" };
  const publicPost = { ...local, moderationStatus: "published", text: "Published" };
  assert.deepEqual(reconcilePosts([local], [publicPost]), [publicPost]);
  assert.equal(reconcilePulseData({ ...data, posts: [] }).posts.length, 0);
});

test("normal app clock advances on minute ticks, focus and background resume, and unsubscribes", () => {
  let nowMs = NOW;
  const listeners = new Map<string, () => void>();
  const times: number[] = [];
  const register = (event: string, callback: () => void) => {
    listeners.set(event, callback);
    return () => {
      listeners.delete(event);
    };
  };
  const unsubscribe = subscribeFreshnessClock(
    { nowMs: () => nowMs },
    (value) => times.push(value),
    {
      every: (callback, interval) => {
        assert.equal(interval, 60_000);
        return register("interval", callback);
      },
      onFocus: (callback) => register("focus", callback),
      onVisibilityChange: (callback) => register("visibility", callback),
    },
  );
  for (const event of ["interval", "focus", "visibility"]) {
    nowMs += 3_600_000;
    listeners.get(event)!();
  }
  assert.deepEqual(times, [NOW + 3_600_000, NOW + 2 * 3_600_000, NOW + 3 * 3_600_000]);
  unsubscribe();
  assert.equal(listeners.size, 0);
});

test("comment reconciliation uses IDs, preserves distinct same-text rows, and accepts latest status", () => {
  const first = { id: "first", author: "A", text: "Same text", moderationStatus: "pending" };
  const second = { ...first, id: "second", author: "B" };
  const published = { ...first, moderationStatus: "published" };
  assert.deepEqual(commentsById([first, second, published]), [published, second]);
});

for (const kind of ["post", "place", "cultural"] as const) {
  test(`a pending ${kind} detail is hidden immediately from guest and other accounts during a failed refresh`, async () => {
    const fixtures = detailFixtures();
    const detail = { ...fixtures[kind], userId: OWNER, moderationStatus: "pending" };
    const request = deferred();
    let accepted = fixtures.data;
    let failures = 0;
    const controller = new PulseRefreshController(
      () => request.promise,
      { nowMs: () => NOW },
      {
        accepted: (data) => {
          accepted = data;
        },
        failed: () => {
          failures += 1;
        },
        aged: () => {},
      },
    );

    assert.equal(visibleDetail(detail, OWNER), detail);
    const refreshing = controller.refresh();
    // A viewer change must hide raw modal state before the network settles.
    assert.equal(visibleDetail(detail, null), null);
    assert.equal(visibleDetail(detail, OTHER_VIEWER), null);
    assert.equal(failures, 0);
    request.reject(new Error("offline after account switch"));
    await refreshing;

    assert.equal(failures, 1);
    assert.equal(accepted, fixtures.data, "A read failure should retain the accepted dataset");
    assert.equal(visibleDetail(detail, null), null);
    assert.equal(visibleDetail(detail, OTHER_VIEWER), null);
    assert.equal(visibleDetail(detail, OWNER), detail, "Only its owner may view the pending row");
  });
}

for (const kind of ["post", "place", "route", "cultural"] as const) {
  test(`successful refresh reconciles ${kind} details by ID and closes ordinary omitted records`, () => {
    const current = detailFixtures()[kind];
    const different = { ...current, id: `${current.id}-different` };
    const updated = {
      ...current,
      ...(kind === "post"
        ? { text: "The latest published post text" }
        : kind === "place"
          ? { name: "The latest published place name" }
          : { title: "The latest published title" }),
    };

    assert.equal(reconcileOpenDetail(current, [], [], OWNER), null);
    assert.equal(reconcileOpenDetail(current, [different], [different], OWNER), null);
    assert.equal(reconcileOpenDetail(current, [updated], [], OWNER), updated);
    assert.equal(reconcileOpenDetail(null, [updated], [current], OWNER), null);
  });
}

for (const kind of ["post", "place", "route"] as const) {
  test(`a permission-checked Saved ${kind} fills a bootstrap cap without overriding an incoming record`, () => {
    const current = detailFixtures()[kind];
    const saved = { ...current };
    const updated = { ...current };

    assert.equal(reconcileOpenDetail(current, [], [saved], null), saved);
    assert.equal(reconcileOpenDetail(current, [updated], [saved], null), updated);
  });
}

for (const kind of ["post", "place"] as const) {
  test(`a pending Saved ${kind} candidate cannot leak across viewers or replace a hidden incoming record`, () => {
    const current = detailFixtures()[kind];
    const pendingSaved = { ...current, userId: OWNER, moderationStatus: "pending" };
    const publishedSaved = { ...current, moderationStatus: "published" };
    const hiddenIncoming = { ...current, userId: OWNER, moderationStatus: "hidden" };

    assert.equal(reconcileOpenDetail(current, [], [pendingSaved], OWNER), pendingSaved);
    assert.equal(reconcileOpenDetail(current, [], [pendingSaved], null), null);
    assert.equal(reconcileOpenDetail(current, [], [pendingSaved], OTHER_VIEWER), null);
    assert.equal(
      reconcileOpenDetail(current, [pendingSaved], [publishedSaved], OTHER_VIEWER),
      null,
    );
    assert.equal(reconcileOpenDetail(current, [hiddenIncoming], [publishedSaved], OWNER), null);
    assert.equal(visibleDetail(hiddenIncoming, OWNER), null);
  });
}

test("closing unavailable details preserves target-owned drafts through guest and account switches", async () => {
  const fixtures = detailFixtures();
  const targets: CommentTarget[] = [
    { type: "post", id: fixtures.post.id },
    { type: "place", id: fixtures.place.id },
    { type: "route", id: fixtures.route.id },
    { type: "cultural_event", id: fixtures.cultural.id },
  ];
  const store = new CommentDraftStore();
  store.setViewer(OWNER);
  for (const target of targets) {
    store.setText(OWNER, target, `Owner A draft for ${target.type}`);
  }
  await store.submit(OWNER, targets[0], async () => {
    throw new Error("write failed before detail closure");
  });
  for (const kind of ["post", "place", "route", "cultural"] as const) {
    assert.equal(reconcileOpenDetail(fixtures[kind], [], [], OWNER), null);
  }

  store.setViewer(null);
  for (const kind of ["post", "place", "cultural"] as const) {
    assert.equal(
      visibleDetail({ ...fixtures[kind], userId: OWNER, moderationStatus: "pending" }, null),
      null,
      "Account-scoped detail closure must not require deleting its owner's draft",
    );
  }
  for (const target of targets) assert.equal(store.get(null, target).text, "");
  store.setViewer(OTHER_VIEWER);
  for (const kind of ["post", "place", "cultural"] as const) {
    assert.equal(
      visibleDetail(
        { ...fixtures[kind], userId: OWNER, moderationStatus: "pending" },
        OTHER_VIEWER,
      ),
      null,
    );
  }
  for (const target of targets) assert.equal(store.get(OTHER_VIEWER, target).text, "");
  store.setText(OTHER_VIEWER, targets[0], "Owner B draft for this post");
  store.setViewer(OWNER);

  for (const target of targets) {
    assert.equal(store.get(OWNER, target).text, `Owner A draft for ${target.type}`);
    assert.equal(
      store.get(OWNER, { ...target, id: `${target.id}-another` }).text,
      "",
      "A reopened different target must not borrow the closed detail's draft",
    );
  }
  assert.equal(store.get(OWNER, targets[0]).status, "error");
  assert.equal(store.get(OTHER_VIEWER, targets[0]).text, "Owner B draft for this post");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  isRouteEditorRole,
  MAX_ROUTE_GEOMETRY_POINTS,
  parseOpenRouteServiceResponse,
  parseRoutePreviewRequest,
  readRoutePreviewRequest,
  requestOpenRouteService,
  RouteProviderAccessError,
  RouteProviderLimitError,
  routePreviewAccessStatus,
} from "../supabase/functions/_shared/route-preview";
import {
  handleRoutePreview,
  type RoutePreviewDependencies,
} from "../supabase/functions/_shared/route-preview-handler";
import {
  parseRouteGeometry,
  parseRoutePreviewResponse,
  resolveRoutePreviewForSave,
  routeInputHash,
} from "../src/lib/hp/route-preview";
import {
  appleMapsDirectionsUrl,
  googleMapsDirectionsUrl,
  googleMapsNativeUrl,
} from "../src/lib/hp/route-navigation";
test("route hashes are stable and profile-sensitive", () => {
  const points = [
    [21.31, 37.64],
    [21.58, 37.67],
  ] as const;
  assert.equal(
    routeInputHash("driving-car", [...points]),
    routeInputHash("driving-car", [...points]),
  );
  assert.notEqual(
    routeInputHash("driving-car", [...points]),
    routeInputHash("foot-walking", [...points]),
  );
});
test("request validation and authorization roles", () => {
  assert.equal(
    parseRoutePreviewRequest({
      profile: "foot-walking",
      coordinates: [
        [21, 37],
        [22, 38],
      ],
    }).profile,
    "foot-walking",
  );
  assert.throws(() =>
    parseRoutePreviewRequest({
      profile: "cycling",
      coordinates: [
        [21, 37],
        [22, 38],
      ],
    }),
  );
  assert.throws(() =>
    parseRoutePreviewRequest({
      profile: "driving-car",
      coordinates: [
        [-74, 40],
        [-73, 41],
      ],
    }),
  );
  assert.equal(isRouteEditorRole("owner"), true);
  assert.equal(isRouteEditorRole("editor"), true);
  assert.equal(isRouteEditorRole("moderator"), false);
  assert.equal(routePreviewAccessStatus(null, false, null), 401);
  assert.equal(routePreviewAccessStatus("Bearer token", false, "owner"), 401);
  assert.equal(routePreviewAccessStatus("Bearer token", true, "moderator"), 403);
  assert.equal(routePreviewAccessStatus("Bearer token", true, "editor"), null);
});
test("request bodies are bounded before JSON parsing", async () => {
  const request = new Request("https://example.test/build-route-preview", {
    method: "POST",
    body: JSON.stringify({
      profile: "driving-car",
      coordinates: [
        [21, 37],
        [22, 38],
      ],
      padding: "x".repeat(9_000),
    }),
  });
  await assert.rejects(readRoutePreviewRequest(request), /too large/);
});
test("ORS response parser rejects malformed responses", () => {
  const parsed = parseOpenRouteServiceResponse({
    features: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [21, 37],
            [22, 38],
          ],
        },
        properties: { summary: { distance: 1234.4, duration: 456.7 } },
      },
    ],
  });
  assert.equal(parsed.distanceMeters, 1234);
  assert.equal(parsed.durationSeconds, 457);
  assert.throws(() => parseOpenRouteServiceResponse({ features: [] }));
  assert.deepEqual(parseRoutePreviewResponse(parsed).geometry, parsed.geometry);
  const detailed = Array.from({ length: 120 }, (_, index) => [21 + index / 1000, 37]);
  assert.equal(
    parseRoutePreviewResponse({
      geometry: { type: "LineString", coordinates: detailed },
      distanceMeters: 1000,
      durationSeconds: 100,
    }).geometry.coordinates.length,
    120,
  );
  const tooManyPoints = Array.from({ length: MAX_ROUTE_GEOMETRY_POINTS + 1 }, () => [21, 37]);
  assert.throws(() =>
    parseOpenRouteServiceResponse({
      features: [
        {
          geometry: { type: "LineString", coordinates: tooManyPoints },
          properties: { summary: { distance: 1, duration: 1 } },
        },
      ],
    }),
  );
  assert.equal(
    parseRouteGeometry({
      type: "LineString",
      coordinates: [
        [21, 37],
        [999, 37],
      ],
    }),
    null,
  );
  assert.equal(parseRouteGeometry({ type: "LineString", coordinates: tooManyPoints }), null);
});
test("ORS upstream failures are surfaced without exposing the key", async () => {
  let authorization = "";
  let signal: AbortSignal | null | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("Authorization") ?? "";
    signal = init?.signal;
    return new Response("quota", { status: 429 });
  };
  await assert.rejects(
    requestOpenRouteService(fetcher, "server-only", "driving-car", [
      [21, 37],
      [22, 38],
    ]),
    RouteProviderLimitError,
  );
  assert.equal(authorization, "server-only");
  assert.ok(signal);
  await assert.rejects(
    requestOpenRouteService(
      async () => new Response("rejected secret", { status: 403 }),
      "server-only",
      "driving-car",
      [
        [21, 37],
        [22, 38],
      ],
    ),
    RouteProviderAccessError,
  );
});
test("Edge handler distinguishes provider access failure from quota", async () => {
  let providerStatus = 403;
  const dependencies: RoutePreviewDependencies = {
    providerKey: "server-only",
    fetcher: async () => new Response("sensitive-provider-body", { status: providerStatus }),
    createClient: () => ({
      hasUser: async () => true,
      role: async () => ({ value: "owner", error: false }),
      claimQuota: async () => ({ granted: true, error: false }),
    }),
  };
  const request = () =>
    new Request("https://example.test/functions/v1/build-route-preview", {
      method: "POST",
      headers: { Authorization: "Bearer editor" },
      body: JSON.stringify({
        profile: "driving-car",
        coordinates: [
          [21, 37],
          [22, 38],
        ],
      }),
    });
  const accessResponse = await handleRoutePreview(request(), dependencies);
  assert.equal(accessResponse.status, 503);
  assert.equal((await accessResponse.text()).includes("sensitive-provider-body"), false);
  providerStatus = 429;
  const quotaResponse = await handleRoutePreview(request(), dependencies);
  assert.equal(quotaResponse.status, 429);
  assert.equal((await quotaResponse.text()).includes("server-only"), false);
});
test("a failed refresh retains only matching cached geometry", () => {
  const existing = {
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [21, 37],
        [22, 38],
      ] as [number, number][],
    },
    distanceMeters: 1000,
    durationSeconds: 500,
    inputHash: "current",
    generatedAt: "2026-09-29T00:00:00.000Z",
  };
  assert.deepEqual(resolveRoutePreviewForSave(existing, "current", null, "later"), existing);
  assert.deepEqual(resolveRoutePreviewForSave(existing, "changed", null, "later"), {
    geometry: null,
    distanceMeters: null,
    durationSeconds: null,
    inputHash: null,
    generatedAt: null,
  });
  const generated = { geometry: existing.geometry, distanceMeters: 1200, durationSeconds: 600 };
  assert.deepEqual(resolveRoutePreviewForSave(existing, "changed", generated, "later"), {
    ...generated,
    inputHash: "changed",
    generatedAt: "later",
  });
});
test("Edge handler gates provider calls by user, role, inputs, and global quota", async () => {
  const validBody = JSON.stringify({
    profile: "driving-car",
    coordinates: [
      [21, 37],
      [22, 38],
    ],
  });
  let providerCalls = 0;
  let quotaCalls = 0;
  let hasUser = false;
  let role: unknown = "owner";
  let quotaGranted = true;
  const dependencies: RoutePreviewDependencies = {
    providerKey: "server-only",
    fetcher: async () => {
      providerCalls += 1;
      return Response.json({
        features: [
          {
            geometry: {
              type: "LineString",
              coordinates: [
                [21, 37],
                [22, 38],
              ],
            },
            properties: { summary: { distance: 1000, duration: 600 } },
          },
        ],
      });
    },
    createClient: () => ({
      hasUser: async () => hasUser,
      role: async () => ({ value: role, error: false }),
      claimQuota: async () => {
        quotaCalls += 1;
        return { granted: quotaGranted, error: false };
      },
    }),
  };
  const request = (authorization: string | null, body = validBody) =>
    new Request("https://example.test/functions/v1/build-route-preview", {
      method: "POST",
      headers: authorization ? { Authorization: authorization } : undefined,
      body,
    });
  assert.equal((await handleRoutePreview(request(null), dependencies)).status, 401);
  assert.equal((await handleRoutePreview(request("Bearer invalid"), dependencies)).status, 401);
  hasUser = true;
  role = "moderator";
  assert.equal((await handleRoutePreview(request("Bearer editor"), dependencies)).status, 403);
  role = "owner";
  assert.equal((await handleRoutePreview(request("Bearer owner", "{}"), dependencies)).status, 400);
  assert.equal(quotaCalls, 0, "Invalid callers and bodies must not consume quota");
  quotaGranted = false;
  assert.equal((await handleRoutePreview(request("Bearer owner"), dependencies)).status, 429);
  assert.equal(providerCalls, 0, "Quota refusal must not call the provider");
  quotaGranted = true;
  const response = await handleRoutePreview(request("Bearer owner"), dependencies);
  assert.equal(response.status, 200);
  const payload: unknown = await response.json();
  assert.ok(payload && typeof payload === "object" && "distanceMeters" in payload);
  assert.equal(payload.distanceMeters, 1000);
  assert.equal(providerCalls, 1);
});
test("navigation URLs preserve travel mode", () => {
  const target = { lat: 37.64, lng: 21.31, label: "Pyrgos" };
  assert.match(googleMapsDirectionsUrl(target, "foot-walking"), /travelmode=walking/);
  assert.match(googleMapsNativeUrl(target, "driving-car"), /directionsmode=driving/);
  assert.match(appleMapsDirectionsUrl(target, "foot-walking"), /dirflg=w/);
  assert.match(appleMapsDirectionsUrl(target, "driving-car", true), /^maps:\/\//);
});

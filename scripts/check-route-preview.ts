import assert from "node:assert/strict";
import test from "node:test";
import {
  isRouteEditorRole,
  parseOpenRouteServiceResponse,
  parseRoutePreviewRequest,
  requestOpenRouteService,
  routePreviewAccessStatus,
} from "../supabase/functions/_shared/route-preview";
import { parseRoutePreviewResponse, routeInputHash } from "../src/lib/hp/route-preview";
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
  assert.equal(isRouteEditorRole("owner"), true);
  assert.equal(isRouteEditorRole("editor"), true);
  assert.equal(isRouteEditorRole("moderator"), false);
  assert.equal(routePreviewAccessStatus(null, false, null), 401);
  assert.equal(routePreviewAccessStatus("Bearer token", false, "owner"), 401);
  assert.equal(routePreviewAccessStatus("Bearer token", true, "moderator"), 403);
  assert.equal(routePreviewAccessStatus("Bearer token", true, "editor"), null);
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
});
test("ORS upstream failures are surfaced without exposing the key", async () => {
  let authorization = "";
  const fetcher: typeof fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("Authorization") ?? "";
    return new Response("quota", { status: 429 });
  };
  await assert.rejects(
    requestOpenRouteService(fetcher, "server-only", "driving-car", [
      [21, 37],
      [22, 38],
    ]),
    /failed \(429\)/,
  );
  assert.equal(authorization, "server-only");
});
test("navigation URLs preserve travel mode", () => {
  const target = { lat: 37.64, lng: 21.31, label: "Pyrgos" };
  assert.match(googleMapsDirectionsUrl(target, "foot-walking"), /travelmode=walking/);
  assert.match(googleMapsNativeUrl(target, "driving-car"), /directionsmode=driving/);
  assert.match(appleMapsDirectionsUrl(target, "foot-walking"), /dirflg=w/);
  assert.match(appleMapsDirectionsUrl(target, "driving-car", true), /^maps:\/\//);
});

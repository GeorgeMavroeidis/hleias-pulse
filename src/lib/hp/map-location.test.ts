import assert from "node:assert/strict";
import test from "node:test";
import { createMapLocationRequest, LOCATION_MESSAGE, type MapLocationStatus } from "./map-location";

function fixture() {
  const states: MapLocationStatus[] = [];
  const positions: GeolocationPosition[] = [];
  const requests: {
    success: PositionCallback;
    error?: PositionErrorCallback | null;
    options?: PositionOptions;
  }[] = [];
  const request = createMapLocationRequest(
    (state) => states.push(state),
    (position) => positions.push(position),
  );
  const geo = {
    getCurrentPosition(
      success: PositionCallback,
      error?: PositionErrorCallback | null,
      options?: PositionOptions,
    ) {
      requests.push({ success, error, options });
    },
  };
  return { request, geo, states, positions, requests };
}
const position = { coords: { latitude: 37.64, longitude: 21.63 } } as GeolocationPosition;

test("location is explicit, pending requests coalesce, and success publishes once", () => {
  const f = fixture();
  assert.equal(f.requests.length, 0);
  f.request.start(f.geo);
  f.request.start(f.geo);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.states, ["pending"]);
  assert.deepEqual(f.requests[0].options, {
    enableHighAccuracy: true,
    maximumAge: 30000,
    timeout: 12000,
  });
  f.requests[0].success(position);
  f.requests[0].success(position);
  assert.deepEqual(f.states, ["pending", "found"]);
  assert.deepEqual(f.positions, [position]);
});

test("retry teardown invalidates both callback types before a replacement map request", () => {
  const f = fixture();
  f.request.start(f.geo);
  f.request.cancel();
  f.requests[0].success(position);
  f.request.start(f.geo);
  f.requests[0].error?.({ code: 1 } as GeolocationPositionError);
  f.requests[1].success(position);
  assert.deepEqual(f.states, ["pending", "pending", "found"]);
  assert.deepEqual(f.positions, [position]);
});

test("denied, timeout and unavailable retain recoverable messages and permit retry", () => {
  const f = fixture();
  for (const code of [1, 3, 2]) {
    f.request.start(f.geo);
    f.requests.at(-1)!.error?.({ code } as GeolocationPositionError);
  }
  f.request.start();
  f.request.start({
    getCurrentPosition() {
      throw new Error("unavailable");
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
  assert.deepEqual(f.positions, []);
  assert.match(LOCATION_MESSAGE.denied, /browser settings/);
  assert.match(LOCATION_MESSAGE.timeout, /Try again/);
  assert.match(LOCATION_MESSAGE.unavailable, /still explore/);
});

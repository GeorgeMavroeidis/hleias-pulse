export type MapLocationStatus = "idle" | "pending" | "found" | "denied" | "timeout" | "unavailable";
export const LOCATION_MESSAGE: Record<Exclude<MapLocationStatus, "idle">, string> = {
  pending: "Finding your location…",
  found: "Location found",
  denied: "Location access is off. Allow it in your browser settings, then try again.",
  timeout: "Location took too long. Try again.",
  unavailable: "Location is unavailable. You can still explore the map.",
};

/** Geolocation cannot be aborted; invalidate its callbacks on teardown instead. */
export function createMapLocationRequest(
  publish: (status: MapLocationStatus) => void,
  located: (position: GeolocationPosition) => void,
) {
  let generation = 0;
  let pending = false;
  return {
    start(geolocation?: Pick<Geolocation, "getCurrentPosition">) {
      if (pending) return;
      if (!geolocation) {
        publish("unavailable");
        return;
      }
      pending = true;
      const request = ++generation;
      publish("pending");
      const finish = (status: MapLocationStatus, position?: GeolocationPosition) => {
        if (request !== generation || !pending) return;
        pending = false;
        publish(status);
        if (position) located(position);
      };
      try {
        geolocation.getCurrentPosition(
          (position) => finish("found", position),
          (error) =>
            finish(error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable"),
          { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 },
        );
      } catch {
        finish("unavailable");
      }
    },
    cancel() {
      generation++;
      pending = false;
    },
  };
}

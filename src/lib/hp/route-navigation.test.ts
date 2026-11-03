import assert from "node:assert/strict";
import test from "node:test";
import { Capacitor } from "@capacitor/core";
import {
  appleMapsDirectionsUrl,
  googleMapsDirectionsUrl,
  googleMapsNativeUrl,
  openExternalNavigation,
} from "./route-navigation";

const destination = { lat: 37.7704, lng: 21.2936, label: "Παραλία Κουρούτας" };

test("directions preserve the selected coordinates and route mode without collecting an origin", () => {
  for (const [profile, mode] of [
    ["driving-car", "driving"],
    ["foot-walking", "walking"],
  ] as const) {
    const url = new URL(googleMapsDirectionsUrl(destination, profile));
    assert.equal(url.origin, "https://www.google.com");
    assert.equal(url.pathname, "/maps/dir/");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      api: "1",
      destination: "37.7704,21.2936",
      travelmode: mode,
    });
    const native = new URL(googleMapsNativeUrl(destination, profile));
    assert.equal(native.searchParams.get("daddr"), "37.7704,21.2936");
    assert.equal(native.searchParams.get("directionsmode"), mode);
  }
});

test("iOS tries the installed app, then HTTPS even when probing or launching fails", async (t) => {
  const bridge = Capacitor as unknown as {
    PluginHeaders?: unknown[];
    nativePromise?: (plugin: string, method: string, options: { url: string }) => Promise<unknown>;
  };
  const previousHeaders = bridge.PluginHeaders;
  const previousPromise = bridge.nativePromise;
  const platform = t.mock.method(Capacitor, "getPlatform", () => "ios");
  t.mock.method(console, "warn", () => {});
  bridge.PluginHeaders = [
    {
      name: "AppLauncher",
      methods: [
        { name: "canOpenUrl", rtype: "promise" },
        { name: "openUrl", rtype: "promise" },
      ],
    },
  ];
  try {
    for (const provider of ["google", "apple"] as const)
      for (const scenario of [
        "installed",
        "missing",
        "probe-error",
        "launch-error",
        "app-refused",
        "refused",
      ]) {
        const calls: string[] = [];
        bridge.nativePromise = async (_plugin, method, { url }) => {
          calls.push(`${method}:${url}`);
          if (method === "canOpenUrl") {
            if (scenario === "probe-error") throw new Error("Probe failed");
            return { value: scenario !== "missing" };
          }
          if (!url.startsWith("https:")) {
            if (scenario === "launch-error") throw new Error("Launch failed");
            return { completed: scenario === "installed" };
          }
          return { completed: scenario !== "refused" };
        };
        const action = openExternalNavigation(provider, destination, "foot-walking");
        if (scenario === "refused") await assert.rejects(action, /Could not open navigation/);
        else await action;
        const native =
          provider === "google"
            ? googleMapsNativeUrl(destination, "foot-walking")
            : appleMapsDirectionsUrl(destination, "foot-walking", true);
        const fallback =
          provider === "google"
            ? googleMapsDirectionsUrl(destination, "foot-walking")
            : appleMapsDirectionsUrl(destination, "foot-walking");
        assert.equal(calls[0], `canOpenUrl:${native}`, scenario);
        assert.equal(calls.includes(`openUrl:${fallback}`), scenario !== "installed", scenario);
      }
  } finally {
    bridge.PluginHeaders = previousHeaders;
    bridge.nativePromise = previousPromise;
    platform.mock.restore();
  }
});

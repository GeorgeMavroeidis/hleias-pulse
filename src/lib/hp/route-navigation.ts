import { Capacitor } from "@capacitor/core";
import type { RouteRoutingProfile } from "@/lib/hp-model";
export type NavigationProvider = "apple" | "google";
export type NavigationDestination = { lat: number; lng: number; label: string };
const googleMode = (profile: RouteRoutingProfile) =>
  profile === "foot-walking" ? "walking" : "driving";
export function googleMapsDirectionsUrl(
  destination: NavigationDestination,
  profile: RouteRoutingProfile,
) {
  const params = new URLSearchParams({
    api: "1",
    destination: `${destination.lat},${destination.lng}`,
    travelmode: googleMode(profile),
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
export function appleMapsDirectionsUrl(
  destination: NavigationDestination,
  profile: RouteRoutingProfile,
  native = false,
) {
  const params = new URLSearchParams({
    daddr: `${destination.lat},${destination.lng}`,
    dirflg: profile === "foot-walking" ? "w" : "d",
  });
  return `${native ? "maps" : "https"}://${native ? "" : "maps.apple.com/"}?${params.toString()}`;
}
export function googleMapsNativeUrl(
  destination: NavigationDestination,
  profile: RouteRoutingProfile,
) {
  const params = new URLSearchParams({
    daddr: `${destination.lat},${destination.lng}`,
    directionsmode: googleMode(profile),
  });
  return `comgooglemaps://?${params.toString()}`;
}
async function tryNativeUrl(url: string) {
  const { AppLauncher } = await import("@capacitor/app-launcher");
  const supported = await AppLauncher.canOpenUrl({ url });
  if (!supported.value) return false;
  await AppLauncher.openUrl({ url });
  return true;
}
export async function openExternalNavigation(
  provider: NavigationProvider,
  destination: NavigationDestination,
  profile: RouteRoutingProfile,
) {
  const fallback = googleMapsDirectionsUrl(destination, profile);
  if (Capacitor.getPlatform() === "ios") {
    const native =
      provider === "apple"
        ? appleMapsDirectionsUrl(destination, profile, true)
        : googleMapsNativeUrl(destination, profile);
    try {
      if (await tryNativeUrl(native)) return;
    } catch (error) {
      console.warn("Native navigation handoff failed; using the web URL.", error);
    }
  }
  const openWindow = (
    globalThis as unknown as { open?: (url: string, target: string, features: string) => unknown }
  ).open;
  openWindow?.(
    provider === "apple" && Capacitor.getPlatform() === "ios"
      ? appleMapsDirectionsUrl(destination, profile)
      : fallback,
    "_blank",
    "noopener,noreferrer",
  );
}

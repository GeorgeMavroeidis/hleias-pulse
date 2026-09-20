import { isIP } from "node:net";

export type PushProvider = "apple" | "google" | "mozilla";

export type ValidPushEndpoint = {
  provider: PushProvider;
  url: URL;
};

const APPLE_SUFFIX = ".push.apple.com";

export function validatePushEndpoint(candidate: string): ValidPushEndpoint | null {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
  if (url.port && url.port !== "443") return null;

  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname.endsWith(".") || isIP(hostname) !== 0) return null;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return null;
  if (!url.pathname || url.pathname === "/") return null;

  if (hostname === "fcm.googleapis.com") return { provider: "google", url };
  if (hostname === "updates.push.services.mozilla.com") return { provider: "mozilla", url };
  if (hostname.endsWith(APPLE_SUFFIX) && hostname.length > APPLE_SUFFIX.length) {
    return { provider: "apple", url };
  }

  return null;
}

/** Explicit configuration for browser acceptance checks on a disposable stack. */
export interface BrowserBuildEnv {
  DEV?: boolean;
  MODE?: string;
  VITE_HLEIAS_LOCAL_ONLY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface BrowserSupabaseConfig {
  url: string;
  publishableKey: string;
}

/** A second backstop: local acceptance requests cannot follow a hosted redirect. */
export function localOnlyFetch(origin: string, send: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.origin !== origin || !isLoopbackHost(url.hostname)) {
      throw new Error("Local browser request refused: destination is not the disposable API.");
    }
    console.debug(`Local Supabase request: ${url.origin}`);
    return send(input, { ...init, redirect: "error" });
  };
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

function isPublicKey(key: string): boolean {
  if (key.startsWith("sb_publishable_") && key.length > "sb_publishable_".length) return true;
  // This classifies the legacy local key to avoid accidentally bundling a
  // service-role key. It is not authentication; Supabase verifies requests.
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      role?: string;
    };
    return payload.role === "anon";
  } catch {
    return false;
  }
}

/** Undefined hostname is for build validation and Vite's server-side imports. */
export function browserLocalConfig(
  env: BrowserBuildEnv,
  hostname?: string,
): BrowserSupabaseConfig | null {
  const enabled = env.VITE_HLEIAS_LOCAL_ONLY === "1";
  if (env.MODE === "local-test" && !enabled) {
    throw new Error("The local test build requires explicit local-only configuration.");
  }
  if (!enabled) return null;
  if (!env.DEV && env.MODE !== "local-test") {
    throw new Error("Local browser configuration is forbidden in a release build.");
  }
  if (hostname !== undefined && !isLoopbackHost(hostname)) {
    throw new Error("Local browser checks can run only on a loopback host.");
  }
  const value = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error("Local browser checks require an explicit loopback API URL.");
  }
  if (
    !isLoopbackHost(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("Local browser checks require an explicit loopback API URL.");
  }
  if (!key || !isPublicKey(key)) {
    throw new Error("Local browser checks require a local public key, never a service-role key.");
  }
  return { url: url.origin, publishableKey: key };
}

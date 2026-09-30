import {
  readRoutePreviewRequest,
  requestOpenRouteService,
  RouteProviderAccessError,
  RouteProviderLimitError,
  routePreviewAccessStatus,
} from "./route-preview.ts";

export type RoutePreviewClient = {
  hasUser: () => Promise<boolean>;
  role: () => Promise<{ value: unknown; error: boolean }>;
  claimQuota: () => Promise<{ granted: boolean; error: boolean }>;
};

export type RoutePreviewDependencies = {
  createClient: (authorization: string) => RoutePreviewClient;
  providerKey: string | null;
  fetcher: typeof fetch;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleRoutePreview(
  request: Request,
  dependencies: RoutePreviewDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const authorization = request.headers.get("Authorization");
  if (!authorization) return json(401, { error: "Authentication is required." });

  try {
    const client = dependencies.createClient(authorization);
    if (routePreviewAccessStatus(authorization, await client.hasUser(), "owner") === 401)
      return json(401, { error: "Authentication is required." });
    const role = await client.role();
    if (role.error) return json(503, { error: "Route preview access check is unavailable." });
    if (routePreviewAccessStatus(authorization, true, role.value) === 403)
      return json(403, { error: "Owner or editor access is required." });
    if (!dependencies.providerKey)
      return json(503, { error: "Route preview service is not configured." });

    let routeRequest;
    try {
      routeRequest = await readRoutePreviewRequest(request);
    } catch {
      return json(400, { error: "Invalid route preview request." });
    }
    const { profile, coordinates } = routeRequest;
    const quota = await client.claimQuota();
    if (quota.error) return json(503, { error: "Route preview quota is unavailable." });
    if (!quota.granted)
      return json(429, { error: "Route preview limit reached. Try again later." });
    try {
      return json(
        200,
        await requestOpenRouteService(
          dependencies.fetcher,
          dependencies.providerKey,
          profile,
          coordinates,
        ),
      );
    } catch (error) {
      if (error instanceof RouteProviderAccessError)
        return json(503, { error: "Route preview provider access unavailable." });
      if (error instanceof RouteProviderLimitError)
        return json(429, { error: "Route preview provider limit reached. Try again later." });
      console.error("OpenRouteService request failed");
      return json(502, { error: "The route preview provider is temporarily unavailable." });
    }
  } catch {
    console.error("Route preview request failed");
    return json(503, { error: "Route preview service is temporarily unavailable." });
  }
}

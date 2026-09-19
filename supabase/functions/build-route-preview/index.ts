import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parseRoutePreviewRequest,
  requestOpenRouteService,
  routePreviewAccessStatus,
} from "../_shared/route-preview.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const authorization = request.headers.get("Authorization");
  if (!authorization) return json(401, { error: "Authentication is required." });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const key = Deno.env.get("ORS_API_KEY");
    if (!url || !anon || !key) throw new Error("Route preview service is not configured.");
    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const user = await supabase.auth.getUser();
    if (
      routePreviewAccessStatus(authorization, Boolean(user.data.user) && !user.error, "owner") ===
      401
    )
      return json(401, { error: "Authentication is required." });
    const role = await supabase.rpc("current_admin_role");
    if (role.error || routePreviewAccessStatus(authorization, true, role.data) === 403)
      return json(403, { error: "Owner or editor access is required." });
    const { profile, coordinates } = parseRoutePreviewRequest(await request.json());
    try {
      return json(200, await requestOpenRouteService(fetch, key, profile, coordinates));
    } catch (error) {
      console.error("OpenRouteService request failed", error);
      return json(502, { error: "The route preview provider is temporarily unavailable." });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the route preview.";
    return json(message.includes("configured") ? 503 : 400, { error: message });
  }
});

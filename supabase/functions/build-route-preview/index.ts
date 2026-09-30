import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleRoutePreview } from "../_shared/route-preview-handler.ts";

Deno.serve((request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon)
    return new Response(JSON.stringify({ error: "Route preview service is not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  return handleRoutePreview(request, {
    providerKey: Deno.env.get("ORS_API_KEY") ?? null,
    fetcher: fetch,
    createClient: (authorization) => {
      const supabase = createClient(url, anon, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      });
      return {
        hasUser: async () => {
          const user = await supabase.auth.getUser();
          return Boolean(user.data.user) && !user.error;
        },
        role: async () => {
          const role = await supabase.rpc("current_admin_role");
          return { value: role.data, error: Boolean(role.error) };
        },
        claimQuota: async () => {
          const quota = await supabase.rpc("claim_route_preview_quota");
          return { granted: quota.data === true, error: Boolean(quota.error) };
        },
      };
    },
  });
});

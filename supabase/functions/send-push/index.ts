import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

import { createHandler } from "./handler.ts";
import { createWebPushTransport, type PreparedDelivery } from "./transport.ts";
import {
  runPushWorker,
  type ClaimedDelivery,
  type DeliveryOutcome,
  type PushRepository,
  type WorkerLogger,
} from "./worker.ts";

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const supabaseUrl = requiredEnvironment("SUPABASE_URL");
const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const internalSecret = requiredEnvironment("PUSH_INTERNAL_SECRET");
if (new TextEncoder().encode(internalSecret).byteLength < 32) {
  throw new Error("PUSH_INTERNAL_SECRET must be at least 32 bytes");
}

webpush.setVapidDetails(
  requiredEnvironment("VAPID_SUBJECT"),
  requiredEnvironment("VAPID_PUBLIC_KEY"),
  requiredEnvironment("VAPID_PRIVATE_KEY"),
);

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const repository: PushRepository = {
  async claimBatch() {
    const result = await admin.rpc("claim_push_delivery_batch");
    if (result.error) throw new Error("claim_failed");
    return (result.data ?? []) as ClaimedDelivery[];
  },
  async prepare(deliveryId, claimToken) {
    const result = await admin.rpc("prepare_push_delivery", {
      target_delivery_id: deliveryId,
      target_claim_token: claimToken,
    });
    if (result.error) throw new Error("prepare_failed");
    return ((result.data ?? [])[0] as PreparedDelivery | undefined) ?? null;
  },
  async complete(
    deliveryId: string,
    claimToken: string,
    outcome: DeliveryOutcome,
    errorCode: string | null,
  ) {
    const result = await admin.rpc("complete_push_delivery", {
      target_delivery_id: deliveryId,
      target_claim_token: claimToken,
      outcome,
      error_code: errorCode,
    });
    if (result.error || result.data !== true) throw new Error("completion_failed");
  },
};

const transport = createWebPushTransport(webpush);
const log: WorkerLogger = (entry) => console.log(JSON.stringify(entry));

const handler = createHandler({
  internalSecret,
  runWorker: () => runPushWorker(repository, transport, log),
  log: (entry) => console.error(JSON.stringify(entry)),
});

Deno.serve(handler);

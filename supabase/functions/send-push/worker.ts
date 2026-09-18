import { validatePushEndpoint, type PushProvider } from "./endpoint-policy.ts";
import type { PreparedDelivery, PushTransport } from "./transport.ts";
import { PushTransportError } from "./transport.ts";

export type ClaimedDelivery = {
  delivery_id: string;
  claim_token: string;
  outbox_id: string;
  attempt_count: number;
};

export type DeliveryOutcome = "gone" | "permanent" | "sent" | "transient";

export type PushRepository = {
  claimBatch(): Promise<ClaimedDelivery[]>;
  prepare(deliveryId: string, claimToken: string): Promise<PreparedDelivery | null>;
  complete(
    deliveryId: string,
    claimToken: string,
    outcome: DeliveryOutcome,
    errorCode: string | null,
  ): Promise<void>;
};

export type WorkerLogger = (entry: {
  attempt?: number;
  deliveryId?: string;
  event: string;
  outboxId?: string;
  outcome?: string;
  provider?: PushProvider;
}) => void;

function classifyStatus(statusCode: number): { outcome: DeliveryOutcome; code: string | null } {
  if (statusCode >= 200 && statusCode <= 299) return { outcome: "sent", code: null };
  if (statusCode === 404 || statusCode === 410) {
    return { outcome: "gone", code: "subscription_gone" };
  }
  if (statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500) {
    return { outcome: "transient", code: `http_${statusCode}` };
  }
  return { outcome: "permanent", code: `http_${statusCode}` };
}

async function processClaim(
  claim: ClaimedDelivery,
  repository: PushRepository,
  transport: PushTransport,
  log: WorkerLogger,
): Promise<void> {
  let delivery: PreparedDelivery | null;
  try {
    delivery = await repository.prepare(claim.delivery_id, claim.claim_token);
  } catch {
    log({
      event: "push_delivery_prepare_failed",
      deliveryId: claim.delivery_id,
      outboxId: claim.outbox_id,
      attempt: claim.attempt_count,
      outcome: "database_error",
    });
    return;
  }

  if (!delivery) {
    log({
      event: "push_delivery_skipped",
      deliveryId: claim.delivery_id,
      outboxId: claim.outbox_id,
      attempt: claim.attempt_count,
      outcome: "ineligible",
    });
    return;
  }

  const endpoint = validatePushEndpoint(delivery.endpoint);
  if (!endpoint) {
    await repository.complete(claim.delivery_id, claim.claim_token, "gone", "invalid_endpoint");
    log({
      event: "push_delivery_completed",
      deliveryId: claim.delivery_id,
      outboxId: claim.outbox_id,
      attempt: claim.attempt_count,
      outcome: "invalid_endpoint",
    });
    return;
  }

  let result: { outcome: DeliveryOutcome; code: string | null };
  try {
    const response = await transport.send(delivery);
    result = classifyStatus(response.statusCode);
  } catch (error) {
    if (error instanceof PushTransportError) {
      result = {
        outcome: error.category === "response_too_large" ? "permanent" : "transient",
        code: error.category,
      };
    } else {
      result = { outcome: "transient", code: "network_error" };
    }
  }

  await repository.complete(claim.delivery_id, claim.claim_token, result.outcome, result.code);
  log({
    event: "push_delivery_completed",
    deliveryId: claim.delivery_id,
    outboxId: claim.outbox_id,
    attempt: claim.attempt_count,
    provider: endpoint.provider,
    outcome: result.outcome,
  });
}

export async function runPushWorker(
  repository: PushRepository,
  transport: PushTransport,
  log: WorkerLogger,
  concurrency = 5,
): Promise<void> {
  const claims = await repository.claimBatch();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, claims.length) }, async () => {
    while (cursor < claims.length) {
      const claim = claims[cursor++];
      await processClaim(claim, repository, transport, log);
    }
  });
  await Promise.all(workers);
}

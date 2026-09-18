import { createHash } from "node:crypto";

import { validatePushEndpoint } from "./endpoint-policy.ts";

export type PreparedDelivery = {
  delivery_id: string;
  outbox_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  post_id: string;
  comment_text: string;
  attempt_count: number;
};

type RequestDetails = {
  endpoint: string;
  method: string;
  headers: Record<string, string | number>;
  body: Uint8Array | null;
};

export type WebPushRequestBuilder = {
  generateRequestDetails(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: { TTL: number; urgency: "normal"; topic: string },
  ): RequestDetails;
};

export type PushTransport = {
  send(delivery: PreparedDelivery): Promise<{ statusCode: number }>;
};

export class PushTransportError extends Error {
  constructor(
    readonly category: "network_error" | "response_too_large" | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "PushTransportError";
  }
}

function stableTopic(outboxId: string, subscriptionId: string): string {
  return createHash("sha256")
    .update(`${outboxId}:${subscriptionId}`, "utf8")
    .digest("base64url")
    .slice(0, 32);
}

async function consumeBoundedBody(response: Response, limit: number): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  let received = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      received += result.value.byteLength;
      if (received > limit) {
        await reader.cancel();
        throw new PushTransportError("response_too_large", "Push response exceeded limit");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function createWebPushTransport(
  builder: WebPushRequestBuilder,
  options: {
    fetchImpl?: typeof fetch;
    responseLimitBytes?: number;
    timeoutMs?: number;
  } = {},
): PushTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const responseLimitBytes = options.responseLimitBytes ?? 8 * 1024;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return {
    async send(delivery) {
      const validated = validatePushEndpoint(delivery.endpoint);
      if (!validated) throw new PushTransportError("network_error", "Endpoint rejected");

      const body =
        delivery.comment_text.length > 140
          ? `${delivery.comment_text.slice(0, 137)}…`
          : delivery.comment_text;
      const payload = JSON.stringify({
        title: "Κάποιος απάντησε στην ερώτησή σου",
        body,
        url: `/?post=${encodeURIComponent(delivery.post_id)}`,
      });
      const request = builder.generateRequestDetails(
        {
          endpoint: validated.url.toString(),
          keys: { p256dh: delivery.p256dh, auth: delivery.auth_key },
        },
        payload,
        {
          TTL: 86_400,
          urgency: "normal",
          topic: stableTopic(delivery.outbox_id, delivery.subscription_id),
        },
      );

      if (!validatePushEndpoint(request.endpoint)) {
        throw new PushTransportError("network_error", "Generated endpoint rejected");
      }

      let response: Response;
      try {
        response = await fetchImpl(request.endpoint, {
          method: "POST",
          headers: Object.fromEntries(
            Object.entries(request.headers).map(([name, value]) => [name, String(value)]),
          ),
          body: request.body ?? undefined,
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const category =
          error instanceof DOMException && error.name === "TimeoutError"
            ? "timeout"
            : "network_error";
        throw new PushTransportError(category, "Push request failed");
      }

      await consumeBoundedBody(response, responseLimitBytes);
      return { statusCode: response.status };
    },
  };
}

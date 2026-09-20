import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { upsertVaultSecret } from "./provision-push-worker.ts";
import { createHandler } from "../supabase/functions/send-push/handler.ts";
import { validatePushEndpoint } from "../supabase/functions/send-push/endpoint-policy.ts";
import {
  createWebPushTransport,
  PushTransportError,
  type PreparedDelivery,
  type WebPushRequestBuilder,
} from "../supabase/functions/send-push/transport.ts";
import {
  runPushWorker,
  type ClaimedDelivery,
  type DeliveryOutcome,
  type PushRepository,
} from "../supabase/functions/send-push/worker.ts";

const INTERNAL_SECRET = "test-only-internal-secret-with-enough-entropy";

describe("Vault provisioning", () => {
  test("updates an existing named secret instead of leaving the old value active", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      async query(sql: string, values?: unknown[]) {
        calls.push({ sql, values });
        if (sql.startsWith("select id::text")) {
          return { rows: [{ id: "00000000-0000-0000-0000-000000000001" }] };
        }
        return { rows: [] };
      },
    } as unknown as import("pg").default.Client;

    await upsertVaultSecret(client, "push_worker_secret", "rotated-value");

    assert.equal(calls.length, 2);
    assert.match(calls[1].sql, /vault[.]update_secret/);
    assert.deepEqual(calls[1].values, [
      "00000000-0000-0000-0000-000000000001",
      "rotated-value",
      "push_worker_secret",
      "Phase 0 scheduled push worker",
    ]);
  });

  test("creates a named secret only when no existing row is present", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      async query(sql: string, values?: unknown[]) {
        calls.push({ sql, values });
        return { rows: [] };
      },
    } as unknown as import("pg").default.Client;

    await upsertVaultSecret(client, "push_worker_secret", "initial-value");

    assert.equal(calls.length, 2);
    assert.match(calls[1].sql, /vault[.]create_secret/);
  });
});

function request(body = "{}", headers: Record<string, string> = {}, method = "POST"): Request {
  return new Request("https://example.test/functions/v1/send-push", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: method === "GET" || method === "HEAD" ? undefined : body,
  });
}

describe("internal invocation handler", () => {
  test("rejects anonymous, publishable-key, user-JWT, and invalid-secret callers uniformly", async () => {
    let workerCalls = 0;
    const handler = createHandler({
      internalSecret: INTERNAL_SECRET,
      runWorker: async () => {
        workerCalls += 1;
      },
      log: () => {},
    });
    const attempts = [
      request(),
      request("{}", { apikey: "public-test-key" }),
      request("{}", { authorization: "Bearer ordinary-user-token" }),
      request("{}", { "x-push-worker-secret": "wrong" }),
    ];

    const responses = await Promise.all(attempts.map((attempt) => handler(attempt)));
    assert.deepEqual(
      responses.map((response) => response.status),
      [401, 401, 401, 401],
    );
    assert.deepEqual(
      await Promise.all(responses.map((response) => response.text())),
      Array(4).fill('{"error":"unauthorized"}'),
    );
    assert.equal(workerCalls, 0);
  });

  test("rejects wrong methods, media types, malformed bodies, and oversized bodies", async () => {
    const handler = createHandler({
      internalSecret: INTERNAL_SECRET,
      runWorker: async () => {},
      log: () => {},
    });
    const secret = { "x-push-worker-secret": INTERNAL_SECRET };

    assert.equal((await handler(request("", secret, "GET"))).status, 405);
    assert.equal(
      (await handler(request("{}", { ...secret, "content-type": "text/plain" }))).status,
      415,
    );
    assert.equal((await handler(request("{", secret))).status, 400);
    assert.equal((await handler(request('{"comment_id":"attacker"}', secret))).status, 400);
    assert.equal((await handler(request(`{"padding":"${"x".repeat(300)}"}`, secret))).status, 413);
  });

  test("accepts only an authenticated empty-object request and hides worker errors", async () => {
    let workerCalls = 0;
    const handler = createHandler({
      internalSecret: INTERNAL_SECRET,
      runWorker: async () => {
        workerCalls += 1;
      },
      log: () => {},
    });
    const accepted = await handler(request("{}", { "x-push-worker-secret": INTERNAL_SECRET }));
    assert.equal(accepted.status, 202);
    assert.equal(await accepted.text(), '{"accepted":true}');
    assert.equal(workerCalls, 1);

    const failing = createHandler({
      internalSecret: INTERNAL_SECRET,
      runWorker: async () => {
        throw new Error("sensitive database detail");
      },
      log: () => {},
    });
    const failed = await failing(request("{}", { "x-push-worker-secret": INTERNAL_SECRET }));
    assert.equal(failed.status, 500);
    assert.equal(await failed.text(), '{"error":"internal_error"}');
  });
});

describe("push endpoint policy", () => {
  const accepted = [
    "https://fcm.googleapis.com/fcm/send/token",
    "https://fcm.googleapis.com:443/fcm/send/token",
    "https://updates.push.services.mozilla.com/wpush/v2/token",
    "https://web.push.apple.com/QH/token",
    "https://abc-123.push.apple.com/3/device/token",
  ];
  const rejected = [
    "http://fcm.googleapis.com/fcm/send/token",
    "https://localhost/push",
    "https://localhost.localdomain/push",
    "https://127.0.0.1/push",
    "https://[::1]/push",
    "https://10.0.0.1/push",
    "https://169.254.169.254/latest/meta-data",
    "https://[::ffff:127.0.0.1]/push",
    "https://fcm.googleapis.com.evil.example/push",
    "https://evilpush.apple.com/push",
    "https://user:pass@fcm.googleapis.com/push",
    "https://fcm.googleapis.com:444/push",
    "https://fcm.googleapis.com/push#fragment",
    "https://fcm.googleapis.com./push",
    "https://push.apple.com/push",
    "not a url",
  ];

  for (const endpoint of accepted) {
    test(`accepts supported provider: ${new URL(endpoint).hostname}`, () => {
      assert.ok(validatePushEndpoint(endpoint));
    });
  }

  for (const endpoint of rejected) {
    test(`rejects hostile endpoint: ${endpoint}`, () => {
      assert.equal(validatePushEndpoint(endpoint), null);
    });
  }
});

function delivery(endpoint = "https://fcm.googleapis.com/fcm/send/token"): PreparedDelivery {
  return {
    delivery_id: "00000000-0000-0000-0000-000000000001",
    outbox_id: "00000000-0000-0000-0000-000000000002",
    subscription_id: "00000000-0000-0000-0000-000000000003",
    endpoint,
    p256dh: "public-key",
    auth_key: "auth-key",
    post_id: "question/id?unsafe=yes",
    comment_text: "x".repeat(200),
    attempt_count: 1,
  };
}

function builder(onBuild?: (payload: string, topic: string) => void): WebPushRequestBuilder {
  return {
    generateRequestDetails(subscription, payload, options) {
      onBuild?.(payload, options.topic);
      return {
        endpoint: subscription.endpoint,
        method: "POST",
        headers: { TTL: options.TTL },
        body: new Uint8Array([1, 2, 3]),
      };
    },
  };
}

describe("bounded Web Push transport", () => {
  test("uses manual redirects, stable topics, bounded text, and encoded links", async () => {
    let redirect: "follow" | "error" | "manual" | undefined;
    let payload = "";
    let topic = "";
    const transport = createWebPushTransport(
      builder((builtPayload, builtTopic) => {
        payload = builtPayload;
        topic = builtTopic;
      }),
      {
        fetchImpl: async (_input, init) => {
          redirect = init?.redirect;
          return new Response("redirect", {
            status: 302,
            headers: { location: "http://127.0.0.1" },
          });
        },
      },
    );
    const response = await transport.send(delivery());
    assert.equal(response.statusCode, 302);
    assert.equal(redirect, "manual");
    assert.equal(topic.length, 32);
    const decoded = JSON.parse(payload) as { body: string; url: string };
    assert.equal(decoded.body.length, 138);
    assert.equal(decoded.url, "/?post=question%2Fid%3Funsafe%3Dyes");
  });

  test("bounds provider response bodies", async () => {
    const transport = createWebPushTransport(builder(), {
      responseLimitBytes: 8,
      fetchImpl: async () => new Response("123456789", { status: 500 }),
    });
    await assert.rejects(
      transport.send(delivery()),
      (error: unknown) =>
        error instanceof PushTransportError && error.category === "response_too_large",
    );
  });

  test("classifies aborted requests without returning network detail", async () => {
    const transport = createWebPushTransport(builder(), {
      fetchImpl: async () => {
        throw new DOMException("provider detail", "TimeoutError");
      },
    });
    await assert.rejects(
      transport.send(delivery()),
      (error: unknown) => error instanceof PushTransportError && error.category === "timeout",
    );
  });
});

describe("worker outcomes and replay", () => {
  const claim: ClaimedDelivery = {
    delivery_id: "00000000-0000-0000-0000-000000000001",
    claim_token: "00000000-0000-0000-0000-000000000004",
    outbox_id: "00000000-0000-0000-0000-000000000002",
    attempt_count: 1,
  };

  for (const [status, expected] of [
    [201, "sent"],
    [410, "gone"],
    [408, "transient"],
    [425, "transient"],
    [429, "transient"],
    [503, "transient"],
    [400, "permanent"],
    [302, "permanent"],
  ] as const) {
    test(`maps HTTP ${status} to ${expected}`, async () => {
      const completions: DeliveryOutcome[] = [];
      const repository: PushRepository = {
        claimBatch: async () => [claim],
        prepare: async () => delivery(),
        complete: async (_id, _token, outcome) => {
          completions.push(outcome);
        },
      };
      await runPushWorker(repository, { send: async () => ({ statusCode: status }) }, () => {});
      assert.deepEqual(completions, [expected]);
    });
  }

  test("a replay with no due claim cannot send again", async () => {
    let sends = 0;
    await runPushWorker(
      {
        claimBatch: async () => [],
        prepare: async () => delivery(),
        complete: async () => {},
      },
      {
        send: async () => {
          sends += 1;
          return { statusCode: 201 };
        },
      },
      () => {},
    );
    assert.equal(sends, 0);
  });

  test("a second invalid endpoint check removes the subscription without network I/O", async () => {
    const completions: DeliveryOutcome[] = [];
    let sends = 0;
    await runPushWorker(
      {
        claimBatch: async () => [claim],
        prepare: async () => delivery("https://127.0.0.1/private"),
        complete: async (_id, _token, outcome) => {
          completions.push(outcome);
        },
      },
      {
        send: async () => {
          sends += 1;
          return { statusCode: 201 };
        },
      },
      () => {},
    );
    assert.equal(sends, 0);
    assert.deepEqual(completions, ["gone"]);
  });
});

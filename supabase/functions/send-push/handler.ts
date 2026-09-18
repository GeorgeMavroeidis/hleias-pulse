import { secretsMatch } from "./auth.ts";

const MAX_BODY_BYTES = 256;

type HandlerDependencies = {
  internalSecret: string;
  runWorker(): Promise<void>;
  log(entry: { event: string; outcome: string }): void;
};

function jsonResponse(status: number, body: Record<string, string | boolean>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function readBoundedBody(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new RangeError("too_large");
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let result = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("too_large");
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}

export function createHandler(dependencies: HandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return jsonResponse(405, { error: "method_not_allowed" });
    }

    if (!secretsMatch(dependencies.internalSecret, request.headers.get("x-push-worker-secret"))) {
      return jsonResponse(401, { error: "unauthorized" });
    }

    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      return jsonResponse(415, { error: "unsupported_media_type" });
    }

    let rawBody: string;
    try {
      rawBody = await readBoundedBody(request);
    } catch (error) {
      if (error instanceof RangeError) return jsonResponse(413, { error: "payload_too_large" });
      return jsonResponse(400, { error: "invalid_request" });
    }

    try {
      const body: unknown = JSON.parse(rawBody);
      if (
        body === null ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).length !== 0
      ) {
        return jsonResponse(400, { error: "invalid_request" });
      }
    } catch {
      return jsonResponse(400, { error: "invalid_request" });
    }

    try {
      await dependencies.runWorker();
      return jsonResponse(202, { accepted: true });
    } catch {
      dependencies.log({ event: "push_worker_failed", outcome: "internal_error" });
      return jsonResponse(500, { error: "internal_error" });
    }
  };
}

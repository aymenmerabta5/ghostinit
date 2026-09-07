import { ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { appRouter, generateOpenAPI } from "./orpc.js";

interface OpenAPIDocument {
  paths?: Record<string, unknown>;
  servers?: Array<{ url?: unknown }>;
}

interface TogglePayload {
  json?: { enabled?: unknown };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Exercise the exact oRPC router, fetch transport, Zod converter, and error API used by templates. */
export async function verifyOrpcRuntimeCompatibility(): Promise<void> {
  const error = new ORPCError("NOT_FOUND", { message: "missing" });
  assert(error.code === "NOT_FOUND", "ORPCError did not preserve its code");
  assert(error.message === "missing", "ORPCError did not preserve its message");

  const spec = (await generateOpenAPI()) as OpenAPIDocument;
  assert(spec.paths !== undefined, "OpenAPI generation did not produce paths");
  assert("/api/hello" in spec.paths, "OpenAPI output is missing /api/hello");
  assert("/api/toggle" in spec.paths, "OpenAPI output is missing /api/toggle");
  assert(spec.servers?.[0]?.url === "/", "OpenAPI server URL duplicated the /api router prefix");

  const openApiHandler = new OpenAPIHandler(appRouter);
  const openApiResult = await openApiHandler.handle(
    new Request("http://localhost:3000/api/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    }),
  );
  assert(openApiResult.matched, "OpenAPIHandler did not match POST /api/toggle");
  assert(openApiResult.response?.status === 200, "OpenAPIHandler did not return status 200");
  const misplacedOpenApiResult = await openApiHandler.handle(
    new Request("http://localhost:3000/api/rpc/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    }),
  );
  assert(!misplacedOpenApiResult.matched, "OpenAPIHandler unexpectedly matched /api/rpc/toggle");

  const handler = new RPCHandler(appRouter);
  const result = await handler.handle(
    new Request("http://localhost:3000/api/orpc/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { enabled: true } }),
    }),
    { prefix: "/api/orpc" },
  );
  assert(result.matched, "RPCHandler did not match POST /api/orpc/toggle");
  assert(result.response?.status === 200, "RPCHandler did not return status 200");
  const payload = (await result.response.json()) as TogglePayload;
  assert(payload.json?.enabled === true, "RPCHandler returned an unexpected toggle payload");
}

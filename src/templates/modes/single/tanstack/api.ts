import { webhookContent } from "../../../billing/webhooks/factory.js";

export function singleAuthApiRouteTanstackContent(): string {
  return [
    "import { createFileRoute } from '@tanstack/react-router'",
    "import { auth } from '@/server/auth'",
    "",
    "const allowed = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])",
    "async function handle({ request }: { request: Request }): Promise<Response> {",
    "  if (!allowed.has(request.method)) { return new Response('Method not allowed', { status: 405 }) }",
    "  return auth.handler(request)",
    "}",
    "export const Route = createFileRoute('/api/auth/$splat')({",
    "  server: { handlers: { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle } },",
    "})",
    "",
  ].join("\n");
}

export function singleRpcApiRouteTanstackContent(): string {
  return [
    "import { createFileRoute } from '@tanstack/react-router'",
    "import { RPCHandler } from '@orpc/server/fetch'",
    "import { OpenAPIHandler } from '@orpc/openapi/fetch'",
    "import { appRouter, createContext } from '@/server/api'",
    "",
    "const rpcHandler = new RPCHandler(appRouter)",
    "const openapiHandler = new OpenAPIHandler(appRouter)",
    "async function handle({ request }: { request: Request }): Promise<Response> {",
    "  const context = await createContext(request.headers)",
    "  const opts = { context }",
    "  const rpcResult = await rpcHandler.handle(request, opts as unknown as { context: Record<string, unknown> })",
    "  if (rpcResult.matched && rpcResult.response) {",
    "    const response = rpcResult.response",
    "    response.headers.set('X-Content-Type-Options', 'nosniff')",
    "    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')",
    "    return response",
    "  }",
    "  const openApiResult = await openapiHandler.handle(request, opts as unknown as { context: Record<string, unknown> })",
    "  if (openApiResult.matched && openApiResult.response) {",
    "    const response = openApiResult.response",
    "    response.headers.set('X-Content-Type-Options', 'nosniff')",
    "    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')",
    "    return response",
    "  }",
    "  return new Response('Not found', { status: 404 })",
    "}",
    "export const Route = createFileRoute('/api/rpc/$splat')({",
    "  server: { handlers: { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle } },",
    "})",
    "",
  ].join("\n");
}

export function singleHealthApiRouteTanstackContent(): string {
  return [
    "import { createFileRoute } from '@tanstack/react-router'",
    "export const Route = createFileRoute('/api/health')({",
    "  server: {",
    "    handlers: {",
    "      GET: async () => {",
    "        const body = JSON.stringify({ status: 'ok', time: new Date().toISOString() })",
    "        return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' } })",
    "      },",
    "    },",
    "  },",
    "})",
    "",
  ].join("\n");
}

export function singleOpenapiApiRouteTanstackContent(): string {
  return [
    "import { createFileRoute } from '@tanstack/react-router'",
    "import { generateOpenAPISpec } from '@/server/api/openapi'",
    "export const Route = createFileRoute('/api/openapi')({",
    "  server: {",
    "    handlers: {",
    "      GET: async () => {",
    "        if (process.env.NODE_ENV === 'production') { return new Response('Not found', { status: 404 }) }",
    "        const spec = await generateOpenAPISpec()",
    "        return new Response(JSON.stringify(spec), { headers: { 'Content-Type': 'application/json' } })",
    "      },",
    "    },",
    "  },",
    "})",
    "",
  ].join("\n");
}

export function singleStripeWebhookTanstackContent(isConvex = false): string {
  return webhookContent("stripe", "tanstack", "single", isConvex ? "convex" : "postgres").content;
}

export function singleChargilyWebhookTanstackContent(isConvex = false): string {
  return webhookContent("chargily", "tanstack", "single", isConvex ? "convex" : "postgres").content;
}

export function singlePaddleWebhookTanstackContent(isConvex = false): string {
  return webhookContent("paddle", "tanstack", "single", isConvex ? "convex" : "postgres").content;
}

export function singlePolarWebhookTanstackContent(isConvex = false): string {
  return webhookContent("polar", "tanstack", "single", isConvex ? "convex" : "postgres").content;
}

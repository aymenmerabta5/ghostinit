import {
  tanstackAuthRouteContent,
  tanstackAuthServerHandlerContent,
  tanstackOpenApiRouteContent,
  tanstackOpenApiServerHandlerContent,
  tanstackRpcRouteContent,
  tanstackRpcServerHandlerContent,
} from "../../../apps/fragments/api/core.js";
import {
  tanstackOpenApiOperationsRouteContent,
  tanstackOpenApiOperationsServerContent,
} from "../../../apps/fragments/api/openapi.js";

export function singleAuthApiRouteTanstackContent(): string {
  return tanstackAuthRouteContent();
}

export function singleAuthServerHandlerTanstackContent(): string {
  return tanstackAuthServerHandlerContent("@/server/auth");
}

export function singleRpcApiRouteTanstackContent(): string {
  return tanstackRpcRouteContent();
}

export function singleRpcServerHandlerTanstackContent(): string {
  return tanstackRpcServerHandlerContent("@/server/api");
}

export function singleOpenApiOperationsRouteTanstackContent(): string {
  return tanstackOpenApiOperationsRouteContent();
}

export function singleOpenApiOperationsServerTanstackContent(): string {
  return tanstackOpenApiOperationsServerContent("@/server/api");
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
  return tanstackOpenApiRouteContent();
}

export function singleOpenApiServerHandlerTanstackContent(): string {
  return tanstackOpenApiServerHandlerContent("@/server/api/openapi");
}

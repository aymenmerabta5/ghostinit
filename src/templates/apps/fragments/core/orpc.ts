/**
 * Core fragments – oRPC client + auth shim
 */

export function orpcClientContent(router: "next" | "tanstack"): string {
  if (router === "tanstack") {
    return `"use client"
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import type { appRouter } from '@repo/api'

const link = new RPCLink({
  url: typeof window !== 'undefined' ? \`\${window.location.origin}/api/rpc\` : 'http://localhost:3000/api/rpc',
})

export const orpc: RouterClient<typeof appRouter> = createORPCClient(link)

export function createApiClient() {
  return orpc
}
export type ApiClient = typeof orpc
`;
  }
  return `"use client";
// oRPC contract-first, single port 3000, no treaty
// Context7 /dinwwwh/orpc: createORPCClient + RPCLink - typed client

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@repo/api";

// Single port 3000 - oRPC mounted at /api via RPCHandler fetch adapter
// Context7: RPCHandler handles request with prefix /api, context from createContext
const link = new RPCLink({
  url: typeof window !== "undefined" ? \`\${window.location.origin}/api\` : "http://localhost:3000/api",
});

export const orpc: RouterClient<typeof appRouter> = createORPCClient(link);

export function createApiClient() {
  return orpc;
}
export type ApiClient = typeof orpc;
`;
}

export function authClientShim(): string {
  return `export { authClient } from "@repo/auth/client";
`;
}

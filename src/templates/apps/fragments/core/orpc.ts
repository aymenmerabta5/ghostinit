/** Core fragments: typed oRPC client plus the React Query adapter. */

import { identityClientAdapterContent } from "../auth/client-adapter.js";

function clientContent(router: "next" | "tanstack"): string {
  const rpcPath = "/api/rpc";
  const serverHint =
    router === "tanstack"
      ? "The shared oRPC client is browser-only. Use createRequestApiClient(request) during SSR."
      : "The shared oRPC client is browser-only. Next Server Components and Server Actions use the request application facade.";
  const requestClient =
    router === "tanstack"
      ? `
export interface CreateApiClientOptions {
  url: string | URL;
  headers?: Headers;
}

export function createApiClient(options?: CreateApiClientOptions): ApiClient {
  if (!options) return orpcClient;
  const requestLink = new RPCLink({ url: options.url, headers: options.headers });
  return createORPCClient<RouterClient<typeof appRouter>>(requestLink);
}

export function createRequestApiClient(request: Request): ApiClient {
  const headers = new Headers();
  // Preserve browser provenance with the forwarded cookie. Never manufacture a
  // trusted Origin here: a sibling-site request reaching a server boundary
  // must still be rejected by the oRPC ingress.
  for (const name of ["authorization", "cookie", "origin", "sec-fetch-site"] as const) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const url = new URL(RPC_PATH, request.url);
  return createApiClient({ url, headers });
}
`
      : "";
  return `import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createORPCReactQueryUtils } from "@orpc/react-query";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@repo/api";

const RPC_PATH = "${rpcPath}";

function browserRpcUrl(): URL {
  if (typeof window === "undefined") {
    throw new Error("${serverHint}");
  }
  return new URL(RPC_PATH, window.location.origin);
}

const link = new RPCLink({ url: browserRpcUrl });

export const orpcClient = createORPCClient<RouterClient<typeof appRouter>>(link);
export const orpc = createORPCReactQueryUtils(orpcClient);
export type ApiClient = typeof orpcClient;
${requestClient}
`;
}

export function orpcClientContent(router: "next" | "tanstack"): string {
  return clientContent(router);
}

export function authClientShim(
  database: "postgres" | "convex" | "none" = "postgres",
  target: "nextjs" | "tanstack-start" = "nextjs",
  hasEmail = true,
): string {
  return `import { authClient } from "@repo/auth/client";

export { authClient };
${identityClientAdapterContent({ database, emailPassword: hasEmail, target })}
`;
}

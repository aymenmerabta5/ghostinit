import type { DesktopMode } from "./model.js";

export function desktopOrpcContent(
  routerImport = "@repo/api",
  routerExport = "appRouter",
  rpcPath: "/api" | "/api/rpc" = "/api",
  routerKind: "router" | "contract" = "router",
  hasAuth = true,
  mode: DesktopMode = "monorepo",
  hasBilling = false,
): string {
  const clientTypeImport =
    routerKind === "contract"
      ? `import type { ContractRouterClient } from "@orpc/contract";`
      : `import type { RouterClient } from "@orpc/server";`;
  const clientType = routerKind === "contract" ? "ContractRouterClient" : "RouterClient";
  const identityQueryOptions = hasAuth
    ? `,
  me: () => orpc.me.queryOptions()`
    : "";
  const identityQueryKeys = hasAuth
    ? `,
  me: () => orpc.me.key({ type: "query" })`
    : "";
  const billingReturnHelper = hasBilling
    ? `
export function desktopBillingReturnUrl(status: "success" | "cancel" | "return"): string {
  const parsed = new URL(env.VITE_APP_URL);
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password
  ) throw new Error("VITE_APP_URL must be a trusted HTTP(S) application URL");
  const result = new URL("/billing", parsed);
  result.searchParams.set("checkout", status);
  return result.toString();
}
`
    : "";
  const billingEnvImport = hasBilling
    ? `import { env } from "${mode === "monorepo" ? "@repo/config/vite" : "@/lib/env/vite"}";`
    : "";
  return `import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createORPCReactQueryUtils } from "@orpc/react-query";
${clientTypeImport}
import type { ${routerExport} } from "${routerImport}";
${billingEnvImport}
import { desktopBridgeFetch } from "../adapters/desktop-fetch";

function getBaseUrl(): string {
  return window.desktopBridge.apiUrl;
}

const link = new RPCLink({
  url: \`\${getBaseUrl()}${rpcPath}\`,
  fetch: (input, init) =>
    desktopBridgeFetch(input, {
      ...init,
      credentials: "include",
    }),
});

export const orpcClient = createORPCClient<${clientType}<typeof ${routerExport}>>(link);
export const orpc = createORPCReactQueryUtils(orpcClient);

export const desktopQueryOptions = {
  health: () => orpc.health.queryOptions()${identityQueryOptions},
};

export const desktopQueryKeys = {
  health: () => orpc.health.key({ type: "query" })${identityQueryKeys},
};
${billingReturnHelper}

export function createApiClient() {
  return orpcClient;
}
export type ApiClient = typeof orpcClient;
`;
}

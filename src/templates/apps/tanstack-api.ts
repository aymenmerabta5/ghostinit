/**
 * TanStack Start API routes — deduplicated via fragments/api
 *
 * Webhook routes are NOT emitted here. src/templates/billing/webhooks/providers/*
 * is the single owner of `src/routes/api/webhooks/<provider>.ts` for every
 * mode/framework/database corner. This file used to emit a second, thinner
 * implementation at the identical paths, which the composition step discarded
 * silently — see dedupeFiles in ../shared.ts.
 */

import { file, type TemplateFile } from "../shared.js";
import { hasAddon, type AddonInstallerMap, type BillingProviderName } from "../../lib/addons.js";
import {
  authFileContent,
  orpcFileContent,
  healthFileContent,
  openapiFileContent,
  tanstackAuthServerHandlerContent,
  tanstackOpenApiOperationsRouteContent,
  tanstackOpenApiOperationsServerContent,
  tanstackOpenApiServerHandlerContent,
  tanstackRpcServerHandlerContent,
} from "./fragments/api.js";

export function tanstackApiFiles(
  addons?: AddonInstallerMap | BillingProviderName[] | Record<string, { inUse: boolean }>,
): TemplateFile[] {
  const trustedCloudflareRuntime =
    addons !== undefined &&
    !Array.isArray(addons) &&
    hasAddon(addons as AddonInstallerMap, "cloudflare");
  return [
    authApiRoute(),
    file(
      "apps/web/src/server/http/auth.server.ts",
      tanstackAuthServerHandlerContent("@repo/auth", trustedCloudflareRuntime),
    ),
    orpcApiRoute(),
    file("apps/web/src/server/http/rpc.server.ts", tanstackRpcServerHandlerContent("@repo/api")),
    openapiOperationsRoute(),
    file(
      "apps/web/src/server/http/openapi-operations.server.ts",
      tanstackOpenApiOperationsServerContent("@repo/api"),
    ),
    healthApiRoute(),
    openapiApiRoute(),
    file(
      "apps/web/src/server/http/openapi.server.ts",
      tanstackOpenApiServerHandlerContent("@repo/api/openapi"),
    ),
  ];
}

function authApiRoute(): TemplateFile {
  return file("apps/web/src/routes/api/auth/$.ts", authFileContent("tanstack"));
}

function orpcApiRoute(): TemplateFile {
  return file("apps/web/src/routes/api/rpc/$.ts", orpcFileContent("tanstack"));
}

function openapiOperationsRoute(): TemplateFile {
  return file("apps/web/src/routes/api/$.ts", tanstackOpenApiOperationsRouteContent());
}

function healthApiRoute(): TemplateFile {
  return file("apps/web/src/routes/api/health.ts", healthFileContent("tanstack"));
}

function openapiApiRoute(): TemplateFile {
  return file("apps/web/src/routes/api/openapi.ts", openapiFileContent("tanstack"));
}

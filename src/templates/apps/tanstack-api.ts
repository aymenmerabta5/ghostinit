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
import type { AddonInstallerMap, BillingProviderName } from "../../lib/addons.js";
import {
  authFileContent,
  orpcFileContent,
  healthFileContent,
  openapiFileContent,
} from "./fragments/api.js";

export function tanstackApiFiles(
  _addons?: AddonInstallerMap | BillingProviderName[] | Record<string, { inUse: boolean }>,
): TemplateFile[] {
  return [authApiRoute(), orpcApiRoute(), healthApiRoute(), openapiApiRoute()];
}

function authApiRoute(): TemplateFile {
  return file("apps/web/src/routes/api/auth/$splat.ts", authFileContent("tanstack"));
}

function orpcApiRoute(): TemplateFile {
  return file("apps/web/src/routes/api/rpc/$splat.ts", orpcFileContent("tanstack"));
}

function healthApiRoute(): TemplateFile {
  return file("apps/web/src/routes/api/health.ts", healthFileContent("tanstack"));
}

function openapiApiRoute(): TemplateFile {
  return file("apps/web/src/routes/api/openapi.ts", openapiFileContent("tanstack"));
}

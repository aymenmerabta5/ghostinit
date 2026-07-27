/**
 * Next.js App Router API routes — oRPC contract-first, deduplicated via fragments/api.
 *
 * Webhook routes are NOT emitted here. src/templates/billing/webhooks/providers/*
 * is the single owner of `src/app/api/webhooks/<provider>/route.ts` for every
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

export function apiFiles(
  _addons?: AddonInstallerMap | BillingProviderName[] | Record<string, { inUse: boolean }>,
): TemplateFile[] {
  return [authApiRoute(), orpcApiRoute(), healthApiRoute(), openapiApiRoute()];
}

function authApiRoute(): TemplateFile {
  return file("apps/web/src/app/api/auth/[...all]/route.ts", authFileContent("next"));
}

function orpcApiRoute(): TemplateFile {
  return file("apps/web/src/app/api/[...path]/route.ts", orpcFileContent("next"));
}

function healthApiRoute(): TemplateFile {
  return file("apps/web/src/app/api/health/route.ts", healthFileContent("next"));
}

function openapiApiRoute(): TemplateFile {
  return file("apps/web/src/app/api/openapi/route.ts", openapiFileContent("next"));
}

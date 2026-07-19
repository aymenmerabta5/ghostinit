/**
 * Client boundary: "use client" files must not import server-only packages.
 * Covers @repo/database, @repo/auth, @repo/modules, @repo/api and billing server-only SDKs.
 */

import type { ArchitectureFinding, PackageInfo } from "../types.js";
import { SERVER_ONLY_BILLING_PACKAGES } from "../constants.js";
import { getBasePackage, isFrameworkEntryPoint } from "../utils.js";

export function checkServerOnlyClient(
  findings: ArchitectureFinding[],
  file: string,
  imp: string,
  pkg: PackageInfo | undefined,
  directives: Set<string>,
  source?: string,
): void {
  if (isFrameworkEntryPoint(file)) return;

  const src = source ?? "";
  const isServerRouteWithServerFn =
    src.includes("createServerFn") ||
    src.includes("getRequestHeaders") ||
    src.includes("server: {") ||
    (file.includes("/routes/api/") && src.includes("handlers")) ||
    (file.includes("/app/api/") && src.includes("auth.handler"));

  if (isServerRouteWithServerFn) return;

  if (!directives.has("use client")) return;

  const serverOnly = new Set(["@repo/database", "@repo/auth", "@repo/modules", "@repo/api"]);
  const basePkg = getBasePackage(imp);

  const isAllowedApiImport =
    (imp === "@repo/api" || basePkg === "@repo/api") &&
    (file.includes("orpc") || file.includes("lib/orpc"));
  if (!isAllowedApiImport && (serverOnly.has(imp) || serverOnly.has(basePkg))) {
    findings.push({
      id: "client-imports-server-only",
      severity: "HIGH",
      message: `Client-side file imports server-only package: ${imp}`,
      file,
      rule: "client-boundary",
    });
  }

  if (imp.startsWith(".") || imp.startsWith("@/") || imp.startsWith("~/")) {
    return;
  }
  const isBillingServerOnly =
    imp === "@chargily/chargily-pay" ||
    basePkg === "@chargily/chargily-pay" ||
    SERVER_ONLY_BILLING_PACKAGES.has(imp) ||
    SERVER_ONLY_BILLING_PACKAGES.has(basePkg);
  if (isBillingServerOnly) {
    findings.push({
      id: "client-imports-server-only",
      severity: "HIGH",
      message: `Client-side file imports server-only billing package (Chargily server-only per docs "meant to be ONLY used in the server-side"): ${imp}`,
      file,
      rule: "client-boundary",
    });
  }
}

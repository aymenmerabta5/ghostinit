/**
 * Client boundary: "use client" files must not import server-only packages.
 * Covers @repo/database, @repo/auth, @repo/modules, @repo/api and billing server-only SDKs.
 */

import type { ArchitectureFinding, PackageInfo } from "../types.js";
import { SERVER_ONLY_BILLING_PACKAGES } from "../constants.js";
import { getBasePackage } from "../utils.js";
import {
  isFeatureComponentFile,
  isFeatureDataAdapterFile,
  isFeatureFile,
  isFeatureRemoteAdapterImport,
  isFeatureProviderViewFile,
  isVendorDirectImport,
} from "./vendor.js";

const FEATURE_SERVER_PACKAGES = new Set([
  "@repo/api",
  "@repo/auth",
  "@repo/billing",
  "@repo/core",
  "@repo/database",
  "@repo/email",
  "@repo/modules",
  "@repo/services",
  "@orpc/server",
  "@orpc/openapi",
  "drizzle-orm",
  "drizzle-kit",
  "pg",
  "server-only",
]);

export function checkServerOnlyClient(
  findings: ArchitectureFinding[],
  file: string,
  imp: string,
  pkg: PackageInfo | undefined,
  directives: Set<string>,
  _source?: string,
  resolvedTarget?: string,
): void {
  const normalizedFile = file.replace(/\\/g, "/");
  const isFeature = isFeatureFile(normalizedFile);

  // Feature components are prop-driven presentation. Enforce this whether or not
  // the author remembered a `use client` directive and before any server-route
  // exemption, so adding createServerFn text cannot turn a component into an adapter.
  if (isFeatureComponentFile(normalizedFile) && isPresentationDataImport(imp, resolvedTarget)) {
    findings.push({
      id: "feature-presentation-imports-data-access",
      severity: "HIGH",
      message: `Feature component imports remote state, auth, database, service, or network code directly: ${imp} - pass typed data and callbacks from the feature composition root instead`,
      file,
      rule: "feature-presentation-isolation",
    });
    return;
  }

  if (isFeature && !isFeatureDataAdapterFile(normalizedFile) && isFeatureRemoteAdapterImport(imp)) {
    findings.push({
      id: "feature-imports-data-access-outside-adapter",
      severity: "HIGH",
      message: `Feature remote-state clients belong in root queries.ts or mutations.ts, not ${file}: ${imp}`,
      file,
      rule: "feature-data-adapter-isolation",
    });
    return;
  }

  if (isFeature && isFeatureServerImport(imp, resolvedTarget)) {
    findings.push({
      id: "client-imports-server-only",
      severity: "HIGH",
      message: `Feature presentation imports a server-only dependency directly: ${imp}`,
      file,
      rule: "client-boundary",
    });
    return;
  }

  const isDesktopRenderer =
    file.includes("apps/desktop/src/renderer") || file.includes("src/renderer");
  if (!directives.has("use client") && !isDesktopRenderer) return;

  // Desktop renderer is treated as client-side: must not import server-only packages.
  // Only better-auth/react (client) via ../lib/auth.ts is allowed — direct @repo/auth is forbidden.
  // This is stricter than web where api routes are server-side; desktop renderer is always client.
  const serverOnly = FEATURE_SERVER_PACKAGES;
  const basePkg = getBasePackage(imp);
  const isDesktopRendererFile = isDesktopRenderer;

  if (imp === "better-auth/react" || imp.startsWith("better-auth/client/")) return;

  if (imp === "@repo/config/server") {
    findings.push({
      id: "client-imports-server-only",
      severity: "HIGH",
      message: "Client-side file imports the server environment entrypoint",
      file,
      rule: "client-boundary",
    });
    return;
  }

  // For desktop renderer, forbid direct @repo/auth import — must go via lib/auth.ts (better-auth/react)
  if (
    isDesktopRendererFile &&
    (imp === "@repo/auth" || basePkg === "@repo/auth" || imp.startsWith("@repo/auth/"))
  ) {
    findings.push({
      id: "client-imports-server-only",
      severity: "HIGH",
      message: `Desktop renderer must not import @repo/auth server directly: ${imp} — use better-auth/react via ../lib/auth.ts instead`,
      file,
      rule: "client-boundary",
    });
    return;
  }

  const isAllowedApiImport =
    (imp === "@repo/api" || basePkg === "@repo/api") && isOrpcClientAdapter(normalizedFile);
  if (!isAllowedApiImport && (serverOnly.has(imp) || serverOnly.has(basePkg))) {
    findings.push({
      id: "client-imports-server-only",
      severity: "HIGH",
      message: `Client-side file imports server-only package: ${imp}`,
      file,
      rule: "client-boundary",
    });
    return;
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

function isOrpcClientAdapter(file: string): boolean {
  return /(?:^|\/)(?:apps\/[^/]+\/)?src\/(?:renderer\/)?lib\/orpc\.[cm]?[jt]sx?$/.test(file);
}

function isFeatureServerImport(imp: string, resolvedTarget?: string): boolean {
  const normalized = imp.replace(/\\/g, "/");
  const base = getBasePackage(normalized);
  return (
    FEATURE_SERVER_PACKAGES.has(normalized) ||
    FEATURE_SERVER_PACKAGES.has(base) ||
    normalized.startsWith("node:") ||
    normalized.startsWith("bun:") ||
    normalized === "next/headers" ||
    normalized === "next/server" ||
    /(?:^|\/)(?:server|services|db|database)(?:\/|$)/.test(normalized) ||
    (/(?:^|\/)providers(?:\/|$)/.test(normalized) && !isFeatureProviderViewFile(resolvedTarget)) ||
    normalized.includes("/billing/providers/") ||
    normalized.includes("convex/_generated/server") ||
    normalized === "convex/server" ||
    isVendorDirectImport(normalized)
  );
}

function isPresentationDataImport(imp: string, resolvedTarget?: string): boolean {
  const normalized = imp.replace(/\\/g, "/");
  if (isFeatureServerImport(normalized, resolvedTarget)) return true;
  if (isFeatureRemoteAdapterImport(normalized)) return true;

  return (
    /(?:^|\/)(?:queries|mutations)(?:\.[cm]?[jt]sx?)?$/.test(normalized) ||
    /(?:^|\/)lib\/(?:orpc|query-client|auth-client)(?:\.[cm]?[jt]sx?)?$/.test(normalized) ||
    normalized.includes("convex/_generated/api") ||
    normalized.includes("/services/") ||
    (normalized.includes("/providers/") && !isFeatureProviderViewFile(resolvedTarget))
  );
}

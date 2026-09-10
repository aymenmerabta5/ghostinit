/**
 * Six-layer dependency evaluation over a single resolved edge.
 *
 * The policy matrix and classifiers live in layer-policy.ts. This module owns
 * diagnostics and platform presentation boundaries.
 */

import type { ArchitectureFinding, ImportKind, LayerInfo } from "../types.js";
import {
  isFeatureDataAdapterFile,
  isFeatureFile,
  isFeatureProviderViewFile,
  isVendorDirectImport,
} from "./vendor.js";
import {
  getLayerFromFilePath,
  getLayerFromImport,
  isLayerEdgeAllowed,
  type ArchitectureLayer,
} from "./layer-policy.js";

export { getLayerFromFilePath, getLayerFromImport, isLayerEdgeAllowed } from "./layer-policy.js";

export function checkLayeredDependency(
  findings: ArchitectureFinding[],
  file: string,
  _absFile: string,
  specifier: string,
  resolvedTarget?: string,
  importKind?: ImportKind,
  typeOnly = false,
): void {
  const sourceLayer = getLayerFromFilePath(file);
  if (!sourceLayer) return;
  const targetLayer = getLayerFromImport(specifier, resolvedTarget);
  const imp = specifier.replace(/\\/g, "/");
  const resolved = resolvedTarget?.replace(/\\/g, "/");
  // These generated client contracts carry function references and erased DTOs.
  // Backend files and similarly named nested trees retain their normal restrictions.
  if (
    isFeatureFile(file) &&
    ((isFeatureDataAdapterFile(file) && resolved === "convex/_generated/api.js") ||
      (typeOnly && resolved === "convex/_generated/dataModel.d.ts"))
  )
    return;

  if (isFeatureFile(file) && isForbiddenFeatureDependency(imp, targetLayer, resolvedTarget)) {
    findings.push({
      id: "feature-imports-server-layer",
      severity: "HIGH",
      message: `Feature presentation must not import a domain, server, database, provider, or vendor dependency directly: ${specifier}`,
      file,
      rule: "feature-layer-isolation",
    });
    return;
  }

  if (!targetLayer) return;
  if (
    isDesktopRenderer(file) &&
    sourceLayer.name === "UI" &&
    (targetLayer.name === "Domain" ||
      targetLayer.name === "Application" ||
      targetLayer.name === "Vendors")
  ) {
    findings.push({
      id: targetLayer.name === "Vendors" ? "desktop-imports-vendor" : "ui-imports-capabilities",
      severity: "HIGH",
      message: `Desktop renderer must use the typed transport instead of importing ${targetLayer.name} directly: ${specifier}`,
      file,
      rule:
        targetLayer.name === "Vendors" ? "desktop-vendor-isolation" : "ui-capabilities-isolation",
    });
    return;
  }

  if (
    !isLayerEdgeAllowed(
      sourceLayer.name as ArchitectureLayer,
      targetLayer.name as ArchitectureLayer,
    )
  ) {
    findings.push({
      id: "layered-dependency-violation",
      severity: "HIGH",
      message: `Layer violation: ${sourceLayer.name} may not import ${targetLayer.name}: ${specifier}${importKind ? ` (${importKind})` : ""}`,
      file,
      rule: "layered-dependency",
    });
  }
}

function isDesktopRenderer(file: string): boolean {
  const normalized = `/${file.replace(/\\/g, "/").replace(/^\/+/, "")}`;
  return (
    /\/apps\/desktop\/src\/renderer\//.test(normalized) || normalized.startsWith("/src/renderer/")
  );
}

function isForbiddenFeatureDependency(
  specifier: string,
  targetLayer: LayerInfo | null,
  resolvedTarget?: string,
): boolean {
  const base = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
  const serverPackages = new Set([
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
  const resolved = resolvedTarget?.replace(/\\/g, "/") ?? "";
  return (
    targetLayer?.name === "Domain" ||
    targetLayer?.name === "Application" ||
    targetLayer?.name === "Vendors" ||
    serverPackages.has(base) ||
    specifier.startsWith("node:") ||
    specifier.startsWith("bun:") ||
    specifier === "next/headers" ||
    specifier === "next/server" ||
    /(?:^|\/)convex\/_generated\//.test(resolved) ||
    /(?:^|\/)(?:server|services|db|database)(?:\/|$)/.test(resolved) ||
    (/(?:^|\/)providers(?:\/|$)/.test(resolved) && !isFeatureProviderViewFile(resolvedTarget)) ||
    isVendorDirectImport(specifier)
  );
}

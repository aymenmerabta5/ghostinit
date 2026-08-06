/**
 * GhostInit Layered Architecture (pragmatic UI->Supporting, inspired by DDD) — NOT canonical DDD.
 * Linear chain: UI(1) top → Transport(2) → Domain(3) → Capabilities(4) → Vendors(5) → Supporting(6) bottom.
 * Allowed downward only (source.level <= target.level), forbidden upward (source.level > target.level).
 * Inversion vs canonical DDD: Domain(3) CAN import Capabilities(4) downward allowed, but cross-package
 * Capabilities→Domain (4→3) is FORBIDDEN intentionally to enforce isolation via @repo/contracts/Supporting
 * instead of direct coupling. Services use @repo/contracts instead.
 * Intra-module same bounded context skip: e.g., packages/modules/src/identity/application/ports/index
 * importing ../domain/types is SKIPPED because same BC should be allowed — otherwise layered check would flag
 * same-module domain<->application incorrectly. This skip avoids false positives for modules that co-locate
 * domain & application in one bounded context.
 * Full rationale, diagram, violation examples: docs/ARCHITECTURE.md GhostInit Layered Architecture section.
 */

import { dirname, resolve } from "node:path";
import type { ArchitectureFinding, LayerInfo } from "../types.js";
import { isFrameworkEntryPoint, normalizePath } from "../utils.js";
import { isVendorDirectImport } from "./vendor.js";

export function getLayerFromFilePath(p: string): LayerInfo | null {
  const file = p.replace(/\\/g, "/");

  if (isFrameworkEntryPoint(file)) return null;

  if (
    file.includes("/billing/providers/") ||
    file.includes("/billing/src/providers/") ||
    file.includes("packages/billing/src/providers") ||
    file.includes("billing/providers")
  ) {
    return { level: 5, name: "Vendors" };
  }
  if (file.includes("/vendors/") && !file.includes("/node_modules/")) {
    return { level: 5, name: "Vendors" };
  }

  if (file.includes("apps/api/") || file.includes("/apps/api/") || file.includes("apps/api/src")) {
    return { level: 2, name: "Transport" };
  }
  if (file.includes("packages/api/") || file.includes("/packages/api/")) {
    return { level: 2, name: "Transport" };
  }
  if (
    file.includes("src/routes/api") ||
    file.includes("/routes/api/") ||
    file.includes("apps/web/src/routes/api")
  ) {
    return { level: 2, name: "Transport" };
  }
  if (
    file.includes("apps/web/src/lib/orpc") ||
    file.includes("apps/web/src/app/rpc") ||
    file.includes("apps/web/src/app/api") ||
    file.includes("apps/web/src/trpc") ||
    (file.includes("apps/web/") && file.includes("/transport/"))
  ) {
    return { level: 2, name: "Transport" };
  }
  if (
    file.includes("/api/") &&
    (file.includes("src/routes") || file.includes("apps/web/src/routes"))
  ) {
    return { level: 2, name: "Transport" };
  }

  if (
    file.includes("apps/mobile/src/") ||
    file.includes("apps/mobile/app/") ||
    file.includes("apps/mobile/") ||
    file.includes("/apps/mobile/") ||
    file.startsWith("apps/mobile")
  ) {
    return { level: 1, name: "UI" };
  }
  if (
    file.includes("apps/desktop/src/") ||
    file.includes("apps/desktop/") ||
    file.includes("/apps/desktop/") ||
    file.startsWith("apps/desktop") ||
    file.includes("src/renderer/") ||
    file.includes("src/main.ts") ||
    file.includes("src/preload.ts")
  ) {
    return { level: 1, name: "UI" };
  }

  if (
    file.includes("apps/web/src/routes") ||
    file.includes("apps/web/src/components") ||
    file.includes("apps/web/") ||
    file.includes("apps/web")
  ) {
    return { level: 1, name: "UI" };
  }
  if (file.includes("src/routes") || file.includes("/src/routes/")) {
    return { level: 1, name: "UI" };
  }

  if (file.includes("/domain/")) return { level: 3, name: "Domain" };
  if (file.includes("packages/core/") || file.includes("/packages/core/")) {
    return { level: 3, name: "Domain" };
  }

  if (
    file.includes("packages/services/") ||
    file.includes("/packages/services/") ||
    file.includes("src/server/services/") ||
    file.includes("server/services/")
  ) {
    return { level: 4, name: "Capabilities" };
  }
  if (file.includes("packages/billing/") && !file.includes("/providers/")) {
    return { level: 4, name: "Capabilities" };
  }
  if (file.includes("packages/email/")) return { level: 4, name: "Capabilities" };
  if (file.includes("/application/")) return { level: 4, name: "Capabilities" };
  if (file.includes("/modules/src/")) return { level: 4, name: "Capabilities" };

  if (
    file.includes("packages/database/") ||
    file.includes("packages/config/") ||
    file.includes("packages/kernel/") ||
    file.includes("packages/observability/") ||
    file.includes("packages/contracts/") ||
    file.includes("packages/shared/") ||
    file.includes("packages/ui/") ||
    file.includes("packages/typescript-config/") ||
    file.includes("tooling/") ||
    file.includes("tooling/architecture/")
  ) {
    return { level: 6, name: "Supporting" };
  }

  return null;
}

export function getLayerFromImport(imp: string, resolvedPath?: string): LayerInfo | null {
  if (resolvedPath) {
    const layer = getLayerFromFilePath(resolvedPath);
    if (layer) return layer;
  }

  const normalized = imp.replace(/\\/g, "/");

  if (isVendorDirectImport(normalized)) return { level: 5, name: "Vendors" };

  if (normalized.startsWith("@repo/api")) return { level: 2, name: "Transport" };
  if (normalized.startsWith("@repo/contracts")) return { level: 6, name: "Supporting" };
  if (normalized.startsWith("@repo/database")) return { level: 6, name: "Supporting" };
  if (normalized.startsWith("@repo/config")) return { level: 6, name: "Supporting" };
  if (normalized.startsWith("@repo/kernel")) return { level: 6, name: "Supporting" };
  if (normalized.startsWith("@repo/observability")) return { level: 6, name: "Supporting" };
  if (normalized.startsWith("@repo/ui")) return { level: 6, name: "Supporting" };
  if (normalized.startsWith("@repo/shared")) return { level: 6, name: "Supporting" };

  if (normalized.startsWith("@repo/billing")) {
    if (normalized.includes("/providers") || normalized.includes("providers")) {
      return { level: 5, name: "Vendors" };
    }
    return { level: 4, name: "Capabilities" };
  }
  if (normalized.startsWith("@repo/services")) return { level: 4, name: "Capabilities" };
  if (normalized.startsWith("@repo/email")) return { level: 4, name: "Capabilities" };

  if (normalized.startsWith("@repo/modules")) {
    if (normalized.includes("/domain")) return { level: 3, name: "Domain" };
    if (normalized.includes("/application")) return { level: 4, name: "Capabilities" };
    return { level: 3, name: "Domain" };
  }

  if (normalized.includes("/domain/")) return { level: 3, name: "Domain" };
  if (normalized.includes("/application/")) return { level: 4, name: "Capabilities" };
  if (normalized.includes("/providers/") || normalized.includes("billing/providers"))
    return { level: 5, name: "Vendors" };

  if (
    normalized.includes("apps/api") ||
    normalized.includes("packages/api") ||
    normalized.includes("src/routes/api") ||
    normalized.includes("/routes/api") ||
    (normalized.includes("/api/") &&
      (normalized.includes("src/routes") || normalized.includes("apps/web")))
  ) {
    return { level: 2, name: "Transport" };
  }
  if (normalized.includes("/api/") && normalized.includes("routes")) {
    return { level: 2, name: "Transport" };
  }
  if (
    normalized.includes("apps/web") ||
    normalized.includes("src/routes") ||
    normalized.includes("/routes/")
  )
    return { level: 1, name: "UI" };
  if (
    normalized.includes("packages/database") ||
    normalized.includes("packages/config") ||
    normalized.includes("packages/kernel")
  ) {
    return { level: 6, name: "Supporting" };
  }

  return null;
}

export function checkLayeredDependency(
  findings: ArchitectureFinding[],
  file: string,
  absFile: string,
  imp: string,
): void {
  const sourceLayer = getLayerFromFilePath(file);
  if (!sourceLayer) return;

  let targetLayer: LayerInfo | null = null;
  let resolvedNormalized: string | undefined;

  if (imp.startsWith(".")) {
    try {
      const resolved = resolve(dirname(absFile), imp);
      resolvedNormalized = normalizePath(resolved);
      targetLayer =
        getLayerFromFilePath(resolvedNormalized) || getLayerFromImport(imp, resolvedNormalized);
    } catch {
      targetLayer = getLayerFromImport(imp);
    }
  } else {
    targetLayer = getLayerFromImport(imp);
  }

  if (!targetLayer) return;

  const normalized = imp.replace(/\\/g, "/");

  // Strict desktop frontend isolation: desktop must not import Capabilities/Domain directly — must go through Transport (oRPC)
  // This enforces desktop as pure frontend that only uses @repo/api + Supporting, like mobile
  // Web is intentionally not strict here (legacy allows some direct imports), desktop is stricter
  if (
    sourceLayer.level === 1 &&
    (targetLayer.level === 3 || targetLayer.level === 4) &&
    (imp.startsWith("@repo/services") ||
      imp.startsWith("@repo/database") ||
      imp.startsWith("@repo/modules") ||
      imp.startsWith("@repo/email") ||
      imp.startsWith("@repo/billing") ||
      imp.includes("packages/services") ||
      imp.includes("packages/database") ||
      imp.includes("packages/modules") ||
      imp.includes("packages/email") ||
      imp.includes("packages/billing") ||
      normalized.includes("/domain/") ||
      normalized.includes("/application/"))
  ) {
    const isDesktopUi =
      file.includes("apps/desktop") ||
      file.includes("src/renderer") ||
      file.includes("src/main.ts") ||
      file.includes("src/preload.ts");
    if (isDesktopUi) {
      findings.push({
        id: "ui-imports-capabilities",
        severity: "HIGH",
        message: `UI layer (${file}) must not import Capabilities/Domain directly: ${imp} — use oRPC via @repo/api (Transport) instead`,
        file,
        rule: "ui-capabilities-isolation",
      });
      return;
    }
  }

  // Strict desktop isolation: desktop even stricter — also forbid direct Vendors import (must via api)
  if (
    file.includes("apps/desktop") &&
    (targetLayer.level === 5 || isVendorDirectImport(imp)) &&
    !file.includes("/api/") &&
    !file.includes("src/main.ts") // main can import electron, but not billing vendors directly
  ) {
    // Allow electron, vite, but not billing vendors
    if (
      imp.startsWith("stripe") ||
      imp.startsWith("@chargily") ||
      imp.startsWith("@paddle") ||
      imp.startsWith("@polar")
    ) {
      findings.push({
        id: "desktop-imports-vendor",
        severity: "HIGH",
        message: `Desktop UI must not import billing vendor directly: ${imp} — must go via @repo/billing Capabilities → Vendors`,
        file,
        rule: "desktop-vendor-isolation",
      });
      return;
    }
  }

  if (resolvedNormalized) {
    const srcModMatch = /\/modules\/src\/([a-z0-9-]+)\//.exec(file);
    const targetModMatch = /\/modules\/src\/([a-z0-9-]+)\//.exec(resolvedNormalized);
    if (srcModMatch && targetModMatch && srcModMatch[1] === targetModMatch[1]) {
      return;
    }
    const srcModRoot = /\/modules\/src\/([a-z0-9-]+)(?:\/|$)/.exec(file);
    const targetIsDomainInSameModule =
      file.includes(`/modules/src/${srcModRoot?.[1]}/`) &&
      resolvedNormalized.includes(`/modules/src/${srcModRoot?.[1]}/`);
    if (srcModRoot && targetIsDomainInSameModule) {
      return;
    }
  }

  if (sourceLayer.level > targetLayer.level) {
    findings.push({
      id: "layered-dependency-violation",
      severity: "HIGH",
      message: `Layer violation: ${sourceLayer.name} (level ${sourceLayer.level}) imports ${targetLayer.name} (level ${targetLayer.level}) upward: ${imp} in ${file} - allowed flow UI(1)->Transport(2)->Domain(3)->Capabilities(4)->Vendors(5)->Supporting(6) no upward`,
      file,
      rule: "layered-dependency",
    });
  }
}

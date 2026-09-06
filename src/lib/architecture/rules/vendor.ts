/**
 * Vendor isolation: UI (apps/web) must not import billing vendor SDKs directly.
 * Exception: API routes (app/api, routes/api) are server-side and allowed.
 */

import type { ArchitectureFinding } from "../types.js";
import { getBasePackage } from "../utils.js";

const FEATURE_REMOTE_PACKAGES = new Set([
  "@apollo/client",
  "@tanstack/react-query",
  "axios",
  "better-auth",
  "convex",
  "graphql-request",
  "got",
  "ky",
  "swr",
  "undici",
  "urql",
]);

/** The reviewed browser-only Paddle transport seam, never a feature/vendor bypass. */
export function isPaddleBrowserAdapterFile(file: string): boolean {
  return /^(?:apps\/web\/)?src\/adapters\/billing\/paddle\.[cm]?[jt]s$/.test(
    file.replace(/\\/g, "/").replace(/^\/+/, ""),
  );
}

/** A generated feature is presentation code, regardless of the app or framework. */
export function isFeatureFile(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  if (/(?:^|\/)(?:packages|tooling)\/[^/]+\/src\/features(?:\/|$)/.test(normalized)) {
    return false;
  }
  return /(?:^|\/)(?:apps\/[^/]+\/)?src\/features\/[^/]+(?:\/|$)/.test(normalized);
}

/** Components are the prop-driven/presentational edge of a generated feature. */
export function isFeatureComponentFile(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  return isFeatureFile(normalized) && /(?:^|\/)src\/features\/[^/]+\/components\//.test(normalized);
}

/** Only these feature-root modules own remote-state adapter imports. */
export function isFeatureDataAdapterFile(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  return (
    isFeatureFile(normalized) &&
    /(?:^|\/)src\/features\/[^/]+\/(?:queries|mutations)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

export function isFeatureRemoteAdapterImport(imp: string): boolean {
  const normalized = imp.replace(/\\/g, "/");
  const base = getBasePackage(normalized);
  return (
    FEATURE_REMOTE_PACKAGES.has(base) ||
    normalized.startsWith("@orpc/") ||
    /(?:^|\/)lib\/(?:orpc|auth-client)(?:\.[cm]?[jt]sx?)?$/.test(normalized) ||
    normalized.includes("convex/_generated/api")
  );
}

export function isVendorDirectImport(imp: string): boolean {
  const normalized = imp.replace(/\\/g, "/");
  // Check provider paths before local-alias exclusions. Otherwise an import such as
  // `@/server/billing/providers/stripe` would evade the boundary solely by using an alias.
  if (normalized.includes("/billing/providers/") || normalized.includes("billing/providers")) {
    return true;
  }
  if (normalized.includes("@repo/billing") && normalized.includes("providers")) return true;

  if (
    imp.startsWith(".") ||
    imp.startsWith("@/") ||
    imp.startsWith("~/") ||
    imp.startsWith("@repo/ui")
  ) {
    return false;
  }

  const base = getBasePackage(imp);
  if (base === "stripe" || imp === "stripe" || imp.startsWith("stripe/")) return true;
  if (imp.startsWith("@chargily") || base.startsWith("@chargily")) return true;
  if (imp.startsWith("@paddle") || base.startsWith("@paddle")) return true;
  if (imp.startsWith("@polar-sh") || base.startsWith("@polar-sh")) return true;
  return false;
}

export function checkVendorIsolation(
  findings: ArchitectureFinding[],
  file: string,
  imp: string,
): void {
  const normalizedFile = file.replace(/\\/g, "/");
  if (isPaddleBrowserAdapterFile(normalizedFile) && imp === "@paddle/paddle-js") return;
  // Electron main/preload are legit Vendors consumers (electron, electron-updater, electron-store)
  // They live at apps/desktop/src/main.ts / preload.ts and are allowed to import electron family.
  // Only desktop renderer + web UI are restricted from direct vendor SDKs.
  const isDesktopMainOrPreload =
    file.includes("apps/desktop/src/main.ts") ||
    file.includes("apps/desktop/src/preload.ts") ||
    (file.endsWith("/src/main.ts") && file.includes("desktop")) ||
    (file.endsWith("/src/preload.ts") && file.includes("desktop"));
  if (isDesktopMainOrPreload) {
    const base = getBasePackage(imp);
    if (
      imp === "electron" ||
      imp.startsWith("electron/") ||
      base === "electron" ||
      imp === "electron-updater" ||
      imp.startsWith("electron-updater") ||
      base === "electron-updater" ||
      imp === "electron-store" ||
      imp.startsWith("electron-store") ||
      base === "electron-store" ||
      imp.startsWith("electron-vite")
    ) {
      return;
    }
  }
  // TanStack's route files are deliberately thin. Raw-body verification lives
  // in this exact server-only HTTP transport tree, where provider SDKs are the
  // boundary implementation rather than UI dependencies.
  if (
    /(?:^|\/)(?:apps\/web\/)?src\/server\/http\/webhooks\/[^/]+\.server\.[cm]?[jt]s$/.test(
      normalizedFile,
    )
  ) {
    return;
  }
  const isWebUI =
    isFeatureFile(file) ||
    file.includes("apps/web") ||
    file.includes("apps/desktop") ||
    file.includes("apps/mobile") ||
    file.includes("src/routes") ||
    file.includes("src/renderer") ||
    file.includes("apps/web/src/routes");
  if (!isWebUI) return;
  if (
    file.includes("/app/api/") ||
    file.includes("src/app/api/") ||
    file.includes("src/routes/api") ||
    file.includes("/routes/api/") ||
    file.includes("apps/web/src/routes/api")
  )
    return;
  if (!isVendorDirectImport(imp)) return;

  findings.push({
    id: "ui-imports-vendor",
    severity: "HIGH",
    message: `UI layer imports vendor directly: ${imp} - use the typed transport or an application-owned adapter instead`,
    file,
    rule: "vendor-isolation",
  });
}

/**
 * Vendor isolation: UI (apps/web) must not import billing vendor SDKs directly.
 * Exception: API routes (app/api, routes/api) are server-side and allowed.
 */

import type { ArchitectureFinding } from "../types.js";
import { getBasePackage, isFrameworkEntryPoint } from "../utils.js";

export function isVendorDirectImport(imp: string): boolean {
  if (
    imp.startsWith(".") ||
    imp.startsWith("@/") ||
    imp.startsWith("~/") ||
    imp.startsWith("@repo/ui")
  ) {
    return false;
  }
  if (imp.includes("/billing/providers/") || imp.includes("billing/providers")) return true;
  if (imp.includes("@repo/billing") && imp.includes("providers")) return true;

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
  if (isFrameworkEntryPoint(file)) return;
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
  const isWebUI =
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
    message: `UI layer (apps/web) imports vendor directly: ${imp} - must go via Capabilities (@repo/services / @repo/billing) not directly`,
    file,
    rule: "vendor-isolation",
  });
}

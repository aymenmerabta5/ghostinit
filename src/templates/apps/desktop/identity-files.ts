import { desktopSettingsFeatureFiles } from "../fragments/settings/native-desktop.js";
import { file, type TemplateFile } from "../../shared.js";
import { desktopFullSettingsRouteContent } from "../fragments/identity-workspace/index.js";
import { desktopAuthContent } from "./clients.js";
import { identityPureClientFiles } from "../fragments/auth/client-validation.js";
import { desktopWorkspaceFeatureFiles } from "../fragments/identity-workspace/native-workspace.js";
import type { DesktopCapabilities } from "./model.js";
import { desktopAuthFeatureFiles } from "../fragments/auth/native.js";
import { desktopRouteDashboardContent, desktopDashboardFeatureFiles } from "./routes/dashboard.js";
import { desktopRouteSettingsContent } from "./routes/settings.js";
import { desktopUseAuthContent } from "./shell/index.js";

export function desktopIdentityFiles(capabilities: DesktopCapabilities): TemplateFile[] {
  const hasConvexAuth = capabilities.hasAuth && capabilities.isConvex;
  const files: TemplateFile[] = [];
  if (capabilities.hasAuth) {
    files.push(
      ...identityPureClientFiles("apps/desktop/src/renderer"),
      ...desktopSettingsFeatureFiles(
        "monorepo",
        capabilities.hasApi,
        capabilities.hasEmail,
        capabilities.hasI18n,
        capabilities.hasBilling,
      ),
      file(
        "apps/desktop/src/renderer/lib/auth.ts",
        desktopAuthContent(hasConvexAuth, capabilities.hasAdmin, "monorepo", capabilities.hasEmail),
      ),
      file("apps/desktop/src/renderer/hooks/useAuth.ts", desktopUseAuthContent()),
      ...desktopDashboardFeatureFiles(capabilities, "monorepo"),
      file(
        "apps/desktop/src/renderer/routes/dashboard.tsx",
        desktopRouteDashboardContent(capabilities, "monorepo"),
      ),
      file(
        "apps/desktop/src/renderer/routes/settings.tsx",
        capabilities.hasApi
          ? desktopFullSettingsRouteContent("monorepo", capabilities.hasI18n, capabilities.hasEmail)
          : desktopRouteSettingsContent(
              capabilities.hasBilling,
              capabilities.hasEmail,
              capabilities.hasI18n,
              "monorepo",
            ),
      ),
      ...desktopAuthFeatureFiles("monorepo", capabilities.hasEmail, capabilities.hasI18n),
    );
    if (capabilities.hasApi) {
      files.push(...desktopWorkspaceFeatureFiles("monorepo", capabilities.hasI18n));
    }
  }
  return files;
}

import { file, type TemplateFile } from "../../shared.js";
import {
  desktopEmailFlowFiles,
  desktopFullSettingsRouteContent,
  desktopWorkspaceRouteContent,
} from "../fragments/identity-workspace/index.js";
import { desktopAuthContent } from "./clients.js";
import type { DesktopCapabilities } from "./model.js";
import { desktopRouteSignInContent, desktopRouteSignUpContent } from "./routes/credentials.js";
import { desktopRouteDashboardContent } from "./routes/dashboard.js";
import {
  desktopRouteForgotPasswordContent,
  desktopRouteResetPasswordContent,
} from "./routes/recovery.js";
import { desktopRouteSettingsContent } from "./routes/settings.js";
import { desktopRouteTwoFactorContent } from "./routes/two-factor.js";
import { desktopUseAuthContent } from "./shell/index.js";

export function desktopIdentityFiles(capabilities: DesktopCapabilities): TemplateFile[] {
  const hasConvexAuth = capabilities.hasAuth && capabilities.isConvex;
  const files: TemplateFile[] = [];
  if (capabilities.hasAuth) {
    files.push(
      file(
        "apps/desktop/src/renderer/lib/auth.ts",
        desktopAuthContent(hasConvexAuth, capabilities.hasAdmin, "monorepo", capabilities.hasEmail),
      ),
      file("apps/desktop/src/renderer/hooks/useAuth.ts", desktopUseAuthContent()),
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
      file(
        "apps/desktop/src/renderer/routes/sign-in.tsx",
        desktopRouteSignInContent(capabilities.hasEmail, capabilities.hasI18n, "monorepo"),
      ),
      file(
        "apps/desktop/src/renderer/routes/sign-up.tsx",
        desktopRouteSignUpContent(capabilities.hasI18n, "monorepo", capabilities.hasEmail),
      ),
    );
    if (capabilities.hasEmail) {
      files.push(
        file(
          "apps/desktop/src/renderer/routes/2fa.tsx",
          desktopRouteTwoFactorContent(capabilities.hasI18n, "monorepo"),
        ),
      );
    }
    if (capabilities.hasEmail) {
      files.push(
        file(
          "apps/desktop/src/renderer/routes/forgot-password.tsx",
          desktopRouteForgotPasswordContent(capabilities.hasI18n, "monorepo"),
        ),
        file(
          "apps/desktop/src/renderer/routes/reset-password.tsx",
          desktopRouteResetPasswordContent(capabilities.hasI18n, "monorepo"),
        ),
        ...desktopEmailFlowFiles("monorepo", capabilities.hasI18n),
      );
    }
    if (capabilities.hasApi) {
      files.push(
        file(
          "apps/desktop/src/renderer/routes/workspace.tsx",
          desktopWorkspaceRouteContent("monorepo", capabilities.hasI18n),
        ),
      );
    }
  }
  return files;
}

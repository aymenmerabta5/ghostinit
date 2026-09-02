import type { AddonInstallerMap } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { desktopAnalyticsFile } from "../fragments/desktop-analytics.js";
import {
  desktopEmailFlowFiles,
  desktopFullSettingsRouteContent,
  desktopWorkspaceRouteContent,
} from "../fragments/identity-workspace/index.js";
import {
  desktopEveFiles,
  eveProtocolAcceptanceFile,
  eveProtocolFile,
} from "../fragments/eve/index.js";
import { platformI18nFiles } from "../fragments/platform-i18n.js";
import { desktopAuthContent, desktopQueryClientContent } from "./clients.js";
import { desktopApiTransportContent, desktopRendererFetchContent } from "./api-transport.js";
import { desktopUiChatFiles } from "./ui/chat.js";
import { desktopMainContent } from "./main.js";
import { resolveDesktopBillingProviders, resolveDesktopCapabilities } from "./model.js";
import { desktopOrpcContent } from "./orpc.js";
import { desktopPackageJsonContent, desktopSmokeTestContent } from "./package.js";
import { desktopPreloadContent } from "./preload.js";
import { desktopRuntimeConfigContent } from "./runtime-config.js";
import { desktopRouteAdminContent } from "./routes/admin-overview.js";
import {
  desktopRouteAdminCreateUserContent,
  desktopRouteAdminUsersContent,
} from "./routes/admin-users.js";
import { desktopRouteBillingContent } from "./routes/billing.js";
import { desktopRouteSignInContent, desktopRouteSignUpContent } from "./routes/credentials.js";
import { desktopRouteDashboardContent } from "./routes/dashboard.js";
import {
  desktopRouteForgotPasswordContent,
  desktopRouteResetPasswordContent,
} from "./routes/recovery.js";
import { desktopRouteTreeGenContent } from "./routes/route-tree.js";
import { desktopRouteSettingsContent } from "./routes/settings.js";
import { desktopRouteTwoFactorContent } from "./routes/two-factor.js";
import {
  desktopProvidersContent,
  desktopRendererCssContent,
  desktopRendererHtmlContent,
  desktopRendererMainContent,
  desktopRouteIndexContent,
  desktopRouteRootContent,
  desktopUseAuthContent,
} from "./shell/index.js";
import {
  desktopThemeProviderContent,
  desktopThemeToggleContent,
  desktopUiAlertContent,
  desktopUiBadgeContent,
  desktopUiButtonContent,
  desktopUiCardContent,
  desktopUiEmptyContent,
  desktopUiFieldContent,
  desktopUiInputContent,
  desktopUiLabelContent,
  desktopUiSelectContent,
  desktopUiSeparatorContent,
  desktopUiSkeletonContent,
  desktopUiTextareaContent,
} from "./ui/index.js";
import {
  desktopElectronBuilderYmlContent,
  desktopGitignoreContent,
  desktopPackagingReadmeContent,
  desktopRouterConfigContent,
  desktopTsconfigContent,
  desktopViteConfigContent,
} from "./tooling.js";

export function desktopCoreFiles(
  runtime: "node" | "bun" = "bun",
  addons?: AddonInstallerMap,
): TemplateFile[] {
  const projectNamePlaceholder = "__PROJECT_NAME__";
  const capabilities = resolveDesktopCapabilities(addons, [], true);
  const selectedBilling = resolveDesktopBillingProviders(addons);
  const hasConvexAuth = capabilities.hasAuth && capabilities.isConvex;
  const rpcPath = "/api/rpc";
  const files: TemplateFile[] = [
    file("apps/desktop/package.json", desktopPackageJsonContent(runtime, addons, "monorepo")),
    file("apps/desktop/tests/smoke.test.ts", desktopSmokeTestContent()),
    file("apps/desktop/tsr.config.json", desktopRouterConfigContent()),
    file("apps/desktop/electron.vite.config.ts", desktopViteConfigContent()),
    file("apps/desktop/tsconfig.json", desktopTsconfigContent()),
    file("apps/desktop/.gitignore", desktopGitignoreContent()),
    file("apps/desktop/PACKAGING.md", desktopPackagingReadmeContent("monorepo")),
    file(
      "apps/desktop/electron-builder.yml",
      desktopElectronBuilderYmlContent(projectNamePlaceholder),
    ),
    file(
      "apps/desktop/src/main.ts",
      desktopMainContent(
        capabilities.hasAuth,
        "monorepo",
        capabilities.hasI18n,
        capabilities.hasEve,
        capabilities.hasApi,
      ),
    ),
    file(
      "apps/desktop/src/server/transport/runtime-config.ts",
      desktopRuntimeConfigContent("monorepo"),
    ),
    file(
      "apps/desktop/src/preload.ts",
      desktopPreloadContent(
        capabilities.hasAuth,
        capabilities.hasI18n,
        capabilities.hasEve,
        capabilities.hasAuth || capabilities.hasApi,
      ),
    ),
    file("apps/desktop/src/renderer/index.html", desktopRendererHtmlContent()),
    file("apps/desktop/src/renderer/main.tsx", desktopRendererMainContent()),
    file("apps/desktop/src/renderer/index.css", desktopRendererCssContent()),
    file("apps/desktop/src/renderer/lib/theme.tsx", desktopThemeProviderContent()),
    file(
      "apps/desktop/src/renderer/lib/providers.tsx",
      desktopProvidersContent(capabilities, "monorepo"),
    ),
    file(
      "apps/desktop/src/renderer/components/theme-toggle.tsx",
      desktopThemeToggleContent(capabilities.hasI18n, "monorepo"),
    ),
    file("apps/desktop/src/renderer/components/ui/button.tsx", desktopUiButtonContent()),
    file("apps/desktop/src/renderer/components/ui/card.tsx", desktopUiCardContent()),
    ...desktopUiChatFiles("monorepo", capabilities.hasI18n),
    file("apps/desktop/src/renderer/components/ui/input.tsx", desktopUiInputContent()),
    file("apps/desktop/src/renderer/components/ui/label.tsx", desktopUiLabelContent()),
    file("apps/desktop/src/renderer/components/ui/field.tsx", desktopUiFieldContent()),
    file("apps/desktop/src/renderer/components/ui/textarea.tsx", desktopUiTextareaContent()),
    file("apps/desktop/src/renderer/components/ui/alert.tsx", desktopUiAlertContent()),
    file("apps/desktop/src/renderer/components/ui/select.tsx", desktopUiSelectContent()),
    file("apps/desktop/src/renderer/components/ui/badge.tsx", desktopUiBadgeContent()),
    file("apps/desktop/src/renderer/components/ui/empty.tsx", desktopUiEmptyContent()),
    file("apps/desktop/src/renderer/components/ui/separator.tsx", desktopUiSeparatorContent()),
    file("apps/desktop/src/renderer/components/ui/skeleton.tsx", desktopUiSkeletonContent()),
    file(
      "apps/desktop/src/renderer/routes/__root.tsx",
      desktopRouteRootContent(capabilities, "monorepo"),
    ),
    file(
      "apps/desktop/src/renderer/routes/index.tsx",
      desktopRouteIndexContent(capabilities, "monorepo"),
    ),
  ];
  if (capabilities.hasAuth || capabilities.hasApi) {
    files.push(
      file(
        "apps/desktop/src/server/transport/api-fetch.ts",
        desktopApiTransportContent("monorepo"),
      ),
      file("apps/desktop/src/renderer/adapters/desktop-fetch.ts", desktopRendererFetchContent()),
    );
  }
  if (capabilities.hasAnalytics) files.push(desktopAnalyticsFile("monorepo"));
  if (capabilities.hasI18n) files.push(...platformI18nFiles("desktop", "monorepo"));
  if (capabilities.hasEve) {
    files.push(
      eveProtocolFile("desktop", "monorepo"),
      ...desktopEveFiles("monorepo", capabilities.hasI18n),
      eveProtocolAcceptanceFile("desktop", "monorepo"),
    );
  }

  if (capabilities.hasApi) {
    files.push(
      file(
        "apps/desktop/src/renderer/lib/orpc.ts",
        desktopOrpcContent(
          "@repo/api",
          "appRouter",
          rpcPath,
          "router",
          capabilities.hasAuth,
          "monorepo",
          capabilities.hasBilling,
        ),
      ),
      file("apps/desktop/src/renderer/lib/query-client.ts", desktopQueryClientContent()),
    );
  }
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
  if (capabilities.hasBilling) {
    files.push(
      file(
        "apps/desktop/src/renderer/routes/billing.tsx",
        desktopRouteBillingContent(selectedBilling, capabilities.hasI18n, "monorepo"),
      ),
    );
  }
  if (capabilities.hasAdmin) {
    files.push(
      file(
        "apps/desktop/src/renderer/routes/admin.tsx",
        desktopRouteAdminContent(hasConvexAuth, "monorepo", capabilities.hasI18n),
      ),
      file(
        "apps/desktop/src/renderer/routes/admin.users.tsx",
        desktopRouteAdminUsersContent(hasConvexAuth, "monorepo", capabilities.hasI18n),
      ),
      file(
        "apps/desktop/src/renderer/routes/admin.users.create.tsx",
        desktopRouteAdminCreateUserContent(hasConvexAuth, "monorepo", capabilities.hasI18n),
      ),
    );
  }
  files.push(
    file("apps/desktop/src/renderer/routeTree.gen.ts", desktopRouteTreeGenContent(capabilities)),
  );
  return files;
}

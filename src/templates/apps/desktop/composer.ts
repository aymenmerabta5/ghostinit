import type { AddonInstallerMap } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { desktopAnalyticsFile } from "../fragments/desktop-analytics.js";
import {
  desktopEveFiles,
  eveProtocolAcceptanceFile,
  eveProtocolFile,
} from "../fragments/eve/index.js";
import { platformI18nFiles } from "../fragments/platform-i18n.js";
import {
  canonicalQueryAuthHookContent,
  queryAuthCacheBoundaryContent,
} from "../fragments/query-auth.js";
import { queryAuthRegressionFile } from "../fragments/query-auth-tests.js";
import { authOwnedEffectFile } from "../fragments/auth-owned-effect.js";
import { authOwnedMutationFile } from "../fragments/auth-owned-mutation.js";
import { desktopQueryClientContent } from "./clients.js";
import { desktopIdentityFiles } from "./identity-files.js";
import { desktopHomeFeatureFiles } from "./shell/home.js";
import { desktopShellFeatureFiles } from "./shell/root.js";
import { desktopApiTransportContent, desktopRendererFetchContent } from "./api-transport.js";
import { desktopUiChatFiles } from "./ui/chat.js";
import { desktopFormFiles, desktopTranslationFiles } from "./ui/form.js";
import { desktopMainContent } from "./main.js";
import { resolveDesktopBillingProviders, resolveDesktopCapabilities } from "./model.js";
import { desktopOrpcContent } from "./orpc.js";
import { desktopPackageJsonContent, desktopSmokeTestContent } from "./package.js";
import { desktopPreloadContent } from "./preload.js";
import { desktopRuntimeConfigContent } from "./runtime-config.js";
import { desktopConvexStorageTransportContent } from "./convex-storage-transport.js";
import { desktopRouteAdminContent } from "./routes/admin-overview.js";
import { desktopAdminFeatureFiles } from "./routes/admin-feature.js";
import {
  desktopRouteAdminCreateUserContent,
  desktopRouteAdminUsersContent,
} from "./routes/admin-users.js";
import { nativeBillingFeatureFiles } from "../fragments/billing/native.js";
import { billingMoneyFile } from "../../billing/ui/money.js";
import { manualDesktopUiFiles } from "../../billing/ui/manual/index.js";
import { desktopRouteTreeGenContent } from "./routes/route-tree.js";
import {
  desktopProvidersContent,
  desktopRendererCssContent,
  desktopRendererHtmlContent,
  desktopRendererMainContent,
  desktopRouteIndexContent,
  desktopRouteRootContent,
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
  const hasConvexStorage = hasConvexAuth && capabilities.hasMessaging;
  const rpcPath = "/api/rpc";
  const files: TemplateFile[] = [
    ...desktopHomeFeatureFiles(capabilities, "monorepo"),
    ...desktopShellFeatureFiles(capabilities, "monorepo"),
    file("apps/desktop/package.json", desktopPackageJsonContent(runtime, addons, "monorepo")),
    file("apps/desktop/tests/smoke.test.ts", desktopSmokeTestContent()),
    file("apps/desktop/tsr.config.json", desktopRouterConfigContent()),
    file(
      "apps/desktop/electron.vite.config.ts",
      desktopViteConfigContent("monorepo", hasConvexAuth),
    ),
    file("apps/desktop/tsconfig.json", desktopTsconfigContent()),
    file("apps/desktop/.gitignore", desktopGitignoreContent()),
    file("apps/desktop/PACKAGING.md", desktopPackagingReadmeContent("monorepo", hasConvexAuth)),
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
        hasConvexAuth,
        hasConvexStorage,
      ),
    ),
    file(
      "apps/desktop/src/server/transport/runtime-config.ts",
      desktopRuntimeConfigContent("monorepo", hasConvexAuth),
    ),
    file(
      "apps/desktop/src/preload.ts",
      desktopPreloadContent(
        capabilities.hasAuth,
        capabilities.hasI18n,
        capabilities.hasEve,
        capabilities.hasAuth || capabilities.hasApi,
        hasConvexAuth,
        hasConvexStorage,
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
  if (hasConvexStorage) {
    files.push(
      file(
        "apps/desktop/src/server/transport/convex-storage.ts",
        desktopConvexStorageTransportContent(),
      ),
    );
  }
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
    if (capabilities.hasAuth) {
      files.push(
        file(
          "apps/desktop/src/renderer/lib/query-auth-boundary.tsx",
          queryAuthCacheBoundaryContent("./auth", "./query-client", {
            rpcImport: "./orpc",
            hookImport: "./query-auth-scope",
            translationsImport: capabilities.hasI18n ? "./i18n" : "",
            nativeTranslations: true,
          }),
        ),
        file(
          "apps/desktop/src/renderer/lib/query-auth-scope.ts",
          canonicalQueryAuthHookContent("./query-client"),
        ),
      );
    }
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
      queryAuthRegressionFile("apps/desktop", "../src/renderer/lib/query-client"),
    );
  }
  if (capabilities.hasAuth && !capabilities.hasApi) {
    files.push(
      file("apps/desktop/src/renderer/lib/query-client.ts", desktopQueryClientContent()),
      file(
        "apps/desktop/src/renderer/lib/query-auth-boundary.tsx",
        queryAuthCacheBoundaryContent("./auth", "./query-client", {
          hasApi: false,
          translationsImport: capabilities.hasI18n ? "./i18n" : "",
          nativeTranslations: true,
        }),
      ),
      queryAuthRegressionFile("apps/desktop", "../src/renderer/lib/query-client"),
    );
  }
  if (!capabilities.hasAuth && !capabilities.hasApi)
    files.push(file("apps/desktop/src/renderer/lib/query-client.ts", desktopQueryClientContent()));
  files.push(...desktopIdentityFiles(capabilities));
  if (capabilities.hasAuth)
    files.push(
      ...desktopFormFiles("apps/desktop/src/renderer"),
      ...desktopTranslationFiles("apps/desktop/src/renderer", capabilities.hasI18n),
    );
  if (
    capabilities.hasAuth ||
    capabilities.hasBilling ||
    capabilities.hasNotifications ||
    capabilities.hasJobs ||
    capabilities.hasStorage ||
    capabilities.hasFeatureFlags ||
    capabilities.hasPdf
  ) {
    files.push(authOwnedEffectFile("apps/desktop/src/renderer"));
    files.push(authOwnedMutationFile("apps/desktop/src/renderer"));
  }
  if (capabilities.hasBilling) {
    files.push(
      ...(selectedBilling.includes("manual")
        ? manualDesktopUiFiles("apps/desktop/src/renderer", capabilities.hasI18n)
        : []),
      billingMoneyFile("apps/desktop/src/renderer"),
      ...nativeBillingFeatureFiles("desktop", "monorepo", selectedBilling, capabilities.hasI18n),
    );
  }
  if (capabilities.hasAdmin) {
    files.push(
      ...desktopAdminFeatureFiles("monorepo", capabilities.hasI18n),
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

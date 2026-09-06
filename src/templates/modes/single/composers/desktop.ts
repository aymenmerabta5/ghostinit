// @allow-long 500: single desktop flat — minimal, reuses desktop-core at root + full routes
import { file, type TemplateFile } from "../../../shared.js";
import {
  hasAddon,
  type BillingProviderName,
  type AddonInstallerMap,
} from "../../../../lib/addons.js";
import type { RootSecrets } from "../../../root.js";
import { desktopUiChatFiles } from "../../../apps/desktop/ui/chat.js";
import { desktopConvexStorageTransportContent } from "../../../apps/desktop/convex-storage-transport.js";
import {
  desktopPackageJsonContent,
  desktopSmokeTestContent,
  desktopRouterConfigContent,
  desktopViteConfigContent,
  desktopMainContent,
  desktopRuntimeConfigContent,
  desktopPreloadContent,
  desktopApiTransportContent,
  desktopRendererFetchContent,
  desktopRendererHtmlContent,
  desktopRendererMainContent,
  desktopRendererCssContent,
  desktopApiContractContent,
  desktopOrpcContent,
  desktopAuthContent,
  desktopQueryClientContent,
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
  desktopProvidersContent,
  desktopUseAuthContent,
  desktopRouteRootContent,
  desktopRouteIndexContent,
  desktopRouteDashboardContent,
  desktopRouteSettingsContent,
  desktopRouteBillingContent,
  desktopRouteAdminContent,
  desktopRouteAdminUsersContent,
  desktopRouteAdminCreateUserContent,
  desktopRouteTwoFactorContent,
  desktopRouteForgotPasswordContent,
  desktopRouteResetPasswordContent,
  desktopRouteSignInContent,
  desktopRouteSignUpContent,
  desktopRouteTreeGenContent,
  desktopElectronBuilderYmlContent,
  desktopPackagingReadmeContent,
  resolveDesktopCapabilities,
  resolveDesktopBillingProviders,
} from "../../../apps/desktop/index.js";
import { filteredEnvExample, filteredEnvLocal } from "../../../shared/env/builders.js";
import { gitignoreSingle, readmeSingle } from "../fragments/docs.js";
import { singleKernelTypesContent } from "../fragments/kernel.js";
import { convexDatabaseFiles } from "../../../database/convex.js";
import { themeCssContent } from "../../../ui/theme.js";
import { singleEnvFiles } from "../fragments/env.js";
import {
  desktopEmailFlowFiles,
  desktopFullSettingsRouteContent,
  desktopWorkspaceRouteContent,
} from "../../../apps/fragments/identity-workspace/index.js";
import { desktopAnalyticsFile } from "../../../apps/fragments/desktop-analytics.js";
import {
  desktopEveFiles,
  eveProtocolAcceptanceFile,
  eveProtocolFile,
} from "../../../apps/fragments/eve/index.js";
import { platformI18nFiles } from "../../../apps/fragments/platform-i18n.js";
import { billingMoneyFile } from "../../../billing/ui/money.js";

function singleDesktopPackageJson(
  projectName: string,
  runtime: "node" | "bun",
  billing: readonly BillingProviderName[],
  addons?: AddonInstallerMap,
): TemplateFile {
  const raw = desktopPackageJsonContent(runtime, addons, "single", billing);
  const parsed = JSON.parse(raw);
  const isConvex = hasAddon(addons, "convex");
  parsed.name = projectName;
  parsed.main = "dist/main.js";
  parsed.scripts = {
    ...parsed.scripts,
    dev: "electron-vite dev",
    build: "electron-vite build && electron-builder --publish never",
    start: "electron-vite preview",
    ...(isConvex ? { "convex:codegen": "convex codegen" } : {}),
  };
  return file("package.json", JSON.stringify(parsed, null, 2) + "\n");
}

export function buildDesktopFiles(
  projectName: string,
  runtime: "node" | "bun",
  _billing: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  secrets: RootSecrets,
  addons?: AddonInstallerMap,
): TemplateFile[] {
  const resolvedCapabilities = resolveDesktopCapabilities(addons, _billing);
  const isNone = hasAddon(addons, "database:none");
  const hasEveClient =
    (hasEve || hasAddon(addons, "eve")) &&
    resolvedCapabilities.hasApi &&
    resolvedCapabilities.hasAuth &&
    !hasAddon(addons, "tanstack-start") &&
    !isNone;
  const capabilities = {
    ...resolvedCapabilities,
    hasEve: hasEveClient,
    hasI18n: hasI18n || hasAddon(addons, "i18n"),
    // Single desktop is frontend-only until a remote backend host contract is
    // implemented; do not render dead Family C routes or navigation.
    hasNotifications: false,
    hasStorage: false,
    hasFeatureFlags: false,
    hasJobs: false,
  };
  const selectedBilling = resolveDesktopBillingProviders(addons, _billing);
  const { isConvex } = capabilities;
  const database = isConvex ? "convex" : isNone ? "none" : "postgres";
  void secrets;
  const hasConvexAuth = capabilities.hasAuth && isConvex;
  const hasConvexStorage = hasConvexAuth && capabilities.hasMessaging;
  const rpcPath = "/api/rpc";
  const convexFiles =
    isConvex && capabilities.hasAuth
      ? convexDatabaseFiles(projectName, runtime, "single", {
          auth: capabilities.hasAuth,
          billing: capabilities.hasBilling,
          email: capabilities.hasEmail,
          i18n: capabilities.hasI18n,
          posts: capabilities.hasAuth,
        }).filter(({ path }) => path.startsWith("convex/") || path === "convex.json")
      : [];
  const singleTsconfig = JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        paths: { "@/*": ["./src/*"] },
        types: ["bun-types", "node", "vite/client"],
      },
      include: ["src/**/*", "convex/**/*", "electron.vite.config.ts"],
    },
    null,
    2,
  );
  const files: TemplateFile[] = [
    singleDesktopPackageJson(projectName, runtime, _billing, addons),
    file("tests/smoke.test.ts", desktopSmokeTestContent()),
    file("tsr.config.json", desktopRouterConfigContent()),
    file("electron.vite.config.ts", desktopViteConfigContent("single", hasConvexAuth)),
    file("tsconfig.json", singleTsconfig),
    file("electron-builder.yml", desktopElectronBuilderYmlContent(projectName)),
    file("DESKTOP_PACKAGING.md", desktopPackagingReadmeContent("single", hasConvexAuth)),
    file(
      "src/main.ts",
      desktopMainContent(
        capabilities.hasAuth,
        "single",
        capabilities.hasI18n,
        capabilities.hasEve,
        capabilities.hasApi,
        hasConvexAuth,
        hasConvexStorage,
      ),
    ),
    file(
      "src/server/transport/runtime-config.ts",
      desktopRuntimeConfigContent("single", hasConvexAuth),
    ),
    file(
      "src/preload.ts",
      desktopPreloadContent(
        capabilities.hasAuth,
        capabilities.hasI18n,
        capabilities.hasEve,
        capabilities.hasAuth || capabilities.hasApi,
        hasConvexAuth,
        hasConvexStorage,
      ),
    ),
    file("src/renderer/index.html", desktopRendererHtmlContent()),
    file("src/renderer/main.tsx", desktopRendererMainContent()),
    file("src/renderer/index.css", desktopRendererCssContent("./styles/theme.css")),
    file("src/renderer/styles/theme.css", themeCssContent()),
    file("src/renderer/lib/theme.tsx", desktopThemeProviderContent()),
    file("src/renderer/lib/providers.tsx", desktopProvidersContent(capabilities, "single")),
    file(
      "src/renderer/components/theme-toggle.tsx",
      desktopThemeToggleContent(capabilities.hasI18n, "single"),
    ),
    file("src/components/ui/button.tsx", desktopUiButtonContent("single")),
    file("src/components/ui/card.tsx", desktopUiCardContent("single")),
    ...desktopUiChatFiles("single", capabilities.hasI18n),
    file("src/components/ui/input.tsx", desktopUiInputContent("single")),
    file("src/components/ui/label.tsx", desktopUiLabelContent("single")),
    file("src/components/ui/field.tsx", desktopUiFieldContent("single")),
    file("src/components/ui/textarea.tsx", desktopUiTextareaContent("single")),
    file("src/components/ui/alert.tsx", desktopUiAlertContent("single")),
    file("src/components/ui/select.tsx", desktopUiSelectContent("single")),
    file("src/components/ui/badge.tsx", desktopUiBadgeContent("single")),
    file("src/components/ui/empty.tsx", desktopUiEmptyContent("single")),
    file("src/components/ui/separator.tsx", desktopUiSeparatorContent("single")),
    file("src/components/ui/skeleton.tsx", desktopUiSkeletonContent("single")),
    file("src/renderer/lib/kernel.ts", singleKernelTypesContent()),
    file("src/renderer/routes/__root.tsx", desktopRouteRootContent(capabilities, "single")),
    file("src/renderer/routes/index.tsx", desktopRouteIndexContent(capabilities, "single")),
    ...singleEnvFiles(addons, "desktop", false),
  ];
  if (hasConvexStorage) {
    files.push(
      file("src/server/transport/convex-storage.ts", desktopConvexStorageTransportContent()),
    );
  }
  if (capabilities.hasAuth || capabilities.hasApi) {
    files.push(
      file("src/server/transport/api-fetch.ts", desktopApiTransportContent("single")),
      file("src/renderer/adapters/desktop-fetch.ts", desktopRendererFetchContent()),
    );
  }
  if (capabilities.hasAnalytics) files.push(desktopAnalyticsFile("single"));
  if (capabilities.hasI18n) files.push(...platformI18nFiles("desktop", "single"));
  if (capabilities.hasEve) {
    files.push(
      eveProtocolFile("desktop", "single"),
      ...desktopEveFiles("single", capabilities.hasI18n),
      eveProtocolAcceptanceFile("desktop", "single"),
    );
  }

  if (capabilities.hasApi) {
    files.push(
      file(
        "src/renderer/lib/api-contract.ts",
        desktopApiContractContent(
          capabilities.hasBilling,
          capabilities.hasAuth,
          capabilities.hasAdmin,
          capabilities.hasMessaging,
        ),
      ),
      file(
        "src/renderer/lib/orpc.ts",
        desktopOrpcContent(
          "./api-contract",
          "desktopApiContract",
          rpcPath,
          "contract",
          capabilities.hasAuth,
          "single",
          capabilities.hasBilling,
        ),
      ),
      file("src/renderer/lib/query-client.ts", desktopQueryClientContent()),
    );
  }
  if (capabilities.hasAuth) {
    files.push(
      file(
        "src/renderer/lib/auth.ts",
        desktopAuthContent(hasConvexAuth, capabilities.hasAdmin, "single", capabilities.hasEmail),
      ),
      file("src/renderer/hooks/useAuth.ts", desktopUseAuthContent()),
      file(
        "src/renderer/routes/dashboard.tsx",
        desktopRouteDashboardContent(capabilities, "single"),
      ),
      file(
        "src/renderer/routes/settings.tsx",
        capabilities.hasApi
          ? desktopFullSettingsRouteContent("single", capabilities.hasI18n, capabilities.hasEmail)
          : desktopRouteSettingsContent(
              capabilities.hasBilling,
              capabilities.hasEmail,
              capabilities.hasI18n,
              "single",
            ),
      ),
      file(
        "src/renderer/routes/sign-in.tsx",
        desktopRouteSignInContent(capabilities.hasEmail, capabilities.hasI18n, "single"),
      ),
      file(
        "src/renderer/routes/sign-up.tsx",
        desktopRouteSignUpContent(capabilities.hasI18n, "single", capabilities.hasEmail),
      ),
    );
    if (capabilities.hasEmail) {
      files.push(
        file(
          "src/renderer/routes/2fa.tsx",
          desktopRouteTwoFactorContent(capabilities.hasI18n, "single"),
        ),
      );
    }
    if (capabilities.hasEmail) {
      files.push(
        file(
          "src/renderer/routes/forgot-password.tsx",
          desktopRouteForgotPasswordContent(capabilities.hasI18n, "single"),
        ),
        file(
          "src/renderer/routes/reset-password.tsx",
          desktopRouteResetPasswordContent(capabilities.hasI18n, "single"),
        ),
        ...desktopEmailFlowFiles("single", capabilities.hasI18n),
      );
    }
    if (capabilities.hasApi) {
      files.push(
        file(
          "src/renderer/routes/workspace.tsx",
          desktopWorkspaceRouteContent("single", capabilities.hasI18n),
        ),
      );
    }
  }
  if (capabilities.hasBilling) {
    files.push(
      billingMoneyFile("src/renderer"),
      file(
        "src/renderer/routes/billing.tsx",
        desktopRouteBillingContent(selectedBilling, capabilities.hasI18n, "single"),
      ),
    );
  }
  if (capabilities.hasAdmin) {
    files.push(
      file(
        "src/renderer/routes/admin.tsx",
        desktopRouteAdminContent(hasConvexAuth, "single", capabilities.hasI18n),
      ),
      file(
        "src/renderer/routes/admin.users.tsx",
        desktopRouteAdminUsersContent(hasConvexAuth, "single", capabilities.hasI18n),
      ),
      file(
        "src/renderer/routes/admin.users.create.tsx",
        desktopRouteAdminCreateUserContent(hasConvexAuth, "single", capabilities.hasI18n),
      ),
    );
  }
  files.push(
    file("src/renderer/routeTree.gen.ts", desktopRouteTreeGenContent(capabilities)),
    ...convexFiles,
    filteredEnvExample(projectName, secrets, _billing, true, runtime, "single", database, {
      framework: "tanstack-start",
      hasWeb: false,
      hasMobile: false,
      hasDesktop: true,
    }),
    filteredEnvLocal(projectName, secrets, _billing, runtime, "single", database, {
      framework: "tanstack-start",
      hasWeb: false,
      hasMobile: false,
      hasDesktop: true,
    }),
    gitignoreSingle(),
    readmeSingle(projectName, false, { apps: ["desktop"] }),
  );
  return files;
}

// @allow-long 500: single desktop flat — minimal, reuses desktop-core at root + full routes
import { file, type TemplateFile } from "../../../shared.js";
import type { BillingProviderName, AddonInstallerMap } from "../../../../lib/addons.js";
import type { RootSecrets } from "../../../root.js";
import {
  desktopPackageJsonContent,
  desktopViteConfigContent,
  desktopMainContent,
  desktopPreloadContent,
  desktopRendererHtmlContent,
  desktopRendererMainContent,
  desktopRendererCssContent,
  desktopOrpcContent,
  desktopAuthContent,
  desktopAuthStubContent,
  desktopThemeProviderContent,
  desktopThemeToggleContent,
  desktopProvidersContent,
  desktopUseAuthContent,
  desktopUseAuthStubContent,
  desktopRouteRootContent,
  desktopRouteIndexContent,
  desktopRouteDashboardContent,
  desktopRouteSettingsContent,
  desktopRouteBillingContent,
  desktopRouteAdminContent,
  desktopRouteAdminUsersContent,
  desktopRouteAdminCreateUserContent,
  desktopRouteTreeGenContent,
  desktopElectronBuilderYmlContent,
} from "../../../apps/desktop-core.js";
import { filteredEnvExample, filteredEnvLocal } from "../../../shared/env/builders.js";
import { gitignoreSingle, readmeSingle } from "../fragments/docs.js";

function singleDesktopPackageJson(
  projectName: string,
  runtime: "node" | "bun",
  addons?: AddonInstallerMap,
): TemplateFile {
  const raw = desktopPackageJsonContent(runtime, addons);
  const parsed = JSON.parse(raw);
  parsed.name = projectName;
  parsed.main = "dist/main.js";
  parsed.scripts = {
    ...parsed.scripts,
    dev: "electron-vite dev",
    build: "electron-vite build && electron-builder --publish never",
    start: "electron .",
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
  const database = hasEve ? "postgres" : "postgres";
  void hasI18n;
  void secrets;
  void _billing;
  const hasAuth = Boolean((addons as Record<string, { inUse?: boolean }> | undefined)?.auth?.inUse);
  const authLib = hasAuth ? desktopAuthContent() : desktopAuthStubContent();
  const useAuthHook = hasAuth ? desktopUseAuthContent() : desktopUseAuthStubContent();
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
        baseUrl: ".",
        paths: { "@/*": ["src/renderer/*"] },
        types: ["node"],
      },
      include: ["src/**/*", "electron.vite.config.ts"],
    },
    null,
    2,
  );
  return [
    singleDesktopPackageJson(projectName, runtime, addons),
    file("electron.vite.config.ts", desktopViteConfigContent()),
    file("tsconfig.json", singleTsconfig),
    file("electron-builder.yml", desktopElectronBuilderYmlContent(projectName)),
    file("src/main.ts", desktopMainContent()),
    file("src/preload.ts", desktopPreloadContent()),
    file("src/renderer/index.html", desktopRendererHtmlContent()),
    file("src/renderer/main.tsx", desktopRendererMainContent()),
    file("src/renderer/index.css", desktopRendererCssContent()),
    file("src/renderer/lib/orpc.ts", desktopOrpcContent()),
    file("src/renderer/lib/auth.ts", authLib),
    file("src/renderer/lib/theme.tsx", desktopThemeProviderContent()),
    file("src/renderer/lib/providers.tsx", desktopProvidersContent()),
    file("src/renderer/components/theme-toggle.tsx", desktopThemeToggleContent()),
    file("src/renderer/hooks/useAuth.ts", useAuthHook),
    file("src/renderer/routes/__root.tsx", desktopRouteRootContent()),
    file("src/renderer/routes/index.tsx", desktopRouteIndexContent()),
    file("src/renderer/routes/dashboard.tsx", desktopRouteDashboardContent()),
    file("src/renderer/routes/settings.tsx", desktopRouteSettingsContent()),
    file("src/renderer/routes/billing.tsx", desktopRouteBillingContent()),
    file("src/renderer/routes/admin.tsx", desktopRouteAdminContent()),
    file("src/renderer/routes/admin.users.tsx", desktopRouteAdminUsersContent()),
    file("src/renderer/routes/admin.users.create.tsx", desktopRouteAdminCreateUserContent()),
    file("src/renderer/routeTree.gen.ts", desktopRouteTreeGenContent()),
    filteredEnvExample(projectName, secrets, [], true, runtime, "single", database),
    filteredEnvLocal(projectName, secrets, [], runtime, "single", database),
    gitignoreSingle(),
    readmeSingle(projectName),
  ];
}

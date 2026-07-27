import { file, type TemplateFile } from "../../../shared.js";
import { singleWebUiFiles } from "../../../apps/fragments/web-ui/index.js";
import { adminGuardContent } from "../../../apps/fragments/header.js";
import {
  type BillingProviderName,
  type AddonInstallerMap,
  hasAddon,
} from "../../../../lib/addons.js";
import type { RootSecrets } from "../../../root.js";
import { servicesFiles } from "../../../services.js";
import { billingFiles } from "../../../billing-generator.js";
import { emailFiles } from "../../../email.js";
import { analyticsFiles } from "../../../analytics.js";
import { eveFiles as genEveFiles } from "../../../eve.js";

import { singlePackageJson } from "../package.js";
import { filteredEnvExample, filteredEnvLocal } from "../config.js";
import { singleEnvFile } from "../fragments/env.js";
import { singleNextConfigContent } from "../core/next-config.js";
import { singleGlobalsCss, singlePostCss } from "../core/css.js";
import { singleTsConfigContent } from "../core/next-config.js";
import {
  singleLayout,
  singleNotFoundPage,
  singleErrorPage,
  singleLoadingPage,
} from "../core/layout.js";
import {
  serverDbIndexSingle,
  serverDbIndexSingleConvex,
  serverDbIndexSingleNone,
  serverDbAuthSchemaStub,
  serverObservabilitySingle,
  libUtils,
} from "../server/db.js";
import {
  authClientSingle,
  authClientSingleConvex,
  serverAuthSingle,
  serverAuthSingleConvex,
} from "../server/auth.js";
import { convexDatabaseFiles } from "../../../database/convex.js";
import { singleMarketingPage } from "../pages/marketing.js";
import {
  forgotPasswordPageSingle,
  resetPasswordPageSingle,
  signInPageSingle,
  signUpPageSingle,
} from "../pages/auth.js";
import { singleTwoFactorPageContent, singleAgentPageContent } from "../pages/two-factor.js";
import { dashboardPageSingle } from "../pages/dashboard.js";
import {
  settingsLayoutSingle,
  useSettingsHookSingle,
  settingsProfileCardSingle,
  settingsPasswordCardSingle,
  settingsTwoFactorCardSingle,
  settingsDangerZoneCardSingle,
  settingsPageSingleContent,
} from "../pages/settings.js";
import {
  adminLayoutSingleContent,
  adminDashboardSingleFileContent,
  useAdminUsersHookSingleContent,
  adminUserRowSingleContent,
  adminUsersPageSingleFileContent,
  adminCreateUserPageSingleFileContent,
} from "../pages/admin.js";
import { themeProviderSingleContent, themeToggleSingleContent } from "../components/theme.js";
import { providersSingleContent, providersSingleContentConvex } from "../components/providers.js";
import { headerSingleContent } from "../components/header.js";
import {
  useCopyHookSingleContent,
  useBillingHookSingleContent,
  useAuthHookSingleContent,
} from "../components/hooks.js";
import {
  singleAuthRouteContent,
  singleOrpcRouteContent,
  singleHealthRouteContent,
  singleOpenapiRouteContent,
  singleApiContextContent,
  singleApiHealthProcedureContent,
  singleApiMeProcedureContent,
  singleApiContractContent,
  singleApiRouterContent,
  singleApiIndexContent,
  singleApiOpenapiContent,
  singleOrpcClientContent,
} from "../api/routes.js";
import { gitignoreSingle, readmeSingle } from "../fragments/docs.js";

export function buildNextFiles(
  projectName: string,
  runtime: "node" | "bun",
  effectiveBilling: BillingProviderName[],
  hasEve: boolean,
  secrets: RootSecrets,
  addonMap: AddonInstallerMap,
): TemplateFile[] {
  const isConvex = hasAddon(addonMap, "convex");
  const isNone = hasAddon(addonMap, "none");
  const files: TemplateFile[] = [];
  files.push(
    file(
      "package.json",
      singlePackageJson(projectName, runtime, effectiveBilling, hasEve, false, isConvex),
    ),
  );
  files.push(file("next.config.ts", singleNextConfigContent(hasEve)));
  files.push(file("tsconfig.json", singleTsConfigContent()));
  files.push(file("postcss.config.mjs", singlePostCss()));
  files.push(file("src/app/globals.css", singleGlobalsCss()));
  files.push(file("src/app/layout.tsx", singleLayout()));
  files.push(file("src/app/page.tsx", singleMarketingPage()));
  files.push(file("src/app/forgot-password/page.tsx", forgotPasswordPageSingle()));
  files.push(file("src/app/reset-password/page.tsx", resetPasswordPageSingle()));
  files.push(file("src/app/sign-in/page.tsx", signInPageSingle()));
  files.push(file("src/app/sign-up/page.tsx", signUpPageSingle()));
  files.push(file("src/app/dashboard/page.tsx", dashboardPageSingle()));
  files.push(file("src/app/not-found.tsx", singleNotFoundPage()));
  files.push(file("src/app/error.tsx", singleErrorPage()));
  files.push(file("src/app/loading.tsx", singleLoadingPage()));
  files.push(file("src/app/2fa/page.tsx", singleTwoFactorPageContent()));
  if (hasEve) files.push(file("src/app/agent/page.tsx", singleAgentPageContent()));
  files.push(file("src/app/api/auth/[...all]/route.ts", singleAuthRouteContent()));
  files.push(file("src/app/api/[...path]/route.ts", singleOrpcRouteContent()));
  files.push(file("src/app/api/health/route.ts", singleHealthRouteContent()));
  files.push(file("src/app/api/openapi/route.ts", singleOpenapiRouteContent()));
  files.push(file("src/server/api/context.ts", singleApiContextContent()));
  files.push(file("src/server/api/procedures/health.ts", singleApiHealthProcedureContent()));
  files.push(file("src/server/api/procedures/me.ts", singleApiMeProcedureContent()));
  files.push(file("src/server/api/contract.ts", singleApiContractContent()));
  files.push(file("src/server/api/router.ts", singleApiRouterContent()));
  files.push(file("src/server/api/index.ts", singleApiIndexContent()));
  files.push(file("src/server/api/openapi.ts", singleApiOpenapiContent()));
  files.push(file("src/lib/orpc.ts", singleOrpcClientContent()));
  files.push(file("src/app/settings/layout.tsx", settingsLayoutSingle()));
  files.push(file("src/app/settings/hooks/use-settings.ts", useSettingsHookSingle()));
  files.push(file("src/app/settings/components/profile-card.tsx", settingsProfileCardSingle()));
  files.push(file("src/app/settings/components/password-card.tsx", settingsPasswordCardSingle()));
  files.push(
    file("src/app/settings/components/two-factor-card.tsx", settingsTwoFactorCardSingle()),
  );
  files.push(
    file("src/app/settings/components/danger-zone-card.tsx", settingsDangerZoneCardSingle()),
  );
  files.push(file("src/app/settings/page.tsx", settingsPageSingleContent()));
  files.push(file("src/app/admin/layout.tsx", adminLayoutSingleContent()));
  // src/app/admin/layout.tsx imports @/components/admin-guard; the TanStack single
  // composer already emitted it, the Next.js one did not.
  files.push(file("src/components/admin-guard.tsx", adminGuardContent("next")));
  files.push(file("src/app/admin/page.tsx", adminDashboardSingleFileContent()));
  files.push(
    file("src/app/admin/users/hooks/use-admin-users.ts", useAdminUsersHookSingleContent()),
  );
  files.push(file("src/app/admin/users/components/user-row.tsx", adminUserRowSingleContent()));
  files.push(file("src/app/admin/users/page.tsx", adminUsersPageSingleFileContent()));
  files.push(file("src/app/admin/users/create/page.tsx", adminCreateUserPageSingleFileContent()));
  if (isConvex) {
    files.push(file("src/lib/auth-client.ts", authClientSingleConvex()));
    files.push(file("src/server/auth/index.ts", serverAuthSingleConvex()));
    files.push(file("src/server/db/index.ts", serverDbIndexSingleConvex()));
    // emit convex folder (only convex/* and convex.json) for single mode
    const convexAll = convexDatabaseFiles(projectName, runtime);
    for (const cf of convexAll) {
      if (cf.path.startsWith("convex/") || cf.path === "convex.json") {
        files.push(cf);
      }
    }
  } else if (isNone) {
    files.push(file("src/lib/auth-client.ts", authClientSingle()));
    files.push(file("src/server/auth/index.ts", serverAuthSingle()));
    files.push(file("src/server/db/index.ts", serverDbIndexSingleNone()));
  } else {
    files.push(file("src/lib/auth-client.ts", authClientSingle()));
    files.push(file("src/server/auth/index.ts", serverAuthSingle()));
    files.push(file("src/server/db/index.ts", serverDbIndexSingle()));
    files.push(file("src/server/db/schema/auth.ts", serverDbAuthSchemaStub()));
  }
  files.push(file("src/server/observability/index.ts", serverObservabilitySingle()));
  files.push(file("src/lib/utils.ts", libUtils()));
  // shadcn-style primitives the pages import via @/components/ui/*.
  files.push(...singleWebUiFiles());
  files.push(file("src/components/theme-provider.tsx", themeProviderSingleContent()));
  files.push(file("src/components/theme-toggle.tsx", themeToggleSingleContent()));
  if (isConvex) {
    files.push(file("src/components/providers.tsx", providersSingleContentConvex()));
  } else {
    files.push(file("src/components/providers.tsx", providersSingleContent()));
  }
  files.push(file("src/components/header.tsx", headerSingleContent()));
  files.push(file("src/hooks/use-copy.ts", useCopyHookSingleContent()));
  files.push(file("src/hooks/use-billing.ts", useBillingHookSingleContent()));
  files.push(file("src/hooks/use-auth.ts", useAuthHookSingleContent()));
  files.push(gitignoreSingle());
  files.push(readmeSingle(projectName));
  const dbType = isConvex ? "convex" : isNone ? "none" : "postgres";
  files.push(
    filteredEnvExample(projectName, secrets, effectiveBilling, true, runtime, dbType, {
      framework: "nextjs",
      hasMobile: false,
    }),
  );
  files.push(
    filteredEnvLocal(projectName, secrets, effectiveBilling, runtime, dbType, {
      framework: "nextjs",
      hasMobile: false,
    }),
  );
  files.push(singleEnvFile(addonMap));

  files.push(
    ...(servicesFiles(
      { mode: "single", runtime, addons: addonMap } as {
        mode: "single";
        runtime: "node" | "bun";
        addons: typeof addonMap;
      },
      runtime,
    ) as TemplateFile[]),
  );

  const billingArg =
    effectiveBilling.length > 0
      ? ({ mode: "single" as const, runtime, addons: addonMap } as {
          mode: "single";
          runtime: "node" | "bun";
          addons: typeof addonMap;
        })
      : ({
          mode: "single" as const,
          runtime,
          addons: {
            stripe: { inUse: false },
            chargily: { inUse: false },
            paddle: { inUse: false },
            polar: { inUse: false },
            billing: { inUse: false },
          } as never,
        } as never);

  files.push(...(billingFiles(billingArg, runtime) as TemplateFile[]));
  files.push(
    ...(emailFiles(
      { mode: "single", runtime } as { mode: "single"; runtime: "node" | "bun" },
      runtime,
    ) as TemplateFile[]),
  );
  files.push(
    ...(analyticsFiles(
      { mode: "single", runtime } as { mode: "single"; runtime: "node" | "bun" },
      runtime,
    ) as TemplateFile[]),
  );

  if (hasEve) {
    const eveRaw = genEveFiles(projectName, runtime);
    const eveMapped = eveRaw.map((f) => ({
      path: f.path.replace(/^apps\/eve\//, "agent/"),
      content: f.content,
    }));
    const filtered = eveMapped.filter((f) => f.path !== "agent/tsconfig.json");
    filtered.push(
      file(
        "agent/tsconfig.json",
        JSON.stringify(
          {
            compilerOptions: {
              target: "ES2024",
              module: "ESNext",
              moduleResolution: "bundler",
              lib: ["ES2024"],
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true,
              resolveJsonModule: true,
              types: ["node"],
              paths: { "#*": ["./agent/*"], "#evals/*": ["./evals/*"] },
              outDir: "./dist",
              rootDir: ".",
            },
            include: ["agent/**/*", "lib/**/*"],
            exclude: ["node_modules", "dist", ".eve"],
          },
          null,
          2,
        ) + "\n",
      ),
    );
    files.push(...filtered);
  }

  return files;
}

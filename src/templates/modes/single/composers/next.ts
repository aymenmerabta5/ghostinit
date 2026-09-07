import { uiUtilsContent } from "../../../ui/utils.js";
import { file, type TemplateFile } from "../../../shared.js";
import { transactionalAccountDeletionFile } from "../../../auth-deletion.js";
import { singleWebUiFiles } from "../../../apps/fragments/web-ui/index.js";
import { webLibFiles } from "../../../apps/fragments/web-lib.js";
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
import { i18nFiles } from "../../../i18n.js";
import { surfaceTranslationFiles } from "../../../i18n/surface.js";
import { emailFlowPageContent } from "../../../apps/fragments/recovery/index.js";
import { globalErrorFileContent } from "../../../apps/fragments/layout.js";

import { singlePackageJson } from "../package.js";
import { filteredEnvExample, filteredEnvLocal } from "../config.js";
import { singleEnvFiles } from "../fragments/env.js";
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
  serverDbEmptySchema,
  serverDrizzleConfigSingle,
  serverObservabilitySingle,
} from "../server/db.js";
import {
  authClientSingle,
  authClientSingleConvex,
  serverAuthSingle,
  serverAuthSingleConvex,
} from "../server/auth.js";
import { convexDatabaseFiles } from "../../../database/convex.js";
import { singleKernelTypesContent } from "../fragments/kernel.js";
import {
  singleMarketingClosingContent,
  singleMarketingFeaturesContent,
  singleMarketingHeroContent,
  singleMarketingPage,
} from "../pages/marketing.js";
import {
  authOAuthButtonsSingleContent,
  forgotPasswordPageSingle,
  resetPasswordPageSingle,
  resetPasswordFormSingleContent,
  singleTwoFactorFormContent,
  signInFormSingleContent,
  signInMethodsSingleContent,
  signInPageSingle,
  signUpFormSingleContent,
  signUpPageSingle,
} from "../pages/auth.js";
import { singleTwoFactorPageContent, singleAgentPageContent } from "../pages/two-factor.js";
import { dashboardPageSingle, singleDashboardFeatureFilesNext } from "../pages/dashboard.js";
import {
  settingsLayoutSingle,
  useSettingsHookSingle,
  settingsProfileCardSingle,
  settingsPasswordCardSingle,
  settingsPasskeyCardSingle,
  settingsPasskeyListSingle,
  settingsPasskeyDataSingle,
  settingsPasskeyManagementSingle,
  settingsTwoFactorCardSingle,
  settingsTwoFactorHookSingle,
  settingsSessionsCardSingle,
  settingsSessionsDataSingle,
  settingsSessionsListSingle,
  settingsDangerZoneCardSingle,
  settingsPageSingleContent,
} from "../pages/settings.js";
import { singleNextAdminFeatureFiles } from "../pages/admin.js";
import { webIdentityWorkspaceFiles } from "../../../apps/fragments/identity-workspace/index.js";
import { settingsActionsContent } from "../../../apps/fragments/settings/actions.js";
import { themeProviderSingleContent, themeToggleSingleContent } from "../components/theme.js";
import { workspaceShellFiles } from "../../../apps/fragments/header.js";
import { providersSingleContent, providersSingleContentConvex } from "../components/providers.js";
import {
  headerActionsSingleContent,
  headerSingleContent,
  headerUserMenuSingleContent,
} from "../components/header.js";
import {
  useCopyHookSingleContent,
  useBillingHookSingleContent,
  useAuthHookSingleContent,
} from "../components/hooks.js";
import {
  singleAuthRouteContent,
  singleOrpcRouteContent,
  singleOpenApiOperationsRouteContent,
  singleHealthRouteContent,
  singleOpenapiRouteContent,
  singleOrpcRequestSecurityContent,
  singleApiContextContent,
  singleApiHealthProcedureContent,
  singleApiMeProcedureContent,
  singleApiContractContent,
  singleApiRouterContent,
  singleApiIndexContent,
  singleApiOpenapiContent,
  singleOrpcClientContent,
} from "../api/routes.js";
import {
  singleAdminApiFiles,
  singleApiSupportFiles,
  singleServiceErrorFiles,
} from "../api/admin.js";
import { singleBillingApiFiles } from "../api/billing.js";
import { singleCapabilityApiFiles } from "../api/capabilities.js";
import { gitignoreSingle, readmeSingle } from "../fragments/docs.js";
import { singleEveFiles } from "../eve.js";
import {
  canonicalQueryAuthHookFile,
  queryAuthBoundaryFile,
} from "../../../apps/fragments/query-auth.js";
import { requestOwnedSnapshotFile } from "../../../apps/fragments/request-owned-snapshot.js";

export function buildNextFiles(
  projectName: string,
  runtime: "node" | "bun",
  effectiveBilling: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  hasEmail: boolean,
  hasApi: boolean,
  hasAnalytics: boolean,
  secrets: RootSecrets,
  addonMap: AddonInstallerMap,
): TemplateFile[] {
  const isConvex = hasAddon(addonMap, "convex");
  const isNone = hasAddon(addonMap, "database:none");
  const hasAuth = hasAddon(addonMap, "auth");
  const hasMessaging = hasAddon(addonMap, "messaging");
  const hasJobs = hasAddon(addonMap, "jobs");
  const hasAdminApi = hasApi && hasAuth && !isNone;
  const hasBilling = effectiveBilling.length > 0;
  const hasPdf = hasAddon(addonMap, "pdf");
  const hasCloudflare = hasAddon(addonMap, "cloudflare");
  const apiCapabilities = {
    auth: hasAuth,
    identity: hasApi && hasAuth && !isNone,
    messaging: hasApi && hasMessaging && !isConvex && !isNone,
    notifications: hasApi && hasAddon(addonMap, "notifications"),
    featureFlags: hasApi && (hasAddon(addonMap, "featureFlags") || hasAddon(addonMap, "posthog")),
    jobs: hasApi && hasAuth && hasAddon(addonMap, "jobsApi"),
    storage: hasApi && hasAuth && hasAddon(addonMap, "storage") && !isNone,
  } as const;
  const headerNavigation = {
    eve: hasEve,
    notifications: apiCapabilities.notifications,
    storage: apiCapabilities.storage,
    featureFlags: apiCapabilities.featureFlags,
    jobs: apiCapabilities.jobs,
  } as const;
  const files: TemplateFile[] = [];
  files.push(
    ...surfaceTranslationFiles({ enabled: hasI18n, framework: "next", sourceRoot: "src" }),
  );
  files.push(
    file(
      "package.json",
      singlePackageJson(
        projectName,
        runtime,
        effectiveBilling,
        hasEve,
        hasI18n,
        isConvex,
        hasMessaging,
        hasEmail,
        hasApi,
        hasAnalytics,
        hasJobs,
        hasAuth,
        isNone,
        hasAddon(addonMap, "storage") && !isNone,
        hasCloudflare,
        hasPdf,
      ),
    ),
  );
  files.push(
    file(
      "next.config.ts",
      singleNextConfigContent({
        hasEve,
        hasI18n,
        hasPdf,
        hasCloudflare,
        hasConvex: isConvex,
        billingProviders: effectiveBilling,
      }),
    ),
  );
  files.push(file("tsconfig.json", singleTsConfigContent()));
  files.push(file("postcss.config.mjs", singlePostCss()));
  files.push(file("src/app/globals.css", singleGlobalsCss()));
  files.push(file("src/app/layout.tsx", singleLayout(hasI18n)));
  files.push(file("src/app/page.tsx", singleMarketingPage()));
  const marketingOptions = {
    hasAuth,
    hasApi,
    hasBilling,
    hasEve,
    database: isConvex ? "convex" : isNone ? "none" : "postgres",
  } as const;
  files.push(
    file("src/components/marketing/hero.tsx", singleMarketingHeroContent(marketingOptions)),
  );
  files.push(
    file("src/components/marketing/features.tsx", singleMarketingFeaturesContent(marketingOptions)),
  );
  files.push(
    file("src/components/marketing/closing.tsx", singleMarketingClosingContent(marketingOptions)),
  );
  if (hasAuth && hasEmail) {
    files.push(file("src/app/forgot-password/page.tsx", forgotPasswordPageSingle()));
    files.push(file("src/app/reset-password/page.tsx", resetPasswordPageSingle()));
    files.push(
      file("src/components/auth/reset-password-form.tsx", resetPasswordFormSingleContent()),
    );
    files.push(file("src/app/magic-link/page.tsx", emailFlowPageContent("magic-link", "next")));
    files.push(file("src/app/verify-email/page.tsx", emailFlowPageContent("verify-email", "next")));
  }
  if (hasAuth) {
    files.push(file("src/app/sign-in/page.tsx", signInPageSingle(hasEmail)));
    files.push(file("src/app/sign-up/page.tsx", signUpPageSingle()));
    files.push(file("src/components/auth/oauth-buttons.tsx", authOAuthButtonsSingleContent()));
    files.push(
      file(
        "src/components/auth/sign-in-methods.tsx",
        signInMethodsSingleContent(!isConvex && !isNone),
      ),
    );
    files.push(
      file(
        "src/components/auth/sign-in-form.tsx",
        signInFormSingleContent(hasEmail, !isConvex && !isNone),
      ),
    );
    files.push(file("src/components/auth/sign-up-form.tsx", signUpFormSingleContent(hasEmail)));
    files.push(file("src/app/dashboard/page.tsx", dashboardPageSingle(isConvex)));
    files.push(...singleDashboardFeatureFilesNext(hasBilling, hasApi && !isNone));
  }
  files.push(file("src/app/not-found.tsx", singleNotFoundPage()));
  files.push(file("src/app/error.tsx", singleErrorPage()));
  files.push(file("src/app/global-error.tsx", globalErrorFileContent()));
  files.push(file("src/app/loading.tsx", singleLoadingPage()));
  if (hasAuth && hasEmail) {
    files.push(file("src/app/2fa/page.tsx", singleTwoFactorPageContent()));
    files.push(file("src/components/auth/two-factor-form.tsx", singleTwoFactorFormContent()));
  }
  if (hasEve) files.push(file("src/app/agent/page.tsx", singleAgentPageContent()));
  if (hasAuth) {
    files.push(file("src/app/api/auth/[...all]/route.ts", singleAuthRouteContent(hasCloudflare)));
  }
  if (hasApi) {
    files.push(file("src/app/api/rpc/[...path]/route.ts", singleOrpcRouteContent()));
    files.push(file("src/app/api/[...path]/route.ts", singleOpenApiOperationsRouteContent()));
    files.push(file("src/app/api/health/route.ts", singleHealthRouteContent()));
    files.push(file("src/app/api/openapi/route.ts", singleOpenapiRouteContent()));
    files.push(file("src/server/api/request-security.ts", singleOrpcRequestSecurityContent()));
    files.push(
      file(
        "src/server/api/context.ts",
        singleApiContextContent(isConvex, hasAuth, apiCapabilities),
      ),
    );
    files.push(file("src/server/api/procedures/health.ts", singleApiHealthProcedureContent()));
    if (hasAuth) {
      files.push(file("src/server/api/procedures/me.ts", singleApiMeProcedureContent()));
    }
    files.push(
      file(
        "src/server/api/contract.ts",
        singleApiContractContent(hasAdminApi, hasBilling, apiCapabilities),
      ),
    );
    files.push(
      file(
        "src/server/api/router.ts",
        singleApiRouterContent(hasAdminApi, hasBilling, apiCapabilities),
      ),
    );
    files.push(file("src/server/api/index.ts", singleApiIndexContent(apiCapabilities.messaging)));
    files.push(file("src/server/api/openapi.ts", singleApiOpenapiContent()));
    files.push(file("src/lib/orpc.ts", singleOrpcClientContent()));
    if (hasAuth) files.push(...singleApiSupportFiles());
    else if (apiCapabilities.featureFlags) files.push(...singleServiceErrorFiles());
    files.push(...singleCapabilityApiFiles(apiCapabilities, isConvex ? "convex" : "postgres"));
    if (hasAdminApi) files.push(...singleAdminApiFiles(isConvex ? "convex" : "postgres"));
    if (hasBilling) files.push(...singleBillingApiFiles());
  }
  if (hasAuth) {
    files.push(
      file(
        "src/app/settings/layout.tsx",
        settingsLayoutSingle(hasBilling, apiCapabilities.identity),
      ),
    );
    files.push(file("src/app/settings/hooks/use-settings.ts", useSettingsHookSingle()));
    if (apiCapabilities.identity) {
      files.push(file("src/app/settings/actions.ts", settingsActionsContent("single")));
    }
    files.push(file("src/app/settings/components/profile-card.tsx", settingsProfileCardSingle()));
    if (hasEmail) {
      files.push(
        file("src/app/settings/components/password-card.tsx", settingsPasswordCardSingle()),
        file("src/app/settings/components/two-factor-card.tsx", settingsTwoFactorCardSingle()),
        file(
          "src/app/settings/components/use-two-factor-settings.ts",
          settingsTwoFactorHookSingle(),
        ),
      );
    }
    if (!isConvex && !isNone) {
      files.push(
        file("src/app/settings/components/passkey-card.tsx", settingsPasskeyCardSingle()),
        file("src/app/settings/components/passkey-list.tsx", settingsPasskeyListSingle()),
        file("src/app/settings/passkeys.ts", settingsPasskeyDataSingle()),
        file(
          "src/app/settings/components/use-passkey-management.ts",
          settingsPasskeyManagementSingle(),
        ),
      );
    }
    if (apiCapabilities.identity) {
      files.push(
        file("src/app/settings/components/sessions-card.tsx", settingsSessionsCardSingle()),
        file("src/app/settings/components/session-list.tsx", settingsSessionsListSingle()),
        file("src/app/settings/sessions.ts", settingsSessionsDataSingle(true)),
      );
    }
    files.push(
      file(
        "src/app/settings/components/danger-zone-card.tsx",
        settingsDangerZoneCardSingle(hasEmail),
      ),
    );
    files.push(
      file(
        "src/app/settings/page.tsx",
        settingsPageSingleContent(
          apiCapabilities.identity,
          hasEmail,
          !isConvex && !isNone,
          apiCapabilities.identity,
        ),
      ),
    );
    if (apiCapabilities.identity) {
      files.push(...webIdentityWorkspaceFiles("next", "single", hasI18n));
    }
    if (hasAdminApi) {
      files.push(...singleNextAdminFeatureFiles(isConvex, hasI18n));
    }
  }
  if (isConvex) {
    if (hasAuth) {
      files.push(file("src/lib/auth-client.ts", authClientSingleConvex(hasEmail)));
      files.push(file("src/server/auth/index.ts", serverAuthSingleConvex()));
    }
    files.push(file("src/server/db/index.ts", serverDbIndexSingleConvex()));
    const convexAll = convexDatabaseFiles(projectName, runtime, "single", {
      auth: hasAuth,
      billing: hasBilling,
      email: hasEmail,
      i18n: hasI18n,
      posts: hasAuth,
    });
    for (const cf of convexAll) {
      if (cf.path.startsWith("convex/") || cf.path === "convex.json") {
        files.push(cf);
      }
    }
  } else if (isNone) {
    if (hasAuth) {
      files.push(file("src/lib/auth-client.ts", authClientSingle(hasEmail)));
      files.push(file("src/server/auth/index.ts", serverAuthSingle(hasEmail)));
    }
    files.push(file("src/server/db/index.ts", serverDbIndexSingleNone()));
    files.push(file("src/server/db/schema/auth.ts", serverDbAuthSchemaStub()));
  } else {
    if (hasAuth) {
      files.push(file("src/lib/auth-client.ts", authClientSingle(hasEmail)));
      files.push(file("src/server/auth/index.ts", serverAuthSingle(hasEmail)));
    }
    files.push(file("src/server/db/index.ts", serverDbIndexSingle(hasBilling, hasAuth)));
    if (hasAuth) files.push(file("src/server/db/schema/auth.ts", serverDbAuthSchemaStub()));
    if (!hasAuth && !hasBilling) {
      files.push(file("src/server/db/schema/index.ts", serverDbEmptySchema()));
    }
    files.push(file("drizzle.config.ts", serverDrizzleConfigSingle()));
  }
  if (hasAuth && !isConvex) files.push(transactionalAccountDeletionFile("src/server/auth"));
  files.push(file("src/server/observability/index.ts", serverObservabilitySingle()));
  files.push(file("src/lib/utils.ts", uiUtilsContent()));
  files.push(file("src/lib/kernel.ts", singleKernelTypesContent()));
  files.push(...singleWebUiFiles());
  for (const f of webLibFiles("src", "nextjs")) {
    // These renderers share UI files, so retain each emitted path only once.
    if (
      f.path.startsWith("src/lib/") ||
      f.path.startsWith("src/hooks/") ||
      f.path.startsWith("tests/") ||
      f.path.startsWith("src/components/ui/surface") ||
      f.path.startsWith("src/components/Notification") ||
      f.path.startsWith("src/components/form-fields") ||
      f.path.startsWith("src/components/dialogs")
    ) {
      if (!files.some((existing) => existing.path === f.path)) files.push(f);
    }
  }
  files.push(file("src/components/theme-provider.tsx", themeProviderSingleContent()));
  files.push(file("src/components/theme-toggle.tsx", themeToggleSingleContent()));
  if (hasAuth) files.push(queryAuthBoundaryFile("src", hasApi));
  if (hasAuth && hasApi)
    files.push(canonicalQueryAuthHookFile("src"), requestOwnedSnapshotFile("src"));
  if (isConvex) {
    files.push(
      file(
        "src/components/providers.tsx",
        providersSingleContentConvex(hasAnalytics, hasAuth, hasI18n),
      ),
    );
  } else {
    files.push(
      file("src/components/providers.tsx", providersSingleContent(hasAnalytics, hasI18n, hasAuth)),
    );
  }
  const hasTypedAdminNavigation = hasAdminApi;
  files.push(
    file("src/components/header.tsx", headerSingleContent(hasI18n, hasAuth)),
    ...workspaceShellFiles("next", {
      sourceRoot: "src",
      hasAuth,
      hasBilling,
      hasAdminNavigation: hasTypedAdminNavigation,
      hasPdf,
      hasMessaging,
      navigation: headerNavigation,
    }),
  );
  if (hasAuth) {
    files.push(
      file(
        "src/components/header-actions.tsx",
        headerActionsSingleContent(hasI18n, headerNavigation.notifications),
      ),
    );
    files.push(
      file(
        "src/components/header-user-menu.tsx",
        headerUserMenuSingleContent(
          hasBilling,
          hasTypedAdminNavigation,
          hasMessaging,
          hasPdf,
          headerNavigation,
        ),
      ),
    );
  }
  files.push(file("src/hooks/use-copy.ts", useCopyHookSingleContent()));
  if (hasApi && effectiveBilling.length > 0) {
    files.push(file("src/hooks/use-billing.ts", useBillingHookSingleContent()));
  }
  if (hasAuth) files.push(file("src/hooks/use-auth.ts", useAuthHookSingleContent()));
  files.push(gitignoreSingle());
  files.push(
    readmeSingle(projectName, hasEmail, {
      framework: "nextjs",
      hasEve,
    }),
  );
  const dbType = isConvex ? "convex" : isNone ? "none" : "postgres";
  files.push(
    filteredEnvExample(projectName, secrets, effectiveBilling, hasEmail, runtime, dbType, {
      framework: "nextjs",
      hasEve,
      hasMobile: false,
    }),
  );
  files.push(
    filteredEnvLocal(
      projectName,
      secrets,
      effectiveBilling,
      runtime,
      dbType,
      {
        framework: "nextjs",
        hasEve,
        hasMobile: false,
      },
      hasEmail,
    ),
  );
  files.push(...singleEnvFiles(addonMap, "nextjs", hasEmail));
  if (hasI18n) {
    files.push(...i18nFiles({ mode: "single", runtime, framework: "nextjs", addons: addonMap }));
  }

  files.push(
    ...(servicesFiles(
      { mode: "single", runtime, framework: "nextjs", addons: addonMap } as {
        mode: "single";
        runtime: "node" | "bun";
        framework: "nextjs";
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

  if (hasApi && hasBilling) files.push(...(billingFiles(billingArg, runtime) as TemplateFile[]));
  if (hasEmail) {
    files.push(
      ...(emailFiles({ mode: "single", runtime, i18n: hasI18n }, runtime) as TemplateFile[]),
    );
  }
  if (hasAnalytics) {
    files.push(
      ...(analyticsFiles(
        { mode: "single", runtime, deploy: hasCloudflare ? "cloudflare" : "none" },
        runtime,
      ) as TemplateFile[]),
    );
  }

  if (hasEve) {
    files.push(...singleEveFiles(projectName, runtime, "nextjs", effectiveBilling));
  }

  return files;
}

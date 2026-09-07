// @allow-long 312: single-mode TanStack Start composer; the file list is a linear manifest
import { singleWebUiFiles } from "../../../apps/fragments/web-ui/index.js";
import { tanstackSettingsFeatureFiles } from "../../../apps/fragments/settings/index.js";
import { webIdentityWorkspaceFiles } from "../../../apps/fragments/identity-workspace/index.js";
import { webLibFiles } from "../../../apps/fragments/web-lib.js";
import { file, type TemplateFile } from "../../../shared.js";
import { transactionalAccountDeletionFile } from "../../../auth-deletion.js";
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
import { tanstackServerFoundationFiles } from "../../../apps/fragments/tanstack-server.js";
import { emailFlowPageContent } from "../../../apps/fragments/recovery/index.js";

import { singlePackageJsonTanstack } from "../package.js";
import { convexDatabaseFiles } from "../../../database/convex.js";
import { filteredEnvExample, filteredEnvLocal } from "../config.js";
import { singleEnvFiles } from "../fragments/env.js";
import {
  singleViteConfigTanstackContent,
  singleNitroConfigTanstackContent,
  singleRouterTanstackContent,
  singleGlobalsCssTanstackContent,
  singlePostCssTanstackContent,
  singleTsConfigTanstackContent,
  singleRootRouteTanstackContent,
} from "../tanstack/core.js";
import {
  singleMarketingClosingTanstackContent,
  singleMarketingFeaturesTanstackContent,
  singleMarketingHeroTanstackContent,
  singleMarketingPageTanstackContent,
} from "../tanstack/pages/marketing.js";
import {
  singleAuthOAuthButtonsTanstackContent,
  singleSignInFormTanstackContent,
  singleSignInMethodsTanstackContent,
  singleSignInRouteTanstackContent,
  singleSignUpFormTanstackContent,
  singleSignUpRouteTanstackContent,
  singleForgotPasswordRouteTanstackContent,
  singleResetPasswordRouteTanstackContent,
  singleResetPasswordFormTanstackContent,
  singleTwoFactorFormTanstackContent,
  singleTwoFactorRouteTanstackContent,
} from "../tanstack/pages/auth.js";
import {
  singleDashboardRouteTanstackContent,
  singleDashboardFeatureFilesTanstack,
  singleSettingsRouteTanstackContent,
  singleTanstackBillingFeatureFiles,
  singleNotFoundRouteTanstackContent,
} from "../tanstack/pages/dashboard.js";
import {
  singleAuthApiRouteTanstackContent,
  singleAuthServerHandlerTanstackContent,
  singleOpenApiOperationsRouteTanstackContent,
  singleOpenApiOperationsServerTanstackContent,
  singleRpcApiRouteTanstackContent,
  singleRpcServerHandlerTanstackContent,
  singleHealthApiRouteTanstackContent,
  singleOpenapiApiRouteTanstackContent,
  singleOpenApiServerHandlerTanstackContent,
} from "../tanstack/api.js";
import { singleTanstackAdminFeatureFiles } from "../tanstack/pages/admin.js";
import {
  singleApiContextContent,
  singleApiHealthProcedureContent,
  singleApiMeProcedureContent,
  singleApiContractContent,
  singleApiRouterContent,
  singleApiIndexContent,
  singleApiOpenapiContent,
  singleOrpcRequestSecurityContent,
  singleOrpcClientTanstackContent,
} from "../api/routes.js";
import {
  singleAdminApiFiles,
  singleApiSupportFiles,
  singleServiceErrorFiles,
} from "../api/admin.js";
import { singleBillingApiFiles } from "../api/billing.js";
import { singleCapabilityApiFiles } from "../api/capabilities.js";
import {
  authClientSingle,
  authClientSingleConvex,
  serverAuthTanstackSingle,
  serverAuthTanstackSingleConvex,
} from "../server/auth.js";
import {
  serverDbIndexSingle,
  serverDbIndexSingleConvex,
  serverDbIndexSingleNone,
  serverDbAuthSchemaStub,
  serverDbEmptySchema,
  serverDrizzleConfigSingle,
  serverObservabilitySingle,
  libUtils,
} from "../server/db.js";
import { themeProviderSingleContent, themeToggleSingleContent } from "../components/theme.js";
import {
  singleProvidersTanstackContent,
  singleProvidersTanstackContentConvex,
} from "../components/providers.js";
import {
  singleHeaderActionsTanstackContent,
  singleHeaderTanstackContent,
  singleHeaderUserMenuTanstackContent,
  singleSignOutButtonTanstackContent,
} from "../components/header.js";
import { useCopyHookSingleContent, useAuthHookSingleContent } from "../components/hooks.js";
import { singleKernelTypesContent } from "../fragments/kernel.js";
import { gitignoreSingle, readmeSingle } from "../fragments/docs.js";
import { singleEveFiles } from "../eve.js";

export function buildTanstackFiles(
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
    notifications: apiCapabilities.notifications,
    storage: apiCapabilities.storage,
    featureFlags: apiCapabilities.featureFlags,
    jobs: apiCapabilities.jobs,
  } as const;
  const files: TemplateFile[] = [];
  files.push(
    ...surfaceTranslationFiles({ enabled: hasI18n, framework: "tanstack", sourceRoot: "src" }),
  );
  files.push(
    file(
      "package.json",
      singlePackageJsonTanstack(
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
      ),
    ),
  );
  const hasPostgres = !isConvex && !isNone;
  files.push(
    file(
      "vite.config.ts",
      singleViteConfigTanstackContent(hasMessaging && !isConvex, hasPostgres, hasCloudflare),
    ),
  );
  if (!hasCloudflare) {
    files.push(
      file(
        "nitro.config.ts",
        singleNitroConfigTanstackContent(
          hasMessaging && !isConvex,
          hasAddon(addonMap, "vercel") ? "vercel" : runtime === "node" ? "node-server" : "bun",
          hasEve,
          hasPostgres,
          isConvex,
          effectiveBilling.includes("paddle"),
        ),
      ),
    );
  }
  files.push(file("tsconfig.json", singleTsConfigTanstackContent()));
  files.push(file("postcss.config.mjs", singlePostCssTanstackContent()));
  files.push(file("src/styles/app.css", singleGlobalsCssTanstackContent()));
  files.push(file("src/router.tsx", singleRouterTanstackContent()));
  files.push(file("src/routes/__root.tsx", singleRootRouteTanstackContent(hasI18n)));
  files.push(file("src/routes/index.tsx", singleMarketingPageTanstackContent()));
  const marketingOptions = {
    hasAuth,
    hasApi,
    hasBilling,
    hasEve,
    database: isConvex ? "convex" : isNone ? "none" : "postgres",
  } as const;
  files.push(
    file("src/components/marketing/hero.tsx", singleMarketingHeroTanstackContent(marketingOptions)),
  );
  files.push(
    file(
      "src/components/marketing/features.tsx",
      singleMarketingFeaturesTanstackContent(marketingOptions),
    ),
  );
  files.push(
    file(
      "src/components/marketing/closing.tsx",
      singleMarketingClosingTanstackContent(marketingOptions),
    ),
  );
  if (hasAuth) {
    files.push(file("src/routes/sign-in.tsx", singleSignInRouteTanstackContent(hasEmail)));
    files.push(file("src/routes/sign-up.tsx", singleSignUpRouteTanstackContent()));
    files.push(
      file("src/components/auth/oauth-buttons.tsx", singleAuthOAuthButtonsTanstackContent()),
    );
    files.push(
      file(
        "src/components/auth/sign-in-methods.tsx",
        singleSignInMethodsTanstackContent(hasPostgres),
      ),
    );
    files.push(
      file(
        "src/components/auth/sign-in-form.tsx",
        singleSignInFormTanstackContent(hasEmail, hasPostgres),
      ),
    );
    files.push(
      file("src/components/auth/sign-up-form.tsx", singleSignUpFormTanstackContent(hasEmail)),
    );
  }
  if (hasAuth && hasEmail) {
    files.push(file("src/routes/forgot-password.tsx", singleForgotPasswordRouteTanstackContent()));
    files.push(file("src/routes/reset-password.tsx", singleResetPasswordRouteTanstackContent()));
    files.push(
      file("src/components/auth/reset-password-form.tsx", singleResetPasswordFormTanstackContent()),
    );
    files.push(file("src/routes/magic-link.tsx", emailFlowPageContent("magic-link", "tanstack")));
    files.push(
      file("src/routes/verify-email.tsx", emailFlowPageContent("verify-email", "tanstack")),
    );
  }
  if (hasAuth) {
    if (hasEmail) {
      files.push(file("src/routes/2fa.tsx", singleTwoFactorRouteTanstackContent()));
      files.push(
        file("src/components/auth/two-factor-form.tsx", singleTwoFactorFormTanstackContent()),
      );
    }
    files.push(file("src/routes/dashboard.tsx", singleDashboardRouteTanstackContent(isConvex)));
    files.push(
      ...singleDashboardFeatureFilesTanstack(hasBilling, hasApi && (isConvex || hasPostgres)),
    );
    files.push(
      file(
        "src/routes/settings.tsx",
        singleSettingsRouteTanstackContent(isConvex, apiCapabilities.identity, hasBilling),
      ),
    );
    files.push(
      ...tanstackSettingsFeatureFiles("single", apiCapabilities.identity, hasEmail, hasPostgres),
    );
    if (apiCapabilities.identity) {
      files.push(...webIdentityWorkspaceFiles("tanstack", "single", hasI18n));
    }
    if (hasBilling) files.push(...singleTanstackBillingFeatureFiles(isConvex, effectiveBilling));
    if (hasAdminApi) {
      files.push(...singleTanstackAdminFeatureFiles(isConvex, hasI18n));
    }
  }
  files.push(file("src/routes/$notFound.tsx", singleNotFoundRouteTanstackContent()));
  if (hasAuth) {
    files.push(file("src/routes/api/auth/$.ts", singleAuthApiRouteTanstackContent()));
    files.push(
      file("src/server/http/auth.server.ts", singleAuthServerHandlerTanstackContent(hasCloudflare)),
    );
  }
  if (hasApi) {
    files.push(file("src/routes/api/rpc/$.ts", singleRpcApiRouteTanstackContent()));
    files.push(file("src/server/http/rpc.server.ts", singleRpcServerHandlerTanstackContent()));
    files.push(file("src/routes/api/$.ts", singleOpenApiOperationsRouteTanstackContent()));
    files.push(
      file(
        "src/server/http/openapi-operations.server.ts",
        singleOpenApiOperationsServerTanstackContent(),
      ),
    );
    files.push(file("src/routes/api/health.ts", singleHealthApiRouteTanstackContent()));
    files.push(file("src/routes/api/openapi.ts", singleOpenapiApiRouteTanstackContent()));
    files.push(
      file("src/server/http/openapi.server.ts", singleOpenApiServerHandlerTanstackContent()),
    );
  }
  if (hasApi) {
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
    if (hasAuth) files.push(...singleApiSupportFiles());
    else if (apiCapabilities.featureFlags) files.push(...singleServiceErrorFiles());
    files.push(...singleCapabilityApiFiles(apiCapabilities, isConvex ? "convex" : "postgres"));
    if (hasAdminApi) files.push(...singleAdminApiFiles(isConvex ? "convex" : "postgres"));
    if (hasBilling) files.push(...singleBillingApiFiles());
  }
  files.push(file("src/components/theme-provider.tsx", themeProviderSingleContent()));
  files.push(file("src/components/theme-toggle.tsx", themeToggleSingleContent()));
  const hasTypedAdminNavigation = hasAdminApi;
  files.push(
    file(
      "src/components/header.tsx",
      singleHeaderTanstackContent(
        hasI18n,
        hasAuth,
        hasBilling,
        hasTypedAdminNavigation,
        isConvex && hasTypedAdminNavigation ? "../../convex/_generated/api" : undefined,
        hasPdf,
        hasMessaging,
        headerNavigation,
      ),
    ),
  );
  if (hasAuth) {
    files.push(
      file(
        "src/components/header-actions.tsx",
        singleHeaderActionsTanstackContent(hasI18n, headerNavigation.notifications),
      ),
    );
    files.push(
      file(
        "src/components/header-user-menu.tsx",
        singleHeaderUserMenuTanstackContent(
          hasBilling,
          hasTypedAdminNavigation,
          hasMessaging,
          hasPdf,
          headerNavigation,
        ),
      ),
    );
    files.push(file("src/components/sign-out-button.tsx", singleSignOutButtonTanstackContent()));
  }
  if (isConvex) {
    files.push(
      file(
        "src/components/providers.tsx",
        singleProvidersTanstackContentConvex(hasAuth, hasAnalytics, hasI18n),
      ),
    );
  } else {
    files.push(
      file(
        "src/components/providers.tsx",
        singleProvidersTanstackContent(hasAnalytics, hasI18n, hasAuth),
      ),
    );
  }
  files.push(
    ...tanstackServerFoundationFiles("single", hasAuth, hasApi, {
      admin: hasAdminApi,
      billing: hasAdminApi && hasBilling,
      featureFlags: hasAdminApi && apiCapabilities.featureFlags,
      identity: apiCapabilities.identity,
      messaging:
        hasAdminApi && hasMessaging
          ? isConvex
            ? "convex"
            : apiCapabilities.messaging
              ? "postgres"
              : false
          : false,
    }),
  );
  if (isConvex) {
    if (hasAuth) {
      files.push(
        file("src/lib/auth-client.ts", authClientSingleConvex(hasEmail, "tanstack-start")),
      );
      files.push(file("src/server/auth/index.ts", serverAuthTanstackSingleConvex()));
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
      files.push(file("src/lib/auth-client.ts", authClientSingle(hasEmail, "tanstack-start")));
      files.push(file("src/server/auth/index.ts", serverAuthTanstackSingle(hasEmail)));
    }
    files.push(file("src/server/db/index.ts", serverDbIndexSingleNone()));
    files.push(file("src/server/db/schema/auth.ts", serverDbAuthSchemaStub()));
  } else {
    if (hasAuth) {
      files.push(file("src/lib/auth-client.ts", authClientSingle(hasEmail, "tanstack-start")));
      files.push(file("src/server/auth/index.ts", serverAuthTanstackSingle(hasEmail)));
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
  files.push(file("src/lib/utils.ts", libUtils()));
  files.push(file("src/lib/kernel.ts", singleKernelTypesContent()));
  files.push(...singleWebUiFiles());
  for (const f of webLibFiles("src", "tanstack-start")) {
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
  if (hasApi) files.push(file("src/lib/orpc.ts", singleOrpcClientTanstackContent()));
  files.push(file("src/hooks/use-copy.ts", useCopyHookSingleContent()));
  if (hasAuth) files.push(file("src/hooks/use-auth.ts", useAuthHookSingleContent()));
  files.push(gitignoreSingle());
  files.push(
    readmeSingle(projectName, hasEmail, {
      framework: "tanstack-start",
      hasEve,
    }),
  );
  const dbType = isConvex ? "convex" : isNone ? "none" : "postgres";
  files.push(
    filteredEnvExample(projectName, secrets, effectiveBilling, hasEmail, runtime, dbType, {
      framework: "tanstack-start",
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
        framework: "tanstack-start",
        hasEve,
        hasMobile: false,
      },
      hasEmail,
    ),
  );
  files.push(...singleEnvFiles(addonMap, "tanstack-start", hasEmail));
  if (hasI18n) {
    files.push(
      ...i18nFiles({ mode: "single", runtime, framework: "tanstack-start", addons: addonMap }),
    );
  }

  files.push(
    ...(servicesFiles(
      { mode: "single", runtime, framework: "tanstack-start", addons: addonMap } as {
        mode: "single";
        runtime: "node" | "bun";
        framework: "tanstack-start";
        addons: typeof addonMap;
      },
      runtime,
    ) as TemplateFile[]),
  );

  const billingRaw = !hasApi
    ? []
    : effectiveBilling.length > 0
      ? (billingFiles(
          { mode: "single", runtime, addons: addonMap } as {
            mode: "single";
            runtime: "node" | "bun";
            addons: typeof addonMap;
          },
          runtime,
        ) as TemplateFile[])
      : (billingFiles(
          {
            mode: "single",
            runtime,
            addons: {
              stripe: { inUse: false },
              chargily: { inUse: false },
              paddle: { inUse: false },
              polar: { inUse: false },
              billing: { inUse: false },
            } as never,
          } as never,
          runtime,
        ) as TemplateFile[]);
  const billingRuntimeFiles = billingRaw.filter(
    (f) =>
      f.path.startsWith("src/server/") ||
      f.path.startsWith("src/routes/api/webhooks/") ||
      (hasBilling &&
        (f.path.startsWith("src/routes/billing_.") ||
          f.path.startsWith("src/features/billing/") ||
          f.path === "docs/PADDLE_CHECKOUT.md" ||
          f.path === "src/contracts/billing.ts" ||
          f.path === "src/adapters/billing/paddle.ts" ||
          f.path === "src/lib/paddle-checkout-functions.ts")),
  );
  files.push(...billingRuntimeFiles);

  if (hasEmail) {
    files.push(
      ...(emailFiles({ mode: "single", runtime, i18n: hasI18n }, runtime) as TemplateFile[]),
    );
  }
  if (hasAnalytics) {
    files.push(
      ...(analyticsFiles(
        {
          mode: "single",
          runtime,
          framework: "tanstack-start",
          deploy: hasCloudflare ? "cloudflare" : "none",
        },
        runtime,
      ) as TemplateFile[]),
    );
  }

  if (hasEve) {
    files.push(...singleEveFiles(projectName, runtime, "tanstack-start", effectiveBilling));
  }

  return files;
}

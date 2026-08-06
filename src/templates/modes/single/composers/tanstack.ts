// @allow-long 312: single-mode TanStack Start composer; the file list is a linear manifest
import { singleWebUiFiles } from "../../../apps/fragments/web-ui/index.js";
import { file, type TemplateFile } from "../../../shared.js";
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

import { singlePackageJsonTanstack } from "../package.js";
import { convexDatabaseFiles } from "../../../database/convex.js";
import { filteredEnvExample, filteredEnvLocal } from "../config.js";
import { singleEnvFile } from "../fragments/env.js";
import {
  singleViteConfigTanstackContent,
  singleNitroConfigTanstackContent,
  singleRouterTanstackContent,
  singleGlobalsCssTanstackContent,
  singlePostCssTanstackContent,
  singleTsConfigTanstackContent,
  singleRootRouteTanstackContent,
} from "../tanstack/core.js";
import { singleMarketingPageTanstackContent } from "../tanstack/pages/marketing.js";
import {
  singleSignInRouteTanstackContent,
  singleSignUpRouteTanstackContent,
  singleForgotPasswordRouteTanstackContent,
  singleResetPasswordRouteTanstackContent,
  singleTwoFactorRouteTanstackContent,
} from "../tanstack/pages/auth.js";
import {
  singleDashboardRouteTanstackContent,
  singleSettingsRouteTanstackContent,
  singleBillingRouteTanstackContent,
  singleNotFoundRouteTanstackContent,
} from "../tanstack/pages/dashboard.js";
import {
  singleAuthApiRouteTanstackContent,
  singleRpcApiRouteTanstackContent,
  singleHealthApiRouteTanstackContent,
  singleOpenapiApiRouteTanstackContent,
  singleStripeWebhookTanstackContent,
  singleChargilyWebhookTanstackContent,
  singlePaddleWebhookTanstackContent,
  singlePolarWebhookTanstackContent,
} from "../tanstack/api.js";
import {
  singleTanstackAdminContent,
  singleTanstackAdminUsersContent,
  singleTanstackAdminCreateContent,
} from "../tanstack/pages/admin.js";
import {
  singleApiContextContent,
  singleApiHealthProcedureContent,
  singleApiMeProcedureContent,
  singleApiContractContent,
  singleApiRouterContent,
  singleApiIndexContent,
  singleApiOpenapiContent,
  singleOrpcClientTanstackContent,
} from "../api/routes.js";
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
  serverObservabilitySingle,
  libUtils,
} from "../server/db.js";
import { themeProviderSingleContent, themeToggleSingleContent } from "../components/theme.js";
import {
  singleProvidersTanstackContent,
  singleProvidersTanstackContentConvex,
} from "../components/providers.js";
import {
  singleHeaderTanstackContent,
  singleSignOutButtonTanstackContent,
  singleAdminGuardTanstackContent,
} from "../components/header.js";
import {
  useCopyHookSingleContent,
  useBillingHookSingleContent,
  useAuthHookSingleContent,
} from "../components/hooks.js";
import { gitignoreSingle, readmeSingle } from "../fragments/docs.js";

export function buildTanstackFiles(
  projectName: string,
  runtime: "node" | "bun",
  effectiveBilling: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  secrets: RootSecrets,
  addonMap: AddonInstallerMap,
): TemplateFile[] {
  const isConvex = hasAddon(addonMap, "convex");
  const isNone = hasAddon(addonMap, "none");
  const files: TemplateFile[] = [];
  files.push(
    file(
      "package.json",
      singlePackageJsonTanstack(projectName, runtime, effectiveBilling, hasEve, hasI18n, isConvex),
    ),
  );
  files.push(file("vite.config.ts", singleViteConfigTanstackContent()));
  files.push(file("nitro.config.ts", singleNitroConfigTanstackContent()));
  files.push(file("tsconfig.json", singleTsConfigTanstackContent()));
  files.push(file("postcss.config.mjs", singlePostCssTanstackContent()));
  files.push(file("src/styles/app.css", singleGlobalsCssTanstackContent()));
  files.push(file("src/router.tsx", singleRouterTanstackContent()));
  files.push(file("src/routes/__root.tsx", singleRootRouteTanstackContent()));
  files.push(file("src/routes/index.tsx", singleMarketingPageTanstackContent()));
  files.push(file("src/routes/sign-in.tsx", singleSignInRouteTanstackContent()));
  files.push(file("src/routes/sign-up.tsx", singleSignUpRouteTanstackContent()));
  files.push(file("src/routes/forgot-password.tsx", singleForgotPasswordRouteTanstackContent()));
  files.push(file("src/routes/reset-password.tsx", singleResetPasswordRouteTanstackContent()));
  files.push(file("src/routes/2fa.tsx", singleTwoFactorRouteTanstackContent()));
  files.push(file("src/routes/dashboard.tsx", singleDashboardRouteTanstackContent()));
  files.push(file("src/routes/settings.tsx", singleSettingsRouteTanstackContent()));
  files.push(file("src/routes/billing.tsx", singleBillingRouteTanstackContent()));
  // Admin routes — mirror monorepo TanStack admin for typed Link to="/admin" support
  files.push(file("src/routes/admin.tsx", singleTanstackAdminContent()));
  files.push(file("src/routes/admin.users.tsx", singleTanstackAdminUsersContent()));
  files.push(file("src/routes/admin.users.create.tsx", singleTanstackAdminCreateContent()));
  files.push(file("src/routes/$notFound.tsx", singleNotFoundRouteTanstackContent()));
  files.push(file("src/routes/api/auth/$splat.ts", singleAuthApiRouteTanstackContent()));
  files.push(file("src/routes/api/rpc/$splat.ts", singleRpcApiRouteTanstackContent()));
  files.push(file("src/routes/api/health.ts", singleHealthApiRouteTanstackContent()));
  files.push(file("src/routes/api/openapi.ts", singleOpenapiApiRouteTanstackContent()));
  if (effectiveBilling.includes("stripe"))
    files.push(
      file("src/routes/api/webhooks/stripe.ts", singleStripeWebhookTanstackContent(isConvex)),
    );
  if (effectiveBilling.includes("chargily"))
    files.push(
      file("src/routes/api/webhooks/chargily.ts", singleChargilyWebhookTanstackContent(isConvex)),
    );
  if (effectiveBilling.includes("paddle"))
    files.push(
      file("src/routes/api/webhooks/paddle.ts", singlePaddleWebhookTanstackContent(isConvex)),
    );
  if (effectiveBilling.includes("polar"))
    files.push(
      file("src/routes/api/webhooks/polar.ts", singlePolarWebhookTanstackContent(isConvex)),
    );
  if (
    effectiveBilling.length === 0 &&
    (addonMap as Record<string, { inUse?: boolean }>)["billing"]?.inUse
  ) {
    files.push(
      file("src/routes/api/webhooks/stripe.ts", singleStripeWebhookTanstackContent(isConvex)),
    );
    files.push(
      file("src/routes/api/webhooks/chargily.ts", singleChargilyWebhookTanstackContent(isConvex)),
    );
    files.push(
      file("src/routes/api/webhooks/paddle.ts", singlePaddleWebhookTanstackContent(isConvex)),
    );
    files.push(
      file("src/routes/api/webhooks/polar.ts", singlePolarWebhookTanstackContent(isConvex)),
    );
  }
  files.push(file("src/server/api/context.ts", singleApiContextContent()));
  files.push(file("src/server/api/procedures/health.ts", singleApiHealthProcedureContent()));
  files.push(file("src/server/api/procedures/me.ts", singleApiMeProcedureContent()));
  files.push(file("src/server/api/contract.ts", singleApiContractContent()));
  files.push(file("src/server/api/router.ts", singleApiRouterContent()));
  files.push(file("src/server/api/index.ts", singleApiIndexContent()));
  files.push(file("src/server/api/openapi.ts", singleApiOpenapiContent()));
  files.push(file("src/components/theme-provider.tsx", themeProviderSingleContent()));
  files.push(file("src/components/theme-toggle.tsx", themeToggleSingleContent()));
  files.push(file("src/components/header.tsx", singleHeaderTanstackContent()));
  files.push(file("src/components/sign-out-button.tsx", singleSignOutButtonTanstackContent()));
  files.push(file("src/components/admin-guard.tsx", singleAdminGuardTanstackContent()));
  if (isConvex) {
    files.push(file("src/components/providers.tsx", singleProvidersTanstackContentConvex()));
  } else {
    files.push(file("src/components/providers.tsx", singleProvidersTanstackContent()));
  }
  if (isConvex) {
    files.push(file("src/lib/auth-client.ts", authClientSingleConvex()));
    files.push(file("src/server/auth/index.ts", serverAuthTanstackSingleConvex()));
    files.push(file("src/server/db/index.ts", serverDbIndexSingleConvex()));
    const convexAll = convexDatabaseFiles(projectName, runtime);
    for (const cf of convexAll) {
      if (cf.path.startsWith("convex/") || cf.path === "convex.json") {
        files.push(cf);
      }
    }
  } else if (isNone) {
    files.push(file("src/lib/auth-client.ts", authClientSingle()));
    files.push(file("src/server/auth/index.ts", serverAuthTanstackSingle()));
    files.push(file("src/server/db/index.ts", serverDbIndexSingleNone()));
    files.push(file("src/server/db/schema/auth.ts", serverDbAuthSchemaStub()));
  } else {
    files.push(file("src/lib/auth-client.ts", authClientSingle()));
    files.push(file("src/server/auth/index.ts", serverAuthTanstackSingle()));
    files.push(file("src/server/db/index.ts", serverDbIndexSingle()));
    files.push(file("src/server/db/schema/auth.ts", serverDbAuthSchemaStub()));
  }
  files.push(file("src/server/observability/index.ts", serverObservabilitySingle()));
  files.push(file("src/lib/utils.ts", libUtils()));
  // shadcn-style primitives the pages import via @/components/ui/*.
  files.push(...singleWebUiFiles());
  files.push(file("src/lib/orpc.ts", singleOrpcClientTanstackContent()));
  files.push(file("src/hooks/use-copy.ts", useCopyHookSingleContent()));
  files.push(file("src/hooks/use-billing.ts", useBillingHookSingleContent()));
  files.push(file("src/hooks/use-auth.ts", useAuthHookSingleContent()));
  files.push(gitignoreSingle());
  files.push(readmeSingle(projectName));
  const dbType = isConvex ? "convex" : isNone ? "none" : "postgres";
  files.push(
    filteredEnvExample(projectName, secrets, effectiveBilling, true, runtime, dbType, {
      framework: "tanstack-start",
      hasMobile: false,
    }),
  );
  files.push(
    filteredEnvLocal(projectName, secrets, effectiveBilling, runtime, dbType, {
      framework: "tanstack-start",
      hasMobile: false,
    }),
  );
  files.push(singleEnvFile(addonMap, "tanstack-start"));

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

  const billingRaw =
    effectiveBilling.length > 0
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
  const billingServerOnly = billingRaw.filter(
    (f) => f.path.startsWith("src/server/") || f.path.startsWith("src/server/db/"),
  );
  files.push(...billingServerOnly);

  files.push(
    ...(emailFiles(
      { mode: "single", runtime } as { mode: "single"; runtime: "node" | "bun" },
      runtime,
    ) as TemplateFile[]),
  );
  files.push(
    ...(analyticsFiles(
      { mode: "single", runtime, framework: "tanstack-start" } as {
        mode: "single";
        runtime: "node" | "bun";
        framework: "tanstack-start";
      },
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

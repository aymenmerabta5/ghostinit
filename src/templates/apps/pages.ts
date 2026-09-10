import { file, type TemplateFile } from "../shared.js";
import {
  nextRootLayoutContent,
  notFoundFileContent,
  systemFeatureFiles,
  errorFileContent,
  loadingFileContent,
  globalErrorFileContent,
  unauthorizedFileContent,
  forbiddenFileContent,
} from "./fragments/layout.js";
import {
  buildMarketingPageContent,
  marketingFeaturesComponentContent,
  marketingFooterComponentContent,
  marketingHeroComponentContent,
  marketingQuickStartComponentContent,
} from "./fragments/marketing.js";
import type { MarketingOptions } from "./fragments/marketing/shared.js";
import { signInPageContent, signUpPageContent, twoFactorPageContent } from "./fragments/auth.js";
import { authFeatureFiles } from "./fragments/auth/feature.js";
import { nextDashboardFeatureFiles, nextDashboardPageContent } from "./fragments/dashboard-next.js";
import { settingsFiles } from "./fragments/settings/index.js";
import { webIdentityWorkspaceFiles } from "./fragments/identity-workspace/index.js";
import { adminFiles } from "./fragments/admin/index.js";
import { recoveryFiles } from "./fragments/recovery/index.js";
import { agentFiles } from "./fragments/agent/index.js";
import { resolveHasEve, type FeatureInput } from "./fragments/features.js";
import { hasAddon, type AddonInstallerMap } from "../../lib/addons.js";
import {
  manifestFileContent,
  opengraphImageContent,
  robotsFileContent,
  sitemapFileContent,
  viewportFileContent,
} from "./fragments/seo.js";
import { nextInstrumentationContent } from "./fragments/instrumentation.js";

export function pageFiles(addonsOrHasEve: FeatureInput = false): TemplateFile[] {
  const hasEve = resolveHasEve(addonsOrHasEve);
  const hasEmail =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "email")
      : true;
  const isConvex =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "convex")
      : false;
  const isPostgres =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "postgres")
      : true;
  const hasAuth =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "auth")
      : true;
  const hasApi =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "api")
      : true;
  const hasI18n =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "i18n")
      : false;
  const hasBilling =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "billing") ||
        (["stripe", "chargily", "paddle", "polar", "manual"] as const).some((provider) =>
          hasAddon(addonsOrHasEve as AddonInstallerMap, provider),
        )
      : true;
  const hasAdminUi = hasAuth && hasApi && (isConvex || isPostgres);
  return [
    layout(hasI18n),
    ...systemFeatureFiles("next", "apps/web/src", hasAuth),
    globalErrorPage(),
    ...(hasAuth ? [unauthorizedPage(), forbiddenPage()] : []),
    notFoundPage(),
    errorPage(),
    loadingPage(),
    sitemap(hasBilling),
    robots(),
    manifest(),
    viewport(),
    opengraphImage(),
    instrumentation(),
    ...marketingFiles({
      hasAuth,
      hasApi,
      hasBilling,
      hasEve,
      database: isConvex ? "convex" : isPostgres ? "postgres" : "none",
    }),
    ...(hasAuth
      ? [
          dashboardLoading(),
          signInPage(hasEmail),
          signUpPage(),
          ...authFormComponents(hasEmail, isPostgres),
          ...(hasEmail ? [twoFactorPage()] : []),
          dashboardPage(isConvex),
          ...nextDashboardFeatureFiles(hasBilling, hasAdminUi),
          ...settingsFiles(
            "next",
            isConvex,
            hasApi && (isPostgres || isConvex),
            hasBilling,
            hasEmail,
            isPostgres,
          ),
          ...(hasApi && (isPostgres || isConvex)
            ? webIdentityWorkspaceFiles("next", "monorepo", hasI18n)
            : []),
          ...recoveryFiles("next", hasEmail),
        ]
      : []),
    ...(hasEve ? agentFiles() : []),
    ...(hasAdminUi ? adminFiles(isConvex, hasI18n) : []),
  ];
}

function notFoundPage(): TemplateFile {
  return file("apps/web/src/app/not-found.tsx", notFoundFileContent("next"));
}
function errorPage(): TemplateFile {
  return file("apps/web/src/app/error.tsx", errorFileContent("next"));
}
function globalErrorPage(): TemplateFile {
  return file("apps/web/src/app/global-error.tsx", globalErrorFileContent());
}
function unauthorizedPage(): TemplateFile {
  return file("apps/web/src/app/unauthorized.tsx", unauthorizedFileContent("next"));
}
function forbiddenPage(): TemplateFile {
  return file("apps/web/src/app/forbidden.tsx", forbiddenFileContent("next"));
}
function loadingPage(): TemplateFile {
  return file("apps/web/src/app/loading.tsx", loadingFileContent());
}
function layout(hasI18n = false): TemplateFile {
  return file("apps/web/src/app/layout.tsx", nextRootLayoutContent(hasI18n));
}
function marketingFiles(options: MarketingOptions): TemplateFile[] {
  return [
    file("apps/web/src/app/page.tsx", buildMarketingPageContent("next")),
    file(
      "apps/web/src/components/marketing/hero.tsx",
      marketingHeroComponentContent("next", options),
    ),
    file(
      "apps/web/src/components/marketing/features.tsx",
      marketingFeaturesComponentContent("next", options),
    ),
    file(
      "apps/web/src/components/marketing/quick-start.tsx",
      marketingQuickStartComponentContent("next"),
    ),
    file(
      "apps/web/src/components/marketing/footer.tsx",
      marketingFooterComponentContent("next", options.hasBilling, options),
    ),
  ];
}
function signInPage(hasEmail = true): TemplateFile {
  return file("apps/web/src/app/sign-in/page.tsx", signInPageContent("next", hasEmail));
}
function signUpPage(): TemplateFile {
  return file("apps/web/src/app/sign-up/page.tsx", signUpPageContent("next"));
}
function authFormComponents(hasEmail = true, hasPasskey = true): TemplateFile[] {
  return authFeatureFiles({ router: "next", hasEmail, hasPasskey });
}
function twoFactorPage(): TemplateFile {
  return file("apps/web/src/app/2fa/page.tsx", twoFactorPageContent("next"));
}
function dashboardPage(isConvex = false): TemplateFile {
  return file("apps/web/src/app/dashboard/page.tsx", nextDashboardPageContent(isConvex));
}
function sitemap(hasBilling = true): TemplateFile {
  return file("apps/web/src/app/sitemap.ts", sitemapFileContent("next", hasBilling));
}
function robots(): TemplateFile {
  return file("apps/web/src/app/robots.ts", robotsFileContent("next"));
}
function manifest(): TemplateFile {
  return file("apps/web/src/app/manifest.ts", manifestFileContent());
}
function viewport(): TemplateFile {
  return file("apps/web/src/app/viewport.ts", viewportFileContent());
}
function opengraphImage(): TemplateFile {
  return file("apps/web/src/app/opengraph-image.tsx", opengraphImageContent());
}
function dashboardLoading(): TemplateFile {
  return file("apps/web/src/app/dashboard/loading.tsx", loadingFileContent());
}
function instrumentation(): TemplateFile {
  return file("apps/web/src/instrumentation.ts", nextInstrumentationContent());
}

// Re-export legacy functions for backward compat
export { settingsFiles, adminFiles, recoveryFiles, agentFiles };
export {
  notFoundFileContent,
  errorFileContent,
  loadingFileContent,
  globalErrorFileContent,
  unauthorizedFileContent,
  forbiddenFileContent,
  nextRootLayoutContent,
} from "./fragments/layout.js";

import { file, type TemplateFile } from "../shared.js";
import type { BillingProviderName } from "../../lib/addons.js";
import { BILLING_PROVIDERS } from "../../lib/constants.js";
import {
  tanstackRootDocumentContent,
  notFoundFileContent,
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
import {
  authOAuthButtonsContent,
  signInFormContent,
  signInMethodsContent,
  signInPageContent,
  signUpFormContent,
  signUpPageContent,
  twoFactorPageContent,
  twoFactorFormContent,
} from "./fragments/auth.js";
import {
  tanstackDashboardFeatureFiles,
  tanstackDashboardRouteContent,
} from "./fragments/dashboard-tanstack.js";
import { recoveryFiles } from "./fragments/recovery/index.js";
import { settingsFiles } from "./fragments/settings/index.js";
import { webIdentityWorkspaceFiles } from "./fragments/identity-workspace/index.js";
import { billingFiles } from "./fragments/billing/index.js";
import { tanstackAdminFiles } from "./fragments/admin/index.js";
import { manifestFileContent, robotsFileContent, sitemapFileContent } from "./fragments/seo.js";
import { tanstackInstrumentationContent } from "./fragments/instrumentation.js";

export function tanstackPageFiles(
  hasEmail = true,
  isConvex = false,
  hasAuth = true,
  hasApi = true,
  isPostgres = true,
  hasI18n = false,
  hasBilling = true,
  selectedBilling: readonly BillingProviderName[] = BILLING_PROVIDERS,
  hasEve = false,
): TemplateFile[] {
  const hasAdminUi = hasAuth && hasApi && (isConvex || isPostgres);
  return [
    rootRoute(hasI18n),
    ...marketingFiles({
      hasAuth,
      hasApi,
      hasBilling,
      hasEve,
      database: isConvex ? "convex" : isPostgres ? "postgres" : "none",
    }),
    ...(hasAuth
      ? [
          signInRoute(hasEmail),
          signUpRoute(),
          ...authFormComponents(hasEmail, isPostgres),
          ...(hasEmail ? [twoFactorRoute(), twoFactorForm()] : []),
          ...recoveryFiles("tanstack", hasEmail),
          dashboardRoute(isConvex),
          ...tanstackDashboardFeatureFiles(hasBilling, hasAdminUi),
          ...settingsFiles(
            "tanstack",
            isConvex,
            hasApi && (isPostgres || isConvex),
            hasBilling,
            hasEmail,
            isPostgres,
          ),
          ...(hasApi && (isPostgres || isConvex)
            ? webIdentityWorkspaceFiles("tanstack", "monorepo", hasI18n)
            : []),
        ]
      : []),
    ...(hasBilling ? billingFiles("tanstack", isConvex, selectedBilling) : []),
    ...(hasAdminUi ? tanstackAdminFiles(isConvex, hasI18n) : []),
    ...(hasAuth ? [unauthorizedRoute(), forbiddenRoute()] : []),
    notFoundRoute(),
    sitemap(hasBilling),
    robots(),
    manifest(),
    instrumentation(),
  ];
}

function rootRoute(hasI18n = false): TemplateFile {
  return file("apps/web/src/routes/__root.tsx", tanstackRootDocumentContent(hasI18n));
}

function marketingFiles(options: MarketingOptions): TemplateFile[] {
  return [
    file("apps/web/src/routes/index.tsx", buildMarketingPageContent("tanstack")),
    file(
      "apps/web/src/components/marketing/hero.tsx",
      marketingHeroComponentContent("tanstack", options),
    ),
    file(
      "apps/web/src/components/marketing/features.tsx",
      marketingFeaturesComponentContent("tanstack", options),
    ),
    file(
      "apps/web/src/components/marketing/quick-start.tsx",
      marketingQuickStartComponentContent("tanstack"),
    ),
    file(
      "apps/web/src/components/marketing/footer.tsx",
      marketingFooterComponentContent("tanstack", options.hasBilling, options),
    ),
  ];
}

function signInRoute(hasEmail = true): TemplateFile {
  return file("apps/web/src/routes/sign-in.tsx", signInPageContent("tanstack", hasEmail));
}

function signUpRoute(): TemplateFile {
  return file("apps/web/src/routes/sign-up.tsx", signUpPageContent("tanstack"));
}

function authFormComponents(hasEmail = true, hasPasskey = true): TemplateFile[] {
  return [
    file("apps/web/src/components/auth/oauth-buttons.tsx", authOAuthButtonsContent()),
    file(
      "apps/web/src/components/auth/sign-in-methods.tsx",
      signInMethodsContent("tanstack", hasPasskey),
    ),
    file(
      "apps/web/src/components/auth/sign-in-form.tsx",
      signInFormContent("tanstack", hasEmail, hasPasskey),
    ),
    file("apps/web/src/components/auth/sign-up-form.tsx", signUpFormContent("tanstack", hasEmail)),
  ];
}

function twoFactorRoute(): TemplateFile {
  return file("apps/web/src/routes/2fa.tsx", twoFactorPageContent("tanstack"));
}
function twoFactorForm(): TemplateFile {
  return file("apps/web/src/components/auth/two-factor-form.tsx", twoFactorFormContent("tanstack"));
}

function dashboardRoute(isConvex = false): TemplateFile {
  return file("apps/web/src/routes/dashboard.tsx", tanstackDashboardRouteContent(isConvex));
}

function unauthorizedRoute(): TemplateFile {
  return file("apps/web/src/routes/unauthorized.tsx", unauthorizedFileContent("tanstack"));
}

function forbiddenRoute(): TemplateFile {
  return file("apps/web/src/routes/forbidden.tsx", forbiddenFileContent("tanstack"));
}

function notFoundRoute(): TemplateFile {
  return file("apps/web/src/routes/$notFound.tsx", notFoundFileContent("tanstack"));
}
function sitemap(hasBilling = true): TemplateFile {
  return file("apps/web/public/sitemap.xml", sitemapFileContent("tanstack", hasBilling));
}
function robots(): TemplateFile {
  return file("apps/web/public/robots.txt", robotsFileContent("tanstack"));
}
function manifest(): TemplateFile {
  return file("apps/web/public/manifest.webmanifest", manifestFileContent("tanstack"));
}
function instrumentation(): TemplateFile {
  return file("apps/web/src/instrumentation.ts", tanstackInstrumentationContent());
}

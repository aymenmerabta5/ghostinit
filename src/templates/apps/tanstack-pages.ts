/**
 * TanStack Start pages — deduplicated via fragments
 * marketing shared via fragments/marketing (90% identical sticky header h-14 max-w-6xl Badge secondary modular monolith ThemeToggle)
 * auth shared via fragments/auth (email validators, signIn/signUp logic)
 * dashboard shared via fragments/dashboard, layout via fragments/layout, theme via fragments/theme
 * recovery via fragments/recovery with RouterType (next | tanstack) — DRY, no inline 66 LOC copies
 * settings via fragments/settings with RouterType — uses the database-aware getRequestUser boundary
 * billing via fragments/billing with RouterType — new fragment, was only inline 66 LOC
 *
 * Fragment extraction trigger: When TanStack files exceed 300 LOC or third framework added,
 * extract to fragments/ with framework param branching. This file now ~60 LOC (same as pages.ts),
 * delegating to fragments for all routes (marketing, auth, recovery, settings, billing, dashboard).
 */

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
import {
  authOAuthButtonsContent,
  signInFormContent,
  signInMethodsContent,
  signInPageContent,
  signUpFormContent,
  signUpPageContent,
  twoFactorPageContent,
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
): TemplateFile[] {
  const hasAdminUi = hasAuth && hasApi && (isConvex || isPostgres);
  return [
    rootRoute(hasI18n),
    ...marketingFiles(hasBilling),
    ...(hasAuth
      ? [
          signInRoute(hasEmail),
          signUpRoute(),
          ...authFormComponents(hasEmail, isPostgres),
          ...(hasEmail ? [twoFactorRoute()] : []),
          ...recoveryFiles("tanstack", hasEmail),
          dashboardRoute(isConvex),
          ...tanstackDashboardFeatureFiles(hasBilling),
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
    unauthorizedRoute(),
    forbiddenRoute(),
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

function marketingFiles(hasBilling = true): TemplateFile[] {
  return [
    file("apps/web/src/routes/index.tsx", buildMarketingPageContent("tanstack")),
    file("apps/web/src/components/marketing/hero.tsx", marketingHeroComponentContent("tanstack")),
    file(
      "apps/web/src/components/marketing/features.tsx",
      marketingFeaturesComponentContent("tanstack"),
    ),
    file(
      "apps/web/src/components/marketing/quick-start.tsx",
      marketingQuickStartComponentContent("tanstack"),
    ),
    file(
      "apps/web/src/components/marketing/footer.tsx",
      marketingFooterComponentContent("tanstack", hasBilling),
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

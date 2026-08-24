/**
 * TanStack Start pages — deduplicated via fragments
 * marketing shared via fragments/marketing (90% identical sticky header h-14 max-w-6xl Badge secondary modular monolith ThemeToggle)
 * auth shared via fragments/auth (email validators, signIn/signUp logic)
 * dashboard shared via fragments/dashboard, layout via fragments/layout, theme via fragments/theme
 * recovery via fragments/recovery with RouterType (next | tanstack) — DRY, no inline 66 LOC copies
 * settings via fragments/settings with RouterType — uses tanstackGetSessionFnContent + tanstackAuthBeforeLoadContent helpers
 * billing via fragments/billing with RouterType — new fragment, was only inline 66 LOC
 *
 * Fragment extraction trigger: When TanStack files exceed 300 LOC or third framework added,
 * extract to fragments/ with framework param branching. This file now ~60 LOC (same as pages.ts),
 * delegating to fragments for all routes (marketing, auth, recovery, settings, billing, dashboard).
 */

import { file, type TemplateFile } from "../shared.js";
import {
  tanstackRootDocumentContent,
  notFoundFileContent,
  unauthorizedFileContent,
  forbiddenFileContent,
} from "./fragments/layout.js";
import { buildMarketingPageContent } from "./fragments/marketing.js";
import { signInPageContent, signUpPageContent, twoFactorPageContent } from "./fragments/auth.js";
import { dashboardPageContent } from "./fragments/dashboard.js";
import { recoveryFiles } from "./fragments/recovery/index.js";
import { settingsFiles } from "./fragments/settings/index.js";
import { billingFiles } from "./fragments/billing/index.js";
import { tanstackAdminFiles } from "./fragments/admin/index.js";
import {
  manifestFileContent,
  robotsFileContent,
  sitemapFileContent,
  viewportFileContent,
} from "./fragments/seo.js";
import { tanstackInstrumentationContent } from "./fragments/instrumentation.js";

export function tanstackPageFiles(hasEmail = true): TemplateFile[] {
  return [
    rootRoute(),
    marketingRoute(),
    signInRoute(hasEmail),
    signUpRoute(),
    twoFactorRoute(),
    ...recoveryFiles("tanstack", hasEmail),
    dashboardRoute(),
    ...settingsFiles("tanstack"),
    ...billingFiles("tanstack"),
    ...tanstackAdminFiles(),
    unauthorizedRoute(),
    forbiddenRoute(),
    notFoundRoute(),
    sitemap(),
    robots(),
    manifest(),
    viewport(),
    instrumentation(),
    dashboardLoading(),
  ];
}

function rootRoute(): TemplateFile {
  return file("apps/web/src/routes/__root.tsx", tanstackRootDocumentContent());
}

function marketingRoute(): TemplateFile {
  return file("apps/web/src/routes/index.tsx", buildMarketingPageContent("tanstack"));
}

function signInRoute(hasEmail = true): TemplateFile {
  return file("apps/web/src/routes/sign-in.tsx", signInPageContent("tanstack", hasEmail));
}

function signUpRoute(): TemplateFile {
  return file("apps/web/src/routes/sign-up.tsx", signUpPageContent("tanstack"));
}

function twoFactorRoute(): TemplateFile {
  return file("apps/web/src/routes/2fa.tsx", twoFactorPageContent("tanstack"));
}

function dashboardRoute(): TemplateFile {
  return file("apps/web/src/routes/dashboard.tsx", dashboardPageContent("tanstack"));
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
function sitemap(): TemplateFile {
  return file("apps/web/src/routes/sitemap.ts", sitemapFileContent("tanstack"));
}
function robots(): TemplateFile {
  return file("apps/web/src/routes/robots.ts", robotsFileContent("tanstack"));
}
function manifest(): TemplateFile {
  return file("apps/web/src/routes/manifest.ts", manifestFileContent("tanstack"));
}
function viewport(): TemplateFile {
  return file("apps/web/src/routes/viewport.ts", viewportFileContent("tanstack"));
}
function instrumentation(): TemplateFile {
  return file("apps/web/src/instrumentation.ts", tanstackInstrumentationContent());
}
function dashboardLoading(): TemplateFile {
  return file(
    "apps/web/src/routes/dashboard/loading.tsx",
    `import { Skeleton } from "@/components/ui/skeleton";\nexport default function DashboardLoading(): React.JSX.Element { return (<div className="p-6"><Skeleton className="h-32 w-full" /></div>); }\n`,
  );
}

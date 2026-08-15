import { file, type TemplateFile } from "../shared.js";
import {
  nextRootLayoutContent,
  notFoundFileContent,
  errorFileContent,
  loadingFileContent,
  globalErrorFileContent,
  unauthorizedFileContent,
  forbiddenFileContent,
} from "./fragments/layout.js";
import { buildMarketingPageContent } from "./fragments/marketing.js";
import { signInPageContent, signUpPageContent, twoFactorPageContent } from "./fragments/auth.js";
import { dashboardPageContent } from "./fragments/dashboard.js";
import { settingsFiles } from "./fragments/settings/index.js";
import { adminFiles } from "./fragments/admin/index.js";
import { recoveryFiles } from "./fragments/recovery/index.js";
import { agentFiles } from "./fragments/agent/index.js";
import { resolveHasEve, type FeatureInput } from "./fragments/features.js";
import {
  manifestFileContent,
  opengraphImageContent,
  robotsFileContent,
  sitemapFileContent,
  viewportFileContent,
} from "./fragments/seo.js";
import { nextInstrumentationContent } from "./fragments/instrumentation.js";

export function pageFiles(addonsOrHasEve: FeatureInput = false): TemplateFile[] {
  // The agent page imports `eve/react`. Emitting it unconditionally shipped a
  // build-breaking import into every monorepo project that did not enable the
  // eve feature (single mode already gated this correctly).
  const hasEve = resolveHasEve(addonsOrHasEve);
  return [
    layout(),
    globalErrorPage(),
    unauthorizedPage(),
    forbiddenPage(),
    notFoundPage(),
    errorPage(),
    loadingPage(),
    sitemap(),
    robots(),
    manifest(),
    viewport(),
    opengraphImage(),
    dashboardLoading(),
    instrumentation(),
    marketingPage(),
    signInPage(),
    signUpPage(),
    twoFactorPage(),
    dashboardPage(),
    ...(hasEve ? agentFiles() : []),
    ...settingsFiles(),
    ...recoveryFiles(),
    ...adminFiles(),
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
function layout(): TemplateFile {
  return file("apps/web/src/app/layout.tsx", nextRootLayoutContent());
}
function marketingPage(): TemplateFile {
  return file("apps/web/src/app/page.tsx", buildMarketingPageContent("next"));
}
function signInPage(): TemplateFile {
  return file("apps/web/src/app/sign-in/page.tsx", signInPageContent("next"));
}
function signUpPage(): TemplateFile {
  return file("apps/web/src/app/sign-up/page.tsx", signUpPageContent("next"));
}
function twoFactorPage(): TemplateFile {
  return file("apps/web/src/app/2fa/page.tsx", twoFactorPageContent("next"));
}
function dashboardPage(): TemplateFile {
  return file("apps/web/src/app/dashboard/page.tsx", dashboardPageContent("next"));
}
function sitemap(): TemplateFile {
  return file("apps/web/src/app/sitemap.ts", sitemapFileContent("next"));
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

import { file, type TemplateFile } from "../shared.js";
import {
  nextRootLayoutContent,
  notFoundFileContent,
  errorFileContent,
  loadingFileContent,
} from "./fragments/layout.js";
import { buildMarketingPageContent } from "./fragments/marketing.js";
import { signInPageContent, signUpPageContent, twoFactorPageContent } from "./fragments/auth.js";
import { dashboardPageContent } from "./fragments/dashboard.js";
import { settingsFiles } from "./fragments/settings/index.js";
import { adminFiles } from "./fragments/admin/index.js";
import { recoveryFiles } from "./fragments/recovery/index.js";
import { agentFiles } from "./fragments/agent/index.js";

export function pageFiles(): TemplateFile[] {
  return [
    layout(),
    notFoundPage(),
    errorPage(),
    loadingPage(),
    marketingPage(),
    signInPage(),
    signUpPage(),
    twoFactorPage(),
    dashboardPage(),
    ...agentFiles(),
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

// Re-export legacy functions for backward compat
export { settingsFiles, adminFiles, recoveryFiles, agentFiles };
export {
  notFoundFileContent,
  errorFileContent,
  loadingFileContent,
  nextRootLayoutContent,
} from "./fragments/layout.js";

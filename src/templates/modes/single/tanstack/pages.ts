/**
 * TanStack pages orchestrator — re-exports all route content generators.
 * Keeps <300 LOC by delegating to pages/* submodules.
 */
export { singleMarketingPageTanstackContent } from "./pages/marketing.js";
export {
  singleSignInRouteTanstackContent,
  singleSignUpRouteTanstackContent,
  singleForgotPasswordRouteTanstackContent,
  singleResetPasswordRouteTanstackContent,
  singleTwoFactorRouteTanstackContent,
} from "./pages/auth.js";
export {
  singleDashboardRouteTanstackContent,
  singleSettingsRouteTanstackContent,
  singleBillingRouteTanstackContent,
  singleNotFoundRouteTanstackContent,
} from "./pages/dashboard.js";
export { singleRootRouteTanstackContent } from "./core.js";

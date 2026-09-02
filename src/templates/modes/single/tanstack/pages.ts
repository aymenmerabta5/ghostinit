/**
 * TanStack pages orchestrator — re-exports all route content generators.
 * Keeps <300 LOC by delegating to pages/* submodules.
 */
export {
  singleMarketingClosingTanstackContent,
  singleMarketingFeaturesTanstackContent,
  singleMarketingHeroTanstackContent,
  singleMarketingPageTanstackContent,
} from "./pages/marketing.js";
export {
  singleAuthOAuthButtonsTanstackContent,
  singleSignInFormTanstackContent,
  singleSignInRouteTanstackContent,
  singleSignUpFormTanstackContent,
  singleSignUpRouteTanstackContent,
  singleForgotPasswordRouteTanstackContent,
  singleResetPasswordRouteTanstackContent,
  singleTwoFactorRouteTanstackContent,
} from "./pages/auth.js";
export {
  singleDashboardRouteTanstackContent,
  singleDashboardFeatureFilesTanstack,
  singleSettingsRouteTanstackContent,
  singleBillingRouteTanstackContent,
  singleNotFoundRouteTanstackContent,
} from "./pages/dashboard.js";
export { singleRootRouteTanstackContent } from "./core.js";

export type { DesktopCapabilities, DesktopMode } from "./model.js";
export { resolveDesktopBillingProviders, resolveDesktopCapabilities } from "./model.js";
export { desktopPackageJsonContent, desktopSmokeTestContent } from "./package.js";
export {
  desktopElectronBuilderYmlContent,
  desktopGitignoreContent,
  desktopPackagingReadmeContent,
  desktopRouterConfigContent,
  desktopTsconfigContent,
  desktopViteConfigContent,
} from "./tooling.js";
export { desktopMainContent } from "./main.js";
export { desktopRuntimeConfigContent } from "./runtime-config.js";
export { desktopPreloadContent } from "./preload.js";
export { desktopApiTransportContent, desktopRendererFetchContent } from "./api-transport.js";
export { desktopApiContractContent } from "./api-contract.js";
export { desktopOrpcContent } from "./orpc.js";
export {
  desktopAuthContent,
  desktopAuthStubContent,
  desktopQueryClientContent,
  desktopUseAuthStubContent,
} from "./clients.js";
export {
  desktopThemeProviderContent,
  desktopThemeToggleContent,
  desktopUiAlertContent,
  desktopUiBadgeContent,
  desktopUiButtonContent,
  desktopUiCardContent,
  desktopUiChatContent,
  desktopUiEmptyContent,
  desktopUiFieldContent,
  desktopUiInputContent,
  desktopUiLabelContent,
  desktopUiSelectContent,
  desktopUiSeparatorContent,
  desktopUiSkeletonContent,
  desktopUiTextareaContent,
} from "./ui/index.js";
export {
  desktopProvidersContent,
  desktopRendererCssContent,
  desktopRendererHtmlContent,
  desktopRendererMainContent,
  desktopRouteIndexContent,
  desktopRouteRootContent,
  desktopUseAuthContent,
} from "./shell/index.js";
export {
  desktopRouteAdminContent,
  desktopRouteAdminCreateUserContent,
  desktopRouteAdminUsersContent,
  desktopRouteBillingContent,
  desktopRouteDashboardContent,
  desktopRouteForgotPasswordContent,
  desktopRouteResetPasswordContent,
  desktopRouteSettingsContent,
  desktopRouteSignInContent,
  desktopRouteSignUpContent,
  desktopRouteTreeGenContent,
  desktopRouteTwoFactorContent,
} from "./routes/index.js";
export { desktopCoreFiles } from "./composer.js";

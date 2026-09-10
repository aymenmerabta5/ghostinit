import {
  headerActionsContent,
  headerFileContent,
  headerUserMenuContent,
  type HeaderNavigationCapabilities,
} from "../../../apps/fragments/header.js";

export function headerSingleContent(hasI18n = false, hasAuth = true): string {
  return headerFileContent("next", hasI18n, hasAuth);
}

export function singleHeaderTanstackContent(hasI18n = false, hasAuth = true): string {
  return headerFileContent("tanstack", hasI18n, hasAuth);
}

export function headerActionsSingleContent(hasI18n = false, hasNotifications = false): string {
  return headerActionsContent("next", hasI18n, hasNotifications);
}

export function headerUserMenuSingleContent(
  hasBilling = true,
  hasAdminNavigation = true,
  hasMessaging = false,
  hasPdf = false,
  navigation: HeaderNavigationCapabilities = {},
): string {
  return headerUserMenuContent(
    "next",
    hasBilling,
    hasAdminNavigation,
    hasMessaging,
    hasPdf,
    navigation,
  );
}

export function singleHeaderActionsTanstackContent(
  hasI18n = false,
  hasNotifications = false,
): string {
  return headerActionsContent("tanstack", hasI18n, hasNotifications);
}

export function singleHeaderUserMenuTanstackContent(
  hasBilling = true,
  hasAdminNavigation = true,
  hasMessaging = false,
  hasPdf = false,
  navigation: HeaderNavigationCapabilities = {},
): string {
  return headerUserMenuContent(
    "tanstack",
    hasBilling,
    hasAdminNavigation,
    hasMessaging,
    hasPdf,
    navigation,
  );
}

export function singleSignOutButtonTanstackContent(): string {
  return 'export { SignOutButton } from "@/features/app-shell/sign-out-button";\n';
}

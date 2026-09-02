import {
  headerActionsContent,
  headerFileContent,
  headerUserMenuContent,
  type HeaderNavigationCapabilities,
} from "../../../apps/fragments/header.js";

export function headerSingleContent(
  hasI18n = false,
  hasAuth = true,
  hasBilling = true,
  hasAdminNavigation = true,
  convexApiImport?: string,
  hasPdf = false,
  hasMessaging = false,
  navigation: HeaderNavigationCapabilities = {},
): string {
  return headerFileContent(
    "next",
    hasI18n,
    hasAuth,
    hasBilling,
    hasAdminNavigation,
    convexApiImport,
    hasPdf,
    hasMessaging,
    navigation,
  );
}

export function singleHeaderTanstackContent(
  hasI18n = false,
  hasAuth = true,
  hasBilling = true,
  hasAdminNavigation = true,
  convexApiImport?: string,
  hasPdf = false,
  hasMessaging = false,
  navigation: HeaderNavigationCapabilities = {},
): string {
  return headerFileContent(
    "tanstack",
    hasI18n,
    hasAuth,
    hasBilling,
    hasAdminNavigation,
    convexApiImport,
    hasPdf,
    hasMessaging,
    navigation,
  );
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
  return [
    '"use client"',
    "import * as React from 'react'",
    "import { useRouter } from '@tanstack/react-router'",
    "import { authClient } from '@/lib/auth-client'",
    "import { getQueryClient, transitionQueryAuthScope } from '@/lib/query-client'",
    "import { useSurfaceTranslations } from '@/lib/translations'",
    "import { Button } from '@/components/ui/button'",
    "export function SignOutButton(): React.JSX.Element {",
    "  const router = useRouter()",
    "  const t = useSurfaceTranslations('header')",
    "  async function handleClick(): Promise<void> { await authClient.signOut(); transitionQueryAuthScope(getQueryClient(), null); router.navigate({ to: '/' }) }",
    "  return (<Button variant='outline' onClick={() => void handleClick()}>{t('signOut')}</Button>)",
    "}",
    "",
  ].join("\n");
}

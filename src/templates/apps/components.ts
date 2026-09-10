/**
 * App components - deduplicated via fragments/theme, header, core
 * ThemeProvider, ThemeToggle identical Sun/Moon rotate-0 scale-100 dark:-rotate-90 shared via fragment
 * Header getInitials split /\s+/ shared via header fragment
 */

import { file, type TemplateFile } from "../shared.js";
import {
  themeProviderFileContent,
  themeToggleFileContent,
  providersFileContent,
} from "./fragments/theme.js";
import { convexClientProviderContent } from "./fragments/convex-providers.js";
import {
  headerActionsContent,
  headerFileContent,
  headerUserMenuContent,
  workspaceShellFiles,
  signOutButtonContent,
  type HeaderNavigationCapabilities,
} from "./fragments/header.js";
import {
  orpcClientContent,
  useCopyHookContent,
  useBillingHookContent,
  useAuthHookContent,
  authClientShim,
} from "./fragments/core.js";
import type { AddonInstallerMap } from "../../lib/addons.js";
import { BILLING_PROVIDERS, hasAddon } from "../../lib/addons.js";
import { surfaceTranslationFiles } from "../i18n/surface.js";
import { canonicalQueryAuthHookFile, queryAuthBoundaryFile } from "./fragments/query-auth.js";
import { requestOwnedSnapshotFile } from "./fragments/request-owned-snapshot.js";

type AddonMapInput = AddonInstallerMap | Record<string, { inUse: boolean }> | undefined;

function isConvex(input?: AddonMapInput): boolean {
  if (!input) return false;
  if (hasAddon) {
    try {
      return hasAddon(input as AddonInstallerMap, "convex");
    } catch {
      // fallback
    }
  }
  return Boolean((input as Record<string, { inUse?: boolean }>).convex?.inUse);
}

export function componentFiles(addonMap?: AddonMapInput): TemplateFile[] {
  const convex = isConvex(addonMap);
  const analytics = addonMap ? hasAddon(addonMap as AddonInstallerMap, "analytics") : true;
  const auth = addonMap ? hasAddon(addonMap as AddonInstallerMap, "auth") : true;
  const email = addonMap ? hasAddon(addonMap as AddonInstallerMap, "email") : true;
  const api = addonMap ? hasAddon(addonMap as AddonInstallerMap, "api") : true;
  const i18n = addonMap ? hasAddon(addonMap as AddonInstallerMap, "i18n") : false;
  const pdf = addonMap ? hasAddon(addonMap as AddonInstallerMap, "pdf") : false;
  const messaging = addonMap ? hasAddon(addonMap as AddonInstallerMap, "messaging") : false;
  const navigation: HeaderNavigationCapabilities = addonMap
    ? {
        eve: hasAddon(addonMap as AddonInstallerMap, "eve"),
        notifications: hasAddon(addonMap as AddonInstallerMap, "notifications"),
        storage: hasAddon(addonMap as AddonInstallerMap, "storage"),
        featureFlags:
          hasAddon(addonMap as AddonInstallerMap, "featureFlags") ||
          hasAddon(addonMap as AddonInstallerMap, "posthog"),
        jobs: hasAddon(addonMap as AddonInstallerMap, "jobsApi"),
      }
    : {};
  const billing = addonMap
    ? hasAddon(addonMap as AddonInstallerMap, "billing") ||
      BILLING_PROVIDERS.some((provider) => hasAddon(addonMap as AddonInstallerMap, provider))
    : true;
  const hasTypedAdminNavigation =
    auth && api && !(addonMap && hasAddon(addonMap as AddonInstallerMap, "database:none"));
  const base: TemplateFile[] = [
    ...surfaceTranslationFiles({
      enabled: i18n,
      framework: "next",
      sourceRoot: "apps/web/src",
    }),
    providersComponent(convex, analytics, i18n, auth),
    ...(auth ? [queryAuthBoundaryFile("apps/web/src", api)] : []),
    ...(auth && api ? [canonicalQueryAuthHookFile(), requestOwnedSnapshotFile()] : []),
    themeProviderComponent(),
    themeToggleComponent(),
    headerComponent(i18n, auth),
    ...workspaceShellFiles("next", {
      sourceRoot: "apps/web/src",
      hasAuth: auth,
      hasBilling: billing,
      hasAdminNavigation: hasTypedAdminNavigation,
      hasPdf: pdf,
      hasMessaging: messaging,
      navigation,
    }),
    ...(auth
      ? headerSupportComponents(i18n, billing, hasTypedAdminNavigation, messaging, pdf, navigation)
      : []),
    ...(auth ? [signOutButton()] : []),
    authClient(convex ? "convex" : "postgres", email),
    useCopyHook(),
    useAuthHook(),
  ];
  if (convex) {
    base.push(convexClientProviderComponent(auth));
  }
  if (api) base.push(orpcClient());
  if (api && billing) base.push(useBillingHook());
  return base;
}

function themeProviderComponent(): TemplateFile {
  return file("apps/web/src/components/theme-provider.tsx", themeProviderFileContent());
}

function themeToggleComponent(): TemplateFile {
  return file("apps/web/src/components/theme-toggle.tsx", themeToggleFileContent());
}

function providersComponent(
  isConvex = false,
  hasAnalytics = true,
  hasI18n = false,
  hasAuth = true,
): TemplateFile {
  return file(
    "apps/web/src/components/providers.tsx",
    providersFileContent("next", isConvex, hasAnalytics, hasI18n, hasAuth),
  );
}

function convexClientProviderComponent(hasAuth: boolean): TemplateFile {
  return file(
    "apps/web/src/components/providers/convex-client-provider.tsx",
    convexClientProviderContent("next", hasAuth),
  );
}

function headerComponent(hasI18n = false, hasAuth = true): TemplateFile {
  return file("apps/web/src/components/header.tsx", headerFileContent("next", hasI18n, hasAuth));
}

function headerSupportComponents(
  hasI18n = false,
  hasBilling = true,
  hasAdminNavigation = true,
  hasMessaging = false,
  hasPdf = false,
  navigation: HeaderNavigationCapabilities = {},
): TemplateFile[] {
  return [
    file(
      "apps/web/src/components/header-actions.tsx",
      headerActionsContent("next", hasI18n, navigation.notifications),
    ),
    file(
      "apps/web/src/components/header-user-menu.tsx",
      headerUserMenuContent(
        "next",
        hasBilling,
        hasAdminNavigation,
        hasMessaging,
        hasPdf,
        navigation,
      ),
    ),
  ];
}

function useCopyHook(): TemplateFile {
  return file("apps/web/src/hooks/use-copy.ts", useCopyHookContent());
}

function useBillingHook(): TemplateFile {
  return file("apps/web/src/hooks/use-billing.ts", useBillingHookContent());
}

function useAuthHook(): TemplateFile {
  return file("apps/web/src/hooks/use-auth.ts", useAuthHookContent());
}

function signOutButton(): TemplateFile {
  return file("apps/web/src/components/sign-out-button.tsx", signOutButtonContent("next"));
}

function authClient(database: "postgres" | "convex", hasEmail: boolean): TemplateFile {
  return file("apps/web/src/lib/auth-client.ts", authClientShim(database, "nextjs", hasEmail));
}

function orpcClient(): TemplateFile {
  return file("apps/web/src/lib/orpc.ts", orpcClientContent("next"));
}

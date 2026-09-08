/**
 * TanStack Start components — deduplicated via fragments/theme, header, core
 * Same shadcn composition as Next but adapted for Start, now sharing via fragments
 * Theme-provider, theme-toggle identical – extracted to fragments/theme.ts
 * Header getInitials split /\s+/ sticky backdrop-blur shared via header fragment with router param
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
  authClientShim,
  tanstackUseCopyHookContent,
  tanstackUseBillingHookContent,
  tanstackUseAuthHookContent,
} from "./fragments/core.js";
import type { AddonInstallerMap } from "../../lib/addons.js";
import { hasAddon } from "../../lib/addons.js";
import { surfaceTranslationFiles } from "../i18n/surface.js";
import { tanstackServerFoundationFiles } from "./fragments/tanstack-server.js";

type AddonMapInput = AddonInstallerMap | Record<string, { inUse: boolean }> | undefined;

function isConvex(input?: AddonMapInput): boolean {
  if (!input) return false;
  try {
    return hasAddon(input as AddonInstallerMap, "convex");
  } catch {
    return Boolean((input as Record<string, { inUse?: boolean }>).convex?.inUse);
  }
}

export function tanstackComponentFiles(addonMap?: AddonMapInput): TemplateFile[] {
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
      ["stripe", "chargily", "paddle", "polar"].some((provider) =>
        hasAddon(addonMap as AddonInstallerMap, provider),
      )
    : true;
  const hasTypedAdminNavigation =
    auth && api && !(addonMap && hasAddon(addonMap as AddonInstallerMap, "database:none"));
  const initialReads = {
    admin: hasTypedAdminNavigation,
    billing: hasTypedAdminNavigation && billing,
    featureFlags: hasTypedAdminNavigation && navigation.featureFlags === true,
    identity: hasTypedAdminNavigation,
    messaging: hasTypedAdminNavigation && messaging ? (convex ? "convex" : "postgres") : false,
  } as const;
  const base: TemplateFile[] = [
    ...surfaceTranslationFiles({
      enabled: i18n,
      framework: "tanstack",
      sourceRoot: "apps/web/src",
    }),
    themeProviderComponent(),
    themeToggleComponent(),
    headerComponent(i18n, auth),
    ...workspaceShellFiles("tanstack", {
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
    signOutButton(),
    authClientFile(convex ? "convex" : "postgres", email),
    useCopyHook(),
    useAuthHook(),
    providersComponent(convex, analytics, i18n, auth),
    ...tanstackServerFoundationFiles("monorepo", auth, api, initialReads),
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
    providersFileContent("tanstack", isConvex, hasAnalytics, hasI18n, hasAuth),
  );
}

function convexClientProviderComponent(hasAuth: boolean): TemplateFile {
  return file(
    "apps/web/src/components/providers/convex-client-provider.tsx",
    convexClientProviderContent("tanstack", hasAuth),
  );
}

function headerComponent(hasI18n = false, hasAuth = true): TemplateFile {
  return file(
    "apps/web/src/components/header.tsx",
    headerFileContent("tanstack", hasI18n, hasAuth),
  );
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
      headerActionsContent("tanstack", hasI18n, navigation.notifications),
    ),
    file(
      "apps/web/src/components/header-user-menu.tsx",
      headerUserMenuContent(
        "tanstack",
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
  return file("apps/web/src/hooks/use-copy.ts", tanstackUseCopyHookContent());
}

function useBillingHook(): TemplateFile {
  return file("apps/web/src/hooks/use-billing.ts", tanstackUseBillingHookContent());
}

function useAuthHook(): TemplateFile {
  return file("apps/web/src/hooks/use-auth.ts", tanstackUseAuthHookContent());
}

function signOutButton(): TemplateFile {
  return file("apps/web/src/components/sign-out-button.tsx", signOutButtonContent("tanstack"));
}

function authClientFile(database: "postgres" | "convex", hasEmail: boolean): TemplateFile {
  return file(
    "apps/web/src/lib/auth-client.ts",
    authClientShim(database, "tanstack-start", hasEmail),
  );
}

function orpcClient(): TemplateFile {
  return file("apps/web/src/lib/orpc.ts", orpcClientContent("tanstack"));
}

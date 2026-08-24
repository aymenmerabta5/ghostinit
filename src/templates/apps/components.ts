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
import { headerFileContent, signOutButtonContent, adminGuardContent } from "./fragments/header.js";
import {
  orpcClientContent,
  useCopyHookContent,
  useBillingHookContent,
  useAuthHookContent,
  authClientShim,
} from "./fragments/core.js";
import type { AddonInstallerMap } from "../../lib/addons.js";
import { hasAddon } from "../../lib/addons.js";

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
  const base: TemplateFile[] = [
    providersComponent(convex, analytics),
    themeProviderComponent(),
    themeToggleComponent(),
    headerComponent(),
    signOutButton(),
    authClient(),
    adminGuard(),
    orpcClient(),
    useCopyHook(),
    useBillingHook(),
    useAuthHook(),
  ];
  if (convex) {
    base.push(convexClientProviderComponent());
  }
  return base;
}

function themeProviderComponent(): TemplateFile {
  return file("apps/web/src/components/theme-provider.tsx", themeProviderFileContent());
}

function themeToggleComponent(): TemplateFile {
  return file("apps/web/src/components/theme-toggle.tsx", themeToggleFileContent());
}

function providersComponent(isConvex = false, hasAnalytics = true): TemplateFile {
  return file(
    "apps/web/src/components/providers.tsx",
    providersFileContent("next", isConvex, hasAnalytics),
  );
}

function convexClientProviderComponent(): TemplateFile {
  return file(
    "apps/web/src/components/providers/convex-client-provider.tsx",
    convexClientProviderContent(),
  );
}

function headerComponent(): TemplateFile {
  return file("apps/web/src/components/header.tsx", headerFileContent("next"));
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

function authClient(): TemplateFile {
  return file("apps/web/src/lib/auth-client.ts", authClientShim());
}

function adminGuard(): TemplateFile {
  return file("apps/web/src/components/admin-guard.tsx", adminGuardContent("next"));
}

function orpcClient(): TemplateFile {
  return file("apps/web/src/lib/orpc.ts", orpcClientContent("next"));
}

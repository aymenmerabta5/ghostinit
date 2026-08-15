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
import { headerFileContent, signOutButtonContent, adminGuardContent } from "./fragments/header.js";
import {
  orpcClientContent,
  authClientShim,
  tanstackUseCopyHookContent,
  tanstackUseBillingHookContent,
  tanstackUseAuthHookContent,
} from "./fragments/core.js";
import type { AddonInstallerMap } from "../../lib/addons.js";
import { hasAddon } from "../../lib/addons.js";

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
  const base: TemplateFile[] = [
    themeProviderComponent(),
    themeToggleComponent(),
    headerComponent(),
    signOutButton(),
    authClientFile(),
    adminGuard(),
    orpcClient(),
    useCopyHook(),
    useBillingHook(),
    useAuthHook(),
    providersComponent(convex),
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

function providersComponent(isConvex = false): TemplateFile {
  return file("apps/web/src/components/providers.tsx", providersFileContent("tanstack", isConvex));
}

function convexClientProviderComponent(): TemplateFile {
  return file(
    "apps/web/src/components/providers/convex-client-provider.tsx",
    convexClientProviderContent("tanstack"),
  );
}

function headerComponent(): TemplateFile {
  return file("apps/web/src/components/header.tsx", headerFileContent("tanstack"));
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

function authClientFile(): TemplateFile {
  return file("apps/web/src/lib/auth-client.ts", authClientShim());
}

function adminGuard(): TemplateFile {
  return file("apps/web/src/components/admin-guard.tsx", adminGuardContent("tanstack"));
}

function orpcClient(): TemplateFile {
  return file("apps/web/src/lib/orpc.ts", orpcClientContent("tanstack"));
}

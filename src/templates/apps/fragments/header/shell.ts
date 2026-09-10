import { file, type TemplateFile } from "../../../shared.js";
import type { HeaderNavigationCapabilities, RouterType } from "./shared.js";
import { workspaceNavigationContent, workspaceNavigationModelContent } from "./navigation.js";
import { workspaceSidebarContent, workspaceNavigationTriggerContent } from "./sidebar.js";
import { workspaceIdentityContent, workspaceIdentityStatusContent } from "./identity.js";

import { appShellFeatureFiles } from "./app-shell-feature.js";

interface WorkspaceShellOptions {
  sourceRoot: string;
  hasAuth: boolean;
  hasBilling: boolean;
  hasAdminNavigation: boolean;
  hasPdf: boolean;
  hasMessaging: boolean;
  navigation: HeaderNavigationCapabilities;
}

export function workspaceShellFiles(
  router: RouterType,
  options: WorkspaceShellOptions,
): TemplateFile[] {
  const { sourceRoot, hasAuth, hasBilling, hasAdminNavigation, hasPdf, hasMessaging, navigation } =
    options;
  const root = `${sourceRoot}/components`;
  if (!hasAuth)
    return [
      file(
        `${root}/app-shell.tsx`,
        `import type * as React from "react";
import { Header } from "./header";

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <><Header />{children}</>;
}
`,
      ),
    ];
  return [
    file(`${root}/app-shell.tsx`, 'export { AppShell } from "@/features/app-shell/app-shell";\n'),
    ...appShellFeatureFiles(
      sourceRoot,
      router,
      Boolean(navigation.notifications),
      workspaceNavigationModelContent(
        router,
        hasBilling,
        hasAdminNavigation,
        hasPdf,
        hasMessaging,
        navigation,
      ),
    ),
    file(`${root}/workspace-identity.ts`, workspaceIdentityContent()),
    file(`${root}/workspace-identity-status.tsx`, workspaceIdentityStatusContent()),
    file(
      `${root}/workspace-navigation.tsx`,
      workspaceNavigationContent(
        router,
        hasBilling,
        hasAdminNavigation,
        hasPdf,
        hasMessaging,
        navigation,
      ),
    ),
    file(`${root}/workspace-sidebar.tsx`, workspaceSidebarContent()),
    file(`${root}/workspace-navigation-trigger.tsx`, workspaceNavigationTriggerContent()),
  ];
}

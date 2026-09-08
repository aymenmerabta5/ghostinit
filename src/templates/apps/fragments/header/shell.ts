import { file, type TemplateFile } from "../../../shared.js";
import type { HeaderNavigationCapabilities, RouterType } from "./shared.js";
import { workspaceNavigationContent } from "./navigation.js";
import { workspaceSidebarContent, workspaceNavigationTriggerContent } from "./sidebar.js";
import { workspaceIdentityContent, workspaceIdentityStatusContent } from "./identity.js";

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
    file(`${root}/app-shell.tsx`, appShellContent(router)),
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

function appShellContent(router: RouterType): string {
  return `"use client";

import type * as React from "react";
${router === "next" ? 'import { usePathname } from "next/navigation";' : 'import { useRouterState } from "@tanstack/react-router";'}
import { useSurfaceTranslations } from "@/lib/translations";
import { useAuth } from "../hooks/use-auth";
import { useQueryAuthSession } from "./query-auth-boundary";
import { Header } from "./header";
import { HeaderActions } from "./header-actions";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WorkspaceNavigationTrigger } from "./workspace-navigation-trigger";
import { workspaceSection } from "./workspace-navigation";
import { resolveWorkspaceIdentity } from "./workspace-identity";

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const session = useAuth();
  const canonical = useQueryAuthSession();
  const pathname = ${router === "next" ? 'usePathname() ?? "/"' : "useRouterState({ select: (state) => state.location.pathname })"};
  const t = useSurfaceTranslations("header");
  const pending = canonical?.hasCanonicalApi ? canonical.isPending : session.isPending;
  const error = canonical?.hasCanonicalApi ? canonical.error : session.error;
  const currentUser = canonical?.hasCanonicalApi ? canonical.currentRequest?.user : session.user;
  const retry = canonical?.retry ?? (() => { void session.refetch(); });
  const identity = resolveWorkspaceIdentity({ pending, error, user: currentUser ?? null, retry });
  const section = workspaceSection(pathname);
  const workspace = section !== undefined;
  const navigationProps = { pathname, identity };

  return <div className="min-h-dvh">
    {workspace ? <WorkspaceSidebar {...navigationProps} /> : null}
    <div className={workspace ? "min-w-0 lg:ps-[232px]" : "min-w-0"}>
      <Header workspace={workspace} title={section ? t(section) : undefined} navigation={workspace ? <WorkspaceNavigationTrigger {...navigationProps} /> : undefined}>
        <HeaderActions identity={identity} />
      </Header>
      {children}
    </div>
  </div>;
}
`;
}

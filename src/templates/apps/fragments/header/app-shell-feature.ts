import { file, type TemplateFile } from "../../../shared.js";
import type { RouterType } from "./shared.js";

function queriesContent(): string {
  return `"use client";
import { useAuth } from "@/hooks/use-auth";
import { useQueryAuthSession } from "@/components/query-auth-boundary";

export function useShellIdentitySource() {
  const session = useAuth();
  const canonical = useQueryAuthSession();
  return {
    pending: canonical?.hasCanonicalApi ? canonical.isPending : session.isPending,
    error: canonical?.hasCanonicalApi ? canonical.error : session.error,
    user: (canonical?.hasCanonicalApi ? canonical.currentRequest?.user : session.user) ?? null,
    retry: canonical?.retry ?? (() => { void session.refetch(); }),
  };
}
`;
}

function mutationsContent(): string {
  return `"use client";
import { authClient } from "@/lib/auth-client";
import { getQueryClient, transitionQueryAuthScope } from "@/lib/query-client";

export async function signOutShell(): Promise<void> {
  await authClient.signOut();
  transitionQueryAuthScope(getQueryClient(), null);
}
`;
}

function actionsContent(router: RouterType): string {
  return `"use client";
${router === "next" ? 'import { useRouter } from "next/navigation";' : 'import { useRouter } from "@tanstack/react-router";'}
import { signOutShell } from "./mutations";
import type { WorkspaceDestination } from "./navigation-model";

export function useShellActions() {
  const router = useRouter();
  function onNavigate(destination: WorkspaceDestination): void {
    ${router === "next" ? "router.push(destination);" : "void router.navigate({ to: destination });"}
  }
  async function onSignOut(): Promise<void> {
    await signOutShell();
    ${router === "next" ? 'router.push("/");\n    router.refresh();' : 'void router.navigate({ to: "/" });'}
  }
  return { onNavigate, onSignOut };
}
`;
}

function controllerContent(router: RouterType): string {
  return `"use client";
${router === "next" ? 'import { usePathname } from "next/navigation";' : 'import { useRouterState } from "@tanstack/react-router";'}
import { resolveWorkspaceIdentity } from "@/components/workspace-identity";
import { useShellIdentitySource } from "./queries";
import { useShellActions } from "./use-shell-actions";
import { workspaceSection } from "./navigation-model";

export function useAppShell() {
  const source = useShellIdentitySource();
  const identity = resolveWorkspaceIdentity(source);
  const actions = useShellActions();
  const pathname = ${router === "next" ? 'usePathname() ?? "/"' : "useRouterState({ select: (state) => state.location.pathname })"};
  return { identity, pathname, section: workspaceSection(pathname), ...actions };
}
`;
}

function compositionContent(hasNotifications: boolean): string {
  return `"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { Header } from "@/components/header";
import { HeaderActions } from "@/components/header-actions";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { WorkspaceNavigationTrigger } from "@/components/workspace-navigation-trigger";
${hasNotifications ? 'import { NotificationInboxBell } from "@/features/notifications/bell";' : ""}
import { useAppShell } from "./use-app-shell";

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { identity, pathname, section, onNavigate, onSignOut } = useAppShell();
  const t = useSurfaceTranslations("header");
  const workspace = section !== undefined;
  const navigationProps = { pathname, identity };
  return <div className="min-h-dvh">
    {workspace ? <WorkspaceSidebar {...navigationProps} /> : null}
    <div className={workspace ? "min-w-0 lg:ps-[232px]" : "min-w-0"}>
      <Header workspace={workspace} title={section ? t(section) : undefined} navigation={workspace ? <WorkspaceNavigationTrigger {...navigationProps} /> : undefined}>
        <HeaderActions identity={identity} onNavigate={onNavigate} onSignOut={onSignOut}${hasNotifications ? " notifications={<NotificationInboxBell />}" : ""} />
      </Header>
      {children}
    </div>
  </div>;
}
`;
}

function signOutCompositionContent(): string {
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
import { useShellActions } from "./use-shell-actions";

export function SignOutButton(): React.JSX.Element {
  const { onSignOut } = useShellActions();
  const t = useSurfaceTranslations("header");
  return <Button variant="outline" onClick={() => void onSignOut()}>{t("signOut")}</Button>;
}
`;
}

export function appShellFeatureFiles(
  sourceRoot: string,
  router: RouterType,
  hasNotifications: boolean,
  navigationModel: string,
): TemplateFile[] {
  const root = `${sourceRoot}/features/app-shell`;
  return [
    file(`${root}/queries.ts`, queriesContent()),
    file(`${root}/mutations.ts`, mutationsContent()),
    file(`${root}/use-shell-actions.ts`, actionsContent(router)),
    file(`${root}/use-app-shell.ts`, controllerContent(router)),
    file(`${root}/navigation-model.ts`, navigationModel),
    file(`${root}/app-shell.tsx`, compositionContent(hasNotifications)),
    file(`${root}/sign-out-button.tsx`, signOutCompositionContent()),
  ];
}

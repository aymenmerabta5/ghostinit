import { file, type TemplateFile } from "../../../shared.js";
import { identityWorkspaceSourceRoot, type IdentityWorkspaceMode } from "./model.js";
import { webIdentityWorkspaceDataFiles } from "./web-data.js";
import { webIdentityWorkspaceFeatureFiles, webWorkspaceFeatureContent } from "./web-feature.js";

export type IdentityWorkspaceRouter = "next" | "tanstack";

function webWorkspaceRouteContent(
  router: IdentityWorkspaceRouter,
  mode: IdentityWorkspaceMode,
): string {
  if (router === "tanstack") {
    return `import { createFileRoute } from "@tanstack/react-router";
import { IdentityWorkspace } from "@/features/identity-workspace/identity-workspace";
import { loadInitialIdentityWorkspace, requireProtectedRoute } from "@/lib/protected-route";

export const Route = createFileRoute("/settings/workspace")({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  loader: ({ context }) => loadInitialIdentityWorkspace(context),
  component: WorkspacePage,
});

function WorkspacePage(): React.JSX.Element {
  return <main className="mx-auto w-full max-w-6xl p-6"><IdentityWorkspace /></main>;
}
`;
  }
  const applicationModule =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "${applicationModule}";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";
import { QueryAuthStatus } from "@/components/query-auth-boundary";
import { IdentityWorkspace } from "@/features/identity-workspace/identity-workspace";
import type { IdentityWorkspaceInitialData } from "@/features/identity-workspace/types";

async function WorkspaceData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const me = await application.me();
  const principal = application.principal;
  if (!me.user || !principal) redirect("/sign-in");
  const scope = { userId: principal.identityUserId, sessionId: principal.sessionId, tenantId: principal.activeOrganizationId, teamId: principal.activeTeamId };
  const initialData: IdentityWorkspaceInitialData = await application.identity.workspace.snapshot();
  return <RequestOwnedSnapshot scope={scope}><IdentityWorkspace initialData={initialData} /></RequestOwnedSnapshot>;
}

export default function WorkspacePage(): React.JSX.Element {
  return <Suspense fallback={<QueryAuthStatus />}><WorkspaceData /></Suspense>;
}
`;
}

export function webIdentityWorkspaceFiles(
  router: IdentityWorkspaceRouter,
  mode: IdentityWorkspaceMode,
  hasI18n = false,
): TemplateFile[] {
  const sourceRoot = identityWorkspaceSourceRoot(mode);
  const routePath =
    router === "tanstack"
      ? `${sourceRoot}/routes/settings.workspace.tsx`
      : `${sourceRoot}/app/settings/workspace/page.tsx`;
  return [
    ...webIdentityWorkspaceFeatureFiles(mode, hasI18n),
    ...webIdentityWorkspaceDataFiles(mode, router),
    file(routePath, webWorkspaceRouteContent(router, mode)),
  ];
}

export { webWorkspaceFeatureContent, webWorkspaceRouteContent };

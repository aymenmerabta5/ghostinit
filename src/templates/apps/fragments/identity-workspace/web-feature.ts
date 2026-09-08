import { file, type TemplateFile } from "../../../shared.js";
import { identityWorkspaceFeatureRoot, type IdentityWorkspaceMode } from "./model.js";
import {
  identityWorkspaceControllerContent,
  identityWorkspaceTypesContent,
} from "./web-controller.js";
import { identityWorkspaceWebI18n } from "./web-i18n.js";
import { identityWorkspacePresentationContents } from "./web-presentation.js";
import { identityWorkspaceAccessContent } from "./web-access.js";

export function webWorkspaceFeatureContent(hasI18n = false, headingLevel: 1 | 2 = 1): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  const heading = headingLevel === 2 ? "h2" : "h1";
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
${i18n.importLine}
import { InvitationsCard } from "./components/invitations-card";
import { MembersCard } from "./components/members-card";
import { OrganizationsCard } from "./components/organizations-card";
import { TeamsCard } from "./components/teams-card";
import { useIdentityWorkspaceController } from "./controller";
import type { IdentityWorkspaceInitialData } from "./types";

export function IdentityWorkspace({ initialData }: { initialData?: IdentityWorkspaceInitialData }): React.JSX.Element {
${i18n.hookLine}
  const workspace = useIdentityWorkspaceController(t("operationError"), initialData);
  return <div className="flex flex-col gap-6">
    <div><p className="text-sm font-medium text-primary">${i18n.child("kicker")}</p><${heading} className="text-3xl font-semibold tracking-tight">${i18n.child("title")}</${heading}><p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">${i18n.child("webDescription")}</p></div>
    {workspace.permissions.isPending ? <p role="status" className="text-sm text-muted-foreground">${i18n.child("checkingPermissions")}</p> : null}
    {workspace.permissions.hasError ? <Alert variant="destructive"><AlertTitle>${i18n.child("permissionsUnavailable")}</AlertTitle><AlertDescription>${i18n.child("permissionsUnavailableDescription")}<Button variant="outline" size="sm" onClick={() => void workspace.permissions.retry()}>${i18n.child("retry")}</Button></AlertDescription></Alert> : null}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
    <div className="flex flex-col gap-6">
      <OrganizationsCard workspace={workspace} />
      {workspace.error ? <Alert variant="destructive"><AlertTitle>${i18n.child("operationError")}</AlertTitle><AlertDescription>{workspace.error}</AlertDescription></Alert> : null}
    </div>
    <div className="flex flex-col gap-6">
      <MembersCard workspace={workspace} />
      <TeamsCard workspace={workspace} />
      <InvitationsCard workspace={workspace} />
    </div>
    </div>
  </div>;
}
`;
}

export function webIdentityWorkspaceFeatureFiles(
  mode: IdentityWorkspaceMode,
  hasI18n = false,
  headingLevel: 1 | 2 = 1,
): TemplateFile[] {
  const root = identityWorkspaceFeatureRoot(mode);
  return [
    file(`${root}/identity-workspace.tsx`, webWorkspaceFeatureContent(hasI18n, headingLevel)),
    file(`${root}/controller.ts`, identityWorkspaceControllerContent()),
    file(`${root}/access.ts`, identityWorkspaceAccessContent()),
    file(`${root}/types.ts`, identityWorkspaceTypesContent()),
    ...identityWorkspacePresentationContents(hasI18n).map(({ content, path }) =>
      file(`${root}/${path}`, content),
    ),
  ];
}

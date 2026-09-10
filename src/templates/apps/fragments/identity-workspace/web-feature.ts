import { file, type TemplateFile } from "../../../shared.js";
import { identityWorkspaceFeatureRoot, type IdentityWorkspaceMode } from "./model.js";
import { identityWorkspaceTypesContent } from "./web-controller.js";
import { identityWorkspaceWebI18n } from "./web-i18n.js";
import { identityWorkspacePresentationContents } from "./web-presentation.js";
import { identityWorkspaceAccessContent } from "./web-access.js";
import { portableWorkspaceWorkflowFiles } from "./workspace-workflows.js";

export function webWorkspaceFeatureContent(hasI18n = false, headingLevel: 1 | 2 = 1): string {
  const i18n = identityWorkspaceWebI18n(hasI18n);
  const heading = headingLevel === 2 ? "h2" : "h1";
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
${i18n.importLine}
import { WorkspaceInvitations } from "./workspace-invitations";
import { WorkspaceMembers } from "./workspace-members";
import { WorkspaceOrganizations } from "./workspace-organizations";
import { WorkspaceTeams } from "./workspace-teams";
import { useWorkspaceSelection } from "./use-workspace-selection";
import type { IdentityWorkspaceInitialData } from "./types";

export function IdentityWorkspace({ initialData }: { initialData?: IdentityWorkspaceInitialData }): React.JSX.Element {
${i18n.hookLine}
  const selection = useWorkspaceSelection(initialData);
  const { permissions, organizationId, teamId } = selection.queries;
  return <div className="flex flex-col gap-6">
    <div><p className="text-sm font-medium text-primary">${i18n.child("kicker")}</p><${heading} className="text-3xl font-semibold tracking-tight">${i18n.child("title")}</${heading}><p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">${i18n.child("webDescription")}</p></div>
    {permissions.isPending ? <p role="status" className="text-sm text-muted-foreground">${i18n.child("checkingPermissions")}</p> : null}
    {permissions.hasError ? <Alert variant="destructive"><AlertTitle>${i18n.child("permissionsUnavailable")}</AlertTitle><AlertDescription>${i18n.child("permissionsUnavailableDescription")}<Button variant="outline" size="sm" onClick={() => void permissions.retry()}>${i18n.child("retry")}</Button></AlertDescription></Alert> : null}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
    <div className="flex flex-col gap-6">
      <WorkspaceOrganizations selection={selection} />
    </div>
    {organizationId ? <div className="flex flex-col gap-6">
      <WorkspaceMembers key={"members:" + organizationId} selection={selection} />
      <WorkspaceTeams key={"teams:" + organizationId + ":" + teamId} selection={selection} />
      <WorkspaceInvitations key={"invitations:" + organizationId} selection={selection} />
    </div> : null}
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
    ...portableWorkspaceWorkflowFiles(root),
    ...(["Organizations", "Members", "Teams", "Invitations"] as const).map((name) =>
      file(
        `${root}/workspace-${name.toLowerCase()}.tsx`,
        `"use client";
import type * as React from "react";
import { ${name}Card } from "./components/${name.toLowerCase()}-card";
import { WorkspaceError } from "./components/workspace-error";
import { useWorkspace${name} } from "./use-workspace-${name.toLowerCase()}";
import type { WorkspaceSelection } from "./use-workspace-selection";

export function Workspace${name}({ selection }: { selection: WorkspaceSelection }): React.JSX.Element {
  const model = useWorkspace${name}(selection);
  return <section className="flex flex-col gap-3"><${name}Card model={model} /><WorkspaceError error={model.error}${name === "Organizations" ? " recovery={model.readRecovery}" : ""} /></section>;
}
`,
      ),
    ),
    file(
      `${root}/components/workspace-error.tsx`,
      `import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
interface WorkspaceReadRecovery { pending: boolean; retry(): void; }
export function WorkspaceError({ error, recovery }: { error: unknown; recovery?: WorkspaceReadRecovery | null }): React.JSX.Element | null {
  const t = useSurfaceTranslations("workspace");
  if (!error) return null;
  return <Alert variant="destructive"><AlertTitle>{t(recovery ? "organizationsReadError" : "operationError")}</AlertTitle><AlertDescription className="flex flex-col gap-3">
    <p>{t(recovery ? "organizationsReadErrorDescription" : "operationErrorDescription")}</p>
    {recovery ? <Button type="button" size="sm" variant="outline" className="self-start" disabled={recovery.pending} onClick={recovery.retry}>{t(recovery.pending ? "loading" : "retry")}</Button> : null}
  </AlertDescription></Alert>;
}
`,
    ),
    file(`${root}/access.ts`, identityWorkspaceAccessContent()),
    file(`${root}/types.ts`, identityWorkspaceTypesContent()),
    ...identityWorkspacePresentationContents(hasI18n).map(({ content, path }) =>
      file(`${root}/${path}`, content),
    ),
  ];
}

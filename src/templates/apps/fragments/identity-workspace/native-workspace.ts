import { file, type TemplateFile } from "../../../shared.js";
import { desktopPath, mobilePath, type IdentityWorkspaceMode } from "./model.js";
import { webIdentityWorkspaceFeatureFiles } from "./web-feature.js";
import {
  identityWorkspaceBrowserQueriesContent,
  identityWorkspaceBrowserMutationsContent,
} from "./web-data.js";
import {
  identityWorkspacePermissionsContent,
  identityWorkspaceAccessContent,
} from "./web-access.js";
import { identityWorkspaceTypesContent } from "./web-controller.js";
import { portableWorkspaceWorkflowFiles } from "./workspace-workflows.js";
import { nativeI18nTemplate } from "../native-i18n.js";
import {
  expoOrganizationsCardContent,
  expoMembersCardContent,
  expoTeamsCardContent,
  expoInvitationsCardContent,
} from "./expo-workspace-views.js";

/** Electron shares the DOM presenters and portable operations, without web SSR adapters. */
export function desktopWorkspaceFeatureFiles(
  mode: IdentityWorkspaceMode,
  hasI18n: boolean,
): TemplateFile[] {
  const root = desktopPath(mode, "features/identity-workspace");
  const sourceRoot = "src/features/identity-workspace";
  const alias = mode === "monorepo" ? "@" : "@/renderer";
  const adapt = (content: string): string =>
    mode === "monorepo"
      ? content
      : content
          .replaceAll('"@/lib/', '"@/renderer/lib/')
          .replaceAll('"@/hooks/', '"@/renderer/hooks/')
          .replaceAll('"@/features/', '"@/renderer/features/');
  return [
    ...webIdentityWorkspaceFeatureFiles("single", hasI18n).map((entry) =>
      file(entry.path.replace(sourceRoot, root), adapt(entry.content)),
    ),
    file(`${root}/queries.ts`, adapt(identityWorkspaceBrowserQueriesContent(false))),
    file(`${root}/mutations.ts`, adapt(identityWorkspaceBrowserMutationsContent())),
    file(`${root}/permissions.ts`, identityWorkspacePermissionsContent()),
    file(
      desktopPath(mode, "routes/workspace.tsx"),
      `import type * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { IdentityWorkspace } from "${alias}/features/identity-workspace/identity-workspace";
export const Route = createFileRoute("/workspace")({ component: WorkspaceScreen });
function WorkspaceScreen(): React.JSX.Element { return <main className="mx-auto w-full max-w-6xl p-6"><IdentityWorkspace /></main>; }
`,
    ),
  ];
}

export function expoWorkspaceFeatureFiles(
  mode: IdentityWorkspaceMode,
  hasI18n: boolean,
): TemplateFile[] {
  const root = mobilePath(mode, "src/features/identity-workspace");
  const i18n = nativeI18nTemplate(hasI18n, "workspace");
  const sections = ["Organizations", "Members", "Teams", "Invitations"] as const;
  return [
    ...portableWorkspaceWorkflowFiles(root, true),
    file(`${root}/types.ts`, identityWorkspaceTypesContent()),
    file(`${root}/access.ts`, identityWorkspaceAccessContent()),
    file(`${root}/permissions.ts`, identityWorkspacePermissionsContent()),
    file(`${root}/queries.ts`, identityWorkspaceBrowserQueriesContent(false)),
    file(`${root}/mutations.ts`, identityWorkspaceBrowserMutationsContent()),
    file(
      `${root}/screen.tsx`,
      `import type * as React from "react";
import { ScrollView, View } from "react-native";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useWorkspaceSelection } from "./use-workspace-selection";
${sections.map((name) => `import { Workspace${name} } from "./workspace-${name.toLowerCase()}";`).join("\n")}
${i18n.importLine}
export function WorkspaceScreen(): React.JSX.Element {
${i18n.hookLine}
  const selection = useWorkspaceSelection();
  const { organizationId, teamId, permissions } = selection.queries;
  return <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic"><View className="w-full max-w-[960px] self-center gap-5 p-5">
    <View className="gap-1"><Text className="text-xs font-semibold uppercase tracking-widest text-primary">${i18n.child("kicker", "Identity workspace")}</Text><Text className="text-3xl font-bold tracking-tight">${i18n.child("title", "Organizations and teams")}</Text><Text className="text-sm text-muted-foreground">${i18n.child("mobileDescription", "Manage organizations, teammates, and invitations.")}</Text></View>
    {permissions.isPending ? <Text accessibilityLiveRegion="polite">${i18n.child("checkingPermissions", "Checking permissions")}</Text> : null}
    {permissions.hasError ? <Alert variant="destructive" accessibilityRole="alert"><AlertDescription>${i18n.child("permissionsUnavailableDescription", "Permissions could not be loaded. Try again.")}</AlertDescription><Button variant="outline" onPress={() => void permissions.retry()}><Text>${i18n.child("retry", "Retry")}</Text></Button></Alert> : null}
    <WorkspaceOrganizations selection={selection} />
    {organizationId ? <>
    <WorkspaceMembers key={"members:" + organizationId} selection={selection} />
    <WorkspaceTeams key={"teams:" + organizationId + ":" + teamId} selection={selection} />
    <WorkspaceInvitations key={"invitations:" + organizationId} selection={selection} />
    </> : null}
  </View></ScrollView>;
}
`,
    ),
    ...sections.map((name) =>
      file(
        `${root}/workspace-${name.toLowerCase()}.tsx`,
        `import type * as React from "react";
import { View } from "react-native";
import { ${name}Card } from "./components/${name.toLowerCase()}-card";
import { WorkspaceError } from "./components/workspace-error";
import { useWorkspace${name} } from "./use-workspace-${name.toLowerCase()}";
import type { WorkspaceSelection } from "./use-workspace-selection";
export function Workspace${name}({ selection }: { selection: WorkspaceSelection }): React.JSX.Element {
  const model = useWorkspace${name}(selection);
  return <View className="gap-3"><${name}Card model={model}${name === "Organizations" ? "" : ` loading={Boolean(selection.queries.organizationId) && selection.queries.${name === "Members" ? "members" : name === "Teams" ? "teams" : "invitations"}.isPending}`} /><WorkspaceError error={model.error} /></View>;
}
`,
      ),
    ),
    file(`${root}/components/organizations-card.tsx`, expoOrganizationsCardContent(hasI18n)),
    file(`${root}/components/members-card.tsx`, expoMembersCardContent(hasI18n)),
    file(`${root}/components/teams-card.tsx`, expoTeamsCardContent(hasI18n)),
    file(`${root}/components/invitations-card.tsx`, expoInvitationsCardContent(hasI18n)),
    file(
      `${root}/components/workspace-error.tsx`,
      `import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
${i18n.importLine}
export function WorkspaceError({ error }: { error: unknown }): React.JSX.Element | null {
${i18n.hookLine}
  return error ? <Alert variant="destructive" accessibilityRole="alert"><AlertDescription>${i18n.child("operationError", "The workspace operation failed. Try again.")}</AlertDescription></Alert> : null;
}
`,
    ),
    file(
      mobilePath(mode, "app/workspace.tsx"),
      'import { WorkspaceScreen } from "@/features/identity-workspace/screen";\nexport default WorkspaceScreen;\n',
    ),
  ];
}

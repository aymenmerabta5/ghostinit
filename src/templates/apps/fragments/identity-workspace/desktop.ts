import { file, type TemplateFile } from "../../../shared.js";
import {
  desktopSettingsRouteContent,
  desktopSettingsFeatureFiles,
} from "../settings/native-desktop.js";
import { desktopPath, type IdentityWorkspaceMode } from "./model.js";
import { desktopWorkspaceFeatureFiles } from "./native-workspace.js";

export function desktopWorkspaceRouteContent(
  mode: IdentityWorkspaceMode = "monorepo",
  _hasI18n = false,
): string {
  const alias = mode === "monorepo" ? "@" : "@/renderer";
  return `import type * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { IdentityWorkspace } from "${alias}/features/identity-workspace/identity-workspace";
export const Route = createFileRoute("/workspace")({ component: WorkspaceScreen });
function WorkspaceScreen(): React.JSX.Element { return <main className="mx-auto w-full max-w-6xl p-6"><IdentityWorkspace /></main>; }
`;
}
export function desktopFullSettingsRouteContent(
  mode: IdentityWorkspaceMode = "monorepo",
  _hasI18n = false,
  _hasEmail = true,
): string {
  return desktopSettingsRouteContent(mode);
}

export function desktopIdentityWorkspaceFiles(
  mode: IdentityWorkspaceMode,
  hasI18n = false,
  hasEmail = true,
): TemplateFile[] {
  return [
    ...desktopWorkspaceFeatureFiles(mode, hasI18n),
    ...desktopSettingsFeatureFiles(mode, true, hasEmail, hasI18n),
    file(
      desktopPath(mode, "routes/settings.tsx"),
      desktopFullSettingsRouteContent(mode, hasI18n, hasEmail),
    ),
  ];
}

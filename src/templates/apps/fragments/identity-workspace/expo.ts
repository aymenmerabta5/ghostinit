import { file, type TemplateFile } from "../../../shared.js";
import { mobilePath, type IdentityWorkspaceMode } from "./model.js";
import { expoAdminContent, expoAdminFeatureFiles } from "./expo-admin.js";
import { expoWorkspaceFeatureFiles } from "./native-workspace.js";

function expoWorkspaceContent(_mode: IdentityWorkspaceMode = "monorepo", _hasI18n = false): string {
  return 'import { WorkspaceScreen } from "@/features/identity-workspace/screen";\nexport default WorkspaceScreen;\n';
}

export function expoIdentityWorkspaceFiles(
  mode: IdentityWorkspaceMode,
  hasI18n = false,
): TemplateFile[] {
  return [
    ...expoWorkspaceFeatureFiles(mode, hasI18n),
    ...expoAdminFeatureFiles(mode, hasI18n),
    file(mobilePath(mode, "app/admin.tsx"), expoAdminContent(mode, hasI18n)),
  ];
}

export { expoAdminContent, expoWorkspaceContent };

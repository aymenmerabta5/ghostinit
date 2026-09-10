import { file, type TemplateFile } from "../../../shared.js";
import { mobilePath, type IdentityWorkspaceMode } from "./model.js";
import { expoSettingsRouteContent } from "../settings/native-expo.js";
export function expoFullSettingsContent(
  _mode: IdentityWorkspaceMode = "monorepo",
  _hasI18n = false,
  _hasEmail = true,
): string {
  return expoSettingsRouteContent();
}
export function expoFullSettingsFile(
  mode: IdentityWorkspaceMode,
  hasI18n = false,
  hasEmail = true,
): TemplateFile {
  return file(
    mobilePath(mode, "app/settings.tsx"),
    expoFullSettingsContent(mode, hasI18n, hasEmail),
  );
}

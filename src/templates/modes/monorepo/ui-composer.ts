import type { TemplateFile } from "../../shared.js";
import type { AppName, FrameworkName } from "../../../lib/addons.js";
import { designSystemFiles, resolveDesignSystemApps } from "../../ui.js";

export function uiComposerFiles(
  apps: readonly AppName[],
  framework: FrameworkName,
): TemplateFile[] {
  return designSystemFiles("monorepo", resolveDesignSystemApps(apps, framework));
}

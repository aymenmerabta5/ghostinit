import type { TemplateFile } from "../../shared.js";
import { authPackage } from "../../auth.js";
import type { AddonInstallerMap, FrameworkName } from "../../../lib/addons.js";

export function authComposerFiles(
  framework: FrameworkName = "nextjs",
  addonMap?: AddonInstallerMap | Record<string, { inUse: boolean } | boolean>,
  hasEmail = true,
): TemplateFile[] {
  return authPackage(framework, addonMap, { hasEmail });
}

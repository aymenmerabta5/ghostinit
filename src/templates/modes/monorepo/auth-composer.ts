import type { TemplateFile } from "../../shared.js";
import { authPackage } from "../../auth.js";
import type { AddonInstallerMap, FrameworkName } from "../../../lib/addons.js";

export function authComposerFiles(
  framework: FrameworkName = "nextjs",
  addonMap?: AddonInstallerMap | Record<string, { inUse: boolean } | boolean>,
): TemplateFile[] {
  // FrameworkName and AuthFramework are the same union ("nextjs" | "tanstack-start"),
  // and addonMap already matches authPackage's second parameter — no casts needed.
  return authPackage(framework, addonMap);
}

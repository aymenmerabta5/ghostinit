import type { TemplateFile } from "../../shared.js";
import { authPackage } from "../../auth.js";
import type { FrameworkName } from "../../../lib/addons.js";

export function authComposerFiles(framework: FrameworkName): TemplateFile[] {
  return authPackage(framework as any);
}

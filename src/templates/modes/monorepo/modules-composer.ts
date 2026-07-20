import type { TemplateFile } from "../../shared.js";
import { modulesPackage } from "../../modules.js";

type Runtime = "node" | "bun";

export function modulesComposerFiles(runtime: Runtime): TemplateFile[] {
  return modulesPackage(runtime);
}

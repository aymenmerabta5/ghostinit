import type { TemplateFile } from "../../shared.js";
import { modulesPackage } from "../../modules.js";

export function modulesComposerFiles(runtime: "node" | "bun"): TemplateFile[] {
  return modulesPackage(runtime as any);
}

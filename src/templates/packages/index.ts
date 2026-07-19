import type { TemplateFile } from "../shared.js";
import { tsConfigFiles } from "./typescript-config.js";
import { configPackageFiles } from "./config.js";
import { corePackagesFiles } from "./core.js";

export function packageFiles(runtime: "node" | "bun" = "bun"): TemplateFile[] {
  return [...tsConfigFiles(), ...configPackageFiles(), ...corePackagesFiles(runtime)];
}

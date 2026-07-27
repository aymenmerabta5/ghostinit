import type { TemplateFile } from "../shared.js";
import { tsConfigFiles } from "./typescript-config.js";
import { configPackageFiles, type ConfigFramework } from "./config.js";
import { corePackagesFiles } from "./core.js";

export function packageFiles(
  runtime: "node" | "bun" = "bun",
  // @repo/config emits the public env vars for exactly one framework, and the
  // CONVEX_* block only when the project actually uses Convex — see config.ts.
  framework: ConfigFramework = "nextjs",
  database: "postgres" | "convex" | "none" = "postgres",
): TemplateFile[] {
  return [
    ...tsConfigFiles(),
    ...configPackageFiles(framework, database),
    ...corePackagesFiles(runtime),
  ];
}

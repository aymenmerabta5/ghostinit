import type { TemplateFile } from "../../shared.js";
import { packageFiles as genPackageFiles } from "../../packages.js";
import { toolingFiles as genToolingFiles } from "../../tooling.js";
import { analyticsFiles as genAnalyticsFiles } from "../../analytics.js";

type Runtime = "node" | "bun";

export function packagesComposerFiles(runtime: Runtime): TemplateFile[] {
  const pkgRaw = genPackageFiles(runtime);
  const pkgFiltered = pkgRaw.filter(
    (f: TemplateFile) => !f.path.startsWith("packages/typescript-config/"),
  );
  return [...pkgFiltered, ...genToolingFiles(), ...genAnalyticsFiles(runtime)];
}

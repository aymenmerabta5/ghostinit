import type { TemplateFile } from "../../shared.js";
import { packageFiles as genPackageFiles } from "../../packages.js";
import { toolingFiles as genToolingFiles } from "../../tooling.js";
import { analyticsFiles as genAnalyticsFiles } from "../../analytics.js";

export function packagesComposerFiles(runtime: "node" | "bun"): TemplateFile[] {
  const pkgRaw = genPackageFiles(runtime as any);
  // typescript-config will be emitted by apps-composer with authoritative @/* and @repo/* aliases
  const pkgFiltered = pkgRaw.filter(
    (f: TemplateFile) => !f.path.startsWith("packages/typescript-config/"),
  );
  return [...pkgFiltered, ...genToolingFiles(), ...genAnalyticsFiles(runtime as any)];
}

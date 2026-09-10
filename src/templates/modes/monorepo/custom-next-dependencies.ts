import { ValidationError } from "../../../lib/errors.js";
import type { TemplateFile } from "../../shared.js";

interface PackageManifest {
  name: string;
  dependencies?: Record<string, string>;
}

/**
 * The custom Next server bundles workspace source but externalizes vendor imports.
 * Its app manifest must therefore own the runtime dependencies of that source graph.
 * Derive them before compilation so the plan, lock, and production install agree.
 */
export function customNextRuntimeDependencies(files: TemplateFile[]): TemplateFile[] {
  const webPath = "apps/web/package.json";
  const webFile = files.find(({ path }) => path === webPath);
  if (!webFile) throw new ValidationError("Custom Next server requires a web package manifest");
  const web = JSON.parse(webFile.content) as PackageManifest;
  const packages = new Map<string, PackageManifest>();
  for (const file of files) {
    if (/^packages\/[^/]+\/package\.json$/.test(file.path)) {
      const manifest = JSON.parse(file.content) as PackageManifest;
      packages.set(manifest.name, manifest);
    }
  }

  const dependencies = { ...web.dependencies };
  const visited = new Set<string>();
  function collect(manifest: PackageManifest): void {
    if (visited.has(manifest.name)) return;
    visited.add(manifest.name);
    for (const [name, requested] of Object.entries(manifest.dependencies ?? {})) {
      if (requested.startsWith("workspace:")) {
        const workspace = packages.get(name);
        if (!workspace) {
          throw new ValidationError(
            "Custom Next server dependency has no workspace manifest: " + name,
          );
        }
        collect(workspace);
        continue;
      }
      // Some adapter contributions still carry the catalog's caret prefix.
      const version = requested.replace(/^\^/, "");
      const existing = dependencies[name]?.replace(/^\^/, "");
      if (existing !== undefined && existing !== version) {
        throw new ValidationError(
          "Custom Next server has conflicting runtime dependency versions: " + name,
        );
      }
      dependencies[name] = version;
    }
  }
  collect(web);
  web.dependencies = Object.fromEntries(
    Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)),
  );
  return files.map((file) =>
    file.path === webPath ? { ...file, content: JSON.stringify(web, null, 2) + "\n" } : file,
  );
}

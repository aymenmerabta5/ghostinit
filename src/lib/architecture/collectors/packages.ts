/**
 * Package discovery: scans apps/, packages/, tooling/ for package.json.
 * Single responsibility: discover PackageInfo only.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { PackageInfo } from "../types.js";

export async function discoverPackages(root: string): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];
  const dirs = ["apps", "packages", "tooling"];
  for (const dir of dirs) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    const entries = await readdir(base, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgDir = join(base, entry.name);
      const manifestPath = join(pkgDir, "package.json");
      try {
        const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as {
          name?: string;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          peerDependencies?: Record<string, string>;
          optionalDependencies?: Record<string, string>;
        };
        // peer/optional dependencies are declarations too — a shared React package
        // that peer-depends on react has declared it, and flagging it as undeclared
        // pushes authors toward bundling a duplicate copy.
        const deps = new Set([
          ...Object.keys(manifest.dependencies ?? {}),
          ...Object.keys(manifest.devDependencies ?? {}),
          ...Object.keys(manifest.peerDependencies ?? {}),
          ...Object.keys(manifest.optionalDependencies ?? {}),
        ]);
        packages.push({ name: manifest.name ?? entry.name, dir: pkgDir, dependencies: deps });
      } catch {
        packages.push({ name: entry.name, dir: pkgDir, dependencies: new Set() });
      }
    }
  }
  return packages;
}

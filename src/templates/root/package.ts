import { file, packageJson, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import type { AddonInstallerMap } from "../../lib/addons.js";
import { hasAddon } from "../../lib/addons.js";

type AddonMapInput = AddonInstallerMap | Record<string, { inUse: boolean }> | undefined;

function isConvexAddon(input?: AddonMapInput): boolean {
  if (!input) return false;
  try {
    return hasAddon(input as AddonInstallerMap, "convex");
  } catch {
    return Boolean((input as Record<string, { inUse?: boolean }>).convex?.inUse);
  }
}

export function rootPackageJson(
  projectName: string,
  runtime: "node" | "bun",
  addonMap?: AddonMapInput,
): TemplateFile {
  const installCmd = runtime === "bun" ? "bun install" : "npm install";
  const isConvex = isConvexAddon(addonMap);

  const baseScripts: Record<string, string> = {
    dev: "turbo run dev",
    build: "turbo run build",
    start: "turbo run start",
    typecheck: "turbo run typecheck",
    test: "turbo run test",
    lint: "turbo run lint",
    format: "turbo run format",
    "format:check": "turbo run format:check",
    check: "ghostinit check",
    "check:fix": "ghostinit check --fix",
    "doctor:fix": "ghostinit doctor --fix",
    prepare: "husky",
    "install:cmd": installCmd,
  };

  const scripts = isConvex
    ? {
        ...baseScripts,
        "convex:dev": "convex dev",
        "convex:deploy": "convex deploy",
        "convex:codegen": "convex codegen",
        "convex:dev:once": "convex dev --once",
      }
    : {
        ...baseScripts,
        "db:generate": "turbo run db:generate",
        "db:migrate": "turbo run db:migrate",
        "db:push": "turbo run db:push",
      };

  const content = packageJson({
    name: projectName,
    private: true,
    type: "module",
    packageManager: runtime === "bun" ? `bun@${v.runtime.bun}` : `npm@10.8.0`,
    workspaces: ["apps/*", "packages/*", "tooling/*"],
    scripts,
    devDependencies: {
      ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
      ...(isConvex ? { convex: `^${v.convex.convex}` } : {}),
      oxlint: `^${v.tooling.oxlint}`,
      oxfmt: `^${v.tooling.oxfmt}`,
      turbo: `^${v.tooling.turbo}`,
      husky: `^${v.tooling.husky}`,
      typescript: `^${v.typescript.typescript}`,
    },
  }).replace(`"name": "${projectName}"`, '"name": "__PROJECT_NAME__"');
  return file("package.json", content);
}

export function bunfig(): TemplateFile {
  return file("bunfig.toml", `[install]\nhoist = true\n\n[install.lockfile]\npath = "bun.lock"\n`);
}

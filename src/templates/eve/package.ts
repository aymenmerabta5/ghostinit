import { file, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";

export function evePackageJson(projectName: string, isBun: boolean): TemplateFile {
  // Compatibility callers still pass the execution-runtime flag, but package
  // Management is fixed to the canonical Bun version for every generated project.
  void isBun;
  const pkgName = projectName ? `${projectName}-eve` : "eve-agent";
  return file(
    "apps/eve/package.json",
    JSON.stringify(
      {
        name: pkgName,
        private: true,
        type: "module",
        version: "0.1.0",
        description: `${projectName} durable backend agent via eve@${v.eve.eve} filesystem-first framework`,
        imports: { "#*": "./agent/*", "#evals/*": "./evals/*" },
        scripts: {
          build: "eve build",
          "dev:diagnostic": "node ../../scripts/eve-dev.mjs",
          "start:diagnostic": "node .output/server/index.mjs",
          typecheck: "tsc --noEmit",
          test: "bun test",
          lint: "oxlint --deny-warnings .",
          format: "oxfmt --write .",
          "format:check": "oxfmt --check .",
        },
        dependencies: {
          "@repo/config": "workspace:*",
          "@repo/contracts": "workspace:*",
          "@repo/database": "workspace:*",
          "@repo/kernel": "workspace:*",
          "@repo/modules": "workspace:*",
          "@repo/workflows": "workspace:*",
          "@vercel/connect": v.eve["@vercel/connect"],
          ai: v.eve.ai,
          eve: v.eve.eve,
          "just-bash": v.eve["just-bash"],
          zod: v.validation.zod,
        },
        devDependencies: {
          "@types/node": v.runtime["@types/node"],
          typescript: v.typescript.typescript,
          oxlint: v.tooling.oxlint,
          oxfmt: v.tooling.oxfmt,
        },
        overrides: { ai: v.eve.ai },
        engines: { node: v.runtime.node },
        packageManager: `bun@${v.runtime.bun}`,
      },
      null,
      2,
    ) + "\n",
  );
}

import { file, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";

export function evePackageJson(projectName: string, isBun: boolean): TemplateFile {
  const pkgName = projectName ? `${projectName}-eve` : "eve-agent";
  return file(
    "apps/eve/package.json",
    JSON.stringify(
      {
        name: pkgName,
        private: true,
        type: "module",
        version: "0.1.0",
        description: `${projectName} durable backend agent via eve@0.24.6 filesystem-first framework`,
        imports: { "#*": "./agent/*", "#evals/*": "./evals/*" },
        scripts: {
          build: "eve build",
          dev: "eve dev",
          start: "eve start",
          typecheck: "tsc --noEmit",
          test: isBun ? "bun test" : "npm run test:unit",
          lint: "oxlint .",
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
        packageManager: isBun ? `bun@${v.runtime.bun}` : `npm@10.8.0`,
      },
      null,
      2,
    ) + "\n",
  );
}

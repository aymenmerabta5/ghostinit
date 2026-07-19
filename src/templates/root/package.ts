import { file, packageJson, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";

export function rootPackageJson(projectName: string, runtime: "node" | "bun"): TemplateFile {
  const installCmd = runtime === "bun" ? "bun install" : "npm install";
  const content = packageJson({
    name: projectName,
    private: true,
    type: "module",
    packageManager: runtime === "bun" ? `bun@${v.runtime.bun}` : `npm@10.8.0`,
    workspaces: ["apps/*", "packages/*", "tooling/*"],
    scripts: {
      dev: "turbo run dev",
      build: "turbo run build",
      start: "turbo run start",
      typecheck: "turbo run typecheck",
      test: "turbo run test",
      lint: "turbo run lint",
      format: "turbo run format",
      "format:check": "turbo run format:check",
      "db:generate": "turbo run db:generate",
      "db:migrate": "turbo run db:migrate",
      "db:push": "turbo run db:push",
      "install:cmd": installCmd,
    },
    devDependencies: {
      ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
      oxlint: `^${v.tooling.oxlint}`,
      oxfmt: `^${v.tooling.oxfmt}`,
      turbo: `^${v.tooling.turbo}`,
      typescript: `^${v.typescript.typescript}`,
    },
  }).replace(`"name": "${projectName}"`, '"name": "__PROJECT_NAME__"');
  return file("package.json", content);
}

export function bunfig(): TemplateFile {
  return file("bunfig.toml", `[install]\n[install.lockfile]\npath = "bun.lock"\n`);
}

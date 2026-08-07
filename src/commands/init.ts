/**
 * init command — initialize ghostinit in current directory.
 * Reuses create flow but targets cwd directly.
 */

import { existsSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { ExitCode } from "../lib/errors.js";
import type { GlobalOptions } from "./types.js";

export async function initCommand(args: string[], options: GlobalOptions): Promise<number> {
  const cwd = resolve(options.cwd ?? process.cwd());
  let name = args[0];
  if (!name) {
    name = basename(cwd);
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      name = "my-app";
    }
  }

  if (!options.force) {
    try {
      const entries = readdirSync(cwd);
      const filtered = entries.filter(
        (e) => e !== ".ghostinit" && e !== ".git" && e !== "node_modules",
      );
      if (filtered.length > 0 && existsSync(resolve(cwd, "package.json"))) {
        options.logger.warn(
          `Directory ${cwd} already contains a project. Use --force to overwrite.`,
        );
        return ExitCode.CONFLICT_ERROR;
      }
    } catch {}
  }

  const effectiveName = name;

  const { generateProjectFiles } = await import("../templates/default.js");
  const { projectConfigSchema } = await import("../lib/config.js");
  const { FsTransaction } = await import("../lib/fs.js");

  const mode = (options.mode ?? "monorepo") as string;
  const framework = (options.framework ?? "nextjs") as string;
  const billing = (options.billing ?? []) as string[];
  const features = (options.features ?? []) as string[];
  const database = (options.database ?? "postgres") as string;
  const apps = (options.apps ?? ["web"]) as string[];
  const preset = options.preset as string | undefined;
  const cache = (options.cache ?? "none") as string;

  const config = projectConfigSchema.parse({
    name: effectiveName,
    mode,
    framework,
    billing,
    features,
    database,
    apps,
    preset,
    cache,
    version: "0.1.0",
    runtime: "bun",
  });

  const files = generateProjectFiles(config, { dryRun: false });

  const tx = new FsTransaction(cwd);
  for (const f of files) {
    const targetPath = f.path.replace(/__PROJECT_NAME__/g, effectiveName);
    const content = f.content.replace(/__PROJECT_NAME__/g, effectiveName);
    await tx.write(targetPath, content);
  }
  await tx.commit();

  options.logger.info(`Initialized ghostinit project "${effectiveName}" in ${cwd}`);

  // Install step is optional; full install requires InstallInput with config
  // Skipped for init dry-run simplicity — user can run `bun install` manually
  if (!options.noInstall) {
    options.logger.info("Run `bun install` to install dependencies.");
  }

  return ExitCode.OK;
}

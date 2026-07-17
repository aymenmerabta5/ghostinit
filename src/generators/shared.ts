import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { FsTransaction } from "../lib/fs.js";
import { loadState, saveState } from "../lib/state.js";
import { relativeChecksum } from "../lib/checksum.js";
import type { GlobalOptions } from "../commands/types.js";

export interface GenerationContext {
  cwd: string;
  tx: FsTransaction;
  options: GlobalOptions;
}

export function nameFromKebab(name: string): string {
  return name.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

export function pascalCase(name: string): string {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export async function prepareGeneration(
  cwd: string,
  options: GlobalOptions,
): Promise<GenerationContext> {
  const tx = new FsTransaction(cwd);
  return { cwd, tx, options };
}

export async function commitGeneration(ctx: GenerationContext): Promise<void> {
  const state = await loadState(ctx.cwd);
  if (!state) {
    throw new Error("No GhostInit project state found");
  }

  const { written } = await ctx.tx.commit();

  if (written.length === 0) {
    return;
  }

  const checksums = [];
  for (const path of written) {
    const absolutePath = join(ctx.cwd, ...path.split("/"));
    const content = await readFile(absolutePath, "utf-8");
    checksums.push(relativeChecksum(ctx.cwd, path, content));
  }

  await saveState(ctx.cwd, state.project, checksums, state.modules, state.procedures);
}

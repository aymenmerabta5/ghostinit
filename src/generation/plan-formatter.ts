import type { GenerationPlanFormatterPort } from "../application/ports/generation-plan-formatter.js";
import { buildGenerationPlan } from "../domain/generation/plan-builder.js";
import type { GenerationPlan } from "../domain/generation/types.js";

const FORMAT_PATH_RE = /(?:^|\/)(?:[^/]+\.(?:[cm]?[jt]sx?|jsonc?|mdx?|css|scss|html|ya?ml))$/i;
const IGNORED_DIRECTORY_SEGMENTS = new Set(["node_modules", "dist", ".next", ".output", ".turbo"]);

export type GenerationTextFormatter = (path: string, content: string) => Promise<string>;

export class GenerationPlanFormatError extends Error {
  readonly path: string;

  constructor(path: string, cause?: unknown) {
    super(`Unable to deterministically format planned file ${path}`, { cause });
    this.name = "GenerationPlanFormatError";
    this.path = path;
  }
}

/** Match the exact generated-path family passed to the installed Oxfmt CLI. */
export function isGenerationFormatPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  if (!FORMAT_PATH_RE.test(normalized)) return false;
  const segments = normalized.split("/");
  if (segments.some((segment) => IGNORED_DIRECTORY_SEGMENTS.has(segment))) return false;
  if (normalized.startsWith("convex/_generated/") || normalized.includes("/convex/_generated/")) {
    return false;
  }
  return !normalized.endsWith("/routeTree.gen.ts") && normalized !== "routeTree.gen.ts";
}

export async function formatGenerationText(path: string, content: string): Promise<string> {
  try {
    const { format } = await import("oxfmt");
    const result = await format(path, content);
    if (result.errors.length > 0) throw new Error(`${result.errors.length} formatter error(s)`);
    return result.code;
  } catch (error) {
    if (error instanceof GenerationPlanFormatError) throw error;
    throw new GenerationPlanFormatError(path, error);
  }
}

/**
 * Rebuild the immutable plan from canonical post-format bytes. No project
 * filesystem, subprocess, clock, or entropy source is consulted, so previews
 * remain pure.
 */
export async function canonicalizeGenerationPlan(
  plan: GenerationPlan,
  formatter: GenerationTextFormatter = formatGenerationText,
): Promise<GenerationPlan> {
  const files = [];
  for (const file of plan.files) {
    const content = isGenerationFormatPath(file.physicalPath)
      ? await formatter(file.physicalPath, file.content)
      : file.content;
    const { contentHash: _contentHash, ...input } = file;
    files.push({ ...input, content });
  }
  return buildGenerationPlan({
    projectConfigHash: plan.projectConfigHash,
    files,
    secrets: plan.secrets,
  });
}

export const generationPlanFormatter: GenerationPlanFormatterPort = Object.freeze({
  format: canonicalizeGenerationPlan,
});

import type { ProjectRendererPort } from "../application/ports/project-renderer.js";
import { resolvedTemplateRenderer } from "./resolved-template-compiler.js";

const DEFAULT_RENDERERS = Object.freeze([resolvedTemplateRenderer] as const);

/** Immutable renderer registry used by the production create/sync pipelines. */
export function projectRendererRegistry(): readonly ProjectRendererPort[] {
  return DEFAULT_RENDERERS;
}

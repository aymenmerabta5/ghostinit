import type { PlannedFileInput, PlannedSecretOperation } from "../../domain/generation/types.js";
import type { ResolvedProjectConfig } from "../../domain/project/config.js";

export interface RenderedProjectContribution {
  readonly files: readonly PlannedFileInput[];
  readonly secrets: readonly PlannedSecretOperation[];
}

/** Application-owned boundary implemented by target, capability, and packaging renderers. */
export interface ProjectRendererPort {
  readonly id: string;
  render(config: ResolvedProjectConfig): RenderedProjectContribution;
}

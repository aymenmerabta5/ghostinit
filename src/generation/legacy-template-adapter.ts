import type { AddonInstallerMap } from "../lib/addons.js";
import { monorepoFiles } from "../templates/modes/monorepo.js";
import { singleFiles } from "../templates/modes/single.js";
import type { RootSecrets } from "../templates/root.js";
import type { GenerateContext, TemplateFile } from "../templates/shared.js";
import type { ProjectConfig } from "../lib/config.js";

/** Mechanical bridge input compiled entirely from an immutable V2 resolution. */
export interface LegacyTemplateTarget {
  readonly config: ProjectConfig;
  readonly addons: AddonInstallerMap;
  readonly secrets: RootSecrets;
  readonly context: Readonly<GenerateContext>;
}

/**
 * Pure target emitter for the legacy string-template tree.
 *
 * It performs no capability resolution, filtering, provenance inference,
 * lifecycle selection, secret discovery, or filesystem work. Those decisions
 * belong to the resolved template compiler; this bridge only invokes the
 * selected packaging target with its already-compiled input.
 */
export function emitLegacyTemplateTarget(target: LegacyTemplateTarget): readonly TemplateFile[] {
  return target.config.mode === "monorepo"
    ? monorepoFiles(target.config, target.secrets, target.context, target.addons)
    : singleFiles(target.config, target.secrets, target.context, target.addons);
}

import type { ProjectMode } from "../../lib/addons.js";
import { dedupeFilesOrThrow, type TemplateFile } from "../shared.js";
import { componentRegistryFile } from "./component-registry.js";
import { componentsJsonFiles } from "./components-json.js";
import { buildDesignSystemContract, designSystemContractFiles } from "./contract.js";
import {
  normalizeDesignSystemApps,
  resolveUiLayout,
  type ResolvedDesignSystemApp,
  uiAdapterIds,
  type UiAdapterId,
} from "./layout.js";
import { designSystemModuleFiles } from "./manifest.js";
import { designStyleFiles } from "./styles.js";

export function selectedUiAdapters(
  apps: readonly ResolvedDesignSystemApp[],
): readonly UiAdapterId[] {
  const selected = new Set(apps.map((app) => app.target));
  return uiAdapterIds.filter((adapter) => selected.has(adapter));
}

/**
 * Emit the complete mode-resolved UI module. Callers must pass resolved app
 * targets so `web` can never guess between Next and TanStack Start.
 */
export function designSystemFiles(
  mode: ProjectMode,
  apps: readonly ResolvedDesignSystemApp[],
): TemplateFile[] {
  const layout = resolveUiLayout(mode);
  const resolvedApps = normalizeDesignSystemApps(apps);
  const adapters = selectedUiAdapters(resolvedApps);
  const contract = buildDesignSystemContract(layout, resolvedApps, adapters);

  return dedupeFilesOrThrow([
    ...designSystemModuleFiles(layout, adapters),
    ...designStyleFiles(layout, adapters),
    ...designSystemContractFiles(layout, contract),
    componentRegistryFile(layout),
    ...componentsJsonFiles(layout, resolvedApps),
  ]).sort((left, right) => left.path.localeCompare(right.path));
}

export const designSystemTemplateFiles = designSystemFiles;

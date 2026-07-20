import type { TemplateFile } from "../../shared.js";
import {
  servicesFiles,
  emailFiles as genEmailFiles,
  i18nFiles as genI18nFiles,
} from "./core-services-aggregator.js";
import { eveFiles as genEveFiles, agenticFiles as genAgenticFiles } from "./eve-aggregator.js";
import type { AddonInstallerMap, FrameworkName } from "../../../lib/addons.js";

type Runtime = "node" | "bun";

export function servicesComposerFiles(
  projectName: string,
  runtime: Runtime,
  addons: AddonInstallerMap,
  hasEve: boolean,
  hasI18n: boolean,
  framework: FrameworkName = "nextjs",
): TemplateFile[] {
  const out: TemplateFile[] = [];
  out.push(...servicesFiles({ mode: "monorepo", runtime, addons }, runtime));
  out.push(...genEmailFiles(runtime));
  if (hasI18n) out.push(...genI18nFiles(runtime, addons, framework));
  if (hasEve) {
    out.push(...genAgenticFiles(projectName));
    out.push(...genEveFiles(projectName, runtime));
  }
  return out;
}

import type { TemplateFile } from "../../shared.js";
import {
  servicesFiles,
  emailFiles as genEmailFiles,
  i18nFiles as genI18nFiles,
} from "./core-services-aggregator.js";
import { eveFiles as genEveFiles, agenticFiles as genAgenticFiles } from "./eve-aggregator.js";
import type { AddonInstallerMap, FrameworkName } from "../../../lib/addons.js";

export function servicesComposerFiles(
  projectName: string,
  runtime: "node" | "bun",
  addons: AddonInstallerMap,
  hasEve: boolean,
  hasI18n: boolean,
  framework: FrameworkName = "nextjs",
): TemplateFile[] {
  const out: TemplateFile[] = [];
  out.push(
    ...servicesFiles({ mode: "monorepo", runtime: runtime as any, addons } as any, runtime as any),
  );
  out.push(...genEmailFiles(runtime as any));
  if (hasI18n) out.push(...genI18nFiles(runtime as any, addons as any, framework as any));
  if (hasEve) {
    out.push(...genAgenticFiles(projectName));
    out.push(...genEveFiles(projectName, runtime as any));
  }
  return out;
}

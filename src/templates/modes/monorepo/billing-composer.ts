import type { TemplateFile } from "../../shared.js";
import { billingFiles } from "../../billing-generator.js";
import type { AddonInstallerMap, BillingProviderName } from "../../../lib/addons.js";

export function billingComposerFiles(
  mode: "monorepo",
  runtime: "node" | "bun",
  addons: AddonInstallerMap,
  effectiveBilling: BillingProviderName[],
): TemplateFile[] {
  if (effectiveBilling.length > 0) {
    return billingFiles({ mode, runtime, addons }, runtime) as TemplateFile[];
  }
  return [];
}

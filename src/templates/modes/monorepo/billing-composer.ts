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
    return billingFiles(
      { mode, runtime: runtime as any, addons } as any,
      runtime as any,
    ) as TemplateFile[];
  }
  // Empty billing still emits shared schema + empty UI
  return billingFiles(
    {
      mode,
      runtime: runtime as any,
      addons: {
        stripe: { inUse: false },
        chargily: { inUse: false },
        paddle: { inUse: false },
        polar: { inUse: false },
        billing: { inUse: false },
      } as never,
    } as never,
    runtime as any,
  ) as TemplateFile[];
}

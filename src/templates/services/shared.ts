import type { AddonInstallerMap } from "../../lib/addons.js";
import { billingProviders } from "../../lib/addons.js";
import type { ProjectMode } from "../../lib/addons.js";

export function hasBillingAddon(
  map?: AddonInstallerMap | Record<string, { inUse: boolean }>,
): boolean {
  if (!map) return true;
  const billingKeys = [...billingProviders, "billing"] as string[];
  return billingKeys.some((k) => (map as Record<string, { inUse: boolean }>)[k]?.inUse);
}
export function resultImportForMode(mode: ProjectMode): string {
  return mode === "monorepo"
    ? `import { Result } from "@repo/kernel";\nimport { err, ok } from "@repo/kernel";`
    : `import { Result } from "@/server/kernel/result.js";\nimport { err, ok } from "@/server/kernel/result.js";`;
}
export const sharedCalculateTotal = `function calculateTotal(items: InvoiceItem[]): number { return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0); }`;

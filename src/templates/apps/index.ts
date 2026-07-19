import { apiFiles } from "./api.js";
import { componentFiles } from "./components.js";
import { coreFiles } from "./core.js";
import { pageFiles } from "./pages.js";
import { testFiles } from "./tests.js";
import { tanstackCoreFiles } from "./tanstack-core.js";
import { tanstackPageFiles } from "./tanstack-pages.js";
import { tanstackApiFiles } from "./tanstack-api.js";
import { tanstackComponentFiles } from "./tanstack-components.js";
import type { TemplateFile } from "../shared.js";
import type { AddonInstallerMap, BillingProviderName } from "../../lib/addons.js";

type EveAndBillingInput =
  | boolean
  | AddonInstallerMap
  | BillingProviderName[]
  | Record<string, { inUse: boolean }>;

export function appsFiles(
  runtime: "node" | "bun" = "bun",
  addonsOrHasEve: EveAndBillingInput = false,
): TemplateFile[] {
  // Pass addons map to both coreFiles (for conditional eve dep) and apiFiles (for conditional webhooks)
  return [
    ...coreFiles(runtime, addonsOrHasEve as any),
    ...pageFiles(),
    ...apiFiles(addonsOrHasEve as any),
    ...componentFiles(),
    ...testFiles(runtime),
  ];
}

export function tanstackStartFiles(
  runtime: "node" | "bun" = "bun",
  addonsOrHasEve: EveAndBillingInput = false,
): TemplateFile[] {
  return [
    ...tanstackCoreFiles(runtime, addonsOrHasEve as any),
    ...tanstackPageFiles(),
    ...tanstackApiFiles(addonsOrHasEve as any),
    ...tanstackComponentFiles(),
    ...testFiles(runtime),
  ];
}

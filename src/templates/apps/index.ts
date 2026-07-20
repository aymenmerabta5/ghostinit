import { apiFiles } from "./api.js";
import { componentFiles } from "./components.js";
import { coreFiles } from "./core.js";
import { pageFiles } from "./pages.js";
import { testFiles } from "./tests.js";
import { tanstackCoreFiles } from "./tanstack-core.js";
import { tanstackPageFiles } from "./tanstack-pages.js";
import { tanstackApiFiles } from "./tanstack-api.js";
import { tanstackComponentFiles } from "./tanstack-components.js";
import { expoCoreFiles } from "./expo-core.js";
import { expoComponentFiles } from "./expo-components.js";
import { expoPageFiles } from "./expo-pages.js";
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
  return [
    ...coreFiles(runtime, addonsOrHasEve),
    ...pageFiles(),
    ...apiFiles(addonsOrHasEve as AddonInstallerMap),
    ...componentFiles(),
    ...testFiles(runtime),
  ];
}

export function tanstackStartFiles(
  runtime: "node" | "bun" = "bun",
  addonsOrHasEve: EveAndBillingInput = false,
): TemplateFile[] {
  return [
    ...tanstackCoreFiles(runtime, addonsOrHasEve),
    ...tanstackPageFiles(),
    ...tanstackApiFiles(addonsOrHasEve as AddonInstallerMap),
    ...tanstackComponentFiles(),
    ...testFiles(runtime),
  ];
}

export function expoFiles(
  runtime: "node" | "bun" = "bun",
  addonsOrHasEve: EveAndBillingInput = false,
): TemplateFile[] {
  return [
    ...expoCoreFiles(runtime, addonsOrHasEve, addonsOrHasEve),
    ...expoComponentFiles(),
    ...expoPageFiles(),
    ...testFiles(runtime),
  ];
}

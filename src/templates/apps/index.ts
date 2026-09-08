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
import { hasAddon } from "../../lib/addons.js";
import { BILLING_PROVIDERS } from "../../lib/constants.js";
import { resolveHasEve } from "./fragments/features.js";

type EveAndBillingInput =
  | boolean
  | AddonInstallerMap
  | BillingProviderName[]
  | Record<string, { inUse: boolean }>;

export function appsFiles(
  runtime: "node" | "bun" = "bun",
  addonsOrHasEve: EveAndBillingInput = false,
): TemplateFile[] {
  const hasApi =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "api")
      : true;
  return [
    ...coreFiles(runtime, addonsOrHasEve),
    ...pageFiles(addonsOrHasEve),
    ...(hasApi ? apiFiles(addonsOrHasEve as AddonInstallerMap) : []),
    ...componentFiles(addonsOrHasEve as AddonInstallerMap),
    ...testFiles(runtime, "nextjs"),
  ];
}

export function tanstackStartFiles(
  runtime: "node" | "bun" = "bun",
  addonsOrHasEve: EveAndBillingInput = false,
): TemplateFile[] {
  const hasEmail =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "email")
      : true;
  const hasApi =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "api")
      : true;
  const hasAuth =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "auth")
      : true;
  const isConvex =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "convex")
      : false;
  const isPostgres =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "postgres")
      : true;
  const hasI18n =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "i18n")
      : false;
  const hasBilling =
    typeof addonsOrHasEve === "object" && !Array.isArray(addonsOrHasEve)
      ? hasAddon(addonsOrHasEve as AddonInstallerMap, "billing") ||
        (["stripe", "chargily", "paddle", "polar"] as const).some((provider) =>
          hasAddon(addonsOrHasEve as AddonInstallerMap, provider),
        )
      : true;
  const selectedBilling = Array.isArray(addonsOrHasEve)
    ? addonsOrHasEve
    : typeof addonsOrHasEve === "object"
      ? BILLING_PROVIDERS.filter((provider) =>
          hasAddon(addonsOrHasEve as AddonInstallerMap, provider),
        )
      : BILLING_PROVIDERS;
  return [
    ...tanstackCoreFiles(runtime, addonsOrHasEve),
    ...tanstackPageFiles(
      hasEmail,
      isConvex,
      hasAuth,
      hasApi,
      isPostgres,
      hasI18n,
      hasBilling,
      selectedBilling,
      resolveHasEve(addonsOrHasEve),
    ),
    ...(hasApi ? tanstackApiFiles(addonsOrHasEve as AddonInstallerMap) : []),
    ...tanstackComponentFiles(addonsOrHasEve as AddonInstallerMap),
    ...testFiles(runtime, "tanstack-start"),
  ];
}

export function expoFiles(
  runtime: "node" | "bun" = "bun",
  addonsOrHasEve: EveAndBillingInput = false,
): TemplateFile[] {
  return [
    ...expoCoreFiles(runtime, addonsOrHasEve, addonsOrHasEve),
    ...expoComponentFiles(addonsOrHasEve),
    ...expoPageFiles(addonsOrHasEve),
  ];
}

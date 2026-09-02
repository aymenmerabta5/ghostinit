import { normalizeTemplateArgs } from "../shared.js";
import type { AddonInstallerMap, FrameworkName, ProjectMode } from "../../lib/addons.js";

type Runtime = "node" | "bun";

function isFrameworkName(v: unknown): v is FrameworkName {
  return v === "nextjs" || v === "tanstack-start";
}
function isProjectMode(v: unknown): v is ProjectMode {
  return v === "monorepo" || v === "single";
}
function isRuntime(v: unknown): v is Runtime {
  return v === "node" || v === "bun";
}

function isAddonInstaller(value: unknown): value is { inUse: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    "inUse" in value &&
    typeof value.inUse === "boolean"
  );
}

function normalizeAddonMap(record: Record<string, unknown>): AddonInstallerMap {
  const normalized: Record<string, { inUse: boolean }> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "boolean") {
      normalized[key] = { inUse: value };
    } else if (isAddonInstaller(value)) {
      normalized[key] = { inUse: value.inUse };
    }
  }
  return normalized as AddonInstallerMap;
}

export function resolveI18nParams(
  a?: unknown,
  b?: unknown,
  c?: unknown,
  d?: unknown,
): {
  mode: ProjectMode;
  runtime: Runtime;
  framework: FrameworkName;
  addons?: AddonInstallerMap;
} {
  let mode: ProjectMode = "monorepo";
  let runtime: Runtime = "bun";
  let framework: FrameworkName = "nextjs";
  let addons: AddonInstallerMap | undefined;

  try {
    const normalized = normalizeTemplateArgs(
      a as Record<string, unknown>,
      b as Record<string, unknown>,
      c as Record<string, unknown>,
    );
    if (normalized.mode) mode = normalized.mode as ProjectMode;
    if (normalized.runtime) runtime = normalized.runtime as Runtime;
    if (normalized.addons) addons = normalized.addons as AddonInstallerMap;
  } catch {}

  const allArgs = [a, b, c, d];
  for (const arg of allArgs) {
    if (typeof arg === "string") {
      if (isFrameworkName(arg)) framework = arg;
      else if (isProjectMode(arg)) mode = arg;
      else if (isRuntime(arg)) runtime = arg;
    } else if (arg && typeof arg === "object") {
      const obj = arg as Record<string, unknown>;
      if (isFrameworkName(obj.framework)) framework = obj.framework as FrameworkName;
      if (isProjectMode(obj.mode)) mode = obj.mode as ProjectMode;
      if (isRuntime(obj.runtime)) runtime = obj.runtime as Runtime;
      if (obj.addons && typeof obj.addons === "object") addons = obj.addons as AddonInstallerMap;
      if (obj.addonRegistry && typeof obj.addonRegistry === "object")
        addons = obj.addonRegistry as AddonInstallerMap;
      if (!addons) {
        const values = Object.values(obj);
        const looksLikeAddonMap = values.some(
          (v) =>
            typeof v === "boolean" ||
            (v && typeof v === "object" && "inUse" in (v as Record<string, unknown>)),
        );
        const hasFrameworkOrFeatureKeys = Object.keys(obj).some((k) =>
          ["i18n", "eve", "tanstack-start", "nextjs", "monorepo", "single"].includes(k),
        );
        if (looksLikeAddonMap || hasFrameworkOrFeatureKeys) {
          if (!obj.mode && !obj.runtime && !obj.framework && !obj.addons && !obj.addonRegistry) {
            addons = normalizeAddonMap(obj);
          }
        }
      }
    }
  }

  if (addons) {
    const anyAddons = addons as Record<string, { inUse?: boolean } | boolean>;
    const tanstackEntry = anyAddons["tanstack-start"];
    const nextEntry = anyAddons["nextjs"];
    const tanstackInUse =
      (typeof tanstackEntry === "object" && tanstackEntry !== null
        ? (tanstackEntry as { inUse?: boolean }).inUse === true
        : false) || tanstackEntry === true;
    const nextInUse =
      (typeof nextEntry === "object" && nextEntry !== null
        ? (nextEntry as { inUse?: boolean }).inUse === true
        : false) || nextEntry === true;
    const frameworkExplicitInArgs = allArgs.some(
      (arg) => typeof arg === "string" && isFrameworkName(arg),
    );
    const frameworkExplicitInObj = allArgs.some(
      (arg) =>
        arg &&
        typeof arg === "object" &&
        (arg as Record<string, unknown>).framework &&
        isFrameworkName((arg as Record<string, unknown>).framework as string),
    );
    if (!frameworkExplicitInArgs && !frameworkExplicitInObj) {
      if (tanstackInUse) framework = "tanstack-start";
      else if (nextInUse) framework = "nextjs";
    }
  }

  return { mode, runtime, framework, addons };
}

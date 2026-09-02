import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runtime as toolchainRuntime } from "../../packages/versions/src/index.js";
import { resolveProjectConfig } from "../domain/project/index.js";
import type { DesiredProjectConfig, ResolvedProjectConfig } from "../domain/project/config.js";
import {
  PROJECT_CONFIG_FILE,
  PROJECT_CONFIG_SCHEMA_URI,
  projectConfigSchema,
  projectDesiredConfigSchema,
  type ProjectConfig,
} from "./config.js";
import { IncompatibleSchemaError, ProjectStateError, ValidationError } from "./errors.js";

function presetCapability(project: ProjectConfig, key: "auth" | "api" | "email" | "analytics") {
  const explicit = project[key];
  if (explicit !== undefined) return explicit;
  return project.preset === "saas";
}

export function projectConfigToDesired(project: ProjectConfig): DesiredProjectConfig {
  const auth = presetCapability(project, "auth");
  const transport = presetCapability(project, "api");
  const email = presetCapability(project, "email");
  const analytics = presetCapability(project, "analytics");
  const apps = project.apps.map((app) => ({
    id: app,
    target:
      app === "web"
        ? project.framework
        : app === "mobile"
          ? ("expo" as const)
          : ("electron" as const),
    deploy: app === "web" ? project.deploy : ("none" as const),
  }));
  const web = apps.find((app) => app.id === "web");
  const needsBackend =
    auth ||
    transport ||
    email ||
    project.billing.length > 0 ||
    project.messaging === true ||
    project.storage === true ||
    project.cache === "redis" ||
    project.pdf === true ||
    project.eve === true ||
    project.notifications === true ||
    project.featureFlags === "posthog" ||
    project.jobs === true ||
    project.database !== "none";

  const desired = {
    $schema: PROJECT_CONFIG_SCHEMA_URI,
    schemaVersion: 2 as const,
    name: project.name,
    mode: project.mode,
    runtime: project.runtime,
    packageManager: { name: "bun" as const, version: toolchainRuntime.bun },
    apps,
    backend:
      needsBackend && web
        ? {
            hostApp: web.id,
            executionRuntime: project.runtime,
            database: project.database,
          }
        : false,
    capabilities: {
      transport,
      auth,
      billing: project.billing.length > 0 ? { providers: [...project.billing].sort() } : false,
      messaging: project.messaging === true,
      email,
      storage: project.storage === true || project.messaging === true,
      cache: project.cache,
      analytics,
      i18n: project.i18n === true || project.features.includes("i18n"),
      pdf: project.pdf === true,
      eve: project.eve === true || project.features.includes("eve"),
      notifications: project.notifications === true,
      featureFlags: project.featureFlags === "posthog" ? { provider: "posthog" as const } : false,
      jobs: project.jobs === true ? { userFacingApi: project.jobsUserFacingApi ?? false } : false,
    },
  } satisfies DesiredProjectConfig;
  return projectDesiredConfigSchema.parse(desired) as DesiredProjectConfig;
}

export function desiredToProjectConfig(
  desired: DesiredProjectConfig,
  generatedAt?: string,
  resolved?: ResolvedProjectConfig,
): ProjectConfig {
  const web = desired.apps.find(
    (app) => app.target === "nextjs" || app.target === "tanstack-start",
  );
  const apps = desired.apps.map((app) =>
    app.target === "expo" ? "mobile" : app.target === "electron" ? "desktop" : "web",
  );
  const capabilities = desired.capabilities;
  const resolvedCapabilities = resolved?.capabilities;
  const backend = resolved?.backend ?? desired.backend;
  const executionRuntime =
    resolved?.runtime ?? desired.runtime ?? (backend === false ? "bun" : backend.executionRuntime);
  const auth = resolvedCapabilities?.auth ?? capabilities.auth === true;
  const api = resolvedCapabilities?.transport ?? capabilities.transport === true;
  const email = resolvedCapabilities?.email ?? capabilities.email === true;
  const analytics = resolvedCapabilities?.analytics ?? capabilities.analytics === true;
  const preset =
    auth && api && email && analytics
      ? "saas"
      : !auth && !api && !email && !analytics
        ? "frontend"
        : "custom";
  return projectConfigSchema.parse({
    name: desired.name,
    runtime: executionRuntime,
    version: "0.1.0",
    generatedAt,
    mode: desired.mode,
    preset,
    cache: resolvedCapabilities
      ? resolvedCapabilities.cache.enabled
        ? resolvedCapabilities.cache.provider
        : "none"
      : (capabilities.cache ?? "none"),
    deploy: web?.deploy ?? "none",
    auth,
    api,
    email,
    analytics,
    eve: resolvedCapabilities?.eve ?? capabilities.eve === true,
    i18n: resolvedCapabilities?.i18n ?? capabilities.i18n === true,
    pdf: resolvedCapabilities?.pdf ?? capabilities.pdf === true,
    messaging: resolvedCapabilities?.messaging ?? capabilities.messaging === true,
    storage:
      (resolvedCapabilities?.storage ?? capabilities.storage === true) ||
      (resolvedCapabilities?.messaging ?? capabilities.messaging === true),
    notifications: resolvedCapabilities?.notifications ?? capabilities.notifications === true,
    featureFlags: resolvedCapabilities
      ? (resolvedCapabilities.featureFlags.provider ?? "none")
      : capabilities.featureFlags === false
        ? "none"
        : capabilities.featureFlags?.provider,
    jobs: resolvedCapabilities
      ? resolvedCapabilities.jobs.enabled
      : capabilities.jobs !== false && !!capabilities.jobs,
    billing: resolvedCapabilities
      ? resolvedCapabilities.billing.providers
      : capabilities.billing === false
        ? []
        : (capabilities.billing?.providers ?? []),
    features: [],
    database: backend === false ? "none" : backend.database,
    framework: web?.target ?? "nextjs",
    apps: [...new Set(apps)],
  });
}

export function resolveDesiredProjectConfig(desired: DesiredProjectConfig): ResolvedProjectConfig {
  const result = resolveProjectConfig(desired);
  if (!result.ok) {
    throw new ValidationError("ghostinit.config.json contains unsupported capability bindings", {
      issues: result.issues,
    });
  }
  return result.config;
}

export function serializeDesiredProjectConfig(desired: DesiredProjectConfig): string {
  return `${JSON.stringify(desired, null, 2)}\n`;
}

export async function loadDesiredProjectConfig(
  root: string,
  fallback?: ProjectConfig,
): Promise<{ desired: DesiredProjectConfig; resolved: ResolvedProjectConfig; exists: boolean }> {
  const path = join(root, PROJECT_CONFIG_FILE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as { code?: string })?.code === "ENOENT" && fallback) {
      const desired = projectConfigToDesired(fallback);
      return { desired, resolved: resolveDesiredProjectConfig(desired), exists: false };
    }
    if ((error as { code?: string })?.code === "ENOENT") {
      throw new ProjectStateError(`Missing ${PROJECT_CONFIG_FILE}`, { path });
    }
    throw new IncompatibleSchemaError(`${PROJECT_CONFIG_FILE} is not valid JSON`, {
      path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const result = projectDesiredConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new IncompatibleSchemaError(`${PROJECT_CONFIG_FILE} does not match schemaVersion 2`, {
      path,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message,
      })),
    });
  }
  const desired = result.data as DesiredProjectConfig;
  return { desired, resolved: resolveDesiredProjectConfig(desired), exists: true };
}

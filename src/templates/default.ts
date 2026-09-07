// Default GhostInit project generation entrypoints.

import type { GenerationPlan } from "../domain/generation/types.js";
import type { DesiredProjectConfig, ResolvedProjectConfig } from "../domain/project/config.js";
import { serializeDesiredProjectConfig } from "../lib/project-config.js";
import { projectConfigSchema, type ProjectConfig } from "../lib/config.js";
import {
  buildAddonInstallerMap,
  type AppName,
  type BillingProviderName,
  type CacheProvider,
  type DatabaseProvider,
  type FeatureName,
  type FrameworkName,
  type PresetName,
  type ProjectMode,
} from "../lib/addons.js";
import { aggregateGenerationPlan } from "../generation/aggregate.js";
import { projectRendererRegistry } from "../generation/renderer-registry.js";
import { secret, type GenerateContext, type TemplateFile } from "./shared.js";
import type { RootSecrets } from "./root.js";
import { monorepoFiles } from "./modes/monorepo.js";
import { singleFiles } from "./modes/single.js";
import {
  assertValidGeneratedFiles,
  maybeValidateGeneratedFiles,
} from "../lib/template-validator.js";

const CONFIG_RENDERER_ID = "ghostinit.desired-config.v2" as const;
const CONFIG_ACCEPTANCE_ID = "project.config-roundtrip.v2" as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Canonicalize only order-insensitive desired-state collections. */
export function canonicalDesiredProjectConfig(desired: DesiredProjectConfig): DesiredProjectConfig {
  const billing = desired.capabilities.billing;
  return {
    ...desired,
    apps: [...desired.apps].sort(
      (left, right) =>
        compareText(left.id, right.id) ||
        compareText(left.target, right.target) ||
        compareText(left.deploy, right.deploy),
    ),
    capabilities: {
      ...desired.capabilities,
      billing:
        billing === undefined || billing === false
          ? billing
          : { providers: [...new Set(billing.providers)].sort(compareText) },
    },
  };
}

export interface ProjectGenerationPlanOptions {
  readonly desiredConfig?: DesiredProjectConfig;
}

/** Build the production typed plan from an already-resolved configuration. */
export function buildProjectGenerationPlan(
  resolvedConfig: ResolvedProjectConfig,
  options: ProjectGenerationPlanOptions = {},
): GenerationPlan {
  const desired = options.desiredConfig
    ? canonicalDesiredProjectConfig(options.desiredConfig)
    : undefined;
  return aggregateGenerationPlan({
    config: resolvedConfig,
    renderers: projectRendererRegistry(),
    additionalFiles: desired
      ? [
          {
            logicalPath: "ghostinit/desired-project-config.json",
            physicalPath: "ghostinit.config.json",
            content: serializeDesiredProjectConfig(desired),
            owner: "ghostinit",
            lifecycle: "generator-owned",
            provenance: {
              renderer: CONFIG_RENDERER_ID,
              source: "src/templates/default",
              capability: null,
              acceptance: [CONFIG_ACCEPTANCE_ID],
              contribution: ["ghostinit.desired-state.v2"],
            },
          },
        ]
      : [],
  });
}

export function serializeGenerationPlan(plan: GenerationPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

/** Safe bounded CLI view; file bodies stay represented by their content hashes. */
export function publicGenerationPlan(plan: GenerationPlan) {
  return {
    $schema: plan.$schema,
    schemaVersion: plan.schemaVersion,
    projectConfigHash: plan.projectConfigHash,
    planHash: plan.planHash,
    files: plan.files.map(({ content: _content, ...file }) => file),
    secrets: plan.secrets,
  };
}

/**
 * Legacy public compatibility surface. Production create/sync use
 * `buildProjectGenerationPlan` directly, so resolution happens exactly once
 * and secret materialization remains a post-verification side effect.
 */
export function generateProjectFiles(
  config: ProjectConfig,
  ctx: GenerateContext = { dryRun: false },
): TemplateFile[] {
  config = projectConfigSchema.parse(config);
  const mode = (config.mode ?? "monorepo") as ProjectMode;
  const secrets: RootSecrets = ctx.dryRun
    ? {
        authSecret: "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS",
        postgresPassword: "REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD",
        notificationTokenEncryptionKey: "REPLACE_WITH_32_BYTE_BASE64URL_KEY",
        eveInternalAuthSecret: "REPLACE_WITH_A_STRONG_RANDOM_SECRET_AT_LEAST_32_CHARS",
      }
    : {
        authSecret: secret(),
        postgresPassword: secret(),
        notificationTokenEncryptionKey: secret(32),
        eveInternalAuthSecret: secret(32),
      };
  let files: TemplateFile[];
  if (mode === "monorepo") {
    files = monorepoFiles(config, secrets, { dryRun: ctx.dryRun });
  } else {
    const addons = buildAddonInstallerMap({
      billing: (config.billing ?? []) as BillingProviderName[],
      features: (config.features ?? []) as FeatureName[],
      database: (config.database ?? "postgres") as DatabaseProvider,
      mode,
      framework: (config.framework ?? "nextjs") as FrameworkName,
      apps: (config.apps ?? ["web"]) as AppName[],
      preset: (config.preset ?? "saas") as PresetName,
      cache: (config.cache ?? "none") as CacheProvider,
      deploy: config.deploy ?? "none",
      auth: config.auth,
      api: config.api,
      email: config.email,
      analytics: config.analytics,
      eve: config.eve,
      i18n: config.i18n,
      pdf: config.pdf,
      messaging: config.messaging,
      storage: config.storage,
      notifications: config.notifications,
      featureFlags: config.featureFlags,
      jobs: config.jobs,
    });
    files = singleFiles(config, secrets, { dryRun: ctx.dryRun }, addons).map((file) => ({
      path: file.path.replace(/__PROJECT_NAME__/g, config.name),
      content: file.content.replace(/__PROJECT_NAME__/g, config.name),
    }));
  }
  if (ctx.validate === true) assertValidGeneratedFiles(files);
  else maybeValidateGeneratedFiles(files, ctx);
  return files;
}

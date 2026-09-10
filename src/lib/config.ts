/** GhostInit legacy render config plus V2 desired/internal state schemas. */

import { z } from "zod";
import { runtime as toolchainRuntime } from "../../packages/versions/src/index.js";
import {
  availableModes,
  billingProviders,
  availableFeatures,
  availableDatabases,
  availableFrameworks,
  availableApps,
  availablePresets,
  availableCacheProviders,
  availableDeployTargets,
} from "./addons.js";
import { CAPABILITY_IDS } from "../domain/capabilities/types.js";
import {
  FILE_LIFECYCLES,
  FILE_OWNERS,
  GENERATION_PLAN_SCHEMA_URI,
} from "../domain/generation/types.js";
import type { DesiredProjectConfig, ResolvedProjectConfig } from "../domain/project/config.js";
import { PROJECT_NAME_PATTERN } from "../domain/project/choices.js";
import { billingSelectionError } from "../domain/project/billing-selection.js";
import { normalizeDependencySecurityResolutions } from "../domain/dependency-security/resolutions.js";

export const dependencySecurityResolutionsSchema = z.unknown().transform((value, context) => {
  try {
    return normalizeDependencySecurityResolutions(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : String(error),
    });
    return z.NEVER;
  }
});

const billingSelectionSchema = z
  .array(z.enum(billingProviders))
  .superRefine((providers, context) => {
    const message = billingSelectionError(providers);
    if (message !== undefined) context.addIssue({ code: "custom", message });
  });

export const projectConfigSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(
        PROJECT_NAME_PATTERN,
        "Name must start with a lowercase letter, use only lowercase letters, numbers, and single hyphens, and end with a letter or number",
      ),
    runtime: z.enum(["node", "bun"]).default("bun"),
    version: z.string().default("0.1.0"),
    generatedAt: z.string().datetime().optional(),
    mode: z.enum(availableModes).default("monorepo"),
    preset: z.enum(availablePresets).default("saas"),
    cache: z.enum(availableCacheProviders).default("none"),
    deploy: z.enum(availableDeployTargets).default("none"),
    auth: z.boolean().optional(),
    api: z.boolean().optional(),
    email: z.boolean().optional(),
    analytics: z.boolean().optional(),
    eve: z.boolean().optional(),
    i18n: z.boolean().optional(),
    pdf: z.boolean().optional(),
    messaging: z.boolean().optional(),
    storage: z.boolean().optional(),
    notifications: z.boolean().optional(),
    featureFlags: z.enum(["posthog", "none"]).optional(),
    jobs: z.boolean().optional(),
    jobsUserFacingApi: z.boolean().optional(),
    billing: billingSelectionSchema.default([]),
    features: z.array(z.enum(availableFeatures)).default([]),
    database: z.enum(availableDatabases).default("postgres"),
    framework: z.enum(availableFrameworks).default("nextjs"),
    apps: z.array(z.enum(availableApps)).default(["web"]),
  })
  .superRefine((config, context) => {
    if (config.billing.includes("manual") && config.storage === false) {
      context.addIssue({
        code: "custom",
        path: ["storage"],
        message: "manual billing requires storage; omit storage to infer it or set storage to true",
      });
    }
  });

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

const sha256HashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Hash must be a lowercase 64-character SHA-256 digest");
const legacySha256HashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "Hash must be a 64-character SHA-256 digest");
const canonicalPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !/^[a-zA-Z]:/.test(value) &&
      !value.split("/").some((segment) => segment === "" || segment === "." || segment === ".."),
    "Path must be a canonical project-relative path",
  );

export const checksumEntrySchema = z.object({
  algorithm: z.literal("sha256"),
  hash: legacySha256HashSchema,
  size: z.number().int().nonnegative(),
  path: z.string().default(""),
});

export const legacyStateV1Schema = z.object({
  version: z.literal(1),
  project: projectConfigSchema,
  checksums: z.record(z.string(), checksumEntrySchema),
  generatedBy: z.string(),
  generatedAt: z.string().datetime(),
  modules: z.array(z.string()).default([]),
  procedures: z.array(z.string()).default([]),
});
export type LegacyStateV1 = z.infer<typeof legacyStateV1Schema>;

const desiredCapabilitiesSchema = z
  .object({
    transport: z.boolean().optional(),
    auth: z.boolean().optional(),
    billing: z
      .union([z.literal(false), z.object({ providers: billingSelectionSchema.min(1) }).strict()])
      .optional(),
    messaging: z.boolean().optional(),
    email: z.boolean().optional(),
    storage: z.boolean().optional(),
    cache: z.enum(availableCacheProviders).optional(),
    analytics: z.boolean().optional(),
    i18n: z.boolean().optional(),
    pdf: z.boolean().optional(),
    eve: z.boolean().optional(),
    notifications: z.boolean().optional(),
    featureFlags: z
      .union([z.literal(false), z.object({ provider: z.literal("posthog") }).strict()])
      .optional(),
    jobs: z.union([z.literal(false), z.object({ userFacingApi: z.boolean() }).strict()]).optional(),
  })
  .strict()
  .superRefine((capabilities, context) => {
    if (
      capabilities.billing &&
      capabilities.billing.providers.includes("manual") &&
      capabilities.storage === false
    ) {
      context.addIssue({
        code: "custom",
        path: ["storage"],
        message: "manual billing requires storage; omit storage to infer it or set storage to true",
      });
    }
    if (capabilities.messaging === true && capabilities.storage === false) {
      context.addIssue({
        code: "custom",
        path: ["storage"],
        message: "messaging requires storage; omit storage to infer it or set storage to true",
      });
    }
  });

export const PROJECT_CONFIG_FILE = "ghostinit.config.json";
export const PROJECT_CONFIG_SCHEMA_URI =
  "https://ghostinit.dev/schemas/project-config.schema.json" as const;
export const projectDesiredConfigSchema = z
  .object({
    $schema: z.literal(PROJECT_CONFIG_SCHEMA_URI),
    schemaVersion: z.literal(2),
    name: z.string().regex(PROJECT_NAME_PATTERN),
    mode: z.enum(availableModes),
    runtime: z.enum(["bun", "node"]).optional(),
    packageManager: z
      .object({ name: z.literal("bun"), version: z.literal(toolchainRuntime.bun) })
      .strict(),
    apps: z
      .array(
        z
          .object({
            id: z.string().regex(PROJECT_NAME_PATTERN),
            target: z.enum(["nextjs", "tanstack-start", "expo", "electron"]),
            deploy: z.enum(availableDeployTargets),
          })
          .strict(),
      )
      .min(1),
    backend: z.union([
      z.literal(false),
      z
        .object({
          hostApp: z.string().regex(PROJECT_NAME_PATTERN),
          executionRuntime: z.enum(["bun", "node"]),
          database: z.enum(availableDatabases),
        })
        .strict(),
    ]),
    capabilities: desiredCapabilitiesSchema,
    dependencySecurity: dependencySecurityResolutionsSchema.optional(),
  })
  .strict();

const provenanceSchema = z
  .object({
    renderer: z.string().min(1),
    source: z.string().min(1),
    capability: z.enum(CAPABILITY_IDS).nullable(),
    appId: z.string().regex(PROJECT_NAME_PATTERN).nullable().default(null),
    target: z.enum(["nextjs", "tanstack-start", "expo", "electron"]).nullable().default(null),
    artifacts: z.array(z.enum(["route", "adapter", "manifest", "acceptance"])).default([]),
    acceptance: z.array(z.string().min(1)).default([]),
    contribution: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const managedFileStateSchema = z
  .object({
    path: canonicalPathSchema,
    owner: z.enum(FILE_OWNERS),
    lifecycle: z.enum(FILE_LIFECYCLES),
    contentHash: sha256HashSchema,
    size: z.number().int().nonnegative(),
    provenance: provenanceSchema,
  })
  .strict();
export type ManagedFileState = z.infer<typeof managedFileStateSchema>;

export const generationPlanStateSchema = z
  .object({
    $schema: z.literal(GENERATION_PLAN_SCHEMA_URI),
    schemaVersion: z.literal(1),
    projectConfigHash: sha256HashSchema,
    planHash: sha256HashSchema,
    fileCount: z.number().int().nonnegative(),
    renderers: z.array(z.string().min(1)),
    secretReferences: z.array(z.string().min(1)),
  })
  .strict();
export type GenerationPlanState = z.infer<typeof generationPlanStateSchema>;

export const pendingFileChangeSchema = z
  .object({
    action: z.enum(["create", "rewrite", "delete", "move"]),
    path: canonicalPathSchema,
    fromPath: canonicalPathSchema.optional(),
    beforeHash: sha256HashSchema.nullable(),
    afterHash: sha256HashSchema.nullable(),
  })
  .strict();

export const pendingOperationSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["create", "add", "sync", "upgrade"]),
    startedAt: z.string().datetime(),
    configHash: sha256HashSchema,
    planHash: sha256HashSchema,
    changes: z.array(pendingFileChangeSchema),
  })
  .strict();
export type PendingOperation = z.infer<typeof pendingOperationSchema>;

export const migrationHistoryEntrySchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["create", "add", "sync", "upgrade"]),
    fromVersion: z.union([z.literal(1), z.literal(2), z.null()]),
    toVersion: z.literal(2),
    status: z.enum(["completed", "failed"]),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    configHash: sha256HashSchema,
    summary: z
      .object({
        creates: z.number().int().nonnegative(),
        moves: z.number().int().nonnegative(),
        rewrites: z.number().int().nonnegative(),
        deletions: z.number().int().nonnegative(),
        conflicts: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type MigrationHistoryEntry = z.infer<typeof migrationHistoryEntrySchema>;

export const STATE_SCHEMA_URI = "https://ghostinit.dev/schemas/state.schema.json" as const;
export const stateV2Schema = z
  .object({
    $schema: z.literal(STATE_SCHEMA_URI),
    schemaVersion: z.literal(2),
    version: z.literal(2),
    configHash: sha256HashSchema,
    generationPlan: generationPlanStateSchema.nullable().default(null),
    generatedBy: z.string().min(1),
    generatedAt: z.string().datetime(),
    files: z.record(z.string(), managedFileStateSchema),
    modules: z.array(z.string()).default([]),
    procedures: z.array(z.string()).default([]),
    pendingOperation: pendingOperationSchema.nullable(),
    migrationHistory: z.array(migrationHistoryEntrySchema).default([]),
  })
  .strict();
export type PersistedStateV2 = z.infer<typeof stateV2Schema>;

/** Runtime-hydrated state. Compatibility views are never serialized in V2. */
export interface State extends PersistedStateV2 {
  sourceVersion: 1 | 2;
  project: ProjectConfig;
  desiredConfig: DesiredProjectConfig;
  resolvedConfig: ResolvedProjectConfig;
  normalizedConfigHash: string;
  configChanged: boolean;
  configFileExists: boolean;
  checksums: Record<string, z.infer<typeof checksumEntrySchema>>;
}

/** Compatibility parser; new writers always emit stateV2Schema. */
export const stateSchema = z.union([stateV2Schema, legacyStateV1Schema]);

export const GHOSTINIT_DIR = ".ghostinit";
export const STATE_FILE = "state.json";

export function statePath(root: string): string {
  return `${root}/${GHOSTINIT_DIR}/${STATE_FILE}`.replace(/\\/g, "/");
}

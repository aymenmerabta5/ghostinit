/**
 * GhostInit project configuration schemas and utilities.
 */

import { z } from "zod";
import {
  availableModes,
  billingProviders,
  availableFeatures,
  availableDatabases,
  availableFrameworks,
  availableApps,
  availablePresets,
  availableCacheProviders,
} from "./addons.js";

export const projectConfigSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(
      /^[a-z][a-z0-9-]*$/,
      "Name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens",
    ),
  runtime: z.enum(["node", "bun"]).default("bun"),
  version: z.string().default("0.1.0"),
  generatedAt: z.string().datetime().optional(),
  mode: z.enum(availableModes).default("monorepo"),
  preset: z.enum(availablePresets).default("saas"),
  cache: z.enum(availableCacheProviders).default("none"),
  // Fine-grained toggles for custom preset — undefined means derive from preset defaults
  auth: z.boolean().optional(),
  api: z.boolean().optional(),
  email: z.boolean().optional(),
  analytics: z.boolean().optional(),
  billing: z.array(z.enum(billingProviders)).default([]),
  features: z.array(z.enum(availableFeatures)).default([]),
  database: z.enum(availableDatabases).default("postgres"),
  framework: z.enum(availableFrameworks).default("nextjs"),
  apps: z.array(z.enum(availableApps)).default(["web"]),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

const sha256HashRegex = /^[a-f0-9]{64}$/i;

export const checksumEntrySchema = z.object({
  algorithm: z.literal("sha256"),
  hash: z.string().regex(sha256HashRegex, "Hash must be a 64-character SHA-256 hex string"),
  size: z.number().int().nonnegative(),
  path: z.string().default(""),
});

export const stateSchema = z.object({
  version: z.literal(1),
  project: projectConfigSchema,
  checksums: z.record(z.string(), checksumEntrySchema),
  generatedBy: z.string(),
  generatedAt: z.string().datetime(),
  modules: z.array(z.string()).default([]),
  procedures: z.array(z.string()).default([]),
});

export type State = z.infer<typeof stateSchema>;

export const GHOSTINIT_DIR = ".ghostinit";
export const STATE_FILE = "state.json";

export function statePath(root: string): string {
  return `${root}/${GHOSTINIT_DIR}/${STATE_FILE}`.replace(/\\/g, "/");
}

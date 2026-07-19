/**
 * Shared billing env helpers — deduplicated from monorepo.ts and single.ts.
 * Now re-exports from unified env.ts single source of truth.
 * No timestamps, deterministic sorted output.
 *
 * Backwards compat: existing imports of billingEnvLines and filteredEnvExample
 * continue to work, but implementation lives in env.ts.
 */

export {
  billingEnvLines,
  billingEnvLocalLines,
  billingEnvLocalLinesFiltered,
  envExampleContent,
  envLocalContent,
  envPlaceholderContent,
  filteredEnvExample,
  filteredEnvLocal,
  Placeholders,
} from "./env.js";

// Also re-export types for convenience
export type { RootSecrets } from "../root.js";

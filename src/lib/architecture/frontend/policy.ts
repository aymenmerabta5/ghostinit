import type { FrontendOwnershipPolicy } from "./types.js";

/** Kept byte-independent of the host filesystem for the generated CJS bundle. */
export const DEFAULT_FRONTEND_OWNERSHIP_POLICY: FrontendOwnershipPolicy = Object.freeze({
  schemaVersion: 1,
  workflow: Object.freeze({ maxCodeLines: 200, maxReturnedFields: 20 }),
  infrastructure: Object.freeze([
    "src/components/providers.tsx",
    "src/components/query-auth-boundary.tsx",
    "src/components/request-owned-snapshot.tsx",
    "src/components/providers/convex-client-provider.tsx",
    "src/components/convex-client-provider.tsx",
    "src/renderer/components/providers.tsx",
    "src/renderer/components/query-auth-boundary.tsx",
    "src/renderer/lib/providers.tsx",
  ]),
});

/** Reject changes to reviewed ownership exemptions, not just malformed JSON. */
export function validateFrontendOwnershipPolicy(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Frontend ownership policy must be an object"];
  }
  const policy = value as Record<string, unknown>;
  const errors: string[] = [];
  if (policy.schemaVersion !== 1) errors.push("Unsupported frontend ownership policy version");
  const workflow = policy.workflow as Record<string, unknown> | undefined;
  if (workflow?.maxCodeLines !== 200 || workflow?.maxReturnedFields !== 20) {
    errors.push("Workflow budgets must be 200 code lines and 20 returned fields");
  }
  if (
    !Array.isArray(policy.infrastructure) ||
    JSON.stringify(policy.infrastructure) !==
      JSON.stringify(DEFAULT_FRONTEND_OWNERSHIP_POLICY.infrastructure)
  ) {
    errors.push("Infrastructure exceptions must match the reviewed exact path list");
  }
  const allowed = new Set(["$schema", "schemaVersion", "workflow", "infrastructure"]);
  if (Object.keys(policy).some((key) => !allowed.has(key))) errors.push("Unknown policy property");
  if (
    workflow &&
    Object.keys(workflow).some((key) => !["maxCodeLines", "maxReturnedFields"].includes(key))
  ) {
    errors.push("Unknown workflow policy property");
  }
  return errors;
}

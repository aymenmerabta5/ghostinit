import { createFrontendContext } from "./context.js";
import { checkFrontendOwnership } from "./ownership.js";
import { checkFrontendState } from "./state.js";
import { checkWorkflowBudget } from "./budget.js";
import type { FrontendAnalysisInput, FrontendFinding } from "./types.js";
import { validateFrontendOwnershipPolicy } from "./policy.js";

export { classifyFrontendFile } from "./classify.js";
export { DEFAULT_FRONTEND_OWNERSHIP_POLICY, validateFrontendOwnershipPolicy } from "./policy.js";
export type {
  FrontendAnalysisInput,
  FrontendFinding,
  FrontendImport,
  FrontendOwnershipPolicy,
  FrontendRole,
} from "./types.js";

/** Same pure AST engine runs in the host and the generated Node CJS lint bundle. */
export function analyzeFrontendFile(input: FrontendAnalysisInput): FrontendFinding[] {
  const context = createFrontendContext(input);
  const policyErrors = validateFrontendOwnershipPolicy(context.policy);
  if (policyErrors.length) {
    context.add("frontend-policy-invalid", policyErrors.join("; "));
    return context.findings;
  }
  if (["other", "primitive", "infrastructure"].includes(context.role)) return [];
  checkFrontendOwnership(context);
  checkFrontendState(context);
  checkWorkflowBudget(context);
  return context.findings;
}

import type { CapabilityId } from "../capabilities/types.js";
import type { ResolvedProjectConfig } from "./config.js";

export const RESOLUTION_ISSUE_CODES = [
  "invalid-project-name",
  "unsupported-package-manager",
  "app-required",
  "invalid-app-id",
  "duplicate-app-id",
  "single-mode-app-count",
  "unsupported-deploy-binding",
  "backend-host-app-missing",
  "backend-host-target-unsupported",
  "unsupported-execution-runtime",
  "billing-provider-required",
  "billing-provider-conflict",
  "duplicate-selection",
  "capability-implied",
  "capability-explicitly-disabled",
  "capability-requires-backend",
  "capability-requires-persistence",
  "capability-target-binding-missing",
  "capability-client-target-unsupported",
  "capability-deploy-binding-unsupported",
  "database-deploy-binding-unsupported",
  "invalid-dependency-security",
] as const;

export type ResolutionIssueCode = (typeof RESOLUTION_ISSUE_CODES)[number];
export type ResolutionIssueSeverity = "error" | "warning";

export interface ResolutionIssue {
  readonly severity: ResolutionIssueSeverity;
  readonly code: ResolutionIssueCode;
  readonly path: string;
  readonly capability: CapabilityId | null;
  readonly message: string;
  readonly suggestion: string;
}

export interface ResolutionSuccess {
  readonly ok: true;
  readonly config: ResolvedProjectConfig;
  readonly issues: readonly ResolutionIssue[];
}

export interface ResolutionFailure {
  readonly ok: false;
  readonly issues: readonly ResolutionIssue[];
}

export type ResolutionResult = ResolutionSuccess | ResolutionFailure;
export type ResolutionIssueMap = Map<string, ResolutionIssue>;

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function issueSort(left: ResolutionIssue, right: ResolutionIssue): number {
  const severity = left.severity === right.severity ? 0 : left.severity === "error" ? -1 : 1;
  return (
    severity ||
    compareText(left.code, right.code) ||
    compareText(left.path, right.path) ||
    compareText(left.capability ?? "", right.capability ?? "") ||
    compareText(left.message, right.message) ||
    compareText(left.suggestion, right.suggestion)
  );
}

export function addResolutionIssue(issues: ResolutionIssueMap, issue: ResolutionIssue): void {
  const key = [
    issue.severity,
    issue.code,
    issue.path,
    issue.capability ?? "",
    issue.message,
    issue.suggestion,
  ].join("\u0000");
  issues.set(key, issue);
}

export function sortedResolutionIssues(issues: ResolutionIssueMap): ResolutionIssue[] {
  return [...issues.values()].sort(issueSort);
}

/** Shared generated guidance for automatic and explicit dependency maintenance. */
export function dependencySecurityReadmeLines(): string[] {
  return [
    "## Dependency security",
    "",
    "`bun run install:verified` and `bun run install:bootstrap` automatically apply compatible security fixes that satisfy the release-age and integrity policy, then verify the installed graph. `ghostinit upgrade` also repairs dependencies unless `--no-install` is explicit.",
    "",
    "Use `bun run security:audit` for a read-only report, `bun run security:fix --dry-run` to preview, and `bun run security:fix` to repair and run the installed audit plus `typecheck`, `lint:all`, and `test`. Add `--json` for machine output. These scripts do not require GhostInit as a dependency; the CLI provides `ghostinit security audit|fix` too.",
    "",
    "Fixes retain the seven-day delay and empty exclusions. High/critical or unknown unresolved findings block repair; unreviewed low/moderate findings remain visible and explicit audit/fix exits nonzero. Keep the verified security floors in `ghostinit.config.json.dependencySecurity` so later reconciliation preserves repaired versions.",
    "",
    "After a failed install, source changes may already be applied. Inspect `.ghostinit/security-installation.json` and retry the fix after resolving the reported cause; installed dependencies are not rolled back. A `CLEANUP_UNVERIFIED` journal blocks mutation until process cleanup is independently verified and the journal is explicitly reconciled.",
    "If `init` fails after attempting installation in an initially empty directory, it preserves the incomplete project and its recovery record. A dependency fix alone does not finish creation state or local secrets; resolve the cause, repeat the original `init` selections with `--force`, and follow any bootstrap instruction.",
    "",
  ];
}

export function dependencySecurityInstructionLines(): string[] {
  return [
    ...dependencySecurityReadmeLines(),
    "Do not bypass release age, integrity, reviewed patches, audits, or recovery leases to clear a gate. Forced/stale lease takeover does not bypass unverified process cleanup. Ordinary `ghostinit check` remains read-only; security maintenance does not replace required architecture or build/runtime checks.",
    "",
  ];
}

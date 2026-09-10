import type { DependencySecurityResult } from "./types.js";

/** Explicit projection keeps future internal diagnostics/source bytes out of CLI output. */
export function publicDependencySecurityResult(
  result: DependencySecurityResult,
): DependencySecurityResult {
  return {
    status: result.status,
    dryRun: result.dryRun,
    applied: result.applied,
    installedVerified: result.installedVerified,
    changes: result.changes.map(({ package: name, from, to, manifests }) => ({
      package: name,
      from,
      to,
      manifests: [...manifests],
    })),
    remaining: result.remaining.map(({ package: name, url, severity, disposition }) => ({
      package: name,
      url,
      severity,
      disposition,
    })),
    verifiedPatchAdvisories: [...result.verifiedPatchAdvisories],
    ...(result.message === undefined ? {} : { message: result.message }),
    ...(result.recoveryRequired === undefined ? {} : { recoveryRequired: result.recoveryRequired }),
  };
}

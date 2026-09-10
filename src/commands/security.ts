import { resolve } from "node:path";
import { publicDependencySecurityResult } from "../domain/dependency-security/public-result.js";
import { ExitCode, ValidationError, exitCodeName } from "../lib/errors.js";
import { envelope, printJson } from "../lib/json.js";
import { loadDesiredProjectConfig } from "../lib/project-config.js";
import { runDependencySecurity } from "../lib/dependency-security/runtime.js";
import { dependencySecurityPolicy } from "../templates/tooling/dependency-security-policy.js";
import type { GlobalOptions } from "./types.js";

/** Audit is read-only; fix uses the shared verified maintenance workflow. */
export interface SecurityCommandDependencies {
  readonly loadProject?: typeof loadDesiredProjectConfig;
  readonly run?: typeof runDependencySecurity;
  readonly print?: typeof printJson;
}

export async function securityCommand(
  args: string[],
  options: GlobalOptions,
  dependencies: SecurityCommandDependencies = {},
): Promise<number> {
  const startedAt = Date.now();
  const action = args[0] ?? "audit";
  if (args.length > 1 || (action !== "audit" && action !== "fix")) {
    throw new ValidationError("Usage: ghostinit security [audit|fix] [--dry-run] [--json]");
  }
  const cwd = resolve(options.cwd ?? process.cwd());
  const { resolved } = await (dependencies.loadProject ?? loadDesiredProjectConfig)(cwd);
  const policy = dependencySecurityPolicy(
    resolved.apps.some((app) => app.target === "expo"),
    resolved.apps.some((app) => app.target === "nextjs" && app.deploy === "cloudflare"),
  );
  const result = await (dependencies.run ?? runDependencySecurity)({
    cwd,
    mode: action,
    dryRun: options.dryRun,
    policy,
    logger: options.logger,
    verifyProject: action === "fix",
  });
  const exitCode =
    result.status === "failed"
      ? ExitCode.GENERAL_ERROR
      : result.status === "blocked" || result.status === "partial"
        ? ExitCode.DRIFT
        : ExitCode.OK;
  const success = exitCode === ExitCode.OK;
  const message =
    result.message ??
    (success
      ? action === "audit"
        ? "Dependency security audit passed."
        : "Dependency security maintenance completed."
      : "Dependency security maintenance requires attention.");
  if (options.json) {
    (dependencies.print ?? printJson)(
      envelope({
        success,
        exitCode,
        data: { action, ...publicDependencySecurityResult(result) },
        error: success ? undefined : { message, code: exitCodeName(exitCode) },
        command: "security",
        durationMs: Date.now() - startedAt,
      }),
    );
  } else {
    if (success) options.logger.info(message);
    else options.logger.warn(message);
    for (const change of result.changes) {
      options.logger.info(change.package + ": " + change.from + " -> " + change.to);
    }
    for (const advisory of result.remaining) {
      options.logger.warn(
        advisory.package +
          ": " +
          advisory.severity +
          " (" +
          advisory.disposition +
          ") " +
          advisory.url,
      );
    }
  }
  return exitCode;
}

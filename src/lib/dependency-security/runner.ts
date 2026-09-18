import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import {
  buildInstallEnv,
  INSTALL_TIMEOUT_MS,
  InstallerInterruptedError,
  InstallerContainmentUnavailableError,
  InstallerProcessTreeError,
} from "../process-supervisor.js";
import { invalid } from "./validation.js";
import type {
  DependencySecurityPolicy,
  DependencySecurityRuntimeDependencies,
} from "./runtime-types.js";

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

export interface SecurityCommandResult {
  readonly stdout: string;
  readonly exitCode: number;
}

/** Every command, including expected audit exit 1, must prove descendant cleanup. */
export class SecurityCommandRunner {
  private readonly bun: string;
  private readonly environment: NodeJS.ProcessEnv;
  canRemoveTemporaryFiles = true;

  constructor(
    readonly policy: DependencySecurityPolicy,
    private readonly dependencies: DependencySecurityRuntimeDependencies,
    private readonly privateDirectory: string,
    private readonly onContainmentFallback?: (message: string) => void,
  ) {
    this.bun = dependencies.resolveBun(policy.expectedBunVersion);
    this.environment = buildInstallEnv();
    // Preserve a shared content-addressed cache, but isolate user configuration.
    this.environment.BUN_INSTALL_CACHE_DIR = resolve(
      process.env.BUN_INSTALL_CACHE_DIR ?? join(homedir(), ".bun", "install", "cache"),
    );
    this.environment.HOME = join(privateDirectory, "home");
    this.environment.USERPROFILE = join(privateDirectory, "home");
    const pathEntries = Object.entries(this.environment).filter(
      ([key]) => key.toUpperCase() === "PATH",
    );
    if (pathEntries.length > 1) invalid("installer environment contains ambiguous PATH entries");
    const [pathKey = process.platform === "win32" ? "Path" : "PATH", pathValue] =
      pathEntries[0] ?? [];
    this.environment[pathKey] = [dirname(this.bun), pathValue].filter(Boolean).join(delimiter);
  }

  async run(
    cwd: string,
    argv: readonly string[],
    label: string,
    acceptAuditExit = false,
  ): Promise<SecurityCommandResult> {
    const controller = new AbortController();
    const stdout: Buffer[] = [];
    let outputBytes = 0;
    let overflow = false;
    const observe = (chunk: Buffer, capture: boolean): void => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        overflow = true;
        controller.abort();
      } else if (capture) stdout.push(Buffer.from(chunk));
    };
    const result = await this.dependencies
      .runCommand(
        {
          command: this.bun,
          argv: ["--no-env-file", ...argv],
          cwd,
          label,
          timeoutMs: INSTALL_TIMEOUT_MS,
          env: { ...this.environment, PWD: cwd },
          onStdout: (chunk) => observe(chunk, true),
          onStderr: (chunk) => observe(chunk, false),
          abortSignal: controller.signal,
          onContainmentFallback: this.onContainmentFallback,
        },
        this.policy.expectedBunVersion,
      )
      .catch((error: unknown) => {
        // A rejected call has no cleanup receipt. Never infer a safe boundary from
        // the exception type or from the command having stopped producing output.
        this.canRemoveTemporaryFiles = false;
        if (
          error instanceof InstallerProcessTreeError &&
          !(error instanceof InstallerContainmentUnavailableError)
        )
          throw error;
        throw new InstallerProcessTreeError(`${label} did not return a cleanup receipt`, error);
      });
    if (!result.cleanupVerified) {
      this.canRemoveTemporaryFiles = false;
      if (
        result.error instanceof InstallerProcessTreeError &&
        !(result.error instanceof InstallerContainmentUnavailableError)
      )
        throw result.error;
      throw new InstallerProcessTreeError(
        `${label} could not verify descendant cleanup`,
        result.error,
      );
    }
    if (result.error instanceof InstallerContainmentUnavailableError) throw result.error;
    if (result.error instanceof InstallerProcessTreeError) {
      this.canRemoveTemporaryFiles = false;
      throw result.error;
    }
    if (result.error instanceof InstallerInterruptedError) throw result.error;
    if (overflow) invalid(`${label} exceeded its bounded output limit`);
    if (
      !result.cleanupVerified ||
      result.timedOut ||
      result.signal !== null ||
      (result.exitCode !== 0 && !(acceptAuditExit && result.exitCode === 1)) ||
      (result.exitCode === 0 && result.error)
    ) {
      // Child output may contain paths or credentials. Never expose it in errors.
      invalid(`${label} failed or could not prove process cleanup`);
    }
    return { stdout: Buffer.concat(stdout).toString("utf8"), exitCode: result.exitCode };
  }

  async audit(cwd: string, mode?: "--lock-only" | "--refresh-lock-evidence"): Promise<void> {
    await this.run(
      cwd,
      [join(this.privateDirectory, "audit-dependencies.ts"), ...(mode ? [mode] : [])],
      mode ? "Dependency lock verification" : "Installed dependency verification",
    );
  }
}

import type { GenerationPlan } from "../../domain/generation/types.js";
import { ExitCode, GhostinitError } from "../../lib/errors.js";
import { InstallerInterruptedError } from "../../lib/process-supervisor.js";
import type {
  DependencySecurityCreateLifecycle,
  DependencySecurityCreatePublication,
} from "../../lib/dependency-security/runtime-types.js";

export class InstallerNativeRecoveryError extends GhostinitError {
  constructor(root: string, finalizationStarted: boolean, journalUpdated: boolean, cause: unknown) {
    super(
      `Initialization remains incomplete in ${root}. Native installation was attempted, so current project files and dependency state were preserved. Resolve the failure, rerun the original init selections with --force, then run bun run install:bootstrap. A dependency security fix does not finish initialization.`,
      cause instanceof InstallerInterruptedError ? ExitCode.CANCELLED : ExitCode.GENERATION_ERROR,
      {
        projectRoot: root,
        initialized: false,
        completed: false,
        retained: true,
        recoveryRequired: true,
        installedStateRolledBack: false,
        finalizationStarted,
        recoveryJournalUpdated: journalUpdated,
      },
    );
    this.name = "InstallerNativeRecoveryError";
    this.cause = cause;
  }
}

/** Crossing the native install boundary ends authority to roll back this live tree. */
export function createNativeInstallLifecycle(root: string) {
  let publication: DependencySecurityCreatePublication | undefined;
  const runtime: DependencySecurityCreateLifecycle = {
    kind: "existing-empty-root",
    async beforeProjectInstall(value) {
      if (publication)
        throw new Error("Native installation preparation was invoked more than once");
      publication = value;
    },
  };

  return {
    runtime,
    get active(): boolean {
      return publication !== undefined;
    },
    async preserveAfterNativeStart(finalizationStarted: boolean, cause: unknown): Promise<void> {
      if (!publication) return;
      let journalUpdated = true;
      try {
        await publication.completion.fail({
          cleanupVerified: true,
          ...(finalizationStarted ? { reason: "creation-finalization" as const } : {}),
        });
      } catch {
        // Preserve any conflicting journal bytes along with the whole project.
        // This is not permission to overwrite or erase an uncertain outcome.
        journalUpdated = false;
      }
      throw new InstallerNativeRecoveryError(root, finalizationStarted, journalUpdated, cause);
    },
    async preserveUnverifiedProcess(): Promise<void> {
      await publication?.completion.fail({ cleanupVerified: false });
    },
    async complete(plan: GenerationPlan, stateContent: string): Promise<void> {
      await publication?.completion.complete({ plan, stateContent });
    },
  };
}

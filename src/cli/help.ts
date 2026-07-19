import { ExitCode } from "../lib/errors.js";
import { envelope, printJson } from "../lib/json.js";
import { ghostinitVersion } from "../templates/versions.js";

export function showHelp(): string {
  return `GhostInit v${ghostinitVersion} — opinionated modular-monolith generator

Usage: ghostinit <command> [options]

Commands:
  create <name>          Create a new project
  add module <name>      Add a module to the current project
  add use-case <module> <name> --kind command|query
  add procedure <module> <name>
  add action <module> <name>
  sync [--check]         Rebuild generated indexes
  status                 Print project status
  check                  Run architecture checks
  doctor                 Verify environment
  version                Print CLI version
  help

Global options:
  --cwd <path>           Working directory
  --json                 Emit stable JSON envelope
  --yes                  Accept defaults without prompts
  --ci                   CI / non-interactive mode (disables TTY prompts)
  --dry-run              Show changes without writing
  --force                Bypass dirty-tree and drift checks
  --no-install           Skip installation during create
  --runtime node|bun     Runtime preference
  --quiet                Suppress stderr logs
  --debug                Verbose logging

Create options:
  --mode monorepo|single     Project structure mode (default: monorepo)
  --framework nextjs|tanstack-start     Frontend framework (default: nextjs)
  --billing <providers>      Billing: stripe,chargily,paddle,polar|both|all|none (repeatable or comma-separated)
  --features <list>          Features: eve,i18n (repeatable or comma-separated)
  --database postgres|convex|none (default: postgres)
`;
}

export function printVersion(jsonFlag: boolean, start: number): void {
  if (jsonFlag) {
    printJson(
      envelope({
        success: true,
        exitCode: ExitCode.OK,
        data: { name: "ghostinit", version: ghostinitVersion },
        command: "version",
        durationMs: Date.now() - start,
      }),
    );
  } else {
    process.stdout.write(`ghostinit ${ghostinitVersion}\n`);
  }
}

export function printHelpOutput(jsonFlag: boolean, start: number): void {
  const helpText = showHelp();
  if (jsonFlag) {
    printJson(
      envelope({
        success: true,
        exitCode: ExitCode.OK,
        data: { help: helpText },
        command: "help",
        durationMs: Date.now() - start,
      }),
    );
  } else {
    process.stdout.write(helpText);
  }
}

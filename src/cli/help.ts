import { ExitCode } from "../lib/errors.js";
import { envelope, printJson } from "../lib/json.js";
import { ghostinitVersion } from "../templates/versions.js";
import { COMMAND_NAMES, COMMAND_SPECS } from "./spec.js";

export function showHelp(): string {
  const commands = COMMAND_NAMES.map((name) => {
    const spec = COMMAND_SPECS[name];
    return `  ${spec.usage.padEnd(42)} ${spec.description}`;
  }).join("\n");
  return `GhostInit v${ghostinitVersion} — opinionated modular-monolith generator

Usage: ghostinit <command> [options]

Commands:
${commands}

Add forms:
  add module <name>
  add use-case <module> <name> --kind command|query
  add procedure <module> <name>
  add action <module> <name>
  add --list | add list

Global options:
  --cwd <path>           Working directory
  --json                 Emit stable JSON envelope
  --yes                  Accept defaults without prompts
  --ci                   CI / non-interactive mode (disables TTY prompts)
  --dry-run              Preview without project locks, changes, package installation, or secret minting
  --force                Use command-specific force behavior; managed-file conflicts still block writes
  --no-install           Skip installation during create/upgrade (security remains unverified)
  --runtime node|bun     Runtime preference
  --quiet                Suppress stderr logs
  --debug                Verbose logging
  --fix                  Auto-fix fixable issues (check, doctor only)
  --verbose              Verbose output (status, check, doctor only)
  --list                 List mode (add, status only)

Dependency security:
  security [audit]           Read-only dependency audit
  security fix              Apply compatible, age-eligible fixes and verify the installed project
  security fix --dry-run     Preview repairs without changing the project or installing packages
  Install and upgrade workflows apply compatible security fixes automatically.

Create/init options:
  --mode monorepo|single     Project structure mode (default: monorepo)
  --framework nextjs|tanstack-start     Frontend framework (default: nextjs)
  --billing <providers>      Billing: manual, chargily, and at most one of stripe|paddle|polar (comma-separated or repeatable; none disables)
  --features <list>          Features: eve,i18n (deprecated alias for --with-eve/--with-i18n)
  --database postgres|convex|none (default: postgres)
  --apps web,mobile,desktop|both|all Apps: web, mobile, desktop or combos (repeatable or comma-separated, default: web; both=web,mobile, all=web,mobile,desktop)
                              Single mobile/desktop is frontend-only; pair it with web in monorepo mode for backend capabilities
  --preset saas|frontend|custom  Preset: saas (full), frontend (minimal ui+config), custom (pick features) (default: saas)
  --cache redis|none         Cache: redis (Upstash) or none (default: none)
  --deploy vercel|fly|docker|cloudflare|none  Emit provider deployment config (default: none)
                                      Cloudflare web: Convex/none (Next via OpenNext, TanStack native)
                                      PostgreSQL, Eve, and server-side PDF are unsupported on Cloudflare
  --stack nextjs|tanstack-start|expo|both  Stack shorthand for frontend (framework+apps)
  --with-auth --with-api --with-email --with-analytics --with-cache --with-eve --with-i18n --with-pdf --with-messaging  Opt-in addons for custom preset
  --with-storage          Actor-owned object storage (requires auth, API, database, web)
  --with-notifications    Authenticated notification inbox (requires auth, API, database)
  --feature-flags posthog|none  Remote feature flags (requires API; default: none)
  --with-jobs             Persistent background jobs (requires database)
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
        durationMs: start === 0 ? 0 : Date.now() - start,
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
        durationMs: start === 0 ? 0 : Date.now() - start,
      }),
    );
  } else {
    process.stdout.write(helpText);
  }
}

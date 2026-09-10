/**
 * Single source of truth for the public CLI surface.
 *
 * Parsing still lives in `args.ts`, because node:util needs the value type for
 * every option. Applicability, positional arity, help text, and command
 * discovery are all driven from this table so an accepted option can never be
 * silently ignored by an unrelated command.
 */

export const CLI_OPTION_NAMES = [
  "cwd",
  "json",
  "yes",
  "ci",
  "dry-run",
  "force",
  "no-install",
  "runtime",
  "quiet",
  "debug",
  "version",
  "help",
  "h",
  "kind",
  "check",
  "mode",
  "framework",
  "billing",
  "features",
  "database",
  "apps",
  "preset",
  "cache",
  "deploy",
  "stack",
  "with-auth",
  "with-api",
  "with-email",
  "with-analytics",
  "with-cache",
  "with-eve",
  "with-i18n",
  "with-pdf",
  "with-messaging",
  "with-storage",
  "with-notifications",
  "feature-flags",
  "with-jobs",
  "fix",
  "verbose",
  "list",
] as const;

export type CliOptionName = (typeof CLI_OPTION_NAMES)[number];

const HELP_OPTIONS = ["help", "h"] as const;
const OUTPUT_OPTIONS = ["json", "quiet", "debug", ...HELP_OPTIONS] as const;
const PROJECT_OPTIONS = ["cwd", ...OUTPUT_OPTIONS] as const;
const CREATE_OPTIONS = [
  ...PROJECT_OPTIONS,
  "yes",
  "ci",
  "dry-run",
  "force",
  "no-install",
  "runtime",
  "mode",
  "framework",
  "billing",
  "features",
  "database",
  "apps",
  "preset",
  "cache",
  "deploy",
  "stack",
  "with-auth",
  "with-api",
  "with-email",
  "with-analytics",
  "with-cache",
  "with-eve",
  "with-i18n",
  "with-pdf",
  "with-messaging",
  "with-storage",
  "with-notifications",
  "feature-flags",
  "with-jobs",
] as const satisfies readonly CliOptionName[];

export interface CommandSpec {
  readonly description: string;
  readonly usage: string;
  readonly options: readonly CliOptionName[];
  readonly minPositionals: number;
  readonly maxPositionals: number;
}

export const COMMAND_SPECS = {
  create: {
    description: "Create a new project",
    usage: "create [name]",
    options: CREATE_OPTIONS,
    minPositionals: 0,
    maxPositionals: 1,
  },
  init: {
    description: "Initialize in the current directory",
    usage: "init [name]",
    options: CREATE_OPTIONS,
    minPositionals: 0,
    maxPositionals: 1,
  },
  upgrade: {
    description: "Hash-gated transactional desired-state upgrade",
    usage: "upgrade [--dry-run] [--force] [--no-install]",
    options: [...PROJECT_OPTIONS, "dry-run", "force", "no-install"],
    minPositionals: 0,
    maxPositionals: 0,
  },
  add: {
    description: "Add a module, use-case, procedure, or action",
    usage: "add <module|use-case|procedure|action> [...args]",
    options: [...PROJECT_OPTIONS, "dry-run", "force", "kind", "list"],
    minPositionals: 0,
    maxPositionals: 3,
  },
  sync: {
    description: "Reconcile desired state and rebuild generated indexes",
    usage: "sync [--check] [--dry-run] [--force]",
    options: [...PROJECT_OPTIONS, "dry-run", "force", "check"],
    minPositionals: 0,
    maxPositionals: 0,
  },
  status: {
    description: "Print project status",
    usage: "status [--verbose] [--list]",
    options: [...PROJECT_OPTIONS, "verbose", "list"],
    minPositionals: 0,
    maxPositionals: 0,
  },
  check: {
    description: "Run architecture checks",
    usage: "check [--fix] [--dry-run]",
    options: [...PROJECT_OPTIONS, "dry-run", "fix", "verbose"],
    minPositionals: 0,
    maxPositionals: 0,
  },
  doctor: {
    description: "Verify the configured environment",
    usage: "doctor [--fix] [--dry-run]",
    options: [...PROJECT_OPTIONS, "dry-run", "fix", "verbose"],
    minPositionals: 0,
    maxPositionals: 0,
  },
  security: {
    description: "Audit dependencies or apply compatible security fixes",
    usage: "security [audit|fix] [--dry-run]",
    options: [...PROJECT_OPTIONS, "dry-run"],
    minPositionals: 0,
    maxPositionals: 1,
  },
  capabilities: {
    description: "Print the typed support catalog",
    usage: "capabilities [--json]",
    options: ["json", ...HELP_OPTIONS],
    minPositionals: 0,
    maxPositionals: 0,
  },
  version: {
    description: "Print CLI version",
    usage: "version",
    options: ["json", "version", ...HELP_OPTIONS],
    minPositionals: 0,
    maxPositionals: 0,
  },
  help: {
    description: "Print command help",
    usage: "help",
    options: ["json", ...HELP_OPTIONS],
    minPositionals: 0,
    maxPositionals: 0,
  },
} as const satisfies Record<string, CommandSpec>;

export type CommandName = keyof typeof COMMAND_SPECS;

export const COMMAND_NAMES = Object.freeze(Object.keys(COMMAND_SPECS) as CommandName[]);

export function isCommandName(value: string): value is CommandName {
  return Object.hasOwn(COMMAND_SPECS, value);
}

export function isOptionApplicable(command: CommandName, option: CliOptionName): boolean {
  return (COMMAND_SPECS[command].options as readonly CliOptionName[]).includes(option);
}

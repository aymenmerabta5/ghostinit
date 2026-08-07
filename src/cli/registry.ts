import { createCommand } from "../commands/create.js";
import { addCommand } from "../commands/add.js";
import { syncCommand } from "../commands/sync.js";
import { statusCommand } from "../commands/status.js";
import { checkCommand } from "../commands/check.js";
import { doctorCommand } from "../commands/doctor.js";
import { initCommand } from "../commands/init.js";
import { upgradeCommand } from "../commands/upgrade.js";
import type { GlobalOptions } from "../commands/types.js";

export const COMMANDS = [
  "create",
  "init",
  "upgrade",
  "add",
  "sync",
  "status",
  "check",
  "doctor",
  "version",
  "help",
] as const;

export type CommandName = (typeof COMMANDS)[number];
export type RealCommandName = Exclude<CommandName, "version" | "help">;
export type CommandHandler = (args: string[], globals: GlobalOptions) => Promise<number>;

export const COMMAND_REGISTRY: Map<
  RealCommandName,
  { handler: CommandHandler; description: string }
> = new Map([
  ["create", { handler: createCommand, description: "Create a new project" }],
  ["init", { handler: initCommand, description: "Initialize in current directory" }],
  ["upgrade", { handler: upgradeCommand, description: "Upgrade project + sync registries" }],
  ["add", { handler: addCommand, description: "Add module/use-case/procedure/action" }],
  ["sync", { handler: syncCommand, description: "Rebuild generated indexes" }],
  ["status", { handler: statusCommand, description: "Print project status" }],
  ["check", { handler: checkCommand, description: "Run architecture checks" }],
  ["doctor", { handler: doctorCommand, description: "Verify environment" }],
]);

import { createCommand } from "../commands/create.js";
import { addCommand } from "../commands/add.js";
import { syncCommand } from "../commands/sync.js";
import { statusCommand } from "../commands/status.js";
import { checkCommand } from "../commands/check.js";
import { doctorCommand } from "../commands/doctor.js";
import { initCommand } from "../commands/init.js";
import { upgradeCommand } from "../commands/upgrade.js";
import { securityCommand } from "../commands/security.js";
import { capabilitiesCommand } from "../commands/capabilities.js";
import type { GlobalOptions } from "../commands/types.js";
import { COMMAND_NAMES, COMMAND_SPECS, type CommandName } from "./spec.js";

export const COMMANDS = COMMAND_NAMES;

export type { CommandName } from "./spec.js";
export type RealCommandName = Exclude<CommandName, "version" | "help">;
export type CommandHandler = (args: string[], globals: GlobalOptions) => Promise<number>;

export const COMMAND_REGISTRY: Map<
  RealCommandName,
  { handler: CommandHandler; description: string }
> = new Map([
  ["create", { handler: createCommand, description: COMMAND_SPECS.create.description }],
  ["init", { handler: initCommand, description: COMMAND_SPECS.init.description }],
  ["upgrade", { handler: upgradeCommand, description: COMMAND_SPECS.upgrade.description }],
  ["add", { handler: addCommand, description: COMMAND_SPECS.add.description }],
  ["sync", { handler: syncCommand, description: COMMAND_SPECS.sync.description }],
  ["security", { handler: securityCommand, description: COMMAND_SPECS.security.description }],
  ["status", { handler: statusCommand, description: COMMAND_SPECS.status.description }],
  ["check", { handler: checkCommand, description: COMMAND_SPECS.check.description }],
  ["doctor", { handler: doctorCommand, description: COMMAND_SPECS.doctor.description }],
  [
    "capabilities",
    { handler: capabilitiesCommand, description: COMMAND_SPECS.capabilities.description },
  ],
]);

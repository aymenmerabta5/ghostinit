import type { Logger } from "../lib/logger.js";

export interface GlobalOptions {
  cwd: string;
  json: boolean;
  yes: boolean;
  dryRun: boolean;
  force: boolean;
  noInstall: boolean;
  runtime: "node" | "bun";
  kind?: "command" | "query";
  check?: boolean;
  logger: Logger;
}

export interface CommandResult {
  exitCode: number;
}

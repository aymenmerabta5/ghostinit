#!/usr/bin/env node
/**
 * GhostInit CLI entry point.
 */

import { parseArgs } from "node:util";
import {
  ExitCode,
  GhostinitError,
  exitCodeName,
  type ExitCode as ExitCodeType,
} from "./lib/errors.js";
import { envelope, printJson } from "./lib/json.js";
import { Logger } from "./lib/logger.js";
import { createCommand } from "./commands/create.js";
import { addCommand } from "./commands/add.js";
import { syncCommand } from "./commands/sync.js";
import { statusCommand } from "./commands/status.js";
import { checkCommand } from "./commands/check.js";
import { doctorCommand } from "./commands/doctor.js";
import type { GlobalOptions } from "./commands/types.js";

const COMMANDS = ["create", "add", "sync", "status", "check", "doctor", "version", "help"] as const;

type CommandName = (typeof COMMANDS)[number];

function showHelp(): string {
  return `GhostInit v0.1 — opinionated modular-monolith generator

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
  --dry-run              Show changes without writing
  --force                Bypass dirty-tree and drift checks
  --no-install           Skip installation during create
  --runtime node|bun     Runtime preference
  --quiet                Suppress stderr logs
  --debug                Verbose logging
`;
}

async function main(argv: string[]): Promise<ExitCodeType> {
  const start = Date.now();
  const { values, positionals } = parseArgs({
    args: argv.slice(2),
    options: {
      cwd: { type: "string" },
      json: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "no-install": { type: "boolean", default: false },
      runtime: { type: "string" },
      quiet: { type: "boolean", default: false },
      debug: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      h: { type: "boolean", default: false },
      kind: { type: "string" },
      check: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const command = (positionals[0] ?? "help") as CommandName | string;

  const logger = new Logger({
    json: values.json,
    quiet: values.quiet,
    level: values.debug ? "debug" : "info",
  });

  const globals: GlobalOptions = {
    cwd: values.cwd ? (values.cwd as string) : process.cwd(),
    json: values.json as boolean,
    yes: values.yes as boolean,
    dryRun: values["dry-run"] as boolean,
    force: values.force as boolean,
    noInstall: values["no-install"] as boolean,
    runtime: (values.runtime as "node" | "bun") ?? "bun",
    kind: values.kind as "command" | "query" | undefined,
    check: values.check as boolean,
    logger,
  };

  if (values.version) {
    const { ghostinitVersion } = await import("../packages/versions.js");
    if (globals.json) {
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
    return ExitCode.OK;
  }

  if (values.help || values.h || command === "help" || command === "--help" || command === "-h") {
    const helpText = showHelp();
    if (globals.json) {
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
    return ExitCode.OK;
  }

  if (!COMMANDS.includes(command as CommandName)) {
    logger.error(`Unknown command: ${command}`);
    if (globals.json) {
      printJson(
        envelope({
          success: false,
          exitCode: ExitCode.INVALID_ARGUMENTS,
          error: { message: `Unknown command: ${command}`, code: "INVALID_ARGUMENTS" },
          command: String(command),
          durationMs: Date.now() - start,
        }),
      );
    }
    return ExitCode.INVALID_ARGUMENTS;
  }

  try {
    let exitCode: number = ExitCode.OK;

    switch (command) {
      case "create":
        exitCode = await createCommand(positionals.slice(1), globals);
        break;
      case "add":
        exitCode = await addCommand(positionals.slice(1), globals);
        break;
      case "sync":
        exitCode = await syncCommand(positionals.slice(1), globals);
        break;
      case "status":
        exitCode = await statusCommand(positionals.slice(1), globals);
        break;
      case "check":
        exitCode = await checkCommand(positionals.slice(1), globals);
        break;
      case "doctor":
        exitCode = await doctorCommand(positionals.slice(1), globals);
        break;
      case "version": {
        const { ghostinitVersion } = await import("../packages/versions.js");
        if (globals.json) {
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
        return ExitCode.OK;
      }
    }

    return exitCode;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const code =
      err instanceof GhostinitError ? (err.code as ExitCodeType) : ExitCode.GENERAL_ERROR;
    const codeLabel = exitCodeName(code);
    if (globals.json) {
      printJson(
        envelope({
          success: false,
          exitCode: code,
          error: {
            message: err.message,
            code: codeLabel,
            ...(err instanceof GhostinitError ? err.details : {}),
          },
          command,
          durationMs: Date.now() - start,
        }),
      );
    } else {
      logger.error(err.message);
    }
    return code;
  }
}

main(process.argv).then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(String(error instanceof Error ? error.message : error));
    process.stderr.write("\n");
    process.exit(ExitCode.GENERAL_ERROR);
  },
);

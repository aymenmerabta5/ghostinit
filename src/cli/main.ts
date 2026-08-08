import {
  ExitCode,
  GhostinitError,
  exitCodeName,
  type ExitCode as ExitCodeType,
} from "../lib/errors.js";
import { envelope, printJson } from "../lib/json.js";
import { Logger } from "../lib/logger.js";
import { COMMANDS, COMMAND_REGISTRY, type RealCommandName } from "./registry.js";
import { showHelp, printVersion, printHelpOutput } from "./help.js";
import {
  findClosestCommand,
  getBoolean,
  validateRuntime,
  validateKind,
  validateNoExtraPositionals,
  rejectInvalid,
} from "./validation.js";
import { parseRawArgs, parseCreateSpecific, buildGlobalOptions } from "./args.js";

export async function main(argv: string[]): Promise<ExitCodeType> {
  const start = Date.now();
  let values: Record<string, unknown> = {};
  let positionals: string[] = [];
  let logger: Logger | undefined;
  let jsonFlag = false;

  try {
    const parsed = parseRawArgs(argv);
    values = parsed.values;
    positionals = parsed.positionals;
    const command = parsed.command;

    jsonFlag = getBoolean(values.json);
    const quietFlag = getBoolean(values.quiet);
    const debugFlag = getBoolean(values.debug);

    logger = new Logger({
      json: jsonFlag,
      quiet: quietFlag,
      level: debugFlag ? "debug" : "info",
    });

    if (Boolean(values.version) || command === "version") {
      printVersion(jsonFlag, start);
      return ExitCode.OK;
    }

    if (Boolean(values.help) || Boolean(values.h) || command === "help") {
      printHelpOutput(jsonFlag, start);
      return ExitCode.OK;
    }

    try {
      validateNoExtraPositionals(command, positionals);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return rejectInvalid(message, command, jsonFlag, logger, start);
    }

    let runtime: "node" | "bun";
    try {
      runtime = validateRuntime(values.runtime);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return rejectInvalid(message, command, jsonFlag, logger, start);
    }

    const hasKind = values.kind !== undefined;
    const hasCheck = getBoolean(values.check);

    // Flags that only make sense while scaffolding a new project. Listed once so
    // adding a create-only flag cannot silently skip the gate — `--apps` was
    // omitted from the old hand-maintained condition, so `sync --apps mobile`
    // was accepted and quietly ignored.
    const CREATE_ONLY_FLAGS = [
      "mode",
      "framework",
      "billing",
      "features",
      "database",
      "apps",
    ] as const;

    if (command !== "create") {
      const offending = CREATE_ONLY_FLAGS.filter((flag) => values[flag] !== undefined).map(
        (flag) => `--${flag}`,
      );
      if (offending.length > 0) {
        return rejectInvalid(
          `${offending.join(", ")} can only be used with 'create' command`,
          command,
          jsonFlag,
          logger,
          start,
        );
      }
    }

    if (command !== "add" && hasKind) {
      return rejectInvalid(
        "--kind can only be used with 'add' command",
        command,
        jsonFlag,
        logger,
        start,
      );
    }

    if (command !== "sync" && hasCheck) {
      return rejectInvalid(
        "--check can only be used with 'sync' command",
        command,
        jsonFlag,
        logger,
        start,
      );
    }

    const hasFix = getBoolean(values.fix);
    const hasVerbose = getBoolean(values.verbose);
    const hasList = getBoolean(values.list);

    if (hasFix && !["check", "doctor"].includes(command)) {
      return rejectInvalid(
        "--fix can only be used with 'check' or 'doctor' commands",
        command,
        jsonFlag,
        logger,
        start,
      );
    }

    if (hasVerbose && !["status", "check", "doctor"].includes(command)) {
      return rejectInvalid(
        "--verbose can only be used with 'status', 'check' or 'doctor' commands",
        command,
        jsonFlag,
        logger,
        start,
      );
    }

    if (hasList && !["add", "status"].includes(command)) {
      return rejectInvalid(
        "--list can only be used with 'add' or 'status' commands",
        command,
        jsonFlag,
        logger,
        start,
      );
    }

    let kind: "command" | "query" | undefined;
    try {
      kind = validateKind(values.kind);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return rejectInvalid(message, command, jsonFlag, logger, start);
    }

    let createParsed;
    try {
      createParsed = parseCreateSpecific(values, command);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return rejectInvalid(message, command, jsonFlag, logger, start);
    }

    const globals = buildGlobalOptions(values, createParsed, logger, runtime, kind, hasCheck);

    if (!(COMMANDS as readonly string[]).includes(command)) {
      const suggestion = findClosestCommand(command);
      const suggestionText = suggestion ? ` Did you mean '${suggestion}'?` : "";
      const helpHint = " Run 'ghostinit help' to see available commands.";
      const fullMessage = `Unknown command: ${command}.${suggestionText}${helpHint}`;
      logger.error(fullMessage);
      if (globals.json) {
        printJson(
          envelope({
            success: false,
            exitCode: ExitCode.INVALID_ARGUMENTS,
            error: { message: fullMessage, code: exitCodeName(ExitCode.INVALID_ARGUMENTS) },
            command: String(command),
            durationMs: Date.now() - start,
          }),
        );
      } else {
        process.stdout.write("\n" + showHelp());
      }
      return ExitCode.INVALID_ARGUMENTS;
    }

    let exitCode: number = ExitCode.OK;
    const registryEntry = COMMAND_REGISTRY.get(command as RealCommandName);

    if (registryEntry?.handler) {
      try {
        exitCode = await registryEntry.handler(positionals.slice(1), globals);
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
    } else {
      printHelpOutput(globals.json, start);
      return ExitCode.OK;
    }

    return exitCode;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const maybeErr = error as { code?: string; message?: string };
    const codeProp = maybeErr?.code as string | undefined;
    const isParseError =
      codeProp === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ||
      codeProp === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE";

    const effectiveJsonFlag =
      jsonFlag ||
      (values && getBoolean((values as Record<string, unknown>).json)) ||
      argv.slice(2).includes("--json");

    const effectiveCommand = positionals[0] ? String(positionals[0]) : "unknown";
    const effectiveLogger =
      logger ?? new Logger({ json: effectiveJsonFlag, quiet: false, level: "info" });

    if (isParseError) {
      const message = err.message;
      if (effectiveJsonFlag) {
        printJson(
          envelope({
            success: false,
            exitCode: ExitCode.INVALID_ARGUMENTS,
            error: { message, code: exitCodeName(ExitCode.INVALID_ARGUMENTS) },
            command: effectiveCommand,
            durationMs: Date.now() - start,
          }),
        );
      } else {
        effectiveLogger.error(message);
      }
      return ExitCode.INVALID_ARGUMENTS;
    }

    const code =
      err instanceof GhostinitError ? (err.code as ExitCodeType) : ExitCode.GENERAL_ERROR;
    const codeLabel = exitCodeName(code);
    if (effectiveJsonFlag) {
      printJson(
        envelope({
          success: false,
          exitCode: code,
          error: {
            message: err.message,
            code: codeLabel,
            ...(err instanceof GhostinitError ? err.details : {}),
          },
          command: effectiveCommand,
          durationMs: Date.now() - start,
        }),
      );
    } else {
      effectiveLogger.error(err.message);
    }
    return code;
  }
}

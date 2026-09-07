import {
  ExitCode,
  GhostinitError,
  exitCodeName,
  type ExitCode as ExitCodeType,
} from "../lib/errors.js";
import { envelope, printJson } from "../lib/json.js";
import { Logger } from "../lib/logger.js";
import { COMMAND_REGISTRY, type RealCommandName } from "./registry.js";
import { isCommandName } from "./spec.js";
import { showHelp, printVersion, printHelpOutput } from "./help.js";
import {
  findClosestCommand,
  getBoolean,
  validateRuntime,
  validateKind,
  validateCommandInvocation,
  rejectInvalid,
} from "./validation.js";
import { parseRawArgs, parseCreateSpecific, buildGlobalOptions } from "./args.js";

export async function main(argv: string[]): Promise<ExitCodeType> {
  // Successful create/init previews own a deterministic zero-duration
  // envelope and must not consult a clock before command dispatch.
  const start = argv.includes("--dry-run") ? 0 : Date.now();
  const durationMs = () => (start === 0 ? 0 : Date.now() - start);
  let values: Record<string, unknown> = {};
  let positionals: string[] = [];
  let logger: Logger | undefined;
  let jsonFlag = false;

  try {
    const parsed = parseRawArgs(argv);
    values = parsed.values;
    positionals = parsed.positionals;
    let command = parsed.command;
    if (!parsed.rawCommand) {
      if (getBoolean(values.version)) command = "version";
      else if (getBoolean(values.help) || getBoolean(values.h)) command = "help";
    }

    jsonFlag = getBoolean(values.json);
    const quietFlag = getBoolean(values.quiet);
    const debugFlag = getBoolean(values.debug);

    logger = new Logger({
      json: jsonFlag,
      quiet: quietFlag,
      level: debugFlag ? "debug" : "info",
    });

    if (!isCommandName(command)) {
      const suggestion = findClosestCommand(command);
      const suggestionText = suggestion ? ` Did you mean '${suggestion}'?` : "";
      const helpHint = " Run 'ghostinit help' to see available commands.";
      const fullMessage = `Unknown command: ${command}.${suggestionText}${helpHint}`;
      logger.error(fullMessage);
      if (jsonFlag) {
        printJson(
          envelope({
            success: false,
            exitCode: ExitCode.INVALID_ARGUMENTS,
            error: { message: fullMessage, code: exitCodeName(ExitCode.INVALID_ARGUMENTS) },
            command,
            durationMs: durationMs(),
          }),
        );
      } else {
        process.stdout.write("\n" + showHelp());
      }
      return ExitCode.INVALID_ARGUMENTS;
    }

    try {
      validateCommandInvocation(command, values, positionals);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return rejectInvalid(message, command, jsonFlag, logger, start);
    }

    if (getBoolean(values.version) || command === "version") {
      printVersion(jsonFlag, start);
      return ExitCode.OK;
    }

    if (getBoolean(values.help) || getBoolean(values.h) || command === "help") {
      printHelpOutput(jsonFlag, start);
      return ExitCode.OK;
    }

    let runtime: "node" | "bun";
    try {
      runtime = validateRuntime(values.runtime);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return rejectInvalid(message, command, jsonFlag, logger, start);
    }

    const hasCheck = getBoolean(values.check);

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
                ...(err instanceof GhostinitError && err.details ? { details: err.details } : {}),
              },
              command,
              durationMs: durationMs(),
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
            durationMs: durationMs(),
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
            ...(err instanceof GhostinitError && err.details ? { details: err.details } : {}),
          },
          command: effectiveCommand,
          durationMs: durationMs(),
        }),
      );
    } else {
      effectiveLogger.error(err.message);
    }
    return code;
  }
}

import {
  ExitCode,
  ValidationError,
  exitCodeName,
  type ExitCode as ExitCodeType,
} from "../lib/errors.js";
import { envelope, printJson } from "../lib/json.js";
import type { Logger } from "../lib/logger.js";
import { COMMANDS } from "./registry.js";
import {
  CLI_OPTION_NAMES,
  COMMAND_NAMES,
  COMMAND_SPECS,
  isOptionApplicable,
  type CliOptionName,
  type CommandName,
} from "./spec.js";

export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let s = a;
  let t = b;
  let n = s.length;
  let m = t.length;
  if (n < m) {
    [s, t] = [t, s];
    [n, m] = [m, n];
  }

  let prev = Array.from<number>({ length: m + 1 });
  let cur = Array.from<number>({ length: m + 1 });

  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    const ca = s.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cb = t.charCodeAt(j - 1);
      const cost = ca === cb ? 0 : 1;
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      let best = del < ins ? del : ins;
      if (sub < best) best = sub;
      cur[j] = best;
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }

  return prev[m];
}

export function findClosestCommand(input: string): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const cmd of COMMANDS) {
    const dist = levenshteinDistance(input, cmd);
    const maxLen = Math.max(input.length, cmd.length);
    if (maxLen === 0) continue;
    const ratio = dist / maxLen;
    if (ratio > 0.4) continue;

    let threshold: number;
    if (input.length <= 2) threshold = 1;
    else if (input.length < 4) threshold = 2;
    else threshold = 3;

    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = cmd;
    }
  }
  return best;
}

export function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function getStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value as string[];
  }
  if (typeof value === "string") return [value];
  return undefined;
}

export function getBoolean(value: unknown, defaultValue = false): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

export function validateRuntime(raw: unknown): "node" | "bun" {
  if (raw === undefined) return "bun";
  if (raw === "node" || raw === "bun") return raw;
  throw new ValidationError(`Invalid --runtime value: ${String(raw)}. Allowed: node, bun`);
}

export function validateKind(raw: unknown): "command" | "query" | undefined {
  if (raw === undefined) return undefined;
  if (raw === "command" || raw === "query") return raw;
  throw new ValidationError(`Invalid --kind value: ${String(raw)}. Allowed: command, query`);
}

export function validateNoExtraPositionals(command: string, positionals: string[]): void {
  const count = positionals.length;
  if (command === "create") {
    if (count > 2) {
      throw new ValidationError(
        `Too many arguments for 'create': expected at most 1 (project name) but got ${count - 1}. Usage: ghostinit create <name>`,
      );
    }
  } else if (command === "add") {
    const sub = positionals[1];
    if (!sub) return;
    if (!["module", "use-case", "procedure", "action"].includes(sub)) return;
    if (sub === "module") {
      if (count > 3) {
        throw new ValidationError(
          `Too many arguments for 'add module': expected 1 (module name) but got ${count - 2}. Usage: ghostinit add module <name>`,
        );
      }
    } else {
      if (count > 4) {
        throw new ValidationError(
          `Too many arguments for 'add ${sub}': expected 2 (module, name) but got ${count - 2}. Usage: ghostinit add ${sub} <module> <name>`,
        );
      }
    }
  } else if (
    [
      "init",
      "upgrade",
      "sync",
      "status",
      "check",
      "doctor",
      "capabilities",
      "version",
      "help",
    ].includes(command)
  ) {
    const allowed = command === "init" ? 2 : 1;
    if (count > allowed) {
      throw new ValidationError(
        command === "init"
          ? `Too many arguments for 'init': expected at most 1 (project name) but got ${count - 1}. Usage: ghostinit init [name]`
          : `Too many arguments for '${command}': expected no arguments but got ${count - 1}`,
      );
    }
  }
}

export function getProvidedCliOptions(values: Record<string, unknown>): CliOptionName[] {
  return CLI_OPTION_NAMES.filter((name) => {
    const value = values[name];
    return typeof value === "boolean" ? value : value !== undefined;
  });
}

/** Validate both option applicability and arity before any command can run. */
export function validateCommandInvocation(
  command: CommandName,
  values: Record<string, unknown>,
  positionals: string[],
): void {
  const provided = getProvidedCliOptions(values);
  const inapplicable = provided.filter((option) => !isOptionApplicable(command, option));
  if (inapplicable.length > 0) {
    const formatted = inapplicable.map((option) => `--${option}`).join(", ");
    const createOnly = inapplicable.every(
      (option) => isOptionApplicable("create", option) && isOptionApplicable("init", option),
    );
    if (createOnly) {
      throw new ValidationError(`${formatted} can only be used with 'create' or 'init' commands`);
    }
    const allowed = COMMAND_NAMES.filter((candidate) =>
      inapplicable.every((option) => isOptionApplicable(candidate, option)),
    );
    throw new ValidationError(
      `${formatted} ${inapplicable.length === 1 ? "is" : "are"} not applicable to '${command}'` +
        (allowed.length > 0 ? `. Allowed on: ${allowed.join(", ")}` : ""),
    );
  }

  const args = positionals.slice(1);
  const spec = COMMAND_SPECS[command];
  if (args.length < spec.minPositionals || args.length > spec.maxPositionals) {
    const expected =
      spec.minPositionals === spec.maxPositionals
        ? String(spec.maxPositionals)
        : `${spec.minPositionals}-${spec.maxPositionals}`;
    throw new ValidationError(
      `Invalid arguments for '${command}': expected ${expected}, got ${args.length}. Usage: ghostinit ${spec.usage}`,
    );
  }

  // Add has several positional forms and therefore needs one additional row-level
  // arity check after the table's broad maximum has been applied.
  if (command === "add") {
    const [form] = args;
    const expectedByForm: Record<string, number> = {
      list: 1,
      module: 2,
      "use-case": 3,
      procedure: 3,
      action: 3,
    };
    const expected = form ? expectedByForm[form] : undefined;
    if (expected !== undefined && args.length > expected) {
      throw new ValidationError(
        `Too many arguments for 'add ${form}': expected ${expected - 1} but got ${args.length - 1}. Usage: ghostinit ${COMMAND_SPECS.add.usage}`,
      );
    }
  }
}

export function rejectInvalid(
  message: string,
  command: string,
  jsonFlag: boolean,
  logger: Logger,
  start: number,
): ExitCodeType {
  if (jsonFlag) {
    printJson(
      envelope({
        success: false,
        exitCode: ExitCode.INVALID_ARGUMENTS,
        error: { message, code: exitCodeName(ExitCode.INVALID_ARGUMENTS) },
        command: String(command),
        durationMs: start === 0 ? 0 : Date.now() - start,
      }),
    );
  } else {
    logger.error(message);
  }
  return ExitCode.INVALID_ARGUMENTS;
}

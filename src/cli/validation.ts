import {
  ExitCode,
  ValidationError,
  exitCodeName,
  type ExitCode as ExitCodeType,
} from "../lib/errors.js";
import { envelope, printJson } from "../lib/json.js";
import type { Logger } from "../lib/logger.js";
import { COMMANDS } from "./registry.js";

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
  if (command === "create" || command === "init") {
    if (count > 2) {
      throw new ValidationError(
        `Too many arguments for '${command}': expected at most 1 (project name) but got ${count - 1}. Usage: ghostinit ${command} [name]`,
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
  } else if (["sync", "status", "check", "doctor", "version", "help"].includes(command)) {
    if (count > 1) {
      throw new ValidationError(
        `Too many arguments for '${command}': expected no arguments but got ${count - 1}`,
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
        durationMs: Date.now() - start,
      }),
    );
  } else {
    logger.error(message);
  }
  return ExitCode.INVALID_ARGUMENTS;
}

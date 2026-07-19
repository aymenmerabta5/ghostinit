/**
 * Secret-safe console logger.
 *
 * - Writes informational logs to stderr so stdout stays JSON-clean.
 * - Redacts values that look like secrets from structured data.
 * - Respects --json and --quiet global flags.
 */

import type { Writable } from "node:stream";
import {
  SECRET_SUBSTRINGS,
  SECRET_PATTERN,
  URL_SECRET_PARAM_PATTERN,
  looksLikeSecret as looksLikeSecretFromConstants,
} from "./constants.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_LEVEL: LogLevel = "info";

export interface LoggerOptions {
  level?: LogLevel;
  json?: boolean;
  quiet?: boolean;
  out?: Writable["write"];
}

// Re-export for backwards compat and for tests that import from logger
export { SECRET_SUBSTRINGS };
export const SECRET_REGEX = SECRET_PATTERN;

export function looksLikeSecret(key: string): boolean {
  return looksLikeSecretFromConstants(key);
}

function redactUrlToken(value: string): string {
  try {
    const url = new URL(value);
    const needsRedaction =
      url.password || (url.searchParams.toString() && URL_SECRET_PARAM_PATTERN.test(url.search));
    if (!needsRedaction) return value;
    for (const param of Array.from(url.searchParams.keys())) {
      if (looksLikeSecretFromConstants(param)) {
        url.searchParams.set(param, "***");
      }
    }
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return value;
  }
}

export function redact(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (looksLikeSecret(key)) {
      return "***";
    }
    return redactUrlToken(value);
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => redact(v, String(i)));
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, k);
    }
    return out;
  }
  return value;
}

export class Logger {
  private level: LogLevel;
  private json: boolean;
  private quiet: boolean;
  private out: Writable["write"];

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? DEFAULT_LEVEL;
    this.json = options.json ?? false;
    this.quiet = options.quiet ?? false;
    this.out = options.out ?? process.stderr.write.bind(process.stderr);
  }

  child(overrides: Partial<LoggerOptions> = {}): Logger {
    return new Logger({
      level: overrides.level ?? this.level,
      json: overrides.json ?? this.json,
      quiet: overrides.quiet ?? this.quiet,
      out: overrides.out ?? this.out,
    });
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return !this.quiet && LEVEL_RANK[level] >= LEVEL_RANK[this.level];
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const safeMeta = meta ? redact(meta) : undefined;

    if (this.json) {
      const line = JSON.stringify({
        level,
        message,
        timestamp: new Date().toISOString(),
        ...(safeMeta ? { meta: safeMeta } : {}),
      });
      this.out(`${line}\n`);
    } else {
      const prefix = `[${level.toUpperCase()}]`;
      const suffix = safeMeta ? ` ${JSON.stringify(safeMeta)}` : "";
      this.out(`${prefix} ${message}${suffix}\n`);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write("error", message, meta);
  }
}

export const defaultLogger = new Logger();

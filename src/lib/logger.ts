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

/**
 * Redact secret-shaped substrings from a free-text value.
 *
 * Key-based redaction only catches `{ apiKey: "..." }`. It misses a secret
 * carried under a benign key (`{ note: "sk_live_..." }`) or interpolated into a
 * message. SECRET_VALUE_PATTERNS covers the common issued-credential shapes.
 */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  // Provider-issued keys: sk_live_, pk_test_, whsec_, rk_, pdl_ntf_, phc_, re_, polar_...
  /\b(?:sk|pk|rk|whsec|psk)_[A-Za-z0-9_]{8,}/g,
  /\bpdl_[A-Za-z0-9_]{8,}/g,
  /\bpolar_[A-Za-z0-9_]{8,}/g,
  /\b(?:phc|re)_[A-Za-z0-9_]{16,}/g,
  // Bearer tokens and JWTs
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g,
  // postgres://user:password@host — credentials embedded in a connection string
  /\b([a-z][a-z0-9+.-]*:\/\/[^:\s/]+):[^@\s]+@/gi,
];

export function redactSecretValues(text: string): string {
  let out = text;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, (match, prefix?: string) =>
      // Connection-string form keeps the scheme+user so the log stays useful.
      typeof prefix === "string" ? `${prefix}:***@` : "***",
    );
  }
  return out;
}

export function redact(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    if (looksLikeSecret(key)) {
      return "***";
    }
    return redactSecretValues(redactUrlToken(value));
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value.map((v, i) => redact(v, String(i), seen));
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, k, seen);
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
    // The message is user-facing free text and routinely interpolates values
    // (error strings, URLs, env values) — scan it too, not just meta.
    const safeMessage = redactSecretValues(redactUrlToken(message));

    if (this.json) {
      const line = JSON.stringify({
        level,
        message: safeMessage,
        timestamp: new Date().toISOString(),
        ...(safeMeta ? { meta: safeMeta } : {}),
      });
      this.out(`${line}\n`);
    } else {
      const prefix = `[${level.toUpperCase()}]`;
      const suffix = safeMeta ? ` ${JSON.stringify(safeMeta)}` : "";
      this.out(`${prefix} ${safeMessage}${suffix}\n`);
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

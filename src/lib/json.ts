/**
 * Stable JSON envelope used for every CLI output.
 *
 * When --json is passed, all success and failure responses share the same
 * top-level shape. Human-readable logs still go to stderr.
 */

import { redact } from "./logger.js";

export interface JsonEnvelope<T = unknown> {
  success: boolean;
  exitCode: number;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    command: string;
    durationMs: number;
  };
}

export function envelope<T>(args: {
  success: boolean;
  exitCode: number;
  data?: T;
  error?: { message: string; code?: string; details?: Record<string, unknown> };
  command: string;
  durationMs?: number;
}): JsonEnvelope<T> {
  const out: JsonEnvelope<T> = {
    success: args.success,
    exitCode: args.exitCode,
    meta: {
      command: args.command,
      durationMs: args.durationMs ?? 0,
    },
  };

  if (args.data !== undefined) {
    out.data = redact(args.data) as T;
  }

  if (args.error) {
    const { details, ...restError } = args.error;
    out.error = {
      ...restError,
      ...(details ? { details: redact(details) as Record<string, unknown> } : {}),
    } as typeof args.error;
  }

  return out;
}

export function printJson<T>(payload: JsonEnvelope<T>): void {
  // Stable deterministic JSON ordering depends on object insertion order.
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

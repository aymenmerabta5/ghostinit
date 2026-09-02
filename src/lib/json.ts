/**
 * Stable JSON envelope used for every CLI output.
 *
 * When --json is passed, all success and failure responses share the same
 * top-level shape. Human-readable logs still go to stderr.
 */

import { redact } from "./logger.js";

export const JSON_ENVELOPE_SCHEMA_URI =
  "https://ghostinit.dev/schemas/json-envelope.schema.json" as const;
export const JSON_ENVELOPE_SCHEMA_VERSION = 2 as const;

export interface JsonEnvelope<T = unknown> {
  $schema: typeof JSON_ENVELOPE_SCHEMA_URI;
  schemaVersion: typeof JSON_ENVELOPE_SCHEMA_VERSION;
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
  if (args.success && args.exitCode !== 0) {
    throw new Error("Invalid JSON envelope: successful responses require exitCode 0");
  }
  if (!args.success && args.exitCode === 0) {
    throw new Error("Invalid JSON envelope: failed responses require a non-zero exitCode");
  }
  if (args.success && args.data === undefined) {
    throw new Error("Invalid JSON envelope: successful responses require data");
  }
  if (args.success && args.error) {
    throw new Error("Invalid JSON envelope: successful responses cannot include an error");
  }
  if (!args.success && !args.error) {
    throw new Error("Invalid JSON envelope: failed responses require an error");
  }

  const out: JsonEnvelope<T> = {
    $schema: JSON_ENVELOPE_SCHEMA_URI,
    schemaVersion: JSON_ENVELOPE_SCHEMA_VERSION,
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

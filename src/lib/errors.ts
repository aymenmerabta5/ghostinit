/**
 * GhostInit public error contract.
 *
 * Every error carries a stable exit code so scripts can rely on it.
 * When --json is used, errors are serialized into the JSON envelope.
 */

export const ExitCode = {
  OK: 0,
  GENERAL_ERROR: 1,
  INVALID_ARGUMENTS: 2,
  CANCELLED: 130,
  MISSING_DEPENDENCY: 16,
  VALIDATION_ERROR: 17,
  CONFLICT_ERROR: 18,
  LOCK_ERROR: 19,
  GIT_DIRTY_ERROR: 20,
  INCOMPATIBLE_SCHEMA: 21,
  GENERATION_ERROR: 22,
  INVALID_STATE: 23,
} as const;

export type ExitCode = number;

export function exitCodeName(code: ExitCode): string {
  const labels: Record<number, string> = {
    [ExitCode.OK]: "OK",
    [ExitCode.GENERAL_ERROR]: "GENERAL_ERROR",
    [ExitCode.INVALID_ARGUMENTS]: "INVALID_ARGUMENTS",
    [ExitCode.CANCELLED]: "CANCELLED",
    [ExitCode.MISSING_DEPENDENCY]: "MISSING_DEPENDENCY",
    [ExitCode.VALIDATION_ERROR]: "VALIDATION_ERROR",
    [ExitCode.CONFLICT_ERROR]: "CONFLICT_ERROR",
    [ExitCode.LOCK_ERROR]: "LOCK_ERROR",
    [ExitCode.GIT_DIRTY_ERROR]: "GIT_DIRTY_ERROR",
    [ExitCode.INCOMPATIBLE_SCHEMA]: "INCOMPATIBLE_SCHEMA",
    [ExitCode.GENERATION_ERROR]: "GENERATION_ERROR",
    [ExitCode.INVALID_STATE]: "INVALID_STATE",
  };
  return labels[code] ?? "GENERAL_ERROR";
}

export class GhostinitError extends Error {
  readonly code: ExitCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ExitCode = ExitCode.GENERAL_ERROR,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GhostinitError";
    this.code = code;
    this.details = details;
  }
}

export class CancelledError extends GhostinitError {
  constructor(message = "Operation cancelled") {
    super(message, ExitCode.CANCELLED);
  }
}

export class ConflictError extends GhostinitError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ExitCode.CONFLICT_ERROR, details);
  }
}

export class LockError extends GhostinitError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ExitCode.LOCK_ERROR, details);
  }
}

export class GitDirtyError extends GhostinitError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ExitCode.GIT_DIRTY_ERROR, details);
  }
}

export class ValidationError extends GhostinitError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ExitCode.VALIDATION_ERROR, details);
  }
}

export class IncompatibleSchemaError extends GhostinitError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ExitCode.INCOMPATIBLE_SCHEMA, details);
  }
}

export class GenerationError extends GhostinitError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ExitCode.GENERATION_ERROR, details);
  }
}

export class ProjectStateError extends GhostinitError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ExitCode.INVALID_STATE, details);
  }
}

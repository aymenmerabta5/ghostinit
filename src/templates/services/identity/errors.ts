import { serverOnly } from "./shared.js";

export function identityErrorsContent(): string {
  return `${serverOnly}
export const IDENTITY_DOMAIN_ERROR_CODES = [
  "IDENTITY_UNAUTHENTICATED",
  "IDENTITY_VALIDATION_ERROR",
  "IDENTITY_EMAIL_NOT_VERIFIED",
  "IDENTITY_SESSION_NOT_FOUND",
  "IDENTITY_SESSION_FORBIDDEN",
  "IDENTITY_SESSION_NOT_FRESH",
  "IDENTITY_ORGANIZATION_NOT_FOUND",
  "IDENTITY_ORGANIZATION_FORBIDDEN",
  "IDENTITY_ORGANIZATION_SLUG_UNAVAILABLE",
  "IDENTITY_MEMBER_NOT_FOUND",
  "IDENTITY_MEMBER_FORBIDDEN",
  "IDENTITY_LAST_OWNER",
  "IDENTITY_INVITATION_NOT_FOUND",
  "IDENTITY_INVITATION_EMAIL_MISMATCH",
  "IDENTITY_INVITATION_EXPIRED",
  "IDENTITY_INVITATION_NOT_PENDING",
  "IDENTITY_INVITATION_ALREADY_PENDING",
  "IDENTITY_TEAM_NOT_FOUND",
  "IDENTITY_TEAM_NAME_UNAVAILABLE",
] as const;
export type IdentityDomainErrorCode = (typeof IDENTITY_DOMAIN_ERROR_CODES)[number];

export const IDENTITY_APPLICATION_ERROR_CODES = [
  "IDENTITY_AUDIT_FAILED",
  "IDENTITY_PERSISTENCE_FAILED",
] as const;
export type IdentityApplicationErrorCode = (typeof IDENTITY_APPLICATION_ERROR_CODES)[number];
export type IdentityErrorCode = IdentityDomainErrorCode | IdentityApplicationErrorCode;
export type IdentityErrorMetadata = Readonly<Record<string, string | number | boolean | null>>;

export class IdentityError<TCode extends IdentityErrorCode = IdentityErrorCode> extends Error {
  readonly code: TCode;
  readonly meta?: IdentityErrorMetadata;

  constructor(code: TCode, message: string, options?: { cause?: unknown; meta?: IdentityErrorMetadata }) {
    super(message);
    this.name = "IdentityError";
    this.code = code;
    this.meta = options?.meta;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export class IdentityDomainError<TCode extends IdentityDomainErrorCode = IdentityDomainErrorCode> extends IdentityError<TCode> {
  constructor(code: TCode, message: string, options?: { cause?: unknown; meta?: IdentityErrorMetadata }) {
    super(code, message, options);
    this.name = "IdentityDomainError";
  }
}

export class IdentityApplicationError<TCode extends IdentityApplicationErrorCode = IdentityApplicationErrorCode> extends IdentityError<TCode> {
  constructor(code: TCode, message: string, options?: { cause?: unknown; meta?: IdentityErrorMetadata }) {
    super(code, message, options);
    this.name = "IdentityApplicationError";
  }
}

export function isIdentityError(error: unknown): error is IdentityError {
  return error instanceof IdentityError;
}
`;
}

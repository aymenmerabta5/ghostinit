import { ORPCError } from "@orpc/server";

export interface CodedErrorData {
  code: string;
  meta?: Record<string, unknown>;
}

type ORPCStatusCode = ConstructorParameters<typeof ORPCError>[0];

export function codedError(
  status: ORPCStatusCode,
  code: string,
  meta?: Record<string, unknown>,
): ORPCError<ORPCStatusCode, CodedErrorData> {
  return new ORPCError<ORPCStatusCode, CodedErrorData>(status, {
    message: "Forbidden",
    data: { code, ...(meta ? { meta } : {}) },
  });
}

export const suspendedError = codedError("FORBIDDEN", "ACCOUNT_SUSPENDED", { reason: "banned" });
export const suspendedCode: string = suspendedError.data.code;
export const suspendedMeta: Record<string, unknown> | undefined = suspendedError.data.meta;

export function mapServiceError(
  error: Error & CodedErrorData,
): ORPCError<ORPCStatusCode, CodedErrorData> {
  return codedError("FORBIDDEN", error.code, error.meta);
}

export const mappedServiceError = mapServiceError(
  Object.assign(new Error("Suspended"), {
    code: "ACCOUNT_SUSPENDED",
    meta: { reason: "policy" },
  }),
);

/**
 * Narrow structural boundary around the optional Polar SDK.
 * SDK results stay unknown until each operation validates its required fields.
 */

export type PolarProviderErrorCode =
  | "NOT_CONFIGURED"
  | "NOT_SUPPORTED"
  | "INVALID_RESPONSE"
  | "PROVIDER_FAILED";

export class PolarProviderError extends Error {
  readonly name = "PolarProviderError";

  constructor(
    readonly code: PolarProviderErrorCode,
    operation: string,
    detail: string,
  ) {
    super(`${code}: Polar ${operation}: ${detail}`);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function isConfiguredAccessToken(value: string | undefined): value is string {
  return Boolean(value && !value.startsWith("REPLACE_WITH"));
}

export function requirePolarClient<T>(
  client: T | null | undefined,
  accessToken: string | undefined,
  operation: string,
): T {
  if (!isConfiguredAccessToken(accessToken)) {
    throw new PolarProviderError(
      "NOT_CONFIGURED",
      operation,
      "POLAR_ACCESS_TOKEN is missing or still a placeholder",
    );
  }
  if (!client) {
    throw new PolarProviderError(
      "NOT_CONFIGURED",
      operation,
      "@polar-sh/sdk is unavailable or could not initialize",
    );
  }
  return client;
}

export function requirePolarCapability<T>(
  capability: T | null | undefined,
  operation: string,
  capabilityName: string,
): T {
  if (!capability) {
    throw new PolarProviderError(
      "NOT_SUPPORTED",
      operation,
      `installed Polar SDK does not expose ${capabilityName}`,
    );
  }
  return capability;
}

export function requirePolarResponseString(
  value: unknown,
  operation: string,
  field: string,
): string {
  const result = nonEmptyString(value);
  if (!result) {
    throw new PolarProviderError(
      "INVALID_RESPONSE",
      operation,
      `verified SDK response did not include ${field}`,
    );
  }
  return result;
}

export function wrapPolarFailure(operation: string, error: unknown): never {
  if (error instanceof PolarProviderError) throw error;
  const detail = error instanceof Error ? error.message : String(error);
  throw new PolarProviderError("PROVIDER_FAILED", operation, detail);
}

export interface PolarClient {
  checkouts?: {
    create?: (input: Record<string, unknown>) => Promise<unknown>;
    get?: (input: { id: string }) => Promise<unknown>;
    /** Polar 0.49 returns a PageIterator whose async iterator yields every page. */
    list?: (input?: Record<string, unknown>) => Promise<AsyncIterable<unknown>>;
  };
  subscriptions?: {
    create?: (input: Record<string, unknown>) => Promise<unknown>;
    list?: (input?: Record<string, unknown>) => Promise<unknown> | AsyncIterable<unknown>;
    get?: (input: { id: string }) => Promise<unknown>;
  };
  customers?: {
    create?: (input: Record<string, unknown>) => Promise<unknown>;
    list?: (input: Record<string, unknown>) => AsyncIterable<unknown> | Promise<unknown>;
    get?: (input: { id: string }) => Promise<unknown>;
    getExternal?: (input: { externalId: string }) => Promise<unknown>;
    update?: (input: { id: string; customerUpdate: Record<string, unknown> }) => Promise<unknown>;
  };
  customerSessions?: {
    create?: (input: {
      externalCustomerId?: string;
      customerId?: string;
      returnUrl?: string;
    }) => Promise<unknown>;
  };
  events?: {
    ingest?: (input: { events: Array<Record<string, unknown>> }) => Promise<unknown>;
  };
  webhooks?: {
    createWebhookEndpoint?: (input: {
      url: string;
      format: string;
      events: string[];
      organizationId: string;
      name?: string;
    }) => Promise<unknown>;
    listWebhookEndpoints?: (input?: Record<string, unknown>) => Promise<unknown>;
  };
  licenseKeys?: {
    list?: (input: Record<string, unknown>) => AsyncIterable<unknown> | Promise<unknown>;
  };
  benefitGrants?: {
    list?: (input: Record<string, unknown>) => AsyncIterable<unknown> | Promise<unknown>;
  };
  customerSeats?: { listSeats?: (input: Record<string, unknown>) => Promise<unknown> };
}

export type PolarSdkConstructor = new (opts: {
  accessToken?: string;
  server?: string;
}) => PolarClient;

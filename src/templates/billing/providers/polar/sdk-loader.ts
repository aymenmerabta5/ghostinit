/**
 * Polar SDK lazy loader — avoids hard failure when deps not installed.
 */
import type { PolarSdkConstructor } from "./types.js";

type ValidateEvent = (
  body: string | Buffer,
  headers: Record<string, string>,
  secret: string,
) => unknown;
type WebhookVerificationErrorConstructor = new (message: string) => Error;

interface PolarSdkModule {
  Polar: PolarSdkConstructor;
}

interface PolarWebhooksModule {
  validateEvent: ValidateEvent;
  WebhookVerificationError: WebhookVerificationErrorConstructor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPolarSdkModule(value: unknown): value is PolarSdkModule {
  return isRecord(value) && typeof value.Polar === "function";
}

function isPolarWebhooksModule(value: unknown): value is PolarWebhooksModule {
  return (
    isRecord(value) &&
    typeof value.validateEvent === "function" &&
    typeof value.WebhookVerificationError === "function"
  );
}

let _PolarCtor: PolarSdkConstructor | undefined | null;
let _validateEvent: ValidateEvent | undefined | null;
let _WebhookVerificationError: WebhookVerificationErrorConstructor | undefined | null;

export async function loadPolarSdk(): Promise<{
  PolarCtor: PolarSdkConstructor;
  validateEvent: ValidateEvent;
  WebhookVerificationError: WebhookVerificationErrorConstructor;
} | null> {
  if (
    _PolarCtor !== undefined &&
    _validateEvent !== undefined &&
    _WebhookVerificationError !== undefined
  ) {
    if (_PolarCtor === null || _validateEvent === null || _WebhookVerificationError === null)
      return null;
    return {
      PolarCtor: _PolarCtor,
      validateEvent: _validateEvent,
      WebhookVerificationError: _WebhookVerificationError,
    };
  }
  try {
    const sdkModule: unknown = await import("@polar-sh/sdk");
    const webhooksModule: unknown = await import("@polar-sh/sdk/webhooks");
    if (!isPolarSdkModule(sdkModule) || !isPolarWebhooksModule(webhooksModule)) {
      throw new Error("Polar SDK module has an unexpected shape");
    }
    _PolarCtor = sdkModule.Polar;
    _validateEvent = webhooksModule.validateEvent;
    _WebhookVerificationError = webhooksModule.WebhookVerificationError;
    return {
      PolarCtor: _PolarCtor,
      validateEvent: _validateEvent,
      WebhookVerificationError: _WebhookVerificationError,
    };
  } catch {
    _PolarCtor = null;
    _validateEvent = null;
    _WebhookVerificationError = null;
    return null;
  }
}

export function getPolarCtor(): PolarSdkConstructor | null {
  if (_PolarCtor && _PolarCtor !== null) return _PolarCtor;
  return null;
}

/**
 * Polar SDK lazy loader — avoids hard failure when deps not installed.
 */
import type { PolarSdkConstructor } from "./types.js";

let _PolarCtor: PolarSdkConstructor | undefined | null;
let _validateEvent:
  | ((body: string | Buffer, headers: Record<string, string>, secret: string) => unknown)
  | undefined
  | null;
let _WebhookVerificationError: (new (msg?: string) => Error) | undefined | null;

export async function loadPolarSdk(): Promise<{
  PolarCtor: PolarSdkConstructor;
  validateEvent: (
    body: string | Buffer,
    headers: Record<string, string>,
    secret: string,
  ) => unknown;
  WebhookVerificationError: new (msg?: string) => Error;
} | null> {
  if (_PolarCtor !== undefined && _validateEvent !== undefined) {
    if (_PolarCtor === null || _validateEvent === null) return null;
    return {
      PolarCtor: _PolarCtor,
      validateEvent: _validateEvent!,
      WebhookVerificationError: _WebhookVerificationError! as new (msg?: string) => Error,
    };
  }
  try {
    // @ts-ignore - optional dep
    const mod = (await import("@polar-sh/sdk")) as unknown as { Polar: PolarSdkConstructor };
    // @ts-ignore - optional dep
    const webhooksMod = (await import("@polar-sh/sdk/webhooks")) as unknown as {
      validateEvent: (
        body: string | Buffer,
        headers: Record<string, string>,
        secret: string,
      ) => unknown;
      WebhookVerificationError: new (msg?: string) => Error;
    };
    _PolarCtor = mod.Polar as PolarSdkConstructor;
    _validateEvent = webhooksMod.validateEvent as typeof _validateEvent;
    _WebhookVerificationError = webhooksMod.WebhookVerificationError;
    return {
      PolarCtor: _PolarCtor,
      validateEvent: _validateEvent!,
      WebhookVerificationError: _WebhookVerificationError! as new (msg?: string) => Error,
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

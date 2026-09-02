/**
 * Host-only declarations for the optional Polar dependency.
 *
 * These declarations are not in billing-generator.ts's emitted subfile list;
 * generated projects therefore resolve the real @polar-sh/sdk declarations.
 */
declare module "@polar-sh/sdk" {
  export const Polar: new (...args: unknown[]) => unknown;
}

declare module "@polar-sh/sdk/webhooks" {
  export function validateEvent(
    body: string | Buffer,
    headers: Record<string, string>,
    secret: string,
  ): unknown;

  export class WebhookVerificationError extends Error {
    constructor(message: string);
  }
}

/**
 * Host-only declaration for the optional Paddle dependency.
 *
 * billing-generator.ts emits only the provider's named .ts subfiles, so this
 * declaration lets the GhostInit host typecheck the literal dynamic import
 * without being copied into generated projects. Generated projects use the
 * SDK's real declarations from @paddle/paddle-node-sdk.
 */
declare module "@paddle/paddle-node-sdk" {
  export const Paddle: new (...args: unknown[]) => unknown;
  export const Environment: {
    production: unknown;
    sandbox: unknown;
  };
}

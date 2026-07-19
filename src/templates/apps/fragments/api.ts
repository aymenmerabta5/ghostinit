/**
 * API fragments shim — split 575 LOC god file into api/ folder <300 each.
 */
export * from "./api/index.js";
export {
  authFileContent,
  orpcFileContent,
  healthFileContent,
  openapiFileContent,
  billingHelperCode,
  sharedAuthHandlerLogic,
} from "./api/core.js";
export {
  sharedStripeImports,
  stripeSecretCheck,
  stripeWebhookCore,
  stripeWebhookFileContent,
} from "./api/stripe.js";
export { chargilySharedCore, chargilyWebhookFileContent } from "./api/chargily.js";
export { paddleWebhookFileContent } from "./api/paddle.js";
export { polarWebhookFileContent } from "./api/polar.js";
export type { RouterType, ResponseLib } from "./api/core.js";

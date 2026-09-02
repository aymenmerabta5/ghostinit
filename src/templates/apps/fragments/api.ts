/**
 * API fragments shim — split a 575 LOC god file into api/ (<300 LOC each).
 *
 * Provider webhook fragments used to live here too. They emitted a second copy of
 * every `api/webhooks/<provider>` route and lost the composition race to
 * src/templates/billing/webhooks/providers/*, so they were deleted rather than
 * kept as a decaying parallel implementation.
 */
export type { RouterType, ResponseLib } from "./api/core.js";
export {
  authFileContent,
  orpcFileContent,
  healthFileContent,
  openapiFileContent,
  billingHelperCode,
  sharedAuthHandlerLogic,
  tanstackAuthRouteContent,
  tanstackAuthServerHandlerContent,
  tanstackOpenApiRouteContent,
  tanstackOpenApiServerHandlerContent,
  tanstackRpcRouteContent,
  tanstackRpcServerHandlerContent,
} from "./api/core.js";
export {
  nextOpenApiOperationsRouteContent,
  tanstackOpenApiOperationsRouteContent,
  tanstackOpenApiOperationsServerContent,
} from "./api/openapi.js";

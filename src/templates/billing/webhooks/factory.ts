/**
 * Billing webhook factory — shim re-exporting from providers/ folder.
 * Keeps backward compatibility while splitting 1281 LOC god file into <300 LOC modules.
 */
export {
  webhookContent,
  webhookRouteFiles,
  webhookFilesForProvider,
  allWebhookFiles,
  webhookFilesFiltered,
  type BillingProviderName,
  type WebhookFramework,
  type WebhookMode,
} from "./providers/index.js";
export { getDbImports, getPath, type DbImports } from "./providers/shared.js";

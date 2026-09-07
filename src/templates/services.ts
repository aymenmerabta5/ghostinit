/**
 * Services shim — split 562 LOC god file into services/ folder <150 each.
 */
export { servicesFiles } from "./services/index.js";
export { billingServiceFiles, billingCreateCheckoutContent } from "./services/billing.js";
export { emailServiceFiles, emailSendResetContent } from "./services/email.js";
export { invoiceServiceFiles, invoiceServiceContent } from "./services/invoice.js";
export { adminServiceFiles } from "./services/admin.js";
export { identityServiceFiles } from "./services/identity/index.js";
export { messagingServiceFiles } from "./services/messaging.js";
export { storageServiceFiles } from "./services/storage.js";
export { notificationsServiceFiles } from "./services/notifications/index.js";
export { featureFlagsServiceFiles } from "./services/feature-flags/index.js";
export { jobsServiceFiles } from "./services/jobs/index.js";
export { hasBillingAddon, resultImportForMode, sharedCalculateTotal } from "./services/shared.js";

/**
 * Services shim — split 562 LOC god file into services/ folder <150 each.
 */
export { servicesFiles } from "./services/index.js";
export { billingServiceFiles, billingCreateCheckoutContent } from "./services/billing.js";
export { emailServiceFiles, emailSendResetContent } from "./services/email.js";
export { invoiceServiceFiles, invoiceServiceContent } from "./services/invoice.js";
export { hasBillingAddon, resultImportForMode, sharedCalculateTotal } from "./services/shared.js";

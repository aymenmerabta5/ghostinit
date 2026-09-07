/**
 * The standalone storage contract accepts a 14 MiB base64 string so a full
 * 10 MiB decoded object fits. Keep one additional MiB for the JSON/oRPC
 * envelope while retaining a hard streaming transport bound.
 */
export const MAX_ORPC_BODY_BYTES = 15 * 1024 * 1024;

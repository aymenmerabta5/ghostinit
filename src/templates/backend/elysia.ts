// DEPRECATED - kept for reference, not emitted, use oRPC only
// Legacy: replaced by oRPC — no longer emitted. See packages/versions/src/index.ts backend deprecation.
// Spec non-negotiable oRPC contract-first, no websocket double RPC duplication treaty<App> vs @orpc/client.
// Raw body webhooks handled via Next.js route handlers (single port) via Buffer.from(await request.arrayBuffer()).
// This stub returns [] so monorepoFiles/singleFiles no longer emit apps/api Elysia server.
// File kept for backwards compatibility / historical reference only - do NOT re-introduce emission.
import type { TemplateFile } from "../shared.js";

/**
 * @deprecated - Elysia backend removed, pure oRPC only. Returns empty array.
 * Use oRPC via RPCHandler route handlers. Webhooks via Next.js routes with raw Buffer.
 */
export function backendFiles(
  _projectName?: string,
  _runtime?: "bun" | "node",
  _addons?: unknown,
): TemplateFile[] {
  return [];
}

export default backendFiles;

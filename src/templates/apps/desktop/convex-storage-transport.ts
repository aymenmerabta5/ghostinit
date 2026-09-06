import { MAX_ORPC_BODY_BYTES } from "../../api/body-limits.js";

/** Convex getUrl values are bearer capabilities, not expiring authenticated links. */
export function desktopConvexStorageTransportContent(): string {
  return `import { session } from "electron";
import { convexUrl } from "./runtime-config.js";

const MAX_STORAGE_DOWNLOAD_BYTES = ${MAX_ORPC_BODY_BYTES};

function trustedConvexStorageUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096) throw new Error("Invalid Convex storage URL");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("Invalid Convex storage URL"); }
  if (parsed.protocol !== "https:" || parsed.origin !== convexUrl || parsed.username || parsed.password ||
    parsed.search || parsed.hash || value.includes("?") || value.includes("#") ||
    !/^\\/api\\/storage\\/[A-Za-z0-9_-]+$/.test(parsed.pathname)) {
    throw new Error("Convex storage URL is outside the configured deployment boundary");
  }
  return parsed.toString();
}

export async function handleDesktopConvexStorageRequest(value: unknown): Promise<{
  body: Uint8Array; headers: [string, string][]; status: number; statusText: string;
}> {
  const url = trustedConvexStorageUrl(value);
  // The URL itself grants access. Never attach the app's auth headers or cookies;
  // getUrl does not perform a fresh application permission check on every download.
  const response = await session.defaultSession.fetch(url, {
    method: "GET",
    headers: {},
    credentials: "omit",
    redirect: "manual",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error("Convex storage redirects are not permitted");
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_STORAGE_DOWNLOAD_BYTES) {
    await response.body?.cancel();
    throw new Error("Convex storage response body is too large");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > MAX_STORAGE_DOWNLOAD_BYTES) {
          await reader.cancel();
          throw new Error("Convex storage response body is too large");
        }
        chunks.push(chunk);
      }
    } finally { reader.releaseLock(); }
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  const type = response.headers.get("content-type");
  return {
    body,
    headers: type ? [["content-type", type]] : [],
    status: response.status,
    statusText: response.statusText,
  };
}
`;
}

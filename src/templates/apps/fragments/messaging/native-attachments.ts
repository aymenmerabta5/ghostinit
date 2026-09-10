type MessagingDatabase = "postgres" | "convex";
type MessagingMode = "monorepo" | "single";

export function expoMessagingAttachmentContent(
  mode: MessagingMode,
  database: MessagingDatabase,
): string {
  const envImport = mode === "monorepo" ? "@repo/config/expo" : "@/lib/env/expo";
  return `import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { authClient } from "@/lib/auth-client";
import { env } from "${envImport}";

export interface NativeAttachmentDraft {
  uri: string;
  name: string;
  mimeType: string;
}

function assertAttachmentOwner(isCurrent: () => boolean): void {
  if (!isCurrent()) throw new Error("The attachment action owner changed");
}

function apiUrl(path: string): string {
  const base = env.EXPO_PUBLIC_API_URL || env.EXPO_PUBLIC_APP_URL;
  if (!base) throw new Error("Configure EXPO_PUBLIC_API_URL before using messaging attachments");
  return new URL(path, base.endsWith("/") ? base : base + "/").toString();
}

function safeFileName(value: string): string {
  const leaf = value.replaceAll("\\\\", "/").split("/").at(-1) ?? "attachment";
  return (leaf.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\\.+/, "") || "attachment").slice(0, 128);
}

export async function pickNativeAttachment(isCurrent: () => boolean = () => true): Promise<NativeAttachmentDraft | null> {
  assertAttachmentOwner(isCurrent);
  if (Platform.OS === "web") throw new Error("Use the web messaging surface to attach browser files");
  const picked = await File.pickFileAsync({ multipleFiles: false });
  assertAttachmentOwner(isCurrent);
  if (picked.canceled) return null;
  const selected = picked.result;
  if (!selected.uri) throw new Error("The selected attachment has no file URI");
  return {
    uri: selected.uri,
    name: safeFileName(selected.name || "attachment"),
    mimeType: selected.type || "application/octet-stream",
  };
}

async function authHeaders(isCurrent: () => boolean): Promise<Record<string, string>> {
  assertAttachmentOwner(isCurrent);
  if (Platform.OS === "web") return {};
  const cookie = await authClient.getCookie();
  assertAttachmentOwner(isCurrent);
  return cookie ? { cookie } : {};
}

function nativeAttachmentRequest(value: string): { url: string; authenticated: boolean } {
  const backend = new URL(apiUrl("/"));
  const url = new URL(value, backend);
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && url.protocol !== "http:")) {
    throw new Error("Invalid attachment URL");
  }
  if (url.origin === backend.origin && /^\\/api\\/messaging\\/attachments\\/[^/]+$/.test(url.pathname)) {
    return { url: url.toString(), authenticated: true };
  }
  ${
    database === "convex"
      ? `const configuredConvex = env.EXPO_PUBLIC_CONVEX_URL;
  if (configuredConvex) {
    const convex = new URL(configuredConvex);
    if (!convex.username && !convex.password && url.origin === convex.origin && /^\\/api\\/storage\\/[^/]+$/.test(url.pathname)) {
      // Convex storage URLs grant bearer access; never send application cookies.
      return { url: url.toString(), authenticated: false };
    }
  }`
      : ""
  }
  throw new Error("Attachment URL is outside the configured messaging storage boundary");
}

async function fetchNativeAttachment(value: string, signal: AbortSignal | undefined, isCurrent: () => boolean): Promise<Response> {
  assertAttachmentOwner(isCurrent);
  const request = nativeAttachmentRequest(value);
  const headers = request.authenticated ? await authHeaders(isCurrent) : {};
  assertAttachmentOwner(isCurrent);
  if (signal?.aborted) throw new Error("Attachment preview was cancelled");
  const response = await fetch(request.url, {
    credentials: request.authenticated ? "include" : "omit",
    headers,
    redirect: "error",
    signal,
  });
  assertAttachmentOwner(isCurrent);
  return response;
}

export async function loadNativeAttachmentPreview(value: string, signal: AbortSignal, isCurrent: () => boolean = () => true): Promise<string> {
  assertAttachmentOwner(isCurrent);
  if (signal.aborted) throw new Error("Attachment preview was cancelled");
  const response = await fetchNativeAttachment(value, signal, isCurrent);
  if (!response.ok) throw new Error("Attachment preview failed");
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!mimeType || !new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]).has(mimeType)) {
    throw new Error("Attachment is not a supported preview image");
  }
  const maximumBytes = 10 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > maximumBytes) throw new Error("Attachment preview is too large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  assertAttachmentOwner(isCurrent);
  if (signal.aborted) throw new Error("Attachment preview was cancelled");
  if (bytes.byteLength > maximumBytes) throw new Error("Attachment preview is too large");
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return "data:" + mimeType + ";base64," + btoa(binary);
}

export async function uploadNativeAttachment(
  conversationId: string,
  draft: NativeAttachmentDraft,
  isCurrent: () => boolean = () => true,
): Promise<string> {
  assertAttachmentOwner(isCurrent);
  const body = new FormData();
  body.append("conversationId", conversationId);
  const localResponse = await fetch(draft.uri);
  assertAttachmentOwner(isCurrent);
  if (!localResponse.ok) throw new Error("Unable to read the selected attachment");
  const localBlob = await localResponse.blob();
  assertAttachmentOwner(isCurrent);
  body.append("file", localBlob, draft.name);
  const headers = await authHeaders(isCurrent);
  assertAttachmentOwner(isCurrent);
  const response = await fetch(apiUrl("api/messaging/attachments"), {
    method: "POST",
    credentials: "include",
    headers: { "X-Ghostinit-Conversation-Id": conversationId, ...headers },
    body,
  });
  assertAttachmentOwner(isCurrent);
  if (!response.ok) throw new Error("Attachment upload failed with status " + response.status);
  const value: unknown = await response.json();
  assertAttachmentOwner(isCurrent);
  if (typeof value !== "object" || value === null || typeof Reflect.get(value, "attachmentId") !== "string") {
    throw new Error("Attachment upload returned no attachment id");
  }
  return String(Reflect.get(value, "attachmentId"));
}

export async function downloadNativeAttachment(url: string, originalName: string, isCurrent: () => boolean = () => true): Promise<void> {
  const response = await fetchNativeAttachment(url, undefined, isCurrent);
  if (!response.ok) throw new Error("Attachment download failed with status " + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assertAttachmentOwner(isCurrent);
  const output = new File(Paths.cache, safeFileName(originalName));
  output.write(bytes);
  const canShare = await Sharing.isAvailableAsync();
  assertAttachmentOwner(isCurrent);
  if (canShare) {
    const mimeType = response.headers.get("content-type");
    await Sharing.shareAsync(output.uri, mimeType ? { mimeType } : {});
  }
}
`;
}

export function desktopMessagingAttachmentContent(mode: MessagingMode, isConvex = false): string {
  const fetchImport =
    mode === "monorepo" ? "@/adapters/desktop-fetch" : "@/renderer/adapters/desktop-fetch";
  return `import { desktopBridgeFetch } from "${fetchImport}";

function assertAttachmentOwner(isCurrent: () => boolean): void {
  if (!isCurrent()) throw new Error("The attachment action owner changed");
}

function desktopMessagingApiUrl(path: string): string {
  let base: URL;
  try {
    const configured = window.desktopBridge.apiUrl;
    base = new URL(configured.endsWith("/") ? configured : configured + "/");
  } catch {
    throw new Error("The desktop bridge must expose a valid HTTP(S) API URL");
  }
  if ((base.protocol !== "https:" && base.protocol !== "http:") || base.username || base.password) {
    throw new Error("The desktop bridge must expose a trusted HTTP(S) API URL");
  }
  const attachmentBase = new URL("api/messaging/attachments", base);
  const attachmentPath = attachmentBase.pathname.endsWith("/")
    ? attachmentBase.pathname.slice(0, -1)
    : attachmentBase.pathname;
  const url = new URL(path.replace(new RegExp("^/+"), ""), base);
  if (
    url.origin !== base.origin ||
    url.username ||
    url.password ||
    (url.pathname !== attachmentPath && !url.pathname.startsWith(attachmentPath + "/"))
  ) {
    throw new Error("Messaging attachments must use the configured API origin");
  }
  return url.toString();
}

export async function uploadDesktopAttachment(conversationId: string, source: File, isCurrent: () => boolean = () => true): Promise<string> {
  assertAttachmentOwner(isCurrent);
  const body = new FormData();
  body.append("conversationId", conversationId);
  body.append("file", source);
  const response = await desktopBridgeFetch(desktopMessagingApiUrl("/api/messaging/attachments"), {
    method: "POST",
    credentials: "include",
    headers: { "X-Ghostinit-Conversation-Id": conversationId },
    body,
  });
  assertAttachmentOwner(isCurrent);
  if (!response.ok) throw new Error("Attachment upload failed with status " + response.status);
  const value: unknown = await response.json();
  assertAttachmentOwner(isCurrent);
  if (typeof value !== "object" || value === null || typeof Reflect.get(value, "attachmentId") !== "string") {
    throw new Error("Attachment upload returned no attachment id");
  }
  return String(Reflect.get(value, "attachmentId"));
}

export async function downloadDesktopAttachment(url: string, originalName: string, isCurrent: () => boolean = () => true): Promise<void> {
  assertAttachmentOwner(isCurrent);
${
  isConvex
    ? `  const target = new URL(url, window.desktopBridge.apiUrl);
  let response: Response;
  if (target.origin === window.desktopBridge.convexUrl && target.pathname.startsWith("/api/storage/")) {
    const result = await window.desktopBridge.convexStorageFetch(url);
    response = new Response(new Uint8Array(result.body).buffer, result);
  } else {
    response = await desktopBridgeFetch(desktopMessagingApiUrl(url), { credentials: "include" });
  }`
    : '  const response = await desktopBridgeFetch(desktopMessagingApiUrl(url), { credentials: "include" });'
}
  assertAttachmentOwner(isCurrent);
  if (!response.ok) throw new Error("Attachment download failed with status " + response.status);
  const blob = await response.blob();
  assertAttachmentOwner(isCurrent);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128) || "attachment";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
`;
}

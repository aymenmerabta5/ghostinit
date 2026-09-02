// @allow-long 320: server-mediated Convex attachment upload keeps auth, bounded admission, and action bridge auditable
import { file, type TemplateFile } from "../../../shared.js";

type MessagingMode = "monorepo" | "single";
type MessagingRouter = "next" | "tanstack";

function convexApiImport(mode: MessagingMode, router: MessagingRouter): string {
  if (mode === "single") {
    return router === "next"
      ? "../../../../../convex/_generated/api"
      : "../../../../convex/_generated/api";
  }
  return router === "next"
    ? "../../../../../../../convex/_generated/api"
    : "../../../../../../convex/_generated/api";
}

function convexServerApiImport(mode: MessagingMode): string {
  return mode === "monorepo"
    ? "../../../../../../convex/_generated/api"
    : "../../../../convex/_generated/api";
}

function handlerContent(
  mode: MessagingMode,
  router: MessagingRouter,
  generatedApiImport = convexApiImport(mode, router),
): string {
  const apiImport = mode === "monorepo" ? "@repo/api" : "@/server/api";
  const databaseImport = mode === "monorepo" ? "@repo/database" : "@/server/db";
  const serviceImport =
    mode === "monorepo" ? "@repo/services/storage" : "@/server/services/storage";
  return `import { createContext } from "${apiImport}";
import { getConvexClient } from "${databaseImport}";
import { api } from "${generatedApiImport}";
import { DEFAULT_STORAGE_QUOTA } from "${serviceImport}";

const MAX_ATTACHMENT_BYTES = DEFAULT_STORAGE_QUOTA.maxObjectBytes;
const MAX_MULTIPART_BODY_BYTES = MAX_ATTACHMENT_BYTES + 64 * 1024;
const UPLOAD_READ_DEADLINE_MS = 15_000;
const MAX_CONCURRENT_UPLOADS = 2;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
]);
const activeUploadActors = new Set<string>();
let activeUploadCount = 0;

class AttachmentBodyTooLargeError extends Error {}
class AttachmentReadTimeoutError extends Error {}

function trustedServerToken(): string {
  const token = process.env.BETTER_AUTH_SECRET;
  if (!token || token.length < 32 || token.startsWith("REPLACE_WITH")) {
    throw new Error("Trusted Convex messaging upload authentication is not configured");
  }
  return token;
}

function acquireUploadAdmission(actorId: string): (() => void) | null {
  if (activeUploadCount >= MAX_CONCURRENT_UPLOADS || activeUploadActors.has(actorId)) return null;
  activeUploadCount += 1;
  activeUploadActors.add(actorId);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeUploadCount -= 1;
    activeUploadActors.delete(actorId);
  };
}

function declaredBodyTooLarge(request: Request): boolean {
  const value = request.headers.get("content-length");
  if (value === null) return false;
  if (!/^\\d+$/.test(value)) return true;
  const length = Number(value);
  return !Number.isSafeInteger(length) || length > MAX_MULTIPART_BODY_BYTES;
}

async function readBoundedMultipartFormData(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;") || !request.body) {
    throw new TypeError("Expected multipart/form-data");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      void reader.cancel("multipart body deadline exceeded").catch(() => undefined);
      reject(new AttachmentReadTimeoutError("Attachment request body timed out"));
    }, UPLOAD_READ_DEADLINE_MS);
    timeout.unref?.();
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      received += value.byteLength;
      if (received > MAX_MULTIPART_BODY_BYTES) {
        await reader.cancel("multipart body limit exceeded").catch(() => undefined);
        throw new AttachmentBodyTooLargeError("Attachment request body is too large");
      }
      chunks.push(value);
    }
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    reader.releaseLock();
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return await new Response(body, {
    headers: { "Content-Type": contentType },
  }).formData();
}

export async function uploadConvexAttachment(request: Request): Promise<Response> {
  const context = await createContext(request.headers);
  if (!context.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (context.user.banned === true) {
    return Response.json({ error: "Suspended accounts cannot upload" }, { status: 403 });
  }
  const actorId = context.user.id;
  const conversationId = request.headers.get("x-ghostinit-conversation-id")?.trim();
  if (!conversationId || conversationId.length > 128) {
    return Response.json({ error: "A valid conversation header is required" }, { status: 400 });
  }
  if (declaredBodyTooLarge(request)) {
    return Response.json({ error: "Attachment exceeds 10 MiB" }, { status: 413 });
  }
  let serverToken: string;
  try {
    serverToken = trustedServerToken();
    await getConvexClient().action(api.messagingServer.authorizeUpload, {
      serverToken,
      actorId,
      conversationId,
    });
  } catch {
    return Response.json({ error: "Conversation access denied" }, { status: 403 });
  }

  const releaseAdmission = acquireUploadAdmission(actorId);
  if (!releaseAdmission) {
    return Response.json({ error: "Another upload is already in progress" }, { status: 429 });
  }
  try {
    let form: FormData;
    try {
      form = await readBoundedMultipartFormData(request);
    } catch (error) {
      if (error instanceof AttachmentBodyTooLargeError) {
        return Response.json({ error: "Attachment exceeds 10 MiB" }, { status: 413 });
      }
      if (error instanceof AttachmentReadTimeoutError) {
        return Response.json({ error: "Attachment upload timed out" }, { status: 408 });
      }
      return Response.json({ error: "Invalid multipart attachment body" }, { status: 400 });
    }
    const upload = form.get("file");
    if (!(upload instanceof File) || form.get("conversationId") !== conversationId) {
      return Response.json(
        { error: "file and matching conversationId are required" },
        { status: 400 },
      );
    }
    const mimeType = (upload.type || "application/octet-stream").toLowerCase();
    if (upload.size < 1 || upload.size > MAX_ATTACHMENT_BYTES) {
      return Response.json(
        { error: upload.size < 1 ? "Attachment cannot be empty" : "Attachment exceeds 10 MiB" },
        { status: upload.size < 1 ? 400 : 413 },
      );
    }
    if (!ALLOWED_MIME.has(mimeType)) {
      return Response.json({ error: "Unsupported attachment type" }, { status: 415 });
    }
    const bytes = await upload.arrayBuffer();
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return Response.json({ error: "Attachment exceeds 10 MiB" }, { status: 413 });
    }
    try {
      const result = await getConvexClient().action(api.messagingServer.upload, {
        serverToken,
        actorId,
        conversationId,
        bytes,
        mimeType,
        originalName: upload.name,
      });
      return Response.json({ attachmentId: result.attachmentId }, { status: 201 });
    } catch {
      return Response.json({ error: "Attachment registration failed" }, { status: 409 });
    }
  } finally {
    releaseAdmission();
  }
}
`;
}

export function messagingConvexAttachmentRouteFiles(
  router: MessagingRouter,
  mode: MessagingMode,
): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/web/" : "";
  if (router === "next") {
    return [
      file(
        `${root}src/app/api/messaging/attachments/route.ts`,
        `${handlerContent(mode, router)}
export const POST = uploadConvexAttachment;
`,
      ),
    ];
  }
  return [
    file(
      `${root}src/server/http/messaging/attachments-upload.server.ts`,
      `import "server-only";
${handlerContent(mode, router, convexServerApiImport(mode))}`,
    ),
    file(
      `${root}src/routes/api/messaging/attachments.ts`,
      `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchAttachmentUpload = createServerOnlyFn(
  async (request: Request): Promise<Response> => {
    const { uploadConvexAttachment } = await import(
      "@/server/http/messaging/attachments-upload.server"
    );
    return await uploadConvexAttachment(request);
  },
);

export const Route = createFileRoute("/api/messaging/attachments")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => dispatchAttachmentUpload(request),
    },
  },
});
`,
    ),
  ];
}

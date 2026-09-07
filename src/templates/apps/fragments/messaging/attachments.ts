import { file, type TemplateFile } from "../../../shared.js";
import { postgresMessagingAttachmentAdapterContent } from "../../../adapters/messaging/postgres-attachments.js";

type MessagingMode = "monorepo" | "single";
type MessagingRouter = "next" | "tanstack";

function imports(mode: MessagingMode, operation: "upload" | "download"): string {
  if (operation === "upload") {
    return `import { auth } from "${mode === "monorepo" ? "@repo/auth" : "@/server/auth"}";
import { DEFAULT_STORAGE_QUOTA } from "${mode === "monorepo" ? "@repo/services/storage" : "@/server/services/storage"}";
import { isAllowedMime } from "${mode === "monorepo" ? "@repo/storage" : "@/server/storage"}";
import {
  authorizeMessageAttachmentUpload,
  messageAttachmentStorageErrorCode,
  storeMessageAttachment,
} from "@/server/messaging/attachment-storage";`;
  }
  if (mode === "monorepo") {
    return `import { auth } from "@repo/auth";
import { conversationParticipants, db, messageAttachments } from "@repo/database";
import { getFile } from "@repo/storage";
import { and, eq, isNotNull } from "drizzle-orm";`;
  }
  return `import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { conversationParticipants, messageAttachments } from "@/server/db/schema/messaging";
import { getFile } from "@/server/storage";
import { and, eq, isNotNull } from "drizzle-orm";`;
}

function uploadHelpers(): string {
  return `const MAX_ATTACHMENT_BYTES = DEFAULT_STORAGE_QUOTA.maxObjectBytes;
const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_MULTIPART_BODY_BYTES = MAX_ATTACHMENT_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;
const UPLOAD_READ_DEADLINE_MS = 15_000;
const MAX_CONCURRENT_UPLOADS = 2;
const activeUploadActors = new Set<string>();
let activeUploadCount = 0;

class AttachmentBodyTooLargeError extends Error {
  constructor() {
    super("Attachment request body exceeds the bounded multipart limit");
    this.name = "AttachmentBodyTooLargeError";
  }
}

class AttachmentReadTimeoutError extends Error {
  constructor() {
    super("Attachment request body timed out");
    this.name = "AttachmentReadTimeoutError";
  }
}

function acquireUploadAdmission(userId: string): (() => void) | null {
  if (activeUploadCount >= MAX_CONCURRENT_UPLOADS || activeUploadActors.has(userId)) return null;
  activeUploadCount += 1;
  activeUploadActors.add(userId);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeUploadCount -= 1;
    activeUploadActors.delete(userId);
  };
}

function declaredBodyTooLarge(request: Request): boolean {
  const value = request.headers.get("content-length");
  if (value === null) return false;
  if (!/^\\d+$/.test(value)) return true;
  const length = Number(value);
  return !Number.isSafeInteger(length) || length > MAX_MULTIPART_BODY_BYTES;
}

/**
 * Request.formData() buffers an unbounded chunked body. Bound the stream first,
 * cancel it as soon as the multipart envelope crosses the file limit plus a
 * small metadata allowance, then parse only the bounded copy.
 */
export async function readBoundedMultipartFormData(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new TypeError("Expected multipart/form-data");
  }
  if (!request.body) throw new TypeError("Expected a multipart request body");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      void reader.cancel("multipart body deadline exceeded").catch(() => undefined);
      reject(new AttachmentReadTimeoutError());
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
        throw new AttachmentBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    reader.releaseLock();
  }

  const boundedBody = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    boundedBody.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return await new Response(boundedBody, {
    headers: { "Content-Type": contentType },
  }).formData();
}`;
}

function downloadHelpers(): string {
  return `function contentDisposition(value: string): string {
  const normalizedCharacters = Array.from(value.toWellFormed(), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f ? "_" : character;
  });
  const normalized = normalizedCharacters.slice(0, 255).join("") || "attachment";
  const fallback = Array.from(normalized, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code > 0x7e || character === '"' || character === "\\\\" || character === "/"
      ? "_"
      : character;
  }).join("");
  const encoded = encodeURIComponent(normalized).replace(
    /['()*]/g,
    (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase(),
  );
  return \`inline; filename="\${fallback}"; filename*=UTF-8''\${encoded}\`;
}`;
}

function sharedHelpers(mode: MessagingMode, operation: "upload" | "download"): string {
  return `${imports(mode, operation)}

async function sessionUser(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!session?.user || session.user.banned === true) return null;
  return session.user;
}

${operation === "upload" ? uploadHelpers() : downloadHelpers()}`;
}

function uploadHandler(mode: MessagingMode, response: "next" | "web"): string {
  const json = response === "next" ? "NextResponse.json" : "Response.json";
  const nextImport = response === "next" ? 'import { NextResponse } from "next/server";\n' : "";
  return `${nextImport}${sharedHelpers(mode, "upload")}

export async function uploadAttachment(request: Request): Promise<Response> {
  const user = await sessionUser(request);
  if (!user) return ${json}({ error: "Unauthorized" }, { status: 401 });
  const conversationId = request.headers.get("x-ghostinit-conversation-id")?.trim();
  if (!conversationId || conversationId.length > 128) {
    return ${json}({ error: "A valid conversation header is required" }, { status: 400 });
  }
  // Authenticate membership before consuming any attacker-controlled body.
  if (!(await authorizeMessageAttachmentUpload(conversationId, user.id))) {
    return ${json}({ error: "Conversation access denied" }, { status: 403 });
  }
  if (declaredBodyTooLarge(request)) {
    return ${json}({ error: "Attachment exceeds 10 MiB" }, { status: 413 });
  }
  const releaseAdmission = acquireUploadAdmission(user.id);
  if (!releaseAdmission) {
    return ${json}({ error: "Another upload is already in progress" }, { status: 429 });
  }
  try {
    let form: FormData;
    try {
      form = await readBoundedMultipartFormData(request);
    } catch (error) {
      if (error instanceof AttachmentBodyTooLargeError) {
        return ${json}({ error: "Attachment exceeds 10 MiB" }, { status: 413 });
      }
      if (error instanceof AttachmentReadTimeoutError) {
        return ${json}({ error: "Attachment upload timed out" }, { status: 408 });
      }
      return ${json}({ error: "Invalid multipart attachment body" }, { status: 400 });
    }
    const upload = form.get("file");
    const formConversationId = form.get("conversationId");
    if (!(upload instanceof File) || formConversationId !== conversationId) {
      return ${json}({ error: "file and matching conversationId are required" }, { status: 400 });
    }
    if (upload.size > MAX_ATTACHMENT_BYTES) {
      return ${json}({ error: "Attachment exceeds 10 MiB" }, { status: 413 });
    }
    if (upload.size === 0) {
      return ${json}({ error: "Attachment cannot be empty" }, { status: 400 });
    }
    const mimeType = upload.type || "application/octet-stream";
    if (!isAllowedMime(mimeType)) {
      return ${json}({ error: "Unsupported attachment type" }, { status: 415 });
    }
    const bytes = new Uint8Array(await upload.arrayBuffer());
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return ${json}({ error: "Attachment exceeds 10 MiB" }, { status: 413 });
    }
    try {
      const stored = await storeMessageAttachment({
        ownerId: user.id,
        conversationId,
        data: bytes,
        mimeType,
        originalName: upload.name,
      });
      return ${json}({ attachmentId: stored.attachmentId }, { status: 201 });
    } catch (error) {
      const code = messageAttachmentStorageErrorCode(error);
      if (code === "STORAGE_FORBIDDEN") {
        return ${json}({ error: "Conversation access denied" }, { status: 403 });
      }
      if (code === "STORAGE_QUOTA_EXCEEDED") {
        return ${json}({ error: "Storage quota exceeded" }, { status: 409 });
      }
      throw error;
    }
  } finally {
    releaseAdmission();
  }
}
`;
}

function downloadHandler(mode: MessagingMode): string {
  return `${sharedHelpers(mode, "download")}

export async function downloadAttachment(request: Request, attachmentId: string): Promise<Response> {
  const user = await sessionUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const now = new Date();
  const authorizedRows = await db
    .select({
      ownerId: messageAttachments.ownerId,
      messageId: messageAttachments.messageId,
      expiresAt: messageAttachments.expiresAt,
      storageKey: messageAttachments.storageKey,
      mimeType: messageAttachments.mimeType,
      originalName: messageAttachments.originalName,
    })
    .from(messageAttachments)
    .innerJoin(
      conversationParticipants,
      and(
        eq(conversationParticipants.conversationId, messageAttachments.conversationId),
        eq(conversationParticipants.userId, user.id),
      ),
    )
    .where(and(eq(messageAttachments.id, attachmentId), isNotNull(messageAttachments.uploadedAt)))
    .limit(1);
  const authorized = authorizedRows[0];
  if (!authorized) return new Response("Not found", { status: 404 });
  if (
    authorized.messageId === null &&
    (authorized.ownerId !== user.id || authorized.expiresAt <= now)
  ) {
    return new Response("Not found", { status: 404 });
  }
  const data = await getFile(authorized.storageKey);
  if (!data) return new Response("Not found", { status: 404 });
  const responseBody = new Uint8Array(data).buffer;
  return new Response(responseBody, {
    headers: {
      "Content-Type": authorized.mimeType,
      "Content-Disposition": contentDisposition(authorized.originalName),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
`;
}

function nextFiles(mode: MessagingMode): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/web/" : "";
  return [
    file(
      `${root}src/app/api/messaging/attachments/route.ts`,
      `${uploadHandler(mode, "next")}
export const POST = uploadAttachment;
`,
    ),
    file(
      `${root}src/app/api/messaging/attachments/[attachmentId]/route.ts`,
      `${downloadHandler(mode)}
export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
): Promise<Response> {
  const { attachmentId } = await context.params;
  return await downloadAttachment(request, attachmentId);
}
`,
    ),
  ];
}

function tanstackFiles(mode: MessagingMode): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/web/" : "";
  return [
    file(
      `${root}src/server/http/messaging/attachments-upload.server.ts`,
      `import "server-only";
${uploadHandler(mode, "web")}`,
    ),
    file(
      `${root}src/server/http/messaging/attachments-download.server.ts`,
      `import "server-only";
${downloadHandler(mode)}`,
    ),
    file(
      `${root}src/routes/api/messaging/attachments.ts`,
      `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchAttachmentUpload = createServerOnlyFn(
  async (request: Request): Promise<Response> => {
    const { uploadAttachment } = await import(
      "@/server/http/messaging/attachments-upload.server"
    );
    return await uploadAttachment(request);
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
    file(
      `${root}src/routes/api/messaging/attachments.$attachmentId.ts`,
      `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchAttachmentDownload = createServerOnlyFn(
  async (request: Request, attachmentId: string): Promise<Response> => {
    const { downloadAttachment } = await import(
      "@/server/http/messaging/attachments-download.server"
    );
    return await downloadAttachment(request, attachmentId);
  },
);

export const Route = createFileRoute("/api/messaging/attachments/$attachmentId")({
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: { attachmentId: string } }) =>
        dispatchAttachmentDownload(request, params.attachmentId),
    },
  },
});
`,
    ),
  ];
}

export function messagingAttachmentRouteFiles(
  router: MessagingRouter,
  mode: MessagingMode,
): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/web/" : "";
  return [
    file(
      `${root}src/server/messaging/attachment-storage.ts`,
      postgresMessagingAttachmentAdapterContent(mode),
    ),
    ...(router === "next" ? nextFiles(mode) : tanstackFiles(mode)),
  ];
}

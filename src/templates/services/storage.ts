// @allow-long 390: one renderer emits storage policy, contracts, application ports, and facade
import { file, type TemplateFile } from "../shared.js";
import type { ProjectMode } from "../../lib/addons.js";

function serviceRoot(mode: ProjectMode): string {
  return mode === "monorepo" ? "packages/services/src/storage" : "src/server/services/storage";
}

function contractsContent(): string {
  return `import "server-only";

export interface StorageActor {
  id: string;
  banned: boolean;
}

export interface AttachmentUpload {
  attachmentId: string;
  conversationId: string;
  ownerId: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthorizedAttachment extends AttachmentUpload {
  storageKey: string;
}

export interface AttachmentDownload {
  data: Uint8Array;
  mimeType: string;
  byteSize: number;
  originalName: string;
}
`;
}

/**
 * Application-owned starter limits. These are deliberately code policy rather
 * than vendor claims or environment-dependent defaults. Both persistence
 * adapters render from this single policy source.
 */
export const DEFAULT_STORAGE_QUOTA = Object.freeze({
  maxObjectBytes: 10 * 1024 * 1024,
  maxObjectsPerOwner: 100,
  maxBytesPerOwner: 100 * 1024 * 1024,
  pendingReservationTtlMs: 15 * 60 * 1000,
});

export function storageQuotaPolicyContent(): string {
  return `/**
 * Application-owned starter storage policy. Change these values deliberately
 * with a data-migration plan; they are not provider or environment defaults.
 */
export const DEFAULT_STORAGE_QUOTA = Object.freeze({
  maxObjectBytes: ${DEFAULT_STORAGE_QUOTA.maxObjectBytes},
  maxObjectsPerOwner: ${DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner},
  maxBytesPerOwner: ${DEFAULT_STORAGE_QUOTA.maxBytesPerOwner},
  pendingReservationTtlMs: ${DEFAULT_STORAGE_QUOTA.pendingReservationTtlMs},
});

export type StorageQuotaPolicy = typeof DEFAULT_STORAGE_QUOTA;

export type StorageQuotaDecision = "allow" | "invalid" | "quota-exceeded";

const MANAGED_STORAGE_PARAMETER_PREFIX = "ghostinit-upload=";
const MANAGED_STORAGE_TOKEN = /^[0-9a-f]{32}$/;

/** Marks blobs exclusively owned by the generated central Convex registry. */
export function managedStorageContentType(mimeType: string, token: string): string {
  if (!MANAGED_STORAGE_TOKEN.test(token)) {
    throw new TypeError("Managed storage token must be 128-bit lowercase hex");
  }
  return \`\${mimeType.trim().toLowerCase()}; \${MANAGED_STORAGE_PARAMETER_PREFIX}\${token}\`;
}

export function managedStorageToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const parameter = value
    .split(";")
    .slice(1)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.toLowerCase().startsWith(MANAGED_STORAGE_PARAMETER_PREFIX));
  if (!parameter) return null;
  const token = parameter.slice(MANAGED_STORAGE_PARAMETER_PREFIX.length);
  return MANAGED_STORAGE_TOKEN.test(token) ? token : null;
}

export function isManagedStorageContentType(value: string | null | undefined): boolean {
  return managedStorageToken(value) !== null;
}

export function managedStorageBaseMimeType(
  value: string | null | undefined,
  expectedToken?: string,
): string | null {
  const token = managedStorageToken(value);
  if (!token || (expectedToken !== undefined && token !== expectedToken)) return null;
  const base = value?.split(";", 1)[0]?.trim().toLowerCase();
  return base || null;
}

/** Pure application policy; persistence adapters provide one atomic usage snapshot. */
export function decideStorageQuota(
  currentByteSizes: readonly number[],
  expectedByteSize: number,
): StorageQuotaDecision {
  if (
    !Number.isSafeInteger(expectedByteSize) ||
    expectedByteSize < 1 ||
    expectedByteSize > DEFAULT_STORAGE_QUOTA.maxObjectBytes
  ) {
    return "invalid";
  }
  let usedBytes = 0;
  for (const byteSize of currentByteSizes) {
    if (!Number.isSafeInteger(byteSize) || byteSize < 1) return "invalid";
    usedBytes += byteSize;
    if (!Number.isSafeInteger(usedBytes)) return "invalid";
  }
  if (
    currentByteSizes.length >= DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner ||
    usedBytes > DEFAULT_STORAGE_QUOTA.maxBytesPerOwner - expectedByteSize
  ) {
    return "quota-exceeded";
  }
  return "allow";
}
`;
}

function portsContent(): string {
  return `import "server-only";
import type { AttachmentUpload, AuthorizedAttachment } from "./contracts.js";

export interface StoredBlob {
  storageKey: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
}

export interface AttachmentBlobPort {
  put(data: Uint8Array, originalName: string, mimeType: string): Promise<StoredBlob>;
  get(storageKey: string): Promise<Uint8Array | null>;
  delete(storageKey: string): Promise<void>;
}

export interface AttachmentAccessPort {
  isParticipant(conversationId: string, userId: string): Promise<boolean>;
}

export interface AttachmentRepositoryPort {
  registerPending(input: AttachmentUpload & { storageKey: string }): Promise<void>;
  /**
   * Resolve by opaque attachment ID. The adapter must include the participant
   * predicate in the same database query. Pending rows are visible only to their
   * owner before expiry; claimed rows are visible to current participants.
   */
  resolveAuthorized(attachmentId: string, userId: string): Promise<AuthorizedAttachment | null>;
  /** Atomically delete an unclaimed owned row and return its blob key. */
  deletePendingOwned(attachmentId: string, ownerId: string): Promise<{ storageKey: string } | null>;
}
`;
}

function errorsContent(): string {
  return `import "server-only";

export type StorageErrorCode =
  | "STORAGE_UNAUTHENTICATED"
  | "STORAGE_ACTOR_BANNED"
  | "STORAGE_FORBIDDEN"
  | "STORAGE_INVALID_FILE"
  | "STORAGE_QUOTA_EXCEEDED"
  | "STORAGE_ATTACHMENT_NOT_FOUND"
  | "STORAGE_WRITE_FAILED";

export class StorageServiceError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "StorageServiceError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
`;
}

function ownedPortsContent(): string {
  return `import "server-only";

export interface OwnedStoredObject {
  id: string;
  ownerId: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  createdAt: Date;
}

export interface OwnedStoredObjectWithData {
  object: OwnedStoredObject;
  data: Uint8Array;
}

export interface OwnedStoragePort {
  putOwned(input: {
    ownerId: string;
    data: Uint8Array;
    originalName: string;
    mimeType: string;
    createdAt?: Date;
  }): Promise<OwnedStoredObject>;
  getOwned(input: { ownerId: string; id: string }): Promise<OwnedStoredObjectWithData | null>;
  deleteOwned(input: { ownerId: string; id: string }): Promise<boolean>;
}
`;
}

function ownedServiceContent(): string {
  return `import "server-only";
import type { StorageActor } from "./contracts.js";
import { StorageServiceError } from "./errors.js";
import type { OwnedStoragePort } from "./owned-ports.js";
import { DEFAULT_STORAGE_QUOTA } from "./policy.js";

const ALLOWED_STORAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

function requireStorageActor(actor: StorageActor): void {
  if (!actor.id) throw new StorageServiceError("STORAGE_UNAUTHENTICATED", "Authentication required");
  if (actor.banned) throw new StorageServiceError("STORAGE_ACTOR_BANNED", "Suspended accounts cannot use storage");
}

function safeStorageName(value: string): string {
  let leafStart = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x2f || code === 0x5c) leafStart = index + 1;
  }
  const leaf = Array.from(value.slice(leafStart), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f ? "_" : character;
  }).join("").trim();
  return Array.from(leaf || "object").slice(0, 255).join("");
}

function storageFailureCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = Reflect.get(error, "code");
  if (typeof direct === "string") return direct;
  const data = Reflect.get(error, "data");
  if (!data || typeof data !== "object") return undefined;
  const nested = Reflect.get(data, "code");
  return typeof nested === "string" ? nested : undefined;
}

export function createOwnedStorageService(port: OwnedStoragePort) {
  return {
    async upload(actor: StorageActor, input: { data: Uint8Array; mimeType: string; originalName: string }) {
      requireStorageActor(actor);
      const mimeType = input.mimeType.trim().toLowerCase();
      if (
        input.data.byteLength < 1 ||
        input.data.byteLength > DEFAULT_STORAGE_QUOTA.maxObjectBytes ||
        !ALLOWED_STORAGE_MIME_TYPES.has(mimeType)
      ) {
        throw new StorageServiceError("STORAGE_INVALID_FILE", "The uploaded file is not allowed");
      }
      try {
        return await port.putOwned({
          ownerId: actor.id,
          data: input.data,
          mimeType,
          originalName: safeStorageName(input.originalName),
        });
      } catch (cause) {
        if (cause instanceof StorageServiceError) throw cause;
        if (storageFailureCode(cause) === "STORAGE_QUOTA_EXCEEDED") {
          throw new StorageServiceError("STORAGE_QUOTA_EXCEEDED", "Storage quota exceeded", {
            cause,
          });
        }
        throw cause;
      }
    },
    async download(actor: StorageActor, id: string) {
      requireStorageActor(actor);
      const value = await port.getOwned({ ownerId: actor.id, id });
      if (!value) throw new StorageServiceError("STORAGE_ATTACHMENT_NOT_FOUND", "Stored object not found");
      return value;
    },
    async remove(actor: StorageActor, id: string) {
      requireStorageActor(actor);
      const deleted = await port.deleteOwned({ ownerId: actor.id, id });
      if (!deleted) throw new StorageServiceError("STORAGE_ATTACHMENT_NOT_FOUND", "Stored object not found");
      return { ok: true as const };
    },
  };
}

export type OwnedStorageService = ReturnType<typeof createOwnedStorageService>;
`;
}

function facadeContent(): string {
  return `import "server-only";
import type { AttachmentAccessPort, AttachmentBlobPort, AttachmentRepositoryPort } from "./ports.js";
import type { StorageActor } from "./contracts.js";
import { StorageServiceError } from "./errors.js";

export interface StorageServiceDependencies {
  access: AttachmentAccessPort;
  attachments: AttachmentRepositoryPort;
  blobs: AttachmentBlobPort;
  createId: () => string;
  now?: () => Date;
  pendingLifetimeMs?: number;
}

function assertActor(actor: StorageActor): void {
  if (!actor.id) throw new StorageServiceError("STORAGE_UNAUTHENTICATED", "Authentication required");
  if (actor.banned) throw new StorageServiceError("STORAGE_ACTOR_BANNED", "Suspended accounts cannot use storage");
}

export function createStorageService({
  access,
  attachments,
  blobs,
  createId,
  now = () => new Date(),
  pendingLifetimeMs = 15 * 60 * 1000,
}: StorageServiceDependencies) {
  return {
    async upload(actor: StorageActor, input: {
      conversationId: string;
      data: Uint8Array;
      mimeType: string;
      originalName: string;
    }) {
      assertActor(actor);
      if (!(await access.isParticipant(input.conversationId, actor.id))) {
        throw new StorageServiceError("STORAGE_FORBIDDEN", "Conversation access denied");
      }
      let stored;
      try {
        stored = await blobs.put(input.data, input.originalName, input.mimeType);
      } catch (cause) {
        throw new StorageServiceError("STORAGE_WRITE_FAILED", "Attachment storage failed", { cause });
      }
      const createdAt = now();
      const attachmentId = createId();
      try {
        await attachments.registerPending({
          attachmentId,
          conversationId: input.conversationId,
          ownerId: actor.id,
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          originalName: stored.originalName,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + pendingLifetimeMs),
        });
      } catch (cause) {
        await blobs.delete(stored.storageKey).catch(() => undefined);
        throw new StorageServiceError("STORAGE_WRITE_FAILED", "Attachment registration failed", { cause });
      }
      return {
        attachmentId,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        originalName: stored.originalName,
      };
    },

    async download(actor: StorageActor, attachmentId: string) {
      assertActor(actor);
      // The opaque ID is authorized by the adapter before a storage key exists
      // in application memory. Never accept a key from a route or client.
      const attachment = await attachments.resolveAuthorized(attachmentId, actor.id);
      if (!attachment) {
        throw new StorageServiceError("STORAGE_ATTACHMENT_NOT_FOUND", "Attachment not found");
      }
      const data = await blobs.get(attachment.storageKey);
      if (!data) throw new StorageServiceError("STORAGE_ATTACHMENT_NOT_FOUND", "Attachment not found");
      return {
        data,
        mimeType: attachment.mimeType,
        byteSize: attachment.byteSize,
        originalName: attachment.originalName,
      };
    },

    async removePending(actor: StorageActor, attachmentId: string) {
      assertActor(actor);
      // The row deletion and pending/owner predicates are one repository
      // operation. A concurrent message claim therefore wins without allowing
      // this cleanup path to delete the now-live blob.
      const deleted = await attachments.deletePendingOwned(attachmentId, actor.id);
      if (!deleted) {
        throw new StorageServiceError("STORAGE_ATTACHMENT_NOT_FOUND", "Attachment not found");
      }
      await blobs.delete(deleted.storageKey);
      return { ok: true as const };
    },
  };
}

export type StorageService = ReturnType<typeof createStorageService>;
`;
}

function indexContent(includeAttachments: boolean): string {
  return `export { createOwnedStorageService, type OwnedStorageService } from "./owned-service.js";
export type { OwnedStoragePort, OwnedStoredObject, OwnedStoredObjectWithData } from "./owned-ports.js";
export { decideStorageQuota, DEFAULT_STORAGE_QUOTA, isManagedStorageContentType, managedStorageBaseMimeType, managedStorageContentType, managedStorageToken, type StorageQuotaDecision, type StorageQuotaPolicy } from "./policy.js";
${includeAttachments ? 'export { createStorageService, type StorageService, type StorageServiceDependencies } from "./facade.js";\n' : ""}
export { StorageServiceError, type StorageErrorCode } from "./errors.js";
export type { AttachmentDownload, AttachmentUpload, AuthorizedAttachment, StorageActor } from "./contracts.js";
${includeAttachments ? 'export type { AttachmentAccessPort, AttachmentBlobPort, AttachmentRepositoryPort, StoredBlob } from "./ports.js";\n' : ""}
`;
}

export function storageServiceFiles(mode: ProjectMode, includeAttachments = true): TemplateFile[] {
  const root = serviceRoot(mode);
  return [
    file(`${root}/policy.ts`, storageQuotaPolicyContent()),
    file(`${root}/contracts.ts`, contractsContent()),
    file(`${root}/errors.ts`, errorsContent()),
    file(`${root}/owned-ports.ts`, ownedPortsContent()),
    file(`${root}/owned-service.ts`, ownedServiceContent()),
    ...(includeAttachments
      ? [file(`${root}/ports.ts`, portsContent()), file(`${root}/facade.ts`, facadeContent())]
      : []),
    file(`${root}/index.ts`, indexContent(includeAttachments)),
  ];
}

import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";

function root(mode: ProjectMode): string {
  return mode === "monorepo" ? "packages/api/src/storage" : "src/server/api/storage";
}

function serviceModule(mode: ProjectMode): string {
  return mode === "monorepo" ? "@repo/services/storage" : "@/server/services/storage";
}

function contractContent(): string {
  return `import { oc } from "@orpc/contract";
import { oz } from "@orpc/zod";
import { z } from "zod";

export const storedObjectSchema = z.object({
  id: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  originalName: z.string().min(1).max(255),
  createdAt: z.string().datetime(),
});

export const storageContract = {
  upload: oc
    .route({ method: "POST", path: "/storage/objects" })
    .input(z.object({ file: oz.file() }))
    .output(storedObjectSchema),
  uploadBase64: oc
    .route({ method: "POST", path: "/storage/objects/base64" })
    .input(z.object({
      base64: z.string().min(1).max(14 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/),
      mimeType: z.string().trim().min(1).max(128),
      originalName: z.string().trim().min(1).max(255),
    }))
    .output(storedObjectSchema),
  download: oc
    .route({ method: "GET", path: "/storage/objects/{id}" })
    .input(z.object({ id: z.string().min(1).max(128) }))
    .output(oz.file()),
  downloadBase64: oc
    .route({ method: "GET", path: "/storage/objects/{id}/base64" })
    .input(z.object({ id: z.string().min(1).max(128) }))
    .output(z.object({ object: storedObjectSchema, base64: z.string() })),
  remove: oc
    .route({ method: "DELETE", path: "/storage/objects/{id}" })
    .input(z.object({ id: z.string().min(1).max(128) }))
    .output(z.object({ ok: z.literal(true) })),
};
`;
}

function contextContent(mode: ProjectMode): string {
  return `import { StorageServiceError } from "${serviceModule(mode)}";
import type { OwnedStorageService, StorageActor } from "${serviceModule(mode)}";

export interface StorageTransportContext {
  storageActor?: StorageActor | null;
}

export type ResolveStorageService<TContext extends StorageTransportContext> = (
  context: TContext,
) => OwnedStorageService | Promise<OwnedStorageService>;

export function requireStorageActor(context: StorageTransportContext): StorageActor {
  if (!context.storageActor?.id) {
    throw new StorageServiceError("STORAGE_UNAUTHENTICATED", "Authentication is required");
  }
  if (context.storageActor.banned) {
    throw new StorageServiceError(
      "STORAGE_ACTOR_BANNED",
      "Suspended accounts cannot use storage",
    );
  }
  return context.storageActor;
}
`;
}

function actionsContent(mode: ProjectMode): string {
  return `import { ORPCError } from "@orpc/server";
import { createServiceORPCError } from "../utils/service-error.js";
import type { OwnedStoredObject } from "${serviceModule(mode)}";
import {
  requireStorageActor,
  type ResolveStorageService,
  type StorageTransportContext,
} from "./context.js";

const storageErrorCodeMap = {
  STORAGE_UNAUTHENTICATED: "UNAUTHORIZED",
  STORAGE_ACTOR_BANNED: "FORBIDDEN",
  STORAGE_FORBIDDEN: "FORBIDDEN",
  STORAGE_INVALID_FILE: "BAD_REQUEST",
  STORAGE_QUOTA_EXCEEDED: "TOO_MANY_REQUESTS",
  STORAGE_ATTACHMENT_NOT_FOUND: "NOT_FOUND",
  STORAGE_WRITE_FAILED: "INTERNAL_SERVER_ERROR",
} as const;

const MAX_CONCURRENT_UPLOADS = 2;
const MAX_CONCURRENT_UPLOADS_PER_ACTOR = 1;
const activeUploadCounts = new Map<string, number>();
let activeUploadCount = 0;

function decodeBase64(value: string): Uint8Array {
  if (value.length > 14 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new ORPCError("BAD_REQUEST", { message: "Stored object data is invalid" });
  }
  const bytes = Buffer.from(value, "base64");
  const canonicalInput = value.replace(/=+$/, "");
  if (bytes.length === 0 || bytes.toString("base64").replace(/=+$/, "") !== canonicalInput) {
    throw new ORPCError("BAD_REQUEST", { message: "Stored object data is invalid" });
  }
  return new Uint8Array(bytes);
}

function dto(value: OwnedStoredObject) {
  return {
    id: value.id,
    mimeType: value.mimeType,
    byteSize: value.byteSize,
    originalName: value.originalName,
    createdAt: value.createdAt.toISOString(),
  };
}

function acquireUploadAdmission(actorId: string): (() => void) | null {
  const actorUploadCount = activeUploadCounts.get(actorId) ?? 0;
  if (
    activeUploadCount >= MAX_CONCURRENT_UPLOADS ||
    actorUploadCount >= MAX_CONCURRENT_UPLOADS_PER_ACTOR
  ) {
    return null;
  }

  activeUploadCount += 1;
  activeUploadCounts.set(actorId, actorUploadCount + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeUploadCount -= 1;
    const currentActorCount = activeUploadCounts.get(actorId) ?? 0;
    if (currentActorCount <= 1) activeUploadCounts.delete(actorId);
    else activeUploadCounts.set(actorId, currentActorCount - 1);
  };
}

async function invokeStorage<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: storageErrorCodeMap,
      fallbackMessage: "The storage operation failed",
    });
  }
}

export function createStorageActions<TContext extends StorageTransportContext>(
  resolveService: ResolveStorageService<TContext>,
) {
  return {
    upload: async ({ context, input }: { context: TContext; input: { file: unknown } }) =>
      await invokeStorage(async () => {
        const actor = requireStorageActor(context);
        if (!(input.file instanceof File)) {
          throw new ORPCError("BAD_REQUEST", { message: "A file upload is required" });
        }
        const file = input.file;
        const releaseAdmission = acquireUploadAdmission(actor.id);
        if (!releaseAdmission) {
          throw new ORPCError("TOO_MANY_REQUESTS", {
            message: "Upload capacity is temporarily exhausted",
          });
        }
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          return dto(
            await (await resolveService(context)).upload(actor, {
              data: bytes,
              mimeType: file.type,
              originalName: file.name,
            }),
          );
        } finally {
          releaseAdmission();
        }
      }),
    uploadBase64: async ({ context, input }: { context: TContext; input: { base64: string; mimeType: string; originalName: string } }) =>
      await invokeStorage(async () => {
        const actor = requireStorageActor(context);
        const releaseAdmission = acquireUploadAdmission(actor.id);
        if (!releaseAdmission) {
          throw new ORPCError("TOO_MANY_REQUESTS", { message: "Upload capacity is temporarily exhausted" });
        }
        try {
          return dto(await (await resolveService(context)).upload(actor, {
            data: decodeBase64(input.base64),
            mimeType: input.mimeType,
            originalName: input.originalName,
          }));
        } finally {
          releaseAdmission();
        }
      }),
    download: async ({ context, input }: { context: TContext; input: { id: string } }) =>
      await invokeStorage(async () => {
        const value = await (await resolveService(context)).download(
          requireStorageActor(context),
          input.id,
        );
        const bytes = new Uint8Array(value.data.byteLength);
        bytes.set(value.data);
        return new File([bytes], value.object.originalName, { type: value.object.mimeType });
      }),
    downloadBase64: async ({ context, input }: { context: TContext; input: { id: string } }) =>
      await invokeStorage(async () => {
        const value = await (await resolveService(context)).download(
          requireStorageActor(context),
          input.id,
        );
        return { object: dto(value.object), base64: Buffer.from(value.data).toString("base64") };
      }),
    remove: async ({ context, input }: { context: TContext; input: { id: string } }) =>
      await invokeStorage(async () =>
        await (await resolveService(context)).remove(requireStorageActor(context), input.id),
      ),
  };
}
`;
}

function proceduresContent(): string {
  return `import { implement } from "@orpc/server";
import { createStorageActions } from "./actions.js";
import { storageContract } from "./contract.js";
import type { ResolveStorageService, StorageTransportContext } from "./context.js";

export function createStorageProcedures<TContext extends StorageTransportContext>(
  resolveService: ResolveStorageService<TContext>,
) {
  const implementer = implement<typeof storageContract, TContext>(storageContract);
  const actions = createStorageActions(resolveService);
  return {
    upload: implementer.upload.handler(actions.upload),
    uploadBase64: implementer.uploadBase64.handler(actions.uploadBase64),
    download: implementer.download.handler(actions.download),
    downloadBase64: implementer.downloadBase64.handler(actions.downloadBase64),
    remove: implementer.remove.handler(actions.remove),
  };
}
`;
}

function indexContent(): string {
  return `export { storageContract, storedObjectSchema } from "./contract.js";
export { createStorageActions } from "./actions.js";
export { createStorageProcedures } from "./procedures.js";
export {
  requireStorageActor,
  type ResolveStorageService,
  type StorageTransportContext,
} from "./context.js";
`;
}

export function storageApiFiles(mode: ProjectMode): TemplateFile[] {
  const base = root(mode);
  return [
    file(`${base}/contract.ts`, contractContent()),
    file(`${base}/context.ts`, contextContent(mode)),
    file(`${base}/actions.ts`, actionsContent(mode)),
    file(`${base}/procedures.ts`, proceduresContent()),
    file(`${base}/index.ts`, indexContent()),
  ];
}

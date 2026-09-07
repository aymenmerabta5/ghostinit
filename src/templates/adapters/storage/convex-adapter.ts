import type { ProjectMode } from "../../../lib/addons.js";

export function convexStorageAdapterContent(mode: ProjectMode): string {
  const serviceImport =
    mode === "monorepo" ? "@repo/services/storage" : "@/server/services/storage";
  return `import "server-only";
import type { OwnedStoragePort } from "${serviceImport}";

export interface ConvexStorageExecutor {
  upload(input: {
    bytes: ArrayBuffer;
    mimeType: string;
    originalName: string;
  }): Promise<{
    id: string;
    mimeType: string;
    byteSize: number;
    originalName: string;
    createdAt: number
  }>;
  download(input: { id: string }): Promise<{
    url: string;
    mimeType: string;
    byteSize: number;
    originalName: string;
    createdAt: number;
  } | null>;
  remove(input: { id: string }): Promise<boolean>;
}

export function createConvexOwnedStoragePort(executor: ConvexStorageExecutor): OwnedStoragePort {
  return {
    async putOwned(input) {
      const bytes = input.data.slice().buffer;
      const committed = await executor.upload({
        bytes,
        mimeType: input.mimeType,
        originalName: input.originalName,
      });
      return {
        id: committed.id,
        ownerId: input.ownerId,
        mimeType: committed.mimeType,
        byteSize: committed.byteSize,
        originalName: committed.originalName,
        createdAt: new Date(committed.createdAt),
      };
    },
    async getOwned(input) {
      const object = await executor.download({ id: input.id });
      if (!object) return null;
      const response = await fetch(object.url, { cache: "no-store" });
      if (!response.ok) return null;
      return {
        object: {
          id: input.id,
          ownerId: input.ownerId,
          mimeType: object.mimeType,
          byteSize: object.byteSize,
          originalName: object.originalName,
          createdAt: new Date(object.createdAt),
        },
        data: new Uint8Array(await response.arrayBuffer()),
      };
    },
    async deleteOwned(input) {
      return await executor.remove({ id: input.id });
    },
  };
}
`;
}

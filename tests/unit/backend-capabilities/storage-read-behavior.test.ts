import { describe, expect, test } from "bun:test";
import { storageServiceFiles } from "../../../src/templates/services/storage.js";

type Actor = { id: string; banned: boolean };
type Stored = {
  object: {
    id: string;
    ownerId: string;
    originalName: string;
    mimeType: string;
    byteSize: number;
    createdAt: Date;
  };
  data: Uint8Array;
};
type Port = { getOwned(input: { ownerId: string; id: string }): Promise<Stored | null> };
type Service = { download(actor: Actor, id: string): Promise<Stored> };

describe("generated owned storage read operation", () => {
  test("reads owned bytes and rejects foreign, anonymous, and suspended actors before disclosure", async () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = storageServiceFiles(mode, false);
      const source = ["policy.ts", "errors.ts", "owned-service.ts"]
        .map((name) => {
          const file = files.find((entry) => entry.path.endsWith(`/storage/${name}`));
          if (!file) throw new Error(`Missing generated storage module ${name}`);
          return file.content.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, "");
        })
        .join("\n");
      const create = new Function(
        new Bun.Transpiler({ loader: "ts" }).transformSync(source) +
          "\nreturn createOwnedStorageService;",
      )() as (port: Port) => Service;
      const bytes = new TextEncoder().encode("private owned content");
      const stored: Stored = {
        object: {
          id: "object-1",
          ownerId: "owner",
          originalName: "private.txt",
          mimeType: "text/plain",
          byteSize: bytes.length,
          createdAt: new Date(0),
        },
        data: bytes,
      };
      const reads: Array<{ ownerId: string; id: string }> = [];
      let providerFailure = false;
      const service = create({
        getOwned: async (input) => {
          reads.push(input);
          if (providerFailure) throw new Error("storage provider unavailable");
          return input.ownerId === stored.object.ownerId && input.id === stored.object.id
            ? stored
            : null;
        },
      });
      const owner = { id: "owner", banned: false };
      expect(await service.download(owner, "object-1"), mode).toEqual(stored);
      expect(reads, mode).toEqual([{ ownerId: "owner", id: "object-1" }]);
      await expect(
        service.download({ id: "intruder", banned: false }, "object-1"),
      ).rejects.toMatchObject({ code: "STORAGE_ATTACHMENT_NOT_FOUND" });
      expect(reads.at(-1), mode).toEqual({ ownerId: "intruder", id: "object-1" });
      const previousReads = reads.length;
      await expect(service.download({ id: "", banned: false }, "object-1")).rejects.toMatchObject({
        code: "STORAGE_UNAUTHENTICATED",
      });
      await expect(
        service.download({ id: "owner", banned: true }, "object-1"),
      ).rejects.toMatchObject({ code: "STORAGE_ACTOR_BANNED" });
      expect(reads.length, mode).toBe(previousReads);
      providerFailure = true;
      await expect(service.download(owner, "object-1")).rejects.toThrow(
        "storage provider unavailable",
      );
    }
  });
});

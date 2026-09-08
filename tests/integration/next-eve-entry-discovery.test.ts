import { afterAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { projectConfigSchema } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

interface NitroBuilder {
  loadOptions(config: Record<string, unknown>): Promise<{
    serverEntry: false | { handler: string } | undefined;
  }>;
}

const hostRequire = createRequire(import.meta.url);
const eveRequire = createRequire(hostRequire.resolve("eve"));
const nitro = (await import(
  pathToFileURL(eveRequire.resolve("nitro/builder")).href
)) as NitroBuilder;
const roots: string[] = [];

afterAll(async () => {
  for (const root of roots) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep))
      throw new Error("Unsafe fixture cleanup path");
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function discoveredEntry(path: string, content: string) {
  const root = createTemporaryWorkspace("gi-next-eve-entry-");
  roots.push(root);
  const transaction = new FsTransaction(root);
  await transaction.write("package.json", JSON.stringify({ private: true, type: "module" }));
  await transaction.write(path, content);
  await transaction.commit();
  return (await nitro.loadOptions({ rootDir: root, dev: true, serverDir: false, logLevel: 0 }))
    .serverEntry;
}

describe("single Next and Eve server entry ownership", () => {
  test("the pinned Nitro builder claims a generic root server.ts", async () => {
    const entry = await discoveredEntry("server.ts", "export const nextOwnedServer = true;\n");
    expect(entry && entry.handler.replaceAll("\\", "/").endsWith("/server.ts")).toBe(true);
  });

  for (const runtime of ["bun", "node"] as const) {
    test(`${runtime} Next runtime stays outside Eve's automatically discovered entry`, async () => {
      const files = generateProjectFiles(
        projectConfigSchema.parse({
          name: "next-eve-entry",
          version: "0.1.0",
          mode: "single",
          runtime,
          framework: "nextjs",
          database: "postgres",
          apps: ["web"],
          preset: "custom",
          auth: true,
          api: true,
          messaging: true,
          storage: true,
          eve: true,
          billing: [],
          features: [],
        }),
        { dryRun: true },
      );
      const nextServer = files.find(({ path }) => path === "next-server.ts");
      expect(nextServer).toBeDefined();
      if (!nextServer) throw new Error("Generated Next runtime is missing");
      expect(files.some(({ path }) => path === "server.ts")).toBe(false);
      const entry = await discoveredEntry(nextServer.path, nextServer.content);
      expect(entry && entry.handler).toBeFalsy();
      const manifest = JSON.parse(
        files.find(({ path }) => path === "package.json")?.content ?? "{}",
      ) as { scripts: Record<string, string> };
      expect(manifest.scripts["dev:web"]).toContain(`start-next-server.mjs ${runtime} dev`);
      expect(manifest.scripts["start:web"] ?? manifest.scripts.start).toContain(
        `start-next-server.mjs ${runtime} start`,
      );
    });
  }
});

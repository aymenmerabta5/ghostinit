import { describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:net";
import { runtime } from "../../packages/versions/src/index.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { assertLocalBackendStopped } from "../helpers/convex-codegen-process.js";

describe("generated Convex compiler policy", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} declares Node types in its standalone Convex project`, () => {
        const files = new Map(
          generateProjectFiles(
            projectConfigSchema.parse({
              name: "convex-codegen-policy",
              mode,
              framework,
              runtime: "bun",
              database: "convex",
              preset: "custom",
              apps: ["web"],
              auth: true,
              api: true,
              email: false,
              billing: [],
              features: [],
            }),
            { dryRun: true },
          ).map(({ path, content }) => [path, content]),
        );
        const config = JSON.parse(files.get("convex/tsconfig.json") ?? "{}");
        expect(config).toEqual({
          compilerOptions: {
            allowJs: true,
            strict: true,
            moduleResolution: "Bundler",
            jsx: "react-jsx",
            skipLibCheck: true,
            allowSyntheticDefaultImports: true,
            target: "ESNext",
            lib: ["ES2023", "DOM"],
            forceConsistentCasingInFileNames: true,
            module: "ESNext",
            isolatedModules: true,
            noEmit: true,
            types: ["node"],
          },
          include: ["./**/*"],
          exclude: ["./_generated"],
        });
        expect(files.get("convex/auth.ts")).toContain("process.env");
        const owner = JSON.parse(files.get("package.json") ?? "{}");
        expect(owner.devDependencies["@types/node"].replace(/^[~^]/, "")).toBe(
          runtime["@types/node"],
        );
      });
    }
  }
});

async function listener(): Promise<{ server: Server; port: number }> {
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener port");
  return { server, port: address.port };
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

describe("bounded Convex shutdown verification", () => {
  test("waits for an asynchronous shutdown before accepting closure", async () => {
    const { server, port } = await listener();
    const timer = setTimeout(() => server.close(), 60);
    try {
      await assertLocalBackendStopped({ version: "test", sha256: "test", ports: [port] }, 1_000);
      expect(server.listening).toBe(false);
    } finally {
      clearTimeout(timer);
      await close(server);
    }
  });

  test("fails at its deadline while an owned listener remains open", async () => {
    const { server, port } = await listener();
    try {
      await expect(
        assertLocalBackendStopped({ version: "test", sha256: "test", ports: [port] }, 100),
      ).rejects.toThrow("did not close within 100 ms");
      expect(server.listening).toBe(true);
    } finally {
      await close(server);
    }
  });
});

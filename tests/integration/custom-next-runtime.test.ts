import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { link, mkdir, readFile, rm, stat, symlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseSync } from "oxc-parser";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { nextServerRuntimeContent } from "../../src/templates/root/next-server-runtime.js";
import { messagingFilesFor } from "../../src/templates/apps/fragments/messaging/index.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

const roots: string[] = [];
const poison = "SERVER_ONLY_CLIENT_POISON";
const unicode = "Français • مرحبا • 𝄞";

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep))
      throw new Error("Unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function fixture(mode: "single" | "monorepo", hasPdf = false) {
  const root = createTemporaryWorkspace("gi-custom-runtime-");
  roots.push(root);
  const project = join(root, "project");
  await mkdir(project);
  const app = mode === "single" ? project : join(project, "apps/web");
  const entry = mode === "single" ? "next-server.ts" : "apps/web/server.ts";
  const tx = new FsTransaction(project);
  await tx.write("package.json", JSON.stringify({ private: true, type: "module" }));
  await tx.write("scripts/start-next-server.mjs", nextServerRuntimeContent(mode, hasPdf));
  await tx.write(
    "node_modules/server-only/package.json",
    JSON.stringify({ name: "server-only", type: "module", exports: "./index.js" }),
  );
  await tx.write("node_modules/server-only/index.js", `throw new Error("${poison}");`);
  await tx.write(
    "src/server/value.ts",
    `import "server-only"; export const value: string = ${JSON.stringify("single " + unicode)};`,
  );
  await tx.write(
    "packages/services/package.json",
    JSON.stringify({ name: "@repo/services", type: "module", exports: "./src/index.ts" }),
  );
  await tx.write(
    "packages/services/src/index.ts",
    `import "server-only"; export const value: string = ${JSON.stringify("workspace " + unicode)};`,
  );
  await tx.write(
    "tsconfig.json",
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
  );
  if (mode === "monorepo")
    await tx.write("apps/web/package.json", JSON.stringify({ private: true, type: "module" }));
  const source = `import { value } from "${mode === "single" ? "@/server/value" : "@repo/services"}";
console.log(JSON.stringify({ value, runtime: typeof Bun === "undefined" ? "node" : "bun", root: process.argv[2], phase: process.env.NODE_ENV }));`;
  await tx.write(entry, source);
  await tx.commit();
  await mkdir(join(project, "node_modules/@repo"), { recursive: true });
  await symlink(
    join(project, "packages/services"),
    join(project, "node_modules/@repo/services"),
    "junction",
  );
  return { root, project, app, entry };
}

function run(project: string, runtime: "bun" | "node", phase: "dev" | "build" | "start") {
  return spawnSync(process.execPath, ["scripts/start-next-server.mjs", runtime, phase], {
    cwd: project,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  });
}

describe("compiled custom Next server boundary", () => {
  test("the emitted HTTP dispatcher satisfies the pinned Node Server contract", async () => {
    const current = await fixture("single");
    const server = messagingFilesFor("nextjs", "postgres", ["web"], "single").find(
      ({ path }) => path === "next-server.ts",
    );
    if (!server) throw new Error("Custom Next server was not emitted");
    const parsed = parseSync(server.path, server.content);
    const dispatcher = parsed.program.body.find(
      (node) => node.type === "ClassDeclaration" && node.id?.name === "ApplicationHttpServer",
    );
    if (!dispatcher) throw new Error("Custom Next dispatcher was not emitted");
    const tx = new FsTransaction(current.project);
    await tx.write(
      "dispatcher.ts",
      `import { IncomingMessage, Server } from "node:http";
import { Duplex } from "node:stream";
declare function upgradeRequest(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void>;
declare function rejectUpgrade(socket: Duplex, status: number, message: string): void;
${server.content.slice(dispatcher.start, dispatcher.end)}
new ApplicationHttpServer().emit("close");
`,
    );
    await tx.commit();
    const repository = resolve(import.meta.dir, "../..");
    const result = spawnSync(
      process.execPath,
      [
        "x",
        "--no-install",
        "tsc",
        "--ignoreConfig",
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--module",
        "esnext",
        "--moduleResolution",
        "bundler",
        "--target",
        "es2024",
        "--types",
        "node",
        "--typeRoots",
        join(repository, "node_modules/@types"),
        join(current.project, "dispatcher.ts"),
      ],
      { cwd: repository, encoding: "utf8", windowsHide: true, timeout: 30_000 },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  for (const mode of ["single", "monorepo"] as const) {
    for (const runtime of ["bun", "node"] as const) {
      test(`${mode}/${runtime} compiles private imports and starts only the built artifact`, async () => {
        const current = await fixture(mode);
        const built = run(current.project, runtime, "build");
        expect(built.status, built.stderr).toBe(0);
        expect(built.stdout.trim()).toBe("");
        const artifact = join(
          current.app,
          ".ghostinit/runtime",
          `next-server-${runtime}-production.mjs`,
        );
        const before = await readFile(artifact);
        const modifiedAt = (await stat(artifact)).mtimeMs;
        const development = run(current.project, runtime, "dev");
        expect(development.status, development.stderr).toBe(0);
        expect(JSON.parse(development.stdout).phase).toBe("development");
        const tx = new FsTransaction(current.project);
        await tx.write(
          current.entry,
          'throw new Error("Production must not compile changed source");',
        );
        await tx.commit();
        const started = run(current.project, runtime, "start");
        expect(started.status, started.stderr).toBe(0);
        expect(JSON.parse(started.stdout)).toEqual({
          value: (mode === "single" ? "single " : "workspace ") + unicode,
          runtime,
          root: resolve(current.app),
          phase: "production",
        });
        expect(
          createHash("sha256")
            .update(await readFile(artifact))
            .digest("hex"),
        ).toBe(createHash("sha256").update(before).digest("hex"));
        expect((await stat(artifact)).mtimeMs).toBe(modifiedAt);
      });
    }
  }

  test("client entrypoints in mixed packages retain the marker on both runtimes", async () => {
    const current = await fixture("single");
    for (const path of [
      "src/client.ts",
      "packages/auth/src/client.ts",
      "packages/config/src/next.ts",
      "packages/config/src/vite.ts",
      "packages/config/src/expo.ts",
      "packages/analytics/src/client.ts",
      "node_modules/untrusted/index.ts",
    ]) {
      const tx = new FsTransaction(current.project);
      await tx.write(path, 'import "server-only"; console.log("CLIENT_EXECUTED");');
      await tx.write(current.entry, `import "./${path}";`);
      await tx.commit();
      for (const runtime of ["bun", "node"] as const) {
        const result = run(current.project, runtime, "dev");
        expect(result.status, path).not.toBe(0);
        expect(result.stderr, path).toContain(poison);
        expect(result.stdout).not.toContain("CLIENT_EXECUTED");
      }
    }
  });

  test("custom runtimes execute the installed WebSocket implementation instead of a runtime shim", async () => {
    const current = await fixture("single");
    const tx = new FsTransaction(current.project);
    await tx.write(
      "node_modules/ws/package.json",
      JSON.stringify({
        name: "ws",
        type: "module",
        exports: { ".": { import: "./public.mjs" }, "./package.json": "./package.json" },
      }),
    );
    await tx.write(
      "node_modules/ws/public.mjs",
      'export const implementation = "installed-websocket-package";',
    );
    await tx.write(
      current.entry,
      'import { implementation } from "ws"; console.log(implementation);',
    );
    await tx.commit();
    for (const runtime of ["bun", "node"] as const) {
      const result = run(current.project, runtime, "dev");
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe("installed-websocket-package");
    }
  });

  for (const mode of ["single", "monorepo"] as const) {
    test(`${mode} PDF preload precedes Next without changing React module conditions`, async () => {
      const current = await fixture(mode, true);
      const tx = new FsTransaction(current.app);
      await tx.write(
        "node_modules/@react-pdf/renderer/package.json",
        JSON.stringify({ name: "@react-pdf/renderer", type: "module", exports: "./index.js" }),
      );
      await tx.write(
        "node_modules/@react-pdf/renderer/index.js",
        'import { value } from "react"; globalThis.pdfPreload = value;',
      );
      await tx.write(
        "node_modules/react/package.json",
        JSON.stringify({
          name: "react",
          type: "module",
          exports: { ".": { "react-server": "./server.js", default: "./client.js" } },
        }),
      );
      await tx.write(
        "node_modules/react/server.js",
        'throw new Error("Unexpected React server condition");',
      );
      await tx.write("node_modules/react/client.js", 'export const value = "normal-react";');
      await tx.write(
        "node_modules/next/package.json",
        JSON.stringify({ name: "next", type: "module", exports: "./index.js" }),
      );
      await tx.write(
        "node_modules/next/index.js",
        'if (globalThis.pdfPreload !== "normal-react") throw new Error("Next loaded before PDF fonts");',
      );
      await tx.write(
        mode === "single" ? "next-server.ts" : "server.ts",
        'import "next"; console.log(globalThis.pdfPreload);',
      );
      await tx.commit();
      for (const phase of ["dev", "build", "start"] as const) {
        const result = run(current.project, "bun", phase);
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout.trim()).toBe(phase === "build" ? "" : "normal-react");
      }
    });
  }

  test("production without an artifact neither builds nor creates output directories", async () => {
    const current = await fixture("single");
    const result = run(current.project, "bun", "start");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Run bun run build");
    expect(await stat(join(current.app, ".ghostinit")).catch(() => null)).toBeNull();
  });

  test("linked output parents are rejected before creating or writing anything outside", async () => {
    const current = await fixture("single");
    const outside = join(current.root, "outside");
    await mkdir(outside);
    await symlink(outside, join(current.app, ".ghostinit"), "junction");
    const result = run(current.project, "bun", "build");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("owned regular directory");
    expect(await stat(join(outside, "runtime")).catch(() => null)).toBeNull();
  });

  test("linked existing artifacts are never overwritten or executed", async () => {
    const current = await fixture("single");
    const tx = new FsTransaction(current.root);
    await tx.write("outside.mjs", 'console.log("OUTSIDE_EXECUTED");');
    await tx.commit();
    const output = join(current.app, ".ghostinit/runtime");
    await mkdir(output, { recursive: true });
    await link(join(current.root, "outside.mjs"), join(output, "next-server-bun-production.mjs"));
    for (const phase of ["build", "start"] as const) {
      const result = run(current.project, "bun", phase);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("regular unlinked file");
      expect(result.stdout).not.toContain("OUTSIDE_EXECUTED");
    }
    expect(await readFile(join(current.root, "outside.mjs"), "utf8")).toBe(
      'console.log("OUTSIDE_EXECUTED");',
    );
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeProject, analyzeProjectReport } from "../../src/lib/architecture/index.js";

describe("architecture analyzer hardening", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-architecture-v2-"));
    json("package.json", { name: "fixture", private: true, workspaces: ["apps/*", "packages/*"] });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function file(path: string, content: string): void {
    const target = join(root, ...path.split("/"));
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content, "utf8");
  }

  function json(path: string, value: unknown): void {
    file(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  test("fails closed on parser diagnostics and owned unresolved imports", async () => {
    file("src/broken.ts", `import { from "./missing";`);
    file("src/unresolved.ts", `export { value } from "./missing";`);

    const report = await analyzeProjectReport(root);

    expect(report.complete).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "parse-error", severity: "BLOCKER" }),
        expect.objectContaining({
          id: "unresolved-owned-import",
          severity: "BLOCKER",
          file: "src/unresolved.ts",
          importKind: "reexport",
          specifier: "./missing",
        }),
      ]),
    );
  });

  test("analyzes Expo, Eve, Convex, desktop, tests, and single roots", async () => {
    for (const [name, dependencies] of [
      ["mobile", { expo: "1" }],
      ["eve", { eve: "1" }],
      ["desktop", { electron: "1" }],
    ] as const) {
      json(`apps/${name}/package.json`, { name, dependencies });
    }
    file("apps/mobile/app/index.tsx", `import "./missing-mobile"; export default () => null;`);
    file("apps/eve/agent/tool.mts", `export { tool } from "./missing-eve";`);
    file("apps/desktop/electron.vite.config.cts", `import config = require("./missing-desktop");`);
    file("convex/users.mjs", `export * from "./missing-convex";`);
    file("tests/root.test.cjs", `require("./missing-test");`);
    file("src/single.jsx", `import("./missing-single");`);

    const unresolved = (await analyzeProject(root))
      .filter(({ id }) => id === "unresolved-owned-import")
      .map(({ file: path }) => path);

    expect(unresolved).toEqual([
      "apps/desktop/electron.vite.config.cts",
      "apps/eve/agent/tool.mts",
      "apps/mobile/app/index.tsx",
      "convex/users.mjs",
      "src/single.jsx",
      "tests/root.test.cjs",
    ]);
  });

  test("accepts resolved indexes, aliases, workspace exports, and builtins", async () => {
    json("tsconfig.json", { compilerOptions: { paths: { "@/*": ["./src/*"] } } });
    json("packages/kernel/package.json", {
      name: "@repo/kernel",
      exports: { ".": "./src/index.ts", "./result": "./src/result.ts" },
    });
    file("packages/kernel/src/index.ts", `export { ok } from "./result";`);
    file("packages/kernel/src/result.ts", `export const ok = true;`);
    file("src/local/index.ts", `export const local = true;`);
    file(
      "src/index.ts",
      [
        `import { local } from "./local";`,
        `import { ok } from "@/local";`,
        `import { ok as workspaceOk } from "@repo/kernel/result";`,
        `import { readFile } from "node:fs/promises";`,
        `export { local, ok, workspaceOk, readFile };`,
      ].join("\n"),
    );

    const findings = await analyzeProject(root);
    expect(findings.filter(({ id }) => id === "unresolved-owned-import")).toEqual([]);
    expect(findings.filter(({ id }) => id === "undeclared-dependency")).toEqual([]);
  });

  test("propagates runtime server taint through cycles but not type-only edges", async () => {
    file("src/client.ts", `"use client"; import { alpha } from "./alpha"; export { alpha };`);
    file("src/alpha.ts", `import { beta } from "./beta"; export const alpha = beta;`);
    file(
      "src/beta.ts",
      `import { alpha } from "./alpha"; import { secret } from "./server/secret"; export const beta = alpha ?? secret;`,
    );
    file("src/server/secret.ts", `export const secret = "server";`);
    file(
      "src/type-client.ts",
      `"use client"; import type { Secret } from "./server/types"; export type Public = Secret;`,
    );
    file("src/server/types.ts", `export interface Secret { value: string }`);

    const taint = (await analyzeProject(root)).filter(
      ({ id }) => id === "client-transitive-server-import",
    );
    expect(taint).toContainEqual(
      expect.objectContaining({
        file: "src/client.ts",
        trace: ["src/client.ts", "src/alpha.ts", "src/beta.ts", "src/server/secret.ts"],
      }),
    );
    expect(taint.some(({ file: path }) => path === "src/type-client.ts")).toBe(false);
  });

  test("treats single Expo UI modules under app as clients", async () => {
    json("package.json", {
      name: "fixture",
      private: true,
      dependencies: { expo: "1" },
    });
    file(
      "app/index.tsx",
      `import { secret } from "../src/server/secret"; export default () => secret;`,
    );
    file("src/server/secret.ts", `export const secret = "server";`);

    const taint = (await analyzeProject(root)).filter(
      ({ id }) => id === "client-transitive-server-import",
    );

    expect(taint).toContainEqual(
      expect.objectContaining({
        file: "app/index.tsx",
        trace: ["app/index.tsx", "src/server/secret.ts"],
      }),
    );
  });

  test("does not treat single Expo app/api route modules as clients", async () => {
    json("package.json", {
      name: "fixture",
      private: true,
      dependencies: { expo: "1" },
    });
    file(
      "app/api/rpc/[...path]+api.ts",
      `import { secret } from "../../../src/server/secret"; export const POST = () => secret;`,
    );
    file("src/server/secret.ts", `export const secret = "server";`);

    const taint = (await analyzeProject(root)).filter(
      ({ id }) => id === "client-transitive-server-import",
    );

    expect(taint).toEqual([]);
  });

  test("treats config server runtime and schema as server-only boundaries", async () => {
    json("packages/config/package.json", {
      name: "@repo/config",
      exports: { "./server": "./src/server.ts" },
    });
    file("packages/config/src/server.ts", "export const secret = process.env.BETTER_AUTH_SECRET;");
    file("packages/config/src/server-schema.ts", "export interface ServerShape { secret: string }");
    file(
      "src/direct-client.ts",
      '"use client"; import { secret } from "@repo/config/server"; export { secret };',
    );
    file(
      "src/schema-client.ts",
      '"use client"; import { ServerShape } from "../packages/config/src/server-schema"; export { ServerShape };',
    );
    file(
      "src/type-client.ts",
      '"use client"; import type { ServerShape } from "../packages/config/src/server-schema"; export type Shape = ServerShape;',
    );

    const taint = (await analyzeProject(root)).filter(
      ({ id }) => id === "client-transitive-server-import",
    );
    expect(taint.map(({ file: path }) => path)).toEqual([
      "src/direct-client.ts",
      "src/schema-client.ts",
    ]);
    expect(taint.some(({ file: path }) => path === "src/type-client.ts")).toBe(false);
  });

  test("keeps generated Convex API client-safe while generated server remains server-only", async () => {
    file("convex/_generated/api.js", `export const api = {};`);
    file("convex/_generated/server.js", `export const query = {};`);
    file(
      "src/api-client.ts",
      `"use client"; import { api } from "../convex/_generated/api"; export { api };`,
    );
    file(
      "src/server-client.ts",
      `"use client"; import { query } from "../convex/_generated/server"; export { query };`,
    );

    const taint = (await analyzeProject(root)).filter(
      ({ id }) => id === "client-transitive-server-import",
    );
    expect(taint.map(({ file: path }) => path)).toEqual(["src/server-client.ts"]);
    expect(taint[0]?.trace).toEqual(["src/server-client.ts", "convex/_generated/server.js"]);
  });

  test("allows a desktop transport adapter without allowing renderer routes to import Convex", async () => {
    json("apps/desktop/package.json", {
      name: "desktop",
      dependencies: { convex: "1" },
    });
    json("apps/desktop/tsconfig.json", {
      compilerOptions: { paths: { "@/*": ["./src/renderer/*"] } },
    });
    file("convex/_generated/api.js", `export const api = {};`);
    file(
      "apps/desktop/src/renderer/adapters/messaging/convex.ts",
      `import { api } from "../../../../../../convex/_generated/api"; export const messaging = api;`,
    );
    file(
      "apps/desktop/src/renderer/routes/allowed.tsx",
      `import { messaging } from "@/adapters/messaging/convex"; export const allowed = messaging;`,
    );
    file(
      "apps/desktop/src/renderer/routes/forbidden.tsx",
      `import { api } from "../../../../../convex/_generated/api"; export const forbidden = api;`,
    );

    const findings = await analyzeProject(root);
    expect(
      findings.filter(
        ({ id, file: path }) =>
          id === "desktop-imports-vendor" &&
          path === "apps/desktop/src/renderer/adapters/messaging/convex.ts",
      ),
    ).toEqual([]);
    expect(findings).toContainEqual(
      expect.objectContaining({
        id: "desktop-imports-vendor",
        file: "apps/desktop/src/renderer/routes/forbidden.tsx",
        specifier: "../../../../../convex/_generated/api",
      }),
    );
  });

  test("returns byte-for-byte stable normalized reports", async () => {
    file("src/z.ts", `import "./missing-z";`);
    file("src/a.ts", `import "./missing-a";`);
    const first = await analyzeProjectReport(root);
    const second = await analyzeProjectReport(root);

    expect(second).toEqual(first);
    expect(first.findings.map(({ file: path }) => path)).toEqual(["src/a.ts", "src/z.ts"]);
    expect(JSON.stringify(first)).not.toContain(root);
  });

  test("stops with a blocking incomplete report when source budget is exhausted", async () => {
    file("src/a.ts", `export const a = 1;`);
    file("src/b.ts", `export const b = 2;`);
    const report = await analyzeProjectReport(root, {
      sourceCollection: { maxSourceFiles: 1 },
    });
    expect(report.complete).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({ id: "source-collection-limit", severity: "BLOCKER" }),
    );
  });
});

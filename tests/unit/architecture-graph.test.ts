import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { analyzeRuntimeGraph, checkPackageCycles } from "../../src/lib/architecture/graph/index.js";
import type { ArchitectureFinding, PackageInfo } from "../../src/lib/architecture/types.js";

function workspacePackage(root: string, name: string, dependencies: string[]): PackageInfo {
  return {
    name: `@repo/${name}`,
    dir: join(root, "packages", name),
    dependencies: new Set(dependencies.map((dependency) => `@repo/${dependency}`)),
  };
}

describe("package dependency graph", () => {
  test("does not report an incoming tail as another cycle", () => {
    const root = join("D:", "workspace");
    const packages = [
      workspacePackage(root, "tail", ["alpha"]),
      workspacePackage(root, "alpha", ["beta"]),
      workspacePackage(root, "beta", ["alpha"]),
    ];
    const findings: ArchitectureFinding[] = [];

    checkPackageCycles(findings, packages);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("@repo/alpha, @repo/beta");
    expect(findings[0]?.message).not.toContain("@repo/tail");
    expect(findings[0]?.file).toBe("packages/alpha/package.json");
  });

  test("reports each strongly connected component once in stable order", () => {
    const root = join("D:", "workspace");
    const packages = [
      workspacePackage(root, "delta", ["gamma"]),
      workspacePackage(root, "beta", ["alpha"]),
      workspacePackage(root, "gamma", ["delta"]),
      workspacePackage(root, "alpha", ["beta"]),
    ];
    const findings: ArchitectureFinding[] = [];

    checkPackageCycles(findings, packages, root);

    expect(findings.map(({ file }) => file)).toEqual([
      "packages/alpha/package.json",
      "packages/delta/package.json",
    ]);
  });
});

describe("runtime dependency graph", () => {
  test("derives exact client and server seeds from directives, paths, and markers", () => {
    const result = analyzeRuntimeGraph(
      [
        { id: "directive-client", directives: ["use client"] },
        { id: "near-client", directives: ["use client "] },
        { id: "mobile", file: "apps/mobile/src/App.tsx" },
        { id: "expo", file: "expo/app/index.tsx" },
        { id: "renderer", file: "apps/desktop/src/renderer/App.tsx" },
        { id: "directive-server", directives: new Set(["use server"]) },
        { id: "server-path", file: "src/server/handler.ts" },
        { id: "convex", file: "convex/users.ts" },
        { id: "eve", file: "packages/eve/src/agent.ts" },
        { id: "backend", file: "src/backend/jobs.ts" },
        { id: "server-only-node", serverOnly: true },
        { id: "builtin-node", builtin: true },
        { id: "plain" },
      ],
      [
        {
          from: "plain",
          to: "edge-server-only",
          kind: "import",
          typeOnly: false,
          serverOnly: true,
        },
        {
          from: "plain",
          to: "node:fs",
          kind: "require",
          typeOnly: false,
          builtin: true,
        },
      ],
    );

    expect(result.clientSeeds).toEqual(["directive-client", "expo", "mobile", "renderer"]);
    expect(result.serverSeeds).toEqual([
      "backend",
      "builtin-node",
      "convex",
      "directive-server",
      "edge-server-only",
      "eve",
      "node:fs",
      "server-only-node",
      "server-path",
    ]);
    expect(result.findings).toEqual([]);
  });

  test("finds multi-hop server taint through a cycle without looping", () => {
    const result = analyzeRuntimeGraph(
      [
        { id: "client", directives: ["use client"] },
        { id: "alpha" },
        { id: "beta" },
        { id: "server", file: "src/server/secrets.ts" },
      ],
      [
        { from: "client", to: "alpha", kind: "import", typeOnly: false },
        { from: "alpha", to: "beta", kind: "reexport", typeOnly: false },
        { from: "beta", to: "alpha", kind: "import", typeOnly: false },
        { from: "beta", to: "server", kind: "require", typeOnly: false },
      ],
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.trace).toEqual(["client", "alpha", "beta", "server"]);
    expect(result.findings[0]?.edges.map(({ kind }) => kind)).toEqual([
      "import",
      "reexport",
      "require",
    ]);
  });

  test("chooses the lexically stable shortest trace", () => {
    const result = analyzeRuntimeGraph(
      [
        { id: "client", client: true },
        { id: "alpha" },
        { id: "zeta" },
        { id: "long-a" },
        { id: "long-b" },
        { id: "server", server: true },
        { id: "far-server", server: true },
      ],
      [
        { from: "client", to: "zeta", kind: "import", typeOnly: false },
        { from: "zeta", to: "server", kind: "import", typeOnly: false },
        { from: "client", to: "alpha", kind: "import", typeOnly: false },
        { from: "alpha", to: "server", kind: "import", typeOnly: false },
        { from: "client", to: "long-a", kind: "import", typeOnly: false },
        { from: "long-a", to: "long-b", kind: "import", typeOnly: false },
        { from: "long-b", to: "server", kind: "import", typeOnly: false },
        { from: "long-b", to: "far-server", kind: "import", typeOnly: false },
      ],
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.trace).toEqual(["client", "alpha", "server"]);
  });

  test("does not propagate through type-only or explicitly non-runtime edges", () => {
    const result = analyzeRuntimeGraph(
      [
        { id: "client", client: true },
        { id: "type-server", server: true },
        { id: "metadata-server", server: true },
      ],
      [
        { from: "client", to: "type-server", kind: "import", typeOnly: true },
        {
          from: "client",
          to: "metadata-server",
          kind: "reexport",
          typeOnly: false,
          runtime: false,
        },
      ],
    );

    expect(result.serverSeeds).toEqual(["metadata-server", "type-server"]);
    expect(result.findings).toEqual([]);
  });

  test("treats imports of React server actions as remote references", () => {
    const result = analyzeRuntimeGraph(
      [
        { id: "client", directives: ["use client"] },
        { id: "action", directives: ["use server"], serverAction: true },
        { id: "server", file: "src/server/secrets.ts" },
      ],
      [
        { from: "client", to: "action", kind: "import", typeOnly: false },
        { from: "action", to: "server", kind: "import", typeOnly: false },
      ],
    );
    expect(result.serverSeeds).toEqual(["action", "server"]);
    expect(result.findings).toEqual([]);
  });

  test("treats validated TanStack server functions as remote references", () => {
    const result = analyzeRuntimeGraph(
      [
        { id: "client", directives: ["use client"] },
        { id: "server-fn", serverReferenceBoundary: true },
        { id: "server", file: "src/server/orpc-caller.server.ts" },
      ],
      [
        { from: "client", to: "server-fn", kind: "import", typeOnly: false },
        { from: "server-fn", to: "server", kind: "dynamic-import", typeOnly: false },
      ],
    );
    expect(result.serverSeeds).toEqual(["server"]);
    expect(result.findings).toEqual([]);
  });

  test("does not exempt an unvalidated use-server directive", () => {
    const result = analyzeRuntimeGraph(
      [
        { id: "client", directives: ["use client"] },
        { id: "invalid-action", directives: ["use server"], serverAction: false },
      ],
      [{ from: "client", to: "invalid-action", kind: "import", typeOnly: false }],
    );
    expect(result.findings[0]?.trace).toEqual(["client", "invalid-action"]);
  });
});

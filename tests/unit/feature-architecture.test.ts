import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeProject } from "../../src/lib/architecture/index.js";
import { getLayerFromFilePath } from "../../src/lib/architecture/rules/layered.js";

describe("generated feature architecture", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-feature-architecture-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function fixture(path: string, content: string): void {
    const fullPath = join(root, ...path.split("/"));
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf8");
  }

  function webPackage(dependencies: Record<string, string> = {}): void {
    fixture("apps/web/package.json", JSON.stringify({ name: "web", private: true, dependencies }));
  }

  function workspacePackage(name: string): void {
    fixture(
      `packages/${name}/package.json`,
      JSON.stringify({ name: `@repo/${name}`, private: true }),
    );
    fixture(`packages/${name}/src/index.ts`, "export const packageMarker = true;");
  }

  test("classifies single and every monorepo app feature as UI presentation", () => {
    expect(getLayerFromFilePath("src/features/admin-users/index.tsx")).toEqual({
      level: 1,
      name: "UI",
    });
    expect(getLayerFromFilePath("apps/web/src/features/admin-users/queries.ts")).toEqual({
      level: 1,
      name: "UI",
    });
    expect(
      getLayerFromFilePath("apps/desktop/src/features/admin-users/components/user-row.tsx"),
    ).toEqual({ level: 1, name: "UI" });
    expect(getLayerFromFilePath("packages/core/src/features/account.ts")?.name).toBe("Domain");
  });

  test("allows typed oRPC and Query adapters in a monorepo feature data boundary", async () => {
    webPackage({ "@tanstack/react-query": "1.0.0" });
    fixture(
      "apps/web/src/features/admin-users/queries.ts",
      `"use client";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
export function useUsers() { return useQuery(orpc.adminUsers.list.queryOptions({ input: {} })); }`,
    );
    fixture(
      "apps/web/src/features/admin-users/mutations.ts",
      `"use client";
import { useMutation } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
export function useCreateUser() { return useMutation(orpc.adminUsers.create.mutationOptions()); }`,
    );

    const findings = await analyzeProject(root);
    const adapterFindings = findings.filter(
      (finding) =>
        finding.file.includes("features/admin-users") &&
        [
          "client-imports-server-only",
          "feature-imports-server-layer",
          "feature-presentation-imports-data-access",
          "ui-imports-vendor",
        ].includes(finding.id),
    );
    expect(adapterFindings).toEqual([]);
  });

  test("permits exact generated Convex client references in feature-root data adapters", async () => {
    fixture("convex/_generated/api.js", "export const api = {};");
    fixture(
      "src/features/admin-users/queries.ts",
      `"use client";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
export const useUsers = () => usePaginatedQuery(api.users.list, {}, { initialNumItems: 20 });`,
    );
    fixture(
      "src/features/admin-users/mutations.ts",
      `"use client";
import { useMutation } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../convex/_generated/api";
export function useCreateUser() { return { create: authClient.admin.createUser, setRole: useMutation(api.users.setRoleByAuthId) }; }`,
    );

    const findings = await analyzeProject(root);
    const adapterFindings = findings.filter(
      (finding) =>
        finding.file.includes("features/admin-users") &&
        [
          "client-imports-server-only",
          "feature-imports-server-layer",
          "feature-presentation-imports-data-access",
          "ui-imports-vendor",
        ].includes(finding.id),
    );
    expect(adapterFindings).toEqual([]);
  });

  test("rejects remote-state and server imports from monorepo feature components", async () => {
    webPackage({
      "@repo/database": "workspace:*",
      "@repo/services": "workspace:*",
      "@tanstack/react-query": "1.0.0",
      convex: "1.0.0",
    });
    workspacePackage("database");
    workspacePackage("services");
    fixture(
      "apps/web/src/features/admin-users/components/user-table.tsx",
      `import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { api } from "../../../../../convex/_generated/api";
import { db } from "@repo/database";
import { admin } from "@repo/services";
export const UserTable = () => ({ useQuery, orpc, api, db, admin });`,
    );

    const findings = await analyzeProject(root);
    const componentFindings = findings.filter(
      (finding) =>
        finding.file.endsWith("features/admin-users/components/user-table.tsx") &&
        finding.id === "feature-presentation-imports-data-access",
    );
    expect(componentFindings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("@tanstack/react-query"),
        expect.stringContaining("@/lib/orpc"),
        expect.stringContaining("convex/_generated/api"),
        expect.stringContaining("@repo/database"),
        expect.stringContaining("@repo/services"),
      ]),
    );
  });

  test("rejects data clients from single feature components even without use client", async () => {
    fixture(
      "src/features/admin-users/components/user-row.tsx",
      `import { authClient } from "@/lib/auth-client";
import { useMutation } from "convex/react";
import { listUsers } from "../queries";
export const UserRow = { authClient, useMutation, listUsers };`,
    );

    const findings = await analyzeProject(root);
    const componentFindings = findings.filter(
      (finding) => finding.id === "feature-presentation-imports-data-access",
    );
    expect(componentFindings).toHaveLength(3);
  });

  test("does not let a nested queries filename or createServerFn bypass component isolation", async () => {
    fixture(
      "src/features/admin-users/components/queries.ts",
      `import { createServerFn } from "@tanstack/react-start";
import { orpc } from "@/lib/orpc";
export const escaped = createServerFn(() => orpc);`,
    );

    const findings = await analyzeProject(root);
    expect(
      findings.some(
        (finding) =>
          finding.file.endsWith("features/admin-users/components/queries.ts") &&
          finding.id === "feature-presentation-imports-data-access" &&
          finding.message.includes("@/lib/orpc"),
      ),
    ).toBe(true);
  });

  test("keeps remote clients in root data adapters rather than feature hooks", async () => {
    fixture(
      "src/features/admin-users/hooks/queries.ts",
      `import { useQuery } from "@tanstack/react-query";
export const escaped = useQuery;`,
    );

    const findings = await analyzeProject(root);
    expect(
      findings.some(
        (finding) =>
          finding.file.endsWith("features/admin-users/hooks/queries.ts") &&
          finding.id === "feature-imports-data-access-outside-adapter",
      ),
    ).toBe(true);
  });

  test("rejects server, database, domain, and provider imports across feature roots", async () => {
    webPackage({
      "@repo/api": "workspace:*",
      "@repo/database": "workspace:*",
      "@repo/modules": "workspace:*",
      "@repo/services": "workspace:*",
      stripe: "1.0.0",
    });
    for (const name of ["api", "database", "modules", "services"]) workspacePackage(name);
    fixture(
      "apps/web/src/features/admin-users/queries.ts",
      `import { db } from "@repo/database";
import { identity } from "@repo/modules";
import { admin } from "@repo/services";
export const invalid = { db, identity, admin };`,
    );
    fixture(
      "src/features/admin-users/mutations.ts",
      `import Stripe from "stripe";
import { provider } from "@/server/billing/providers/stripe";
export const invalid = { Stripe, provider };`,
    );

    const findings = await analyzeProject(root);
    for (const path of [
      "apps/web/src/features/admin-users/queries.ts",
      "src/features/admin-users/mutations.ts",
    ]) {
      expect(
        findings.some(
          (finding) =>
            finding.file.endsWith(path) &&
            ["feature-imports-server-layer", "ui-imports-vendor"].includes(finding.id),
        ),
      ).toBe(true);
    }
  });

  test("uses structural oRPC and server-route allowances instead of filename substrings", async () => {
    webPackage({ "@repo/api": "workspace:*", "@repo/database": "workspace:*" });
    workspacePackage("api");
    workspacePackage("database");
    fixture(
      "apps/web/src/lib/orpc.ts",
      `"use client";
import type { AppRouter } from "@repo/api";
export type ClientRouter = AppRouter;`,
    );
    fixture(
      "apps/web/src/components/orpc-consumer.tsx",
      `"use client";
import { appRouter } from "@repo/api";
export const leakedRouter = appRouter;`,
    );
    fixture(
      "apps/web/src/routes/admin.users.tsx",
      `import { createServerFn } from "@tanstack/react-start";
import { db } from "@repo/database";
export const load = createServerFn(() => db);`,
    );

    const findings = await analyzeProject(root);
    expect(
      findings.some(
        (finding) =>
          finding.id === "client-imports-server-only" && finding.file.endsWith("src/lib/orpc.ts"),
      ),
    ).toBe(false);
    expect(
      findings.some(
        (finding) =>
          finding.id === "client-imports-server-only" &&
          finding.file.endsWith("src/components/orpc-consumer.tsx"),
      ),
    ).toBe(true);
    expect(
      findings.some(
        (finding) =>
          finding.id === "client-imports-server-only" &&
          finding.file.endsWith("src/routes/admin.users.tsx"),
      ),
    ).toBe(false);
  });
});

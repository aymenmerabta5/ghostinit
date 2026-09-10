import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Ajv2020 from "ajv/dist/2020.js";
import { runtime } from "../../packages/versions/src/index.js";
import type {
  DependencyFieldPath,
  DependencySecurityResolution,
} from "../../src/domain/dependency-security/types.js";
import { normalizeDependencySecurityResolutions } from "../../src/domain/dependency-security/resolutions.js";
import { PROJECT_CONFIG_SCHEMA_URI } from "../../src/domain/project/config.js";
import { resolveProjectConfig } from "../../src/domain/project/resolve.js";
import type { PlannedFileInput } from "../../src/domain/generation/types.js";
import { applyDependencySecurityResolutions } from "../../src/generation/dependency-security.js";
import { projectDesiredConfigSchema } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { hashContent } from "../../src/lib/checksum.js";
import {
  snapshotDependencySecurityMaintenance,
  stageDependencySecurityMaintenance,
} from "../../src/lib/dependency-security-maintenance.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function desired() {
  return {
    $schema: PROJECT_CONFIG_SCHEMA_URI,
    schemaVersion: 2 as const,
    name: "catalog-project",
    mode: "single" as const,
    runtime: "bun" as const,
    packageManager: { name: "bun" as const, version: runtime.bun },
    apps: [{ id: "web", target: "nextjs" as const, deploy: "none" as const }],
    backend: false as const,
    capabilities: {},
  };
}

function document(field: DependencyFieldPath) {
  const resolution: DependencySecurityResolution = {
    manifestPath: "package.json",
    field,
    package: "sample",
    originalSpec: "1.2.3",
    version: "1.2.4",
    integrity: `sha512-${"A".repeat(86)}==`,
    publishedAt: "2026-01-01T00:00:00.000Z",
    auditedAt: "2026-01-08T00:00:00.000Z",
    advisories: ["GHSA-2345-6789-cfgh"],
  };
  return { schemaVersion: 1 as const, resolutions: [resolution] };
}

function planned(content: object): PlannedFileInput {
  return {
    physicalPath: "package.json",
    logicalPath: "package.json",
    content: JSON.stringify(content),
    owner: "tooling",
    lifecycle: "structured-merge",
    provenance: {
      renderer: "catalog.test",
      source: "test",
      capability: null,
      acceptance: [],
      contribution: [],
    },
  };
}

const cases: readonly { field: DependencyFieldPath; manifest: object }[] = [
  {
    field: ["workspaces", "catalog", "sample"],
    manifest: {
      workspaces: { packages: ["packages/*"], catalog: { sample: "1.2.3" } },
      dependencies: { sample: "catalog:" },
    },
  },
  {
    field: ["workspaces", "catalogs", "web", "sample"],
    manifest: {
      workspaces: { packages: ["packages/*"], catalogs: { web: { sample: "1.2.3" } } },
      dependencies: { sample: "catalog:web" },
    },
  },
  {
    field: ["workspaces", "catalogs", "default", "sample"],
    manifest: {
      workspaces: { packages: ["packages/*"], catalogs: { default: { sample: "1.2.3" } } },
      dependencies: { sample: "catalog:" },
    },
  },
  {
    field: ["catalog", "sample"],
    manifest: {
      workspaces: ["packages/*"],
      catalog: { sample: "1.2.3" },
      dependencies: { sample: "catalog:" },
    },
  },
  {
    field: ["catalogs", "web", "sample"],
    manifest: {
      workspaces: ["packages/*"],
      catalogs: { web: { sample: "1.2.3" } },
      dependencies: { sample: "catalog:web" },
    },
  },
  {
    field: ["catalogs", "default", "sample"],
    manifest: {
      workspaces: ["packages/*"],
      catalogs: { default: { sample: "1.2.3" } },
      dependencies: { sample: "catalog:" },
    },
  },
];

describe("dependency security catalog declarations", () => {
  for (const item of cases) {
    test(`accepts, compiles and persists the exact ${item.field.join(".")} slot`, async () => {
      const dependencySecurity = document(item.field);
      const input = { ...desired(), dependencySecurity };
      expect(projectDesiredConfigSchema.safeParse(input).success).toBe(true);
      const resolved = resolveProjectConfig(input);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) throw new Error("Catalog fixture must resolve");
      for (const [schemaName, value] of [
        ["project-config", input],
        ["resolved-project-config", resolved.config],
      ] as const) {
        const ajv = new Ajv2020({ strict: true });
        const validate = ajv.compile(
          JSON.parse(
            readFileSync(join(import.meta.dir, `../../schemas/${schemaName}.schema.json`), "utf8"),
          ),
        );
        expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
      }
      const source = planned(item.manifest);
      const [fixed] = applyDependencySecurityResolutions([source], dependencySecurity);
      let value: unknown = JSON.parse(fixed.content);
      for (const segment of item.field) value = (value as Record<string, unknown>)[segment];
      expect(value).toBe("1.2.4");
      expect(JSON.parse(fixed.content).dependencies).toEqual(
        (item.manifest as { dependencies: object }).dependencies,
      );

      const root = mkdtempSync(join(tmpdir(), "ghostinit-security-catalog-"));
      roots.push(root);
      const seed = new FsTransaction(root);
      await seed.write("ghostinit.config.json", `${JSON.stringify(desired(), null, 2)}\n`);
      await seed.write("package.json", source.content);
      await seed.write("bun.lock", "before\n");
      await seed.commit();
      const tx = new FsTransaction(root);
      await stageDependencySecurityMaintenance(
        tx,
        root,
        await snapshotDependencySecurityMaintenance(root),
        {
          schemaVersion: 1,
          beforeLockSha256: hashContent("before\n"),
          afterLockSha256: hashContent("after\n"),
          changes: [],
          resolutions: dependencySecurity,
          files: [
            { path: "package.json", before: source.content, after: fixed.content },
            { path: "bun.lock", before: "before\n", after: "after\n" },
          ],
        },
      );
      await tx.commit();
      const persisted = JSON.parse(readFileSync(join(root, "ghostinit.config.json"), "utf8"));
      expect(persisted.dependencySecurity.resolutions[0].field).toEqual(item.field);
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(fixed.content);
    });
  }

  for (const field of [
    ["workspaces", "dependencies", "sample"],
    ["workspaces", "catalog", "different"],
    ["workspaces", "catalogs", "__proto__", "sample"],
  ]) {
    test(`rejects unsupported nested declaration ${field.join(".")}`, () => {
      const input = {
        schemaVersion: 1,
        resolutions: [{ ...document(["catalog", "sample"]).resolutions[0], field }],
      };
      expect(() => normalizeDependencySecurityResolutions(input)).toThrow();
    });
  }

  for (const manifest of [
    {
      catalog: { sample: "1.2.3" },
      workspaces: { packages: ["packages/*"], catalog: { sample: "1.2.3" } },
    },
    { catalog: { sample: "1.2.3" }, catalogs: { default: { sample: "1.2.3" } } },
    {
      catalog: { sample: "1.2.3" },
      workspaces: { packages: ["packages/*"], catalogs: { default: { sample: "1.2.3" } } },
    },
  ]) {
    test(`rejects ambiguous default catalog locations ${JSON.stringify(manifest)}`, async () => {
      const source = planned(manifest);
      const dependencySecurity = document(["catalog", "sample"]);
      expect(() => applyDependencySecurityResolutions([source], dependencySecurity)).toThrow(
        /ambiguous/i,
      );
      const root = mkdtempSync(join(tmpdir(), "ghostinit-security-catalog-conflict-"));
      roots.push(root);
      const seed = new FsTransaction(root);
      await seed.write("ghostinit.config.json", JSON.stringify(desired()));
      await seed.write("package.json", source.content);
      await seed.commit();
      const after = JSON.parse(source.content);
      after.catalog.sample = "1.2.4";
      await expect(
        stageDependencySecurityMaintenance(
          new FsTransaction(root),
          root,
          await snapshotDependencySecurityMaintenance(root),
          {
            schemaVersion: 1,
            beforeLockSha256: null,
            afterLockSha256: hashContent("after\n"),
            changes: [],
            resolutions: dependencySecurity,
            files: [
              { path: "package.json", before: source.content, after: JSON.stringify(after) },
              { path: "bun.lock", before: null, after: "after\n" },
            ],
          },
        ),
      ).rejects.toThrow(/ambiguous/i);
    });
  }

  test("does not invent or relocate a missing nested catalog declaration", () => {
    const source = planned({ workspaces: ["packages/*"], dependencies: { sample: "catalog:" } });
    expect(
      applyDependencySecurityResolutions(
        [source],
        document(["workspaces", "catalog", "sample"]),
      )[0],
    ).toBe(source);
  });

  test("distinguishes named catalogs but rejects the same name in both locations", () => {
    const dependencySecurity = document(["workspaces", "catalogs", "web", "sample"]);
    const source = planned({
      workspaces: {
        packages: ["packages/*"],
        catalogs: { web: { sample: "1.2.3" }, mobile: { sample: "1.2.3" } },
      },
    });
    const fixed = JSON.parse(
      applyDependencySecurityResolutions([source], dependencySecurity)[0].content,
    );
    expect(fixed.workspaces.catalogs.web.sample).toBe("1.2.4");
    expect(fixed.workspaces.catalogs.mobile.sample).toBe("1.2.3");
    const ambiguous = planned({
      ...JSON.parse(source.content),
      catalogs: { web: { sample: "1.2.3" } },
    });
    expect(() => applyDependencySecurityResolutions([ambiguous], dependencySecurity)).toThrow(
      /ambiguous/i,
    );
  });
});

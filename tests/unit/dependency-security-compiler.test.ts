import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { runtime } from "../../packages/versions/src/index.js";
import type { DependencySecurityResolution } from "../../src/domain/dependency-security/types.js";
import { normalizeDependencySecurityResolutions } from "../../src/domain/dependency-security/resolutions.js";
import {
  compareSecurityVersions,
  isCompatibleSecurityVersion,
} from "../../src/domain/dependency-security/versions.js";
import {
  PROJECT_CONFIG_SCHEMA_URI,
  type DesiredProjectConfig,
} from "../../src/domain/project/config.js";
import { resolveProjectConfig } from "../../src/domain/project/resolve.js";
import { applyDependencySecurityResolutions } from "../../src/generation/dependency-security.js";
import type { PlannedFileInput } from "../../src/domain/generation/types.js";
import {
  dependencySecurityResolutionsSchema,
  projectDesiredConfigSchema,
} from "../../src/lib/config.js";
import { canonicalDesiredProjectConfig } from "../../src/domain/project/desired-canonical.js";
import { canonicalJson } from "../../src/domain/project/canonical.js";

function resolution(
  overrides: Partial<DependencySecurityResolution> = {},
): DependencySecurityResolution {
  return {
    manifestPath: "package.json",
    field: ["dependencies", "sample"],
    package: "sample",
    originalSpec: "1.2.3",
    version: "1.2.4",
    integrity: `sha512-${"A".repeat(86)}==`,
    publishedAt: "2026-01-01T00:00:00.000Z",
    auditedAt: "2026-01-08T00:00:00.000Z",
    advisories: ["GHSA-2345-6789-cfgh"],
    ...overrides,
  };
}
const document = (item = resolution()) => ({ schemaVersion: 1 as const, resolutions: [item] });

function desired(): DesiredProjectConfig {
  return {
    $schema: PROJECT_CONFIG_SCHEMA_URI,
    schemaVersion: 2,
    name: "security-test",
    mode: "single",
    runtime: "bun",
    packageManager: { name: "bun", version: runtime.bun },
    apps: [{ id: "web", target: "nextjs", deploy: "none" }],
    backend: false,
    capabilities: {},
  };
}

function manifest(content: object, path = "package.json"): PlannedFileInput {
  return {
    logicalPath: path,
    physicalPath: path,
    content: JSON.stringify(content),
    owner: "tooling",
    lifecycle: "structured-merge",
    provenance: {
      renderer: "test.security.v1",
      source: "test",
      capability: null,
      acceptance: [],
      contribution: [],
    },
  };
}

describe("dependency security compiler input", () => {
  test("canonical desired inputs omit optional undefined fields without weakening canonical JSON", () => {
    const parsed = projectDesiredConfigSchema.parse({
      ...desired(),
      runtime: undefined,
      dependencySecurity: undefined,
      capabilities: { billing: undefined, auth: undefined, i18n: false },
    });
    expect(() => canonicalJson(parsed)).toThrow(/undefined/);
    const canonical = canonicalDesiredProjectConfig(parsed);
    expect(canonical.capabilities).toEqual({ i18n: false });
    expect(Object.hasOwn(canonical, "runtime")).toBe(false);
    expect(Object.hasOwn(canonical, "dependencySecurity")).toBe(false);
    const omitted = { ...desired(), capabilities: { i18n: false } };
    delete omitted.runtime;
    expect(canonicalJson(canonical)).toBe(canonicalJson(omitted));
    expect(Object.hasOwn(parsed.capabilities, "billing")).toBe(true);
  });

  test("validates evidence without a clock and preserves optional-field compatibility", () => {
    const plain = resolveProjectConfig(desired());
    const secured = resolveProjectConfig({ ...desired(), dependencySecurity: document() });
    expect(plain.ok && secured.ok).toBe(true);
    if (!plain.ok || !secured.ok) throw new Error("fixture resolution failed");
    expect(Object.hasOwn(plain.config, "dependencySecurity")).toBe(false);
    expect(secured.config.configHash).not.toBe(plain.config.configHash);
    expect(Object.isFrozen(secured.config.dependencySecurity?.resolutions)).toBe(true);
    const ajv = new Ajv2020({ strict: true });
    for (const [name, value] of [
      ["project-config", { ...desired(), dependencySecurity: document() }],
      ["resolved-project-config", secured.config],
    ] as const) {
      const validate = ajv.compile(
        JSON.parse(
          readFileSync(join(import.meta.dir, `../../schemas/${name}.schema.json`), "utf8"),
        ),
      );
      expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  for (const change of [
    { manifestPath: "../package.json" },
    { manifestPath: "C:/package.json" },
    { manifestPath: "node_modules/pkg/package.json" },
    { manifestPath: "apps/CON/package.json" },
    { field: ["dependencies", "different"] },
    { version: "2.0.0" },
    { version: "1.2.2" },
    { version: "1.2.4-beta.1" },
    { originalSpec: "latest" },
    { integrity: `sha256-${"A".repeat(43)}=` },
    { integrity: `sha512-${"A".repeat(85)}B==` },
    { publishedAt: "2026-02-30T00:00:00.000Z" },
    { auditedAt: "2026-01-07T23:59:59.999Z" },
    { advisories: [] },
    { advisories: ["https://example.invalid/advisory"] },
  ]) {
    test(`rejects invalid resolution evidence ${JSON.stringify(change)}`, () => {
      const input = { schemaVersion: 1, resolutions: [{ ...resolution(), ...change }] };
      expect(() => normalizeDependencySecurityResolutions(input)).toThrow();
      expect(dependencySecurityResolutionsSchema.safeParse(input).success).toBe(false);
    });
  }

  test("rejects unknown fields and duplicate declaration slots", () => {
    expect(() =>
      normalizeDependencySecurityResolutions({ ...document(), disabled: true }),
    ).toThrow();
    expect(() =>
      normalizeDependencySecurityResolutions({
        schemaVersion: 1,
        resolutions: [resolution(), resolution()],
      }),
    ).toThrow();
  });

  test("respects pre-1.0 compatibility and tilde bounds", () => {
    expect(isCompatibleSecurityVersion("0.2.3", "0.2.4")).toBe(true);
    expect(isCompatibleSecurityVersion("0.2.3", "0.3.0")).toBe(false);
    expect(isCompatibleSecurityVersion("0.0.3", "0.0.4")).toBe(false);
    expect(isCompatibleSecurityVersion("~1.2.3", "1.3.0")).toBe(false);
    expect(isCompatibleSecurityVersion("^1.2.3", "1.3.0")).toBe(true);
    expect(compareSecurityVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
  });

  test("changes only an existing declaration and retains higher catalog pins", () => {
    const source = manifest({
      dependencies: { sample: "1.2.3", other: "2.0.0" },
      scripts: { test: "user-test" },
    });
    const [fixed] = applyDependencySecurityResolutions([source], document());
    expect(JSON.parse(fixed.content)).toEqual({
      dependencies: { sample: "1.2.4", other: "2.0.0" },
      scripts: { test: "user-test" },
    });
    expect(JSON.parse(source.content).dependencies.sample).toBe("1.2.3");
    const olderCatalog = manifest({ dependencies: { sample: "1.1.0" } });
    expect(
      JSON.parse(applyDependencySecurityResolutions([olderCatalog], document())[0].content)
        .dependencies.sample,
    ).toBe("1.2.4");
    for (const content of [
      { dependencies: { sample: "1.3.0" } },
      { dependencies: { sample: "2.0.0" } },
      { dependencies: { sample: "workspace:*" } },
      { dependencies: { other: "1.2.3" } },
    ]) {
      const file = manifest(content);
      expect(applyDependencySecurityResolutions([file], document())[0]).toBe(file);
    }
    expect(applyDependencySecurityResolutions([], document())).toEqual([]);
    expect(
      applyDependencySecurityResolutions(
        [source],
        document(resolution({ manifestPath: "packages/removed/package.json" })),
      )[0],
    ).toBe(source);
  });

  test("catalog resolutions cannot create catalog or overrides fields", () => {
    const item = resolution({ field: ["catalogs", "web", "sample"] });
    const source = manifest({
      catalogs: { web: { sample: "1.2.3" } },
      dependencies: { sample: "catalog:web" },
    });
    expect(
      JSON.parse(applyDependencySecurityResolutions([source], document(item))[0].content).catalogs
        .web.sample,
    ).toBe("1.2.4");
    const absent = manifest({ dependencies: { other: "1.2.3" } });
    expect(applyDependencySecurityResolutions([absent], document(item))[0]).toBe(absent);
  });
});

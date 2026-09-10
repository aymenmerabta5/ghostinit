import { describe, expect, it } from "bun:test";
import { parseAuditFixReport, parseAuditReport } from "../../src/lib/dependency-security/audit.js";
import { prepareSecurityManifestEdits } from "../../src/lib/dependency-security/repair-plan.js";
import { parseJson } from "../../src/lib/dependency-security/validation.js";
import type { SecurityWorkspaceSnapshot } from "../../src/lib/dependency-security/workspace.js";
import type { SecurityLockEvidence } from "../../src/lib/dependency-security/runtime-types.js";
import {
  testAdvisory,
  testFixReport,
  testIntegrity,
} from "../helpers/dependency-security-runtime.js";

const originalEvidence: SecurityLockEvidence = {
  schemaVersion: 1,
  registry: "https://registry.npmjs.org",
  minimumReleaseAgeSeconds: 604800,
  auditedAt: "2026-09-01T00:00:00.000Z",
  lockSha256: "a".repeat(64),
  releases: [
    {
      package: "vulnerable-child",
      version: "1.0.0",
      publishedAt: "2020-01-01T00:00:00.000Z",
      integrity: testIntegrity,
    },
  ],
};

function declarationPlan(
  manifests: Record<string, Record<string, unknown>>,
  edit: unknown,
): ReturnType<typeof prepareSecurityManifestEdits> {
  const snapshot: SecurityWorkspaceSnapshot = {
    root: "/unused",
    files: new Map(),
    manifests: new Map(Object.entries(manifests)),
  };
  return prepareSecurityManifestEdits(
    snapshot,
    parseAuditFixReport(JSON.stringify(testFixReport([edit])), false),
    parseAuditReport(JSON.stringify({ "vulnerable-child": [testAdvisory] }), 1),
    originalEvidence,
  );
}

describe("strict Bun security reports", () => {
  it("accepts the observed lock-only contract and direct/workspace/catalog locations", () => {
    for (const file of ["package.json", "packages/consumer/package.json"]) {
      const edits = declarationPlan(
        { [file]: { dependencies: { "vulnerable-child": "1.0.0" } } },
        { file, catalog: null, key: "vulnerable-child", from: "1.0.0", to: "1.0.1" },
      );
      expect(edits[0].field).toEqual(["dependencies", "vulnerable-child"]);
      expect(edits[0].manifestPath).toBe(file);
    }
    expect(
      declarationPlan(
        { "package.json": { catalog: { "vulnerable-child": "1.0.0" } } },
        {
          file: "package.json",
          catalog: "default",
          key: "vulnerable-child",
          from: "1.0.0",
          to: "1.0.1",
        },
      )[0].field,
    ).toEqual(["catalog", "vulnerable-child"]);
    expect(
      declarationPlan(
        { "package.json": { catalogs: { app: { "vulnerable-child": "1.0.0" } } } },
        {
          file: "package.json",
          catalog: "app",
          key: "vulnerable-child",
          from: "1.0.0",
          to: "1.0.1",
        },
      )[0].field,
    ).toEqual(["catalogs", "app", "vulnerable-child"]);
    expect(
      declarationPlan(
        {
          "package.json": {
            workspaces: { packages: ["packages/*"], catalog: { "vulnerable-child": "1.0.0" } },
          },
        },
        {
          file: "package.json",
          catalog: "default",
          key: "vulnerable-child",
          from: "1.0.0",
          to: "1.0.1",
        },
      )[0].field,
    ).toEqual(["workspaces", "catalog", "vulnerable-child"]);
    expect(
      declarationPlan(
        {
          "package.json": {
            workspaces: {
              packages: ["packages/*"],
              catalogs: { app: { "vulnerable-child": "1.0.0" } },
            },
          },
        },
        {
          file: "package.json",
          catalog: "app",
          key: "vulnerable-child",
          from: "1.0.0",
          to: "1.0.1",
        },
      )[0].field,
    ).toEqual(["workspaces", "catalogs", "app", "vulnerable-child"]);
  });

  it("rejects duplicate keys, human output, network-shaped reports, unknown severities and identities", () => {
    expect(() => parseJson('{"package":1,"package":2}', "report")).toThrow("duplicate");
    expect(() => parseAuditReport("bun audit failed\n{}", 1)).toThrow();
    expect(() => parseAuditReport("{}", 1)).toThrow("complete");
    expect(() => parseAuditReport('{"error":"network timeout"}', 1)).toThrow();
    expect(() =>
      parseAuditReport(JSON.stringify({ example: [{ ...testAdvisory, severity: "unknown" }] }), 1),
    ).toThrow("severity");
    expect(() =>
      parseAuditReport(
        JSON.stringify({
          example: [{ ...testAdvisory, url: "https://attacker.invalid/advisory" }],
        }),
        1,
      ),
    ).toThrow("identity");
  });

  it("rejects incomplete reports, unexpected fields, downgrades and age exceptions", () => {
    const report = testFixReport();
    expect(() =>
      parseAuditFixReport(JSON.stringify({ ...report, unaudited: ["vulnerable-child"] }), false),
    ).toThrow("could not verify");
    expect(() => parseAuditFixReport(JSON.stringify({ ...report, latest: true }), false)).toThrow(
      "unsupported",
    );
    for (const changes of [
      { downgrade: true },
      { newerThanMinimumReleaseAge: true },
      { to: "0.9.0" },
      { to: "1.0.0" },
    ]) {
      const fix = (report.fixes as Record<string, unknown>[])[0];
      expect(() =>
        parseAuditFixReport(JSON.stringify({ ...report, fixes: [{ ...fix, ...changes }] }), false),
      ).toThrow();
    }
  });

  it("rejects ambiguous, stale, foreign-workspace, escaping and incompatible edits", () => {
    const edit = {
      file: "package.json",
      catalog: null,
      key: "vulnerable-child",
      from: "1.0.0",
      to: "1.0.1",
    };
    expect(() =>
      declarationPlan(
        {
          "package.json": {
            dependencies: { "vulnerable-child": "1.0.0" },
            devDependencies: { "vulnerable-child": "1.0.0" },
          },
        },
        edit,
      ),
    ).toThrow("ambiguous");
    expect(() =>
      declarationPlan({ "package.json": { dependencies: { "vulnerable-child": "1.0.2" } } }, edit),
    ).toThrow("source declaration");
    expect(() =>
      declarationPlan({ "package.json": {} }, { ...edit, file: "foreign/package.json" }),
    ).toThrow("undeclared");
    expect(() => declarationPlan({}, { ...edit, file: "../package.json" })).toThrow("unsafe");
    const report = testFixReport([{ ...edit, to: "2.0.0" }]);
    (report.fixes as Record<string, unknown>[])[0].to = "2.0.0";
    expect(() =>
      prepareSecurityManifestEdits(
        {
          root: "/unused",
          files: new Map(),
          manifests: new Map([["package.json", { dependencies: { "vulnerable-child": "1.0.0" } }]]),
        },
        parseAuditFixReport(JSON.stringify(report), false),
        parseAuditReport(JSON.stringify({ "vulnerable-child": [testAdvisory] }), 1),
        originalEvidence,
      ),
    ).toThrow("compatible");
  });
});

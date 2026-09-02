import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { runtime } from "../../packages/versions/src/index.js";
import { SUPPORT_CATALOG } from "../../src/domain/capabilities/index.js";

const root = resolve(import.meta.dir, "../..");

interface RuntimeEvidenceEntry {
  readonly id: string;
  readonly proofLevel:
    | "generated-install-typecheck-lint-contract"
    | "packed-cli-no-install-contract";
  readonly tests: readonly { readonly path: string; readonly id: string }[];
  readonly scope: readonly string[];
  readonly limitations: readonly string[];
  readonly releaseGateClaim: false;
}

interface RuntimeEvidence {
  readonly schemaVersion: number;
  readonly recordKind: string;
  readonly subject: string;
  readonly nodeVersion: string;
  readonly entries: readonly RuntimeEvidenceEntry[];
}

test("Node compatibility evidence fulfills catalog IDs without claiming a live release gate", () => {
  const evidencePath = resolve(root, "evidence/compatibility/runtime-node.json");
  const schemaPath = resolve(root, "evidence/compatibility/runtime-node.schema.json");
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as RuntimeEvidence;
  const schema: unknown = JSON.parse(readFileSync(schemaPath, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

  expect(validate(evidence), JSON.stringify(validate.errors)).toBe(true);
  expect(evidence).toMatchObject({
    schemaVersion: 1,
    recordKind: "verification-contract",
    subject: "execution-runtime:node",
    nodeVersion: runtime.node,
  });

  const nodeCompatibility = SUPPORT_CATALOG.compatibilityEvidence.find(
    ({ subject }) => subject === "execution-runtime:node",
  );
  expect(nodeCompatibility).toBeDefined();
  expect(evidence.entries.map(({ id }) => id)).toEqual(nodeCompatibility?.requiredEvidence);
  expect(new Set(evidence.entries.map(({ id }) => id)).size).toBe(evidence.entries.length);

  for (const entry of evidence.entries) {
    expect(entry.releaseGateClaim).toBe(false);
    expect(entry.scope.length).toBeGreaterThan(0);
    expect(entry.limitations.length).toBeGreaterThan(0);
    for (const testContract of entry.tests) {
      const absolute = resolve(root, testContract.path);
      expect(existsSync(absolute), testContract.path).toBe(true);
      const source = readFileSync(absolute, "utf8");
      expect(
        source.includes(testContract.id),
        `${entry.id} is not mapped to ${testContract.id} in ${testContract.path}`,
      ).toBe(true);
    }
  }

  const generatedGate = readFileSync(resolve(root, "scripts/test-generated.ts"), "utf8");
  const nodeCornerStart = generatedGate.indexOf('id: "next-monorepo-node"');
  const nodeCornerEnd = generatedGate.indexOf("\n  {", nodeCornerStart + 1);
  const nodeCorner = generatedGate.slice(
    nodeCornerStart,
    nodeCornerEnd === -1 ? generatedGate.length : nodeCornerEnd,
  );
  expect(nodeCorner).toContain('["--runtime", "node"');

  const packedCli = readFileSync(resolve(root, "tests/integration/packed-cli.test.ts"), "utf8");
  expect(packedCli).toContain('const nodeProjectName = "packed-node-demo"');
  expect(packedCli).toContain(
    'expect(modulesTsconfig.compilerOptions?.types).toEqual(["bun-types/test", "node"])',
  );
});

#!/usr/bin/env bun

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  SUPPORT_CATALOG,
  hasCompleteCapabilityCatalog,
  type CapabilityOperationEvidence,
} from "../src/domain/capabilities/index.js";

const REPO_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const FORBIDDEN_SELF_ATTESTATION = new Set([
  "tests/unit/capability-operation-evidence.test.ts",
  "tests/unit/client-surface-generation-plan.test.ts",
  "tests/unit/v2-support-catalog.test.ts",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isInside(root: string, path: string): boolean {
  const candidate = relative(root, path);
  return candidate !== "" && !candidate.startsWith("..") && !candidate.includes(":");
}

function hasNamedTestRegistration(source: string, testName: string): boolean {
  const escaped = escapeRegExp(testName);
  return new RegExp(`\\b(?:test|it)\\s*\\(\\s*(["'\\"])${escaped}\\1`).test(source);
}

export function collectCapabilityEvidenceFailures(
  repositoryRoot = REPO_ROOT,
  evidence: readonly CapabilityOperationEvidence[] = SUPPORT_CATALOG.operationEvidence,
): string[] {
  const failures: string[] = [];
  const schemaPath = resolve(repositoryRoot, "schemas/support-catalog.schema.json");
  if (!existsSync(schemaPath)) {
    failures.push("support catalog schema is missing");
  } else {
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    if (!validate(JSON.parse(JSON.stringify(SUPPORT_CATALOG)))) {
      failures.push(`support catalog is schema-invalid: ${JSON.stringify(validate.errors)}`);
    }
  }
  const expected = SUPPORT_CATALOG.capabilities.flatMap((definition) =>
    definition.acceptanceOperationIds.map((operationId) => ({
      capability: definition.id,
      operationId,
    })),
  );
  const byOperation = new Map<string, CapabilityOperationEvidence>();

  if (evidence === SUPPORT_CATALOG.operationEvidence && !hasCompleteCapabilityCatalog()) {
    failures.push("support catalog operation evidence is not closed over advertised operations");
  }
  for (const entry of evidence) {
    if (byOperation.has(entry.operationId)) {
      failures.push(`duplicate operation evidence: ${entry.operationId}`);
      continue;
    }
    byOperation.set(entry.operationId, entry);
  }

  for (const { capability, operationId } of expected) {
    const entry = byOperation.get(operationId);
    if (!entry) {
      failures.push(`missing operation evidence: ${capability}/${operationId}`);
      continue;
    }
    if (entry.capability !== capability) {
      failures.push(
        `operation evidence capability mismatch: ${operationId} is ${entry.capability}, expected ${capability}`,
      );
    }
    if (entry.artifacts.length === 0) {
      failures.push(`operation evidence has no artifacts: ${operationId}`);
      continue;
    }

    for (const artifact of entry.artifacts) {
      const normalizedPath = artifact.path.replaceAll("\\", "/");
      if (
        artifact.kind !== "bun-test" ||
        !/^tests\/(?:unit|integration)\/.+\.test\.[cm]?[jt]sx?$/.test(normalizedPath)
      ) {
        failures.push(`ineligible evidence artifact for ${operationId}: ${artifact.path}`);
        continue;
      }
      if (FORBIDDEN_SELF_ATTESTATION.has(normalizedPath)) {
        failures.push(`self-attested evidence artifact for ${operationId}: ${normalizedPath}`);
        continue;
      }
      const absolutePath = resolve(repositoryRoot, normalizedPath);
      if (!isInside(repositoryRoot, absolutePath) || !existsSync(absolutePath)) {
        failures.push(`missing evidence artifact for ${operationId}: ${normalizedPath}`);
        continue;
      }
      const source = readFileSync(absolutePath, "utf8");
      if (!hasNamedTestRegistration(source, artifact.testName)) {
        failures.push(
          `missing executable test registration for ${operationId}: ${normalizedPath}#${artifact.testName}`,
        );
      }
      if (!/\bexpect\s*\(/.test(source)) {
        failures.push(`evidence artifact has no assertion for ${operationId}: ${normalizedPath}`);
      }
    }
  }

  for (const operationId of byOperation.keys()) {
    if (!expected.some((entry) => entry.operationId === operationId)) {
      failures.push(`stale operation evidence: ${operationId}`);
    }
  }
  return failures;
}

if (import.meta.main) {
  const failures = collectCapabilityEvidenceFailures();
  if (failures.length > 0) {
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(`Capability evidence check failed with ${failures.length} problem(s).`);
    process.exitCode = 1;
  } else {
    console.log(
      `Capability evidence covers ${SUPPORT_CATALOG.operationEvidence.length} advertised operations with executable behavioral tests.`,
    );
  }
}

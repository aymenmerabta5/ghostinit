import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const root = resolve(import.meta.dir, "../..");
const schema = JSON.parse(
  readFileSync(resolve(root, "schemas/frontend-task-record.schema.json"), "utf8"),
);
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const previous = JSON.parse(
  readFileSync(
    resolve(root, "docs/engineering/frontend-task-records/design-system-contract-v1.json"),
    "utf8",
  ),
);

function currentRecord(method: "human" | "skill-assisted") {
  const { impeccable: _historicalTool, shadcnDiscovery: _discovery, ...record } = previous;
  return {
    ...record,
    schemaVersion: 2,
    designReview: {
      method,
      guidance: method === "human" ? [] : ["design-taste-frontend"],
      context: [{ path: "DESIGN.md", sha256: "a".repeat(64) }],
      decisions: ["DESIGN.md#ownership-and-composition"],
      evidence: ["tests/unit/generated-billing-read-states.test.ts"],
    },
  };
}

test("preserves historical evidence without requiring its tool for new reviews", () => {
  expect(validate(previous), JSON.stringify(validate.errors)).toBe(true);
  expect(validate(currentRecord("human")), JSON.stringify(validate.errors)).toBe(true);
  expect(validate(currentRecord("skill-assisted")), JSON.stringify(validate.errors)).toBe(true);
});

test("requires attributable decisions and evidence for new frontend records", () => {
  const record = currentRecord("human");
  expect(validate({ ...record, designReview: undefined })).toBe(false);
  expect(validate({ ...record, designReview: { ...record.designReview, evidence: [] } })).toBe(
    false,
  );
  expect(validate({ ...record, designReview: { ...record.designReview, decisions: [] } })).toBe(
    false,
  );
  expect(validate({ ...record, impeccable: previous.impeccable })).toBe(false);
  expect(validate({ ...record, schemaVersion: 3 })).toBe(false);
});

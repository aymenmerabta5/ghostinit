import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import {
  GenerationPlanError,
  buildGenerationPlan,
  type PlannedFileInput,
  type PlannedSecretOperation,
} from "../../src/domain/generation/index.js";
import { sha256 } from "../../src/domain/project/index.js";

const root = resolve(import.meta.dir, "../..");
const configHash = sha256("resolved-config");

function plannedFile(args: {
  readonly logicalPath: string;
  readonly physicalPath: string;
  readonly content: string;
  readonly acceptance?: readonly string[];
  readonly contribution?: readonly string[];
}): PlannedFileInput {
  return {
    logicalPath: args.logicalPath,
    physicalPath: args.physicalPath,
    content: args.content,
    owner: "application",
    lifecycle: "generator-owned",
    provenance: {
      renderer: "baseline.next",
      source: "src/generation/baseline",
      capability: "transport",
      acceptance: args.acceptance ?? ["transport.roundtrip"],
      contribution: args.contribution ?? ["baseline.core"],
    },
  };
}

describe("V2 generation plan", () => {
  test("derives content and plan hashes after deterministic sorting", () => {
    const firstFile = plannedFile({
      logicalPath: "application/a.ts",
      physicalPath: "src/a.ts",
      content: "export const a = 1;\n",
      acceptance: ["transport.roundtrip", "transport.health"],
      contribution: ["baseline.transport", "baseline.core"],
    });
    const secondFile = plannedFile({
      logicalPath: "application/b.ts",
      physicalPath: "src/b.ts",
      content: "export const b = 2;\n",
    });
    const first = buildGenerationPlan({
      projectConfigHash: configHash,
      files: [secondFile, firstFile],
    });
    const second = buildGenerationPlan({
      projectConfigHash: configHash,
      files: [
        {
          ...firstFile,
          provenance: {
            ...firstFile.provenance,
            acceptance: [...firstFile.provenance.acceptance].reverse(),
            contribution: [...firstFile.provenance.contribution].reverse(),
          },
        },
        secondFile,
      ],
    });

    expect(first.files.map(({ physicalPath }) => physicalPath)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(first.files[0]?.contentHash).toBe(sha256("export const a = 1;\n"));
    expect(second).toEqual(first);
    expect(second.planHash).toBe(first.planHash);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.files[0]?.provenance.acceptance)).toBe(true);
  });

  test("rejects every duplicate physical path even when content is identical", () => {
    const duplicate = plannedFile({
      logicalPath: "application/duplicate.ts",
      physicalPath: "src/value.ts",
      content: "same\n",
    });

    try {
      buildGenerationPlan({
        projectConfigHash: configHash,
        files: [
          plannedFile({
            logicalPath: "application/original.ts",
            physicalPath: "src/value.ts",
            content: "same\n",
          }),
          duplicate,
        ],
      });
      throw new Error("Expected duplicate path rejection");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(GenerationPlanError);
      if (!(error instanceof GenerationPlanError)) throw error;
      expect(error.code).toBe("duplicate-physical-path");
      expect(error.details).toMatchObject({ physicalPath: "src/value.ts" });
    }
  });

  test("rejects case-folded physical collisions required by Windows support", () => {
    expect(() =>
      buildGenerationPlan({
        projectConfigHash: configHash,
        files: [
          plannedFile({
            logicalPath: "application/upper.ts",
            physicalPath: "src/Value.ts",
            content: "upper\n",
          }),
          plannedFile({
            logicalPath: "application/lower.ts",
            physicalPath: "src/value.ts",
            content: "lower\n",
          }),
        ],
      }),
    ).toThrow("same physical path");
  });

  test("keeps typed secret operations outside rendered content and validates the manifest", () => {
    const secrets: readonly PlannedSecretOperation[] = [
      {
        kind: "require-external",
        reference: "stripe.api-key",
        environmentKey: "STRIPE_SECRET_KEY",
        provider: "stripe",
        placeholder: "REPLACE_WITH_STRIPE_SECRET_KEY",
        destinations: [
          { physicalPath: ".env.local", format: "dotenv", field: "STRIPE_SECRET_KEY" },
        ],
      },
      {
        kind: "generate-self-issued",
        reference: "auth.session-secret",
        environmentKey: "BETTER_AUTH_SECRET",
        bytes: 32,
        encoding: "base64url",
        destinations: [
          { physicalPath: ".env.local", format: "dotenv", field: "BETTER_AUTH_SECRET" },
        ],
      },
    ];
    const plan = buildGenerationPlan({
      projectConfigHash: configHash,
      files: [
        plannedFile({
          logicalPath: "root/env-example",
          physicalPath: ".env.example",
          content: "STRIPE_SECRET_KEY=REPLACE_WITH_STRIPE_SECRET_KEY\n",
        }),
      ],
      secrets: [...secrets].reverse(),
    });

    expect(plan.secrets.map(({ reference }) => reference)).toEqual([
      "auth.session-secret",
      "stripe.api-key",
    ]);
    for (const operation of plan.secrets) {
      expect(Object.prototype.hasOwnProperty.call(operation, "value")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(operation, "content")).toBe(false);
    }

    const schema = JSON.parse(
      readFileSync(resolve(root, "schemas/generation-plan.schema.json"), "utf8"),
    );
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    const serialized = JSON.parse(JSON.stringify(plan));
    expect(validate(serialized), JSON.stringify(validate.errors)).toBe(true);
    expect(serialized).toEqual(plan);
  });

  test("fails closed when a caller smuggles a materialized secret into an operation", () => {
    const unsafeOperation = Object.assign(
      {
        kind: "generate-self-issued" as const,
        reference: "auth.session-secret",
        environmentKey: "BETTER_AUTH_SECRET",
        bytes: 32,
        encoding: "hex" as const,
        destinations: [
          { physicalPath: ".env.local", format: "dotenv" as const, field: "BETTER_AUTH_SECRET" },
        ],
      },
      { value: "must-not-enter-the-plan" },
    );

    try {
      buildGenerationPlan({ projectConfigHash: configHash, files: [], secrets: [unsafeOperation] });
      throw new Error("Expected secret value rejection");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(GenerationPlanError);
      if (!(error instanceof GenerationPlanError)) throw error;
      expect(error.code).toBe("secret-value-forbidden");
    }
  });
});

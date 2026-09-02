import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { featureFlagsServiceFiles } from "../../../src/templates/services/feature-flags/index.js";
import { expectErrorCode, importRenderedService } from "./runtime.js";

interface Subject {
  kind: "user" | "anonymous";
  key: string;
  attributes: Readonly<Record<string, boolean | number | string>>;
}

interface Evaluation {
  key: string;
  value: boolean | number | string;
  variant: string | null;
  reason: "targeting-match" | "rollout" | "provider-default" | "disabled";
  version: string | null;
  evaluatedAt: Date;
}

interface Provider {
  evaluateMany(input: {
    subject: Subject;
    keys: readonly string[];
  }): Promise<Array<Omit<Evaluation, "evaluatedAt">>>;
}

interface FeatureFlagModule {
  FEATURE_FLAGS_ARE_NOT_AUTHORIZATION: true;
  createFeatureFlagService(dependencies: { provider: Provider; now: () => Date }): {
    evaluate(subject: Subject, key: string): Promise<Evaluation>;
    evaluateMany(subject: Subject, keys: readonly string[]): Promise<Evaluation[]>;
  };
}

const now = new Date("2026-03-04T05:06:07.000Z");
let generated: FeatureFlagModule;
let runtimeRoot = "";

beforeAll(async () => {
  const loaded = await importRenderedService<FeatureFlagModule>(
    "feature-flags",
    "src/server/services/feature-flags/",
    featureFlagsServiceFiles("single"),
  );
  generated = loaded.module;
  runtimeRoot = loaded.root;
});

afterAll(() => {
  if (runtimeRoot) rmSync(runtimeRoot, { recursive: true, force: true });
});

const subject: Subject = {
  kind: "user",
  key: "user-a",
  attributes: { plan: "pro" },
};

describe("generated remote feature-flag service behavior", () => {
  test("passes only the trusted subject and preserves deterministic request order", async () => {
    const calls: Array<{ subject: Subject; keys: readonly string[] }> = [];
    const provider: Provider = {
      async evaluateMany(input) {
        calls.push(input);
        return [...input.keys].reverse().map((key) => ({
          key,
          value: key === "new.navigation",
          variant: "on",
          reason: "targeting-match" as const,
          version: "42",
        }));
      },
    };
    const service = generated.createFeatureFlagService({ provider, now: () => now });
    const values = await service.evaluateMany(subject, ["new.navigation", "billing.copy"]);

    expect(calls[0]?.subject).toBe(subject);
    expect(values.map(({ key }) => key)).toEqual(["new.navigation", "billing.copy"]);
    expect(values.every(({ evaluatedAt }) => evaluatedAt === now)).toBe(true);
    expect(generated.FEATURE_FLAGS_ARE_NOT_AUTHORIZATION).toBe(true);
  });

  test("rejects static configuration keys before contacting a remote provider", async () => {
    let calls = 0;
    const provider: Provider = {
      async evaluateMany() {
        calls += 1;
        return [];
      },
    };
    const service = generated.createFeatureFlagService({ provider, now: () => now });

    await expectErrorCode(
      service.evaluate(subject, "config.databaseUrl"),
      "FEATURE_FLAG_STATIC_CONFIG_FORBIDDEN",
    );
    await expectErrorCode(
      service.evaluate(subject, "env.API_KEY"),
      "FEATURE_FLAG_STATIC_CONFIG_FORBIDDEN",
    );
    expect(calls).toBe(0);
  });

  test("fails closed on missing or unavailable provider values", async () => {
    const missing = generated.createFeatureFlagService({
      provider: {
        async evaluateMany() {
          return [];
        },
      },
      now: () => now,
    });
    await expectErrorCode(missing.evaluate(subject, "new.navigation"), "FEATURE_FLAG_NOT_FOUND");

    const unavailable = generated.createFeatureFlagService({
      provider: {
        async evaluateMany() {
          throw new Error("provider offline");
        },
      },
      now: () => now,
    });
    await expectErrorCode(
      unavailable.evaluate(subject, "new.navigation"),
      "FEATURE_FLAG_PROVIDER_UNAVAILABLE",
    );
  });

  test("rejects an empty subject and provider contract corruption", async () => {
    const service = generated.createFeatureFlagService({
      provider: {
        async evaluateMany() {
          return [
            {
              key: "unexpected.flag",
              value: true,
              variant: null,
              reason: "rollout",
              version: null,
            },
          ];
        },
      },
      now: () => now,
    });
    await expectErrorCode(
      service.evaluate({ ...subject, key: "" }, "new.navigation"),
      "FEATURE_FLAG_SUBJECT_REQUIRED",
    );
    await expectErrorCode(
      service.evaluate(subject, "new.navigation"),
      "FEATURE_FLAG_PROVIDER_CONTRACT_VIOLATION",
    );
  });
});

// @allow-long 447: the single gate test keeps schema, detector, transaction, catalog, and gate invariants in one executable contract
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import {
  GENERATED_UNSAFE_SYNTAX_CATALOG,
  GATE_CONFIGURATIONS,
  PROJECTION_CONFIGURATIONS,
  collectUnsafeOccurrences,
  findProvenanceRule,
  generateCatalogOccurrences,
  writeBaselineWithTransaction,
  type UnsafeBaseline,
  type UnsafeDispositionPolicy,
  type UnsafeProvenanceRule,
} from "../helpers/generated-unsafe-syntax.js";

interface DispositionEvidence {
  gateEvidence: {
    configurations: Array<{
      configKey: string;
      mode: string;
      framework: string;
      database: string;
      billing: string[];
      apps: string[];
      capabilities: string;
      occurrenceRows: number;
    }>;
    occurrenceRows: number;
  };
  defaultProjection: {
    removeInStabilization: number;
    deferredV1: number;
  };
}

const root = resolve(import.meta.dir, "../..");
const dispositionPath = resolve(root, "evidence/generated/v1-unsafe-syntax-dispositions.json");
const baselinePath = resolve(root, "evidence/generated/v1-unsafe-syntax-baseline.json");
const policy = JSON.parse(readFileSync(dispositionPath, "utf8")) as UnsafeDispositionPolicy &
  DispositionEvidence;
// Deliberately read the occurrence baseline before either schema. The first RED
// must prove that this factual inventory has not yet been frozen, not fail on a
// schema or detector implementation detail.
const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as UnsafeBaseline;
const dispositionSchema = JSON.parse(
  readFileSync(
    resolve(root, "schemas/v1-generated-unsafe-syntax-dispositions.schema.json"),
    "utf8",
  ),
);
const baselineSchema = JSON.parse(
  readFileSync(resolve(root, "schemas/v1-generated-unsafe-syntax-baseline.schema.json"), "utf8"),
);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function ruleKey(rule: UnsafeProvenanceRule): string {
  return [rule.sourceOwner, rule.emittedPathPattern, ...rule.applicableConfigKeys].join("::");
}

describe("V1 generated unsafe-syntax baseline", () => {
  test("both evidence artifacts satisfy their strict Draft 2020-12 schemas", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validatePolicy = ajv.compile(dispositionSchema);
    const validateBaseline = ajv.compile(baselineSchema);
    expect(validatePolicy(policy), JSON.stringify(validatePolicy.errors)).toBe(true);
    expect(validateBaseline(baseline), JSON.stringify(validateBaseline.errors)).toBe(true);
  });

  test("catalog keys and provenance rules are sorted, unique, anchored, and phase-consistent", () => {
    const catalogKeys = GENERATED_UNSAFE_SYNTAX_CATALOG.map(({ configKey }) => configKey);
    expect(catalogKeys).toEqual([...catalogKeys].sort(compareText));
    expect(new Set(catalogKeys).size).toBe(18);
    expect(baseline.catalogKeys).toEqual(catalogKeys);

    expect(policy.rules.map(ruleKey)).toEqual(policy.rules.map(ruleKey).toSorted(compareText));
    expect(new Set(policy.rules.map(ruleKey)).size).toBe(101);
    expect(
      new Set(
        policy.rules.map(
          ({ sourceOwner, emittedPathPattern }) => `${sourceOwner}::${emittedPathPattern}`,
        ),
      ).size,
    ).toBe(99);
    expect(new Set(policy.rules.map(({ sourceOwner }) => sourceOwner)).size).toBe(60);
    for (const rule of policy.rules) {
      expect(rule.applicableConfigKeys).toEqual([...rule.applicableConfigKeys].sort(compareText));
      expect(new Set(rule.applicableConfigKeys).size).toBe(rule.applicableConfigKeys.length);
      expect(rule.expectedOccurrences).toBeGreaterThan(0);
      expect(rule.emittedPathPattern.startsWith("^")).toBe(true);
      expect(rule.emittedPathPattern.endsWith("$")).toBe(true);
      expect(() => new RegExp(rule.emittedPathPattern)).not.toThrow();
      expect(rule.removalPhase).toBe(
        rule.disposition === "remove-in-stabilization" ? "Phase 1A" : "V2 Phase 6",
      );
    }
  });

  test("detector gives stable distinct ordinals and rejects ambiguous provenance", () => {
    const oneRule: UnsafeDispositionPolicy = {
      rules: [
        {
          sourceOwner: "src/templates/example.ts",
          emittedPathPattern: "^src\\/example\\.ts$",
          applicableConfigKeys: ["example"],
          expectedOccurrences: 5,
          disposition: "deferred-v1",
          removalPhase: "V2 Phase 6",
        },
      ],
    };
    const content = [
      "type First = any;",
      "const one = value as any;",
      "const two = value as any;",
      "const chain = <unknown>value as string;",
      'const markerText = "@ts-ignore is not a suppression comment";',
      "// @ts-ignore retained for V1",
      "call();",
    ].join("\n");
    const occurrences = collectUnsafeOccurrences(
      "example",
      [{ path: "src/example.ts", content }],
      oneRule,
    );
    expect(occurrences.map(({ kind }) => kind).toSorted()).toEqual([
      "as-any",
      "as-any",
      "assertion-chain",
      "explicit-any",
      "ts-ignore",
    ]);
    const duplicateAsAny = occurrences.filter(({ kind }) => kind === "as-any");
    expect(duplicateAsAny[0].fingerprint).toBe(duplicateAsAny[1].fingerprint);
    expect(duplicateAsAny.map(({ id }) => id.slice(id.lastIndexOf("::") + 2))).toEqual(["1", "2"]);

    const shifted = collectUnsafeOccurrences(
      "example",
      [{ path: "src/example.ts", content: `\n\n${content}` }],
      oneRule,
    );
    expect(shifted.map(({ id }) => id)).toEqual(occurrences.map(({ id }) => id));

    expect(() =>
      collectUnsafeOccurrences(
        "missing",
        [{ path: "src/example.ts", content: "type Value = any;" }],
        oneRule,
      ),
    ).toThrow("missing :: src/example.ts; matched 0");
    expect(() =>
      collectUnsafeOccurrences(
        "example",
        [{ path: "src/example.ts", content: "type Value = any;" }],
        { rules: [...oneRule.rules, { ...oneRule.rules[0] }] },
      ),
    ).toThrow("example :: src/example.ts; matched 2");
    expect(() =>
      collectUnsafeOccurrences(
        "example",
        [{ path: "src/example.ts", content: "const value = ;" }],
        oneRule,
      ),
    ).toThrow("OXC parser diagnostics for src/example.ts");
    expect(() =>
      collectUnsafeOccurrences("example", [], {
        rules: [{ ...oneRule.rules[0], emittedPathPattern: "src\\/example\\.ts" }],
      }),
    ).toThrow("must be anchored with ^ and $");
    expect(() =>
      collectUnsafeOccurrences("example", [], {
        rules: [{ ...oneRule.rules[0], emittedPathPattern: "^[$" }],
      }),
    ).toThrow("Invalid unsafe provenance regex ^[$");
  });

  test("assertion chains record one outer occurrence in both as-any orientations", () => {
    const chainPolicy: UnsafeDispositionPolicy = {
      rules: [
        {
          sourceOwner: "src/templates/example.ts",
          emittedPathPattern: "^src\\/chain\\.ts$",
          applicableConfigKeys: ["chain"],
          expectedOccurrences: 2,
          disposition: "deferred-v1",
          removalPhase: "V2 Phase 6",
        },
      ],
    };
    const innerAsAny = collectUnsafeOccurrences(
      "chain",
      [{ path: "src/chain.ts", content: "const result = value as any as string;" }],
      chainPolicy,
    );
    const outerAsAny = collectUnsafeOccurrences(
      "chain",
      [{ path: "src/chain.ts", content: "const result = value as unknown as any;" }],
      chainPolicy,
    );

    expect(innerAsAny.map(({ kind }) => kind)).toEqual(["assertion-chain"]);
    expect(outerAsAny.map(({ kind }) => kind)).toEqual(["as-any"]);
    expect(innerAsAny).toHaveLength(1);
    expect(outerAsAny).toHaveLength(1);
  });

  test("ts-ignore detection accepts directives and rejects documentation mentions", () => {
    const directivePolicy: UnsafeDispositionPolicy = {
      rules: [
        {
          sourceOwner: "src/templates/example.ts",
          emittedPathPattern: "^src\\/directives\\.ts$",
          applicableConfigKeys: ["directives"],
          expectedOccurrences: 2,
          disposition: "deferred-v1",
          removalPhase: "V2 Phase 6",
        },
      ],
    };
    const content = [
      "// Documentation mentions @ts-ignore for users.",
      "const documentedLine = true;",
      "/** Documentation for @ts-ignore behavior. */",
      "const documentedBlock = true;",
      "// @ts-ignore actual line directive",
      "missingLine();",
      "/* @ts-ignore */",
      "missingBlock();",
    ].join("\n");

    const directives = collectUnsafeOccurrences(
      "directives",
      [{ path: "src/directives.ts", content }],
      directivePolicy,
    );
    expect(directives.map(({ kind }) => kind)).toEqual(["ts-ignore", "ts-ignore"]);
    expect(directives.map(({ snippet }) => snippet).toSorted(compareText)).toEqual([
      "/* @ts-ignore */",
      "// @ts-ignore actual line directive",
    ]);
  });

  test("baseline writes stage exact content and stay contained in the transaction root", async () => {
    const transactionRoot = mkdtempSync(join(tmpdir(), "ghostinit-unsafe-baseline-"));
    const relativePath = "evidence/generated/baseline.json";
    const content = '{"schemaVersion":1}\n';
    try {
      const first = await writeBaselineWithTransaction(transactionRoot, relativePath, content);
      expect(first.staged).toEqual([{ path: relativePath, content }]);
      expect(first.written).toEqual([relativePath]);
      expect(readFileSync(resolve(transactionRoot, relativePath), "utf8")).toBe(content);

      const unchanged = await writeBaselineWithTransaction(transactionRoot, relativePath, content);
      expect(unchanged.staged).toEqual([]);
      expect(unchanged.written).toEqual([]);

      await expect(
        writeBaselineWithTransaction(transactionRoot, "../escaped-baseline.json", content),
      ).rejects.toThrow("Path traversal detected");
    } finally {
      rmSync(transactionRoot, { recursive: true, force: true });
    }
  });

  test("all 1,011 catalog occurrences resolve once with exact owner and rule counts", () => {
    const occurrences = generateCatalogOccurrences(GENERATED_UNSAFE_SYNTAX_CATALOG, policy);
    expect(occurrences).toHaveLength(1011);
    expect(baseline.entries).toHaveLength(1011);
    expect(new Set(baseline.entries.map(({ id }) => id)).size).toBe(1011);
    expect(baseline.entries.map(({ id }) => id)).toEqual(
      baseline.entries.map(({ id }) => id).toSorted(compareText),
    );

    const actualById = new Map(occurrences.map((occurrence) => [occurrence.id, occurrence]));
    expect([...actualById.keys()]).toEqual(baseline.entries.map(({ id }) => id));
    for (const entry of baseline.entries) {
      const actual = actualById.get(entry.id);
      expect(actual, entry.id).toBeDefined();
      expect(entry.catalogKeys).toEqual([actual?.configKey]);
      expect(entry.path).toBe(actual?.path);
      expect(entry.kind).toBe(actual?.kind);
      expect(entry.fingerprint).toBe(actual?.fingerprint);
      expect(entry.sourceOwner).toBe(actual?.sourceOwner);
      const rule = findProvenanceRule(actual?.configKey ?? "", actual?.path ?? "", policy);
      expect(entry.sourceOwner).toBe(rule.sourceOwner);
      expect(entry.disposition).toBe(rule.disposition);
      expect(entry.removalPhase).toBe(rule.removalPhase);
    }

    const actualRuleCounts = new Map<string, number>();
    for (const occurrence of occurrences) {
      const key = ruleKey(findProvenanceRule(occurrence.configKey, occurrence.path, policy));
      actualRuleCounts.set(key, (actualRuleCounts.get(key) ?? 0) + 1);
    }
    for (const rule of policy.rules) {
      expect(actualRuleCounts.get(ruleKey(rule)), ruleKey(rule)).toBe(rule.expectedOccurrences);
    }
  });

  test("projection and default gates retain the factual V1 ceiling", () => {
    const projection = generateCatalogOccurrences(PROJECTION_CONFIGURATIONS, policy);
    expect(PROJECTION_CONFIGURATIONS.map(({ configKey }) => configKey)).toHaveLength(16);
    expect(projection).toHaveLength(839);
    const projectionRules = new Map(
      projection.map((occurrence) => {
        const rule = findProvenanceRule(occurrence.configKey, occurrence.path, policy);
        return [ruleKey(rule), rule];
      }),
    );
    expect(projectionRules.size).toBe(96);
    expect(
      new Set(
        [...projectionRules.values()].map(
          ({ sourceOwner, emittedPathPattern }) => `${sourceOwner}::${emittedPathPattern}`,
        ),
      ).size,
    ).toBe(94);
    expect(new Set([...projectionRules.values()].map(({ sourceOwner }) => sourceOwner)).size).toBe(
      55,
    );

    const comparableKeys = new Set([
      "monorepo/nextjs/postgres/capabilities-on",
      "single/nextjs/postgres/capabilities-on",
    ]);
    const comparable = projection.filter(({ configKey }) => comparableKeys.has(configKey));
    const comparableDispositions = comparable.map((occurrence) =>
      findProvenanceRule(occurrence.configKey, occurrence.path, policy),
    );
    expect(
      comparableDispositions.filter(({ disposition }) => disposition === "remove-in-stabilization"),
    ).toHaveLength(72);
    expect(
      comparableDispositions.filter(({ disposition }) => disposition === "deferred-v1"),
    ).toHaveLength(85);

    const actualGateConfigurations = GATE_CONFIGURATIONS.map(({ configKey, config }) => ({
      configKey,
      mode: config.mode,
      framework: config.framework,
      database: config.database,
      billing: config.billing,
      apps: config.apps,
      preset: config.preset,
    }));
    expect(actualGateConfigurations).toEqual([
      {
        configKey: "gate/next-monorepo",
        mode: "monorepo",
        framework: "nextjs",
        database: "postgres",
        billing: ["stripe", "chargily"],
        apps: ["web"],
        preset: "saas",
      },
      {
        configKey: "gate/single-next",
        mode: "single",
        framework: "nextjs",
        database: "postgres",
        billing: ["stripe"],
        apps: ["web"],
        preset: "saas",
      },
    ]);
    expect(
      actualGateConfigurations.map(({ preset: _preset, ...configuration }) => configuration),
    ).toEqual(
      policy.gateEvidence.configurations.map(
        ({ capabilities: _capabilities, occurrenceRows: _occurrenceRows, ...configuration }) =>
          configuration,
      ),
    );
    const gate = generateCatalogOccurrences(GATE_CONFIGURATIONS, policy);
    expect(gate).toHaveLength(172);
    expect(gate).toHaveLength(policy.gateEvidence.occurrenceRows);
    const gateRowsByConfigKey = new Map(GATE_CONFIGURATIONS.map(({ configKey }) => [configKey, 0]));
    for (const { configKey } of gate) {
      gateRowsByConfigKey.set(configKey, (gateRowsByConfigKey.get(configKey) ?? 0) + 1);
    }
    expect(Object.fromEntries(gateRowsByConfigKey)).toEqual({
      "gate/next-monorepo": 101,
      "gate/single-next": 71,
    });
    expect(Object.fromEntries(gateRowsByConfigKey)).toEqual(
      Object.fromEntries(
        policy.gateEvidence.configurations.map(({ configKey, occurrenceRows }) => [
          configKey,
          occurrenceRows,
        ]),
      ),
    );
    const gateRules = gate.map((occurrence) =>
      findProvenanceRule(occurrence.configKey, occurrence.path, policy),
    );
    const gateDispositionSplit = {
      removeInStabilization: gateRules.filter(
        ({ disposition }) => disposition === "remove-in-stabilization",
      ).length,
      deferredV1: gateRules.filter(({ disposition }) => disposition === "deferred-v1").length,
    };
    expect(gateDispositionSplit).toEqual({ removeInStabilization: 72, deferredV1: 100 });
    expect(gateDispositionSplit).toEqual({
      removeInStabilization: policy.defaultProjection.removeInStabilization,
      deferredV1: policy.defaultProjection.deferredV1,
    });

    const gateOnlyChargily = policy.rules.filter(
      ({ applicableConfigKeys }) =>
        applicableConfigKeys.length === 1 && applicableConfigKeys[0] === "gate/next-monorepo",
    );
    expect(
      gateOnlyChargily.map(({ sourceOwner, expectedOccurrences }) => ({
        sourceOwner,
        expectedOccurrences,
      })),
    ).toEqual([
      {
        sourceOwner: "src/templates/billing/providers/chargily/checkout.ts",
        expectedOccurrences: 2,
      },
      {
        sourceOwner: "src/templates/billing/providers/chargily/client.ts",
        expectedOccurrences: 4,
      },
      {
        sourceOwner: "src/templates/billing/providers/chargily/subscriptions.ts",
        expectedOccurrences: 2,
      },
      {
        sourceOwner: "src/templates/billing/providers/chargily/webhook.ts",
        expectedOccurrences: 1,
      },
      {
        sourceOwner: "src/templates/billing/webhooks/providers/chargily.ts",
        expectedOccurrences: 6,
      },
    ]);
    expect(gateOnlyChargily.reduce((sum, rule) => sum + rule.expectedOccurrences, 0)).toBe(15);
  });
});

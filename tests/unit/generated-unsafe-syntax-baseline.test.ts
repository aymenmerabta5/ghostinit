// @allow-long 411: schema, detector behavior, transactional writes, and the zero catalog ratchet form one executable contract
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { CAPABILITY_IDS } from "../../src/domain/capabilities/types.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import {
  GENERATED_UNSAFE_SYNTAX_CATALOG,
  GATE_CONFIGURATIONS,
  PROJECTION_CONFIGURATIONS,
  collectUnsafeOccurrences,
  generateCatalogOccurrences,
  writeBaselineWithTransaction,
  type UnsafeBaseline,
  type UnsafeDispositionPolicy,
} from "../helpers/generated-unsafe-syntax.js";

interface DispositionEvidence {
  catalogEvidence: {
    configKeys: string[];
    occurrenceRows: number;
    uniqueOwnerPathPatterns: number;
    uniqueSourceOwners: number;
    provenanceRules: number;
  };
  projectionEvidence: {
    configKeys: string[];
    occurrenceRows: number;
    uniqueOwnerPathPatterns: number;
    uniqueSourceOwners: number;
    provenanceRules: number;
    fullCapabilityKeys: {
      configKeys: string[];
      removeInStabilization: number;
      deferredV1: number;
    };
  };
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
    configKeys: string[];
    removeInStabilization: number;
    deferredV1: number;
  };
}

const root = resolve(import.meta.dir, "../..");
const dispositionPath = resolve(root, "evidence/generated/v1-unsafe-syntax-dispositions.json");
const baselinePath = resolve(root, "evidence/generated/v1-unsafe-syntax-baseline.json");
const policy = JSON.parse(readFileSync(dispositionPath, "utf8")) as UnsafeDispositionPolicy &
  DispositionEvidence;
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

function capabilityState(config: ProjectConfig): Record<(typeof CAPABILITY_IDS)[number], boolean> {
  return {
    transport: config.api === true,
    auth: config.auth === true,
    billing: config.billing.length > 0,
    messaging: config.messaging === true,
    email: config.email === true,
    storage: config.storage === true,
    cache: config.cache === "redis",
    analytics: config.analytics === true,
    i18n: config.i18n === true,
    pdf: config.pdf === true,
    eve: config.eve === true,
    notifications: config.notifications === true,
    featureFlags: config.featureFlags === "posthog",
    jobs: config.jobs === true,
  };
}

const expectedCapabilityState = (
  enabled: ReadonlySet<(typeof CAPABILITY_IDS)[number]>,
): Record<(typeof CAPABILITY_IDS)[number], boolean> =>
  Object.fromEntries(
    CAPABILITY_IDS.map((capability) => [capability, enabled.has(capability)]),
  ) as Record<(typeof CAPABILITY_IDS)[number], boolean>;

const allCapabilities = new Set(CAPABILITY_IDS);
const statelessCapabilities = new Set<(typeof CAPABILITY_IDS)[number]>([
  "transport",
  "email",
  "analytics",
  "i18n",
  "pdf",
  "eve",
  "featureFlags",
]);

describe("V1 generated unsafe-syntax zero gate", () => {
  test("both zero-state evidence artifacts satisfy their strict Draft 2020-12 schemas", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validatePolicy = ajv.compile(dispositionSchema);
    const validateBaseline = ajv.compile(baselineSchema);
    expect(validatePolicy(policy), JSON.stringify(validatePolicy.errors)).toBe(true);
    expect(validateBaseline(baseline), JSON.stringify(validateBaseline.errors)).toBe(true);
  });

  test("catalog axes stay deterministic while every evidence summary is zero", () => {
    const catalogKeys = GENERATED_UNSAFE_SYNTAX_CATALOG.map(({ configKey }) => configKey);
    const projectionKeys = PROJECTION_CONFIGURATIONS.map(({ configKey }) => configKey);
    const gateKeys = GATE_CONFIGURATIONS.map(({ configKey }) => configKey);

    expect(catalogKeys).toEqual([...catalogKeys].sort(compareText));
    expect(new Set(catalogKeys).size).toBe(38);
    expect(projectionKeys).toHaveLength(36);
    expect(gateKeys).toEqual(["gate/next-monorepo", "gate/single-next"]);
    expect(baseline.catalogKeys).toEqual(catalogKeys);
    expect(policy.catalogEvidence.configKeys).toEqual(catalogKeys);
    expect(policy.projectionEvidence.configKeys).toEqual([...projectionKeys].sort(compareText));

    for (const { configKey, config } of PROJECTION_CONFIGURATIONS) {
      if (configKey.includes("/capabilities-on")) {
        expect(config.billing, configKey).toEqual(["stripe", "chargily", "paddle", "polar"]);
        expect(capabilityState(config), configKey).toEqual(
          expectedCapabilityState(allCapabilities),
        );
      } else if (configKey.endsWith("capabilities-stateless")) {
        expect(config.database, configKey).toBe("none");
        expect(config.billing, configKey).toEqual([]);
        expect(capabilityState(config), configKey).toEqual(
          expectedCapabilityState(statelessCapabilities),
        );
      } else {
        expect(config.billing, configKey).toEqual([]);
        expect(capabilityState(config), configKey).toEqual(expectedCapabilityState(new Set()));
      }
    }

    const nonWebConfigurations = PROJECTION_CONFIGURATIONS.filter(
      ({ config }) => config.mode === "single" && config.apps[0] !== "web",
    );
    expect(nonWebConfigurations).toHaveLength(12);
    expect(nonWebConfigurations.map(({ configKey }) => configKey).toSorted(compareText)).toEqual(
      ["nextjs", "tanstack-start"].flatMap((framework) =>
        ["convex", "none", "postgres"].flatMap((database) =>
          ["desktop", "mobile"].map(
            (app) =>
              `single/${framework}/${database}/capabilities-${database === "none" ? "off" : "on"}-${app}`,
          ),
        ),
      ),
    );
    for (const { configKey, config } of PROJECTION_CONFIGURATIONS.filter(
      ({ config }) => config.mode === "monorepo" && config.billing.length > 0,
    )) {
      expect(config.apps, configKey).toEqual(["web", "mobile", "desktop"]);
    }

    for (const { configKey, config } of GATE_CONFIGURATIONS) {
      expect(config.billing, configKey).toEqual(["stripe", "chargily", "paddle", "polar"]);
      expect(capabilityState(config), configKey).toEqual(expectedCapabilityState(allCapabilities));
    }

    expect(baseline.entries).toEqual([]);
    expect(policy.rules).toEqual([]);
    expect({
      occurrenceRows: policy.catalogEvidence.occurrenceRows,
      uniqueOwnerPathPatterns: policy.catalogEvidence.uniqueOwnerPathPatterns,
      uniqueSourceOwners: policy.catalogEvidence.uniqueSourceOwners,
      provenanceRules: policy.catalogEvidence.provenanceRules,
    }).toEqual({
      occurrenceRows: 0,
      uniqueOwnerPathPatterns: 0,
      uniqueSourceOwners: 0,
      provenanceRules: 0,
    });
    expect({
      occurrenceRows: policy.projectionEvidence.occurrenceRows,
      uniqueOwnerPathPatterns: policy.projectionEvidence.uniqueOwnerPathPatterns,
      uniqueSourceOwners: policy.projectionEvidence.uniqueSourceOwners,
      provenanceRules: policy.projectionEvidence.provenanceRules,
      removeInStabilization: policy.projectionEvidence.fullCapabilityKeys.removeInStabilization,
      deferredV1: policy.projectionEvidence.fullCapabilityKeys.deferredV1,
    }).toEqual({
      occurrenceRows: 0,
      uniqueOwnerPathPatterns: 0,
      uniqueSourceOwners: 0,
      provenanceRules: 0,
      removeInStabilization: 0,
      deferredV1: 0,
    });
    expect({
      occurrenceRows: policy.gateEvidence.occurrenceRows,
      removeInStabilization: policy.defaultProjection.removeInStabilization,
      deferredV1: policy.defaultProjection.deferredV1,
    }).toEqual({
      occurrenceRows: 0,
      removeInStabilization: 0,
      deferredV1: 0,
    });
    expect(policy.gateEvidence.configurations.map(({ occurrenceRows }) => occurrenceRows)).toEqual([
      0, 0,
    ]);

    const actualGateConfigurations = GATE_CONFIGURATIONS.map(({ configKey, config }) => ({
      configKey,
      mode: config.mode,
      framework: config.framework,
      database: config.database,
      billing: config.billing,
      apps: config.apps,
    }));
    expect(actualGateConfigurations).toEqual(
      policy.gateEvidence.configurations.map(
        ({ capabilities: _capabilities, occurrenceRows: _occurrenceRows, ...configuration }) =>
          configuration,
      ),
    );
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
      "// @ts-ignore retained for detector coverage",
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

  test("current generated catalog is exactly zero and any future occurrence fails closed", () => {
    expect(generateCatalogOccurrences(GENERATED_UNSAFE_SYNTAX_CATALOG, policy)).toEqual([]);
    expect(() =>
      collectUnsafeOccurrences(
        "future",
        [{ path: "src/future.ts", content: "const leaked = value as any;" }],
        policy,
      ),
    ).toThrow("future :: src/future.ts; matched 0");
  });
});

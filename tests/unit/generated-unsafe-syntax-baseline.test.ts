// @allow-long 770: the single gate test keeps schema, detector, transaction, catalog, and gate invariants in one executable contract
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
const TASK1_OWNERS = new Set([
  "src/templates/api.ts",
  "src/templates/auth.ts",
  "src/templates/modes/single/server/auth.ts",
  "src/templates/modes/single/pages/admin.ts",
]);
const TASK3_OWNERS = new Set([
  "src/templates/apps/fragments/web-ui/missing.ts",
  "src/templates/apps/fragments/web-ui/form-fields.ts",
  "src/templates/apps/fragments/web-ui/forms.ts",
  "src/templates/apps/fragments/web-ui/primitives.ts",
  "src/templates/apps/fragments/web-ui/feedback.ts",
  "src/templates/apps/fragments/web-ui/layout.ts",
  "src/templates/apps/fragments/web-ui/dropdown.ts",
  "src/templates/apps/fragments/web-ui/overlays.ts",
  "src/templates/apps/fragments/lib/notifications.ts",
  "src/templates/apps/fragments/lib/surface-styles.ts",
  "src/templates/apps/fragments/settings/two-factor-card.ts",
  "src/templates/auth.ts",
]);
const TASK4_OWNERS = new Set([
  "src/templates/apps/fragments/auth/sign-in.ts",
  "src/templates/apps/fragments/lib/feature-flags.ts",
  "src/templates/apps/fragments/recovery/forgot-password.ts",
  "src/templates/apps/fragments/recovery/reset-password.ts",
  "src/templates/auth.ts",
  "src/templates/modes/single/pages/auth.ts",
  "src/templates/modes/single/pages/password.ts",
  "src/templates/modes/single/server/auth.ts",
  "src/templates/modes/single/tanstack/pages/auth.ts",
]);
const TASK4_SAFE_REMOVAL_IDS = new Set([
  "monorepo/nextjs/convex/capabilities-on::packages/billing/src/adapters/convex.ts::assertion-chain::724b73c800be67a5::1",
  "monorepo/tanstack-start/convex/capabilities-on::packages/billing/src/adapters/convex.ts::assertion-chain::724b73c800be67a5::1",
  "single/tanstack-start/convex/capabilities-on::src/components/shell/Navbar.tsx::assertion-chain::1cb91e5a4a9377d9::1",
  "single/tanstack-start/convex/capabilities-on::src/routes/forgot-password.tsx::assertion-chain::aa52595493dbf798::1",
  "single/tanstack-start/convex/capabilities-on::src/routes/forgot-password.tsx::assertion-chain::aa52595493dbf798::2",
  "single/tanstack-start/postgres/capabilities-on::src/components/shell/Navbar.tsx::assertion-chain::1cb91e5a4a9377d9::1",
  "single/tanstack-start/postgres/capabilities-on::src/routes/forgot-password.tsx::assertion-chain::aa52595493dbf798::1",
  "single/tanstack-start/postgres/capabilities-on::src/routes/forgot-password.tsx::assertion-chain::aa52595493dbf798::2",
  "single/tanstack-start/convex/capabilities-on::src/routes/reset-password.tsx::assertion-chain::f604ece91be800b2::1",
  "single/tanstack-start/convex/capabilities-on::src/routes/sign-in.tsx::assertion-chain::47ff23bab957d527::1",
  "single/tanstack-start/postgres/capabilities-on::src/routes/reset-password.tsx::assertion-chain::f604ece91be800b2::1",
  "single/tanstack-start/postgres/capabilities-on::src/routes/sign-in.tsx::assertion-chain::47ff23bab957d527::1",
  ...[
    {
      configKey: "monorepo/nextjs/convex/capabilities-on",
      path: "packages/services/src/billing/list-subscriptions.service.ts",
    },
    {
      configKey: "monorepo/tanstack-start/convex/capabilities-on",
      path: "packages/services/src/billing/list-subscriptions.service.ts",
    },
    {
      configKey: "single/nextjs/convex/capabilities-on",
      path: "src/server/services/billing/list-subscriptions.service.ts",
    },
    {
      configKey: "single/tanstack-start/convex/capabilities-on",
      path: "src/server/services/billing/list-subscriptions.service.ts",
    },
  ].flatMap(({ configKey, path }) =>
    ["30b0649f104a15aa", "3caa6446bbd98ebf", "a08029b9ccdd3b63", "ddef7ce058d5d767"].map(
      (fingerprint) => `${configKey}::${path}::assertion-chain::${fingerprint}::1`,
    ),
  ),
]);
const TASK5_REMOVAL_IDS = new Set([
  "gate/single-next::src/app/settings/components/profile-card.tsx::assertion-chain::619b221bce3a6a52::1",
  "gate/single-next::src/app/settings/components/two-factor-card.tsx::assertion-chain::619b221bce3a6a52::1",
  "gate/single-next::src/app/settings/components/two-factor-card.tsx::assertion-chain::e1828b2b0e620be0::1",
  "gate/single-next::src/app/settings/hooks/use-settings.ts::assertion-chain::619b221bce3a6a52::1",
  "gate/single-next::src/app/settings/hooks/use-settings.ts::assertion-chain::e1828b2b0e620be0::1",
  "single/nextjs/convex/capabilities-on::src/app/settings/components/profile-card.tsx::assertion-chain::619b221bce3a6a52::1",
  "single/nextjs/convex/capabilities-on::src/app/settings/components/two-factor-card.tsx::assertion-chain::619b221bce3a6a52::1",
  "single/nextjs/convex/capabilities-on::src/app/settings/components/two-factor-card.tsx::assertion-chain::e1828b2b0e620be0::1",
  "single/nextjs/convex/capabilities-on::src/app/settings/hooks/use-settings.ts::assertion-chain::619b221bce3a6a52::1",
  "single/nextjs/convex/capabilities-on::src/app/settings/hooks/use-settings.ts::assertion-chain::e1828b2b0e620be0::1",
  "single/nextjs/postgres/capabilities-on::src/app/settings/components/profile-card.tsx::assertion-chain::619b221bce3a6a52::1",
  "single/nextjs/postgres/capabilities-on::src/app/settings/components/two-factor-card.tsx::assertion-chain::619b221bce3a6a52::1",
  "single/nextjs/postgres/capabilities-on::src/app/settings/components/two-factor-card.tsx::assertion-chain::e1828b2b0e620be0::1",
  "single/nextjs/postgres/capabilities-on::src/app/settings/hooks/use-settings.ts::assertion-chain::619b221bce3a6a52::1",
  "single/nextjs/postgres/capabilities-on::src/app/settings/hooks/use-settings.ts::assertion-chain::e1828b2b0e620be0::1",
]);
const TASK5_TYPED_REMOVAL_IDS = new Set([
  "gate/next-monorepo::apps/web/src/app/admin/users/hooks/use-admin-users.ts::assertion-chain::d61d546fe68c45f8::1",
  "gate/next-monorepo::apps/web/src/app/admin/users/page.tsx::assertion-chain::234f2de83496c835::1",
  "gate/next-monorepo::apps/web/src/app/settings/components/profile-card.tsx::assertion-chain::9f821147cf9f4a09::1",
  "monorepo/nextjs/convex/capabilities-off::apps/web/src/app/admin/users/page.tsx::assertion-chain::234f2de83496c835::1",
  "monorepo/nextjs/convex/capabilities-on::apps/web/src/app/admin/users/hooks/use-admin-users.ts::assertion-chain::d61d546fe68c45f8::1",
  "monorepo/nextjs/convex/capabilities-on::apps/web/src/app/admin/users/page.tsx::assertion-chain::234f2de83496c835::1",
  "monorepo/nextjs/convex/capabilities-on::apps/web/src/app/settings/components/profile-card.tsx::assertion-chain::9f821147cf9f4a09::1",
  "monorepo/nextjs/postgres/capabilities-off::apps/web/src/app/admin/users/page.tsx::assertion-chain::234f2de83496c835::1",
  "monorepo/nextjs/postgres/capabilities-on::apps/web/src/app/admin/users/hooks/use-admin-users.ts::assertion-chain::d61d546fe68c45f8::1",
  "monorepo/nextjs/postgres/capabilities-on::apps/web/src/app/admin/users/page.tsx::assertion-chain::234f2de83496c835::1",
  "monorepo/nextjs/postgres/capabilities-on::apps/web/src/app/settings/components/profile-card.tsx::assertion-chain::9f821147cf9f4a09::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/admin.users.create.tsx::assertion-chain::8367f56f76246bd3::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/admin.users.tsx::assertion-chain::63c1858a777c441c::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::0e5cc559ced8b22d::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::2d01e4b86e54c553::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::56c65f489e5d9ce0::2",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::56c65f489e5d9ce0::3",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::88ee7d3956ab5461::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::92d9841583968ea9::2",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::92d9841583968ea9::3",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::b4eab65b59ea0979::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::c875337dcdbae4c6::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::d65d975095989386::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::e574cef3495cded7::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/admin.users.create.tsx::assertion-chain::8367f56f76246bd3::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/admin.users.tsx::assertion-chain::63c1858a777c441c::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::0e5cc559ced8b22d::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::2d01e4b86e54c553::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::56c65f489e5d9ce0::2",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::56c65f489e5d9ce0::3",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::88ee7d3956ab5461::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::92d9841583968ea9::2",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::92d9841583968ea9::3",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::b4eab65b59ea0979::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::c875337dcdbae4c6::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::d65d975095989386::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::e574cef3495cded7::1",
]);
const TASK5_AXIS_REMOVAL_IDS = new Set([
  "gate/single-next::src/server/db/index.ts::explicit-any::d6a7cd2a7371b1a1::1",
  "gate/single-next::src/server/db/index.ts::explicit-any::d6a7cd2a7371b1a1::2",
  "single/nextjs/postgres/capabilities-off::src/server/db/index.ts::explicit-any::d6a7cd2a7371b1a1::1",
  "single/nextjs/postgres/capabilities-off::src/server/db/index.ts::explicit-any::d6a7cd2a7371b1a1::2",
  "single/nextjs/postgres/capabilities-on::src/server/db/index.ts::explicit-any::d6a7cd2a7371b1a1::1",
  "single/nextjs/postgres/capabilities-on::src/server/db/index.ts::explicit-any::d6a7cd2a7371b1a1::2",
  "single/tanstack-start/postgres/capabilities-off::src/server/db/index.ts::explicit-any::d6a7cd2a7371b1a1::1",
  "single/tanstack-start/postgres/capabilities-off::src/server/db/index.ts::explicit-any::d6a7cd2a7371b1a1::2",
  "single/tanstack-start/postgres/capabilities-on::src/server/db/index.ts::explicit-any::d6a7cd2a7371b1a1::1",
  "single/tanstack-start/postgres/capabilities-on::src/server/db/index.ts::explicit-any::d6a7cd2a7371b1a1::2",
]);
const TASK5_REVIEW_REMOVAL_IDS = new Set([
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/admin.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/admin.tsx::assertion-chain::8f557185e84a90d2::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/admin.users.create.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/admin.users.create.tsx::assertion-chain::8f557185e84a90d2::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/admin.users.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/admin.users.tsx::assertion-chain::8f557185e84a90d2::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "monorepo/tanstack-start/convex/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::37852dad5b62915e::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/admin.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/admin.tsx::assertion-chain::8f557185e84a90d2::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/admin.users.create.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/admin.users.create.tsx::assertion-chain::8f557185e84a90d2::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/admin.users.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/admin.users.tsx::assertion-chain::8f557185e84a90d2::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "monorepo/tanstack-start/postgres/capabilities-on::apps/web/src/routes/settings.tsx::assertion-chain::37852dad5b62915e::1",
  "single/tanstack-start/convex/capabilities-on::src/routes/admin.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "single/tanstack-start/convex/capabilities-on::src/routes/admin.tsx::assertion-chain::45830b71a5321214::1",
  "single/tanstack-start/convex/capabilities-on::src/routes/admin.users.create.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "single/tanstack-start/convex/capabilities-on::src/routes/admin.users.create.tsx::assertion-chain::45830b71a5321214::1",
  "single/tanstack-start/convex/capabilities-on::src/routes/admin.users.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "single/tanstack-start/convex/capabilities-on::src/routes/admin.users.tsx::assertion-chain::45830b71a5321214::1",
  "single/tanstack-start/convex/capabilities-on::src/routes/settings.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "single/tanstack-start/convex/capabilities-on::src/routes/settings.tsx::assertion-chain::ef2c97ce8ba2d902::1",
  "single/tanstack-start/postgres/capabilities-on::src/routes/admin.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "single/tanstack-start/postgres/capabilities-on::src/routes/admin.tsx::assertion-chain::45830b71a5321214::1",
  "single/tanstack-start/postgres/capabilities-on::src/routes/admin.users.create.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "single/tanstack-start/postgres/capabilities-on::src/routes/admin.users.create.tsx::assertion-chain::45830b71a5321214::1",
  "single/tanstack-start/postgres/capabilities-on::src/routes/admin.users.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "single/tanstack-start/postgres/capabilities-on::src/routes/admin.users.tsx::assertion-chain::45830b71a5321214::1",
  "single/tanstack-start/postgres/capabilities-on::src/routes/settings.tsx::assertion-chain::2942bbd1c52a8b0f::1",
  "single/tanstack-start/postgres/capabilities-on::src/routes/settings.tsx::assertion-chain::ef2c97ce8ba2d902::1",
]);
const STABILIZED_OWNERS = new Set([...TASK1_OWNERS, ...TASK3_OWNERS, ...TASK4_OWNERS]);

function isTask4CapabilityRemoval(entry: (typeof baseline.entries)[number]): boolean {
  const configKey = entry.catalogKeys[0] ?? "";
  if (/^(?:monorepo|single)\/(?:nextjs|tanstack-start)\/convex\/capabilities-on$/.test(configKey)) {
    if (
      entry.sourceOwner === "src/templates/billing-generator.ts" &&
      /(?:packages\/billing\/src|src\/server\/billing)\/adapters\/convex\.ts$/.test(entry.path)
    ) {
      return true;
    }
    if (
      entry.sourceOwner === "src/templates/billing/index.ts" &&
      /(?:packages\/billing\/src|src\/server\/billing)\/index\.ts$/.test(entry.path)
    ) {
      return true;
    }
  }

  if (/^single\/nextjs\/(?:postgres|convex)\/capabilities-off$/.test(configKey)) {
    return [
      ["src/templates/modes/single/api/routes.ts", /^src\/app\/api\/\[\.\.\.path\]\/route\.ts$/],
      ["src/templates/analytics/proxy.ts", /^src\/app\/api\/ingest\/route\.ts$/],
      [
        "src/templates/billing/ui/components/hook.ts",
        /^src\/app\/billing\/hooks\/use-billing-page\.ts$/,
      ],
    ].some(([owner, pattern]) => owner === entry.sourceOwner && pattern.test(entry.path));
  }

  if (/^single\/tanstack-start\/(?:postgres|convex)\/capabilities-off$/.test(configKey)) {
    return [
      ["src/templates/modes/single/tanstack/pages/admin.ts", /^src\/routes\/admin\.tsx$/],
      ["src/templates/modes/single/tanstack/api.ts", /^src\/routes\/api\/rpc\/\$splat\.ts$/],
      [
        "src/templates/modes/single/tanstack/pages/dashboard.ts",
        /^src\/routes\/(?:billing|dashboard|settings)\.tsx$/,
      ],
    ].some(([owner, pattern]) => owner === entry.sourceOwner && pattern.test(entry.path));
  }
  return false;
}

const LEGITIMATE_REMOVAL_IDS = new Set(
  baseline.entries
    .filter(
      (entry) =>
        TASK5_REVIEW_REMOVAL_IDS.has(entry.id) ||
        TASK5_AXIS_REMOVAL_IDS.has(entry.id) ||
        TASK5_TYPED_REMOVAL_IDS.has(entry.id) ||
        TASK5_REMOVAL_IDS.has(entry.id) ||
        TASK4_SAFE_REMOVAL_IDS.has(entry.id) ||
        isTask4CapabilityRemoval(entry) ||
        (entry.disposition === "remove-in-stabilization" &&
          STABILIZED_OWNERS.has(entry.sourceOwner)),
    )
    .map(({ id }) => id),
);
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

  test("catalog exactly matches the frozen baseline minus enumerated removals", () => {
    const occurrences = generateCatalogOccurrences(GENERATED_UNSAFE_SYNTAX_CATALOG, policy);
    const allowedEntries = baseline.entries.filter(({ id }) => !LEGITIMATE_REMOVAL_IDS.has(id));
    const currentIds = new Set(occurrences.map(({ id }) => id));
    const unenumeratedRemovals = baseline.entries
      .filter(({ id }) => !currentIds.has(id) && !LEGITIMATE_REMOVAL_IDS.has(id))
      .map(({ id }) => id);
    expect(unenumeratedRemovals).toEqual([]);
    expect(occurrences).toHaveLength(671);
    expect(LEGITIMATE_REMOVAL_IDS.size).toBe(340);
    expect(baseline.entries).toHaveLength(1011);
    expect(new Set(baseline.entries.map(({ id }) => id)).size).toBe(1011);
    expect(baseline.entries.map(({ id }) => id)).toEqual(
      baseline.entries.map(({ id }) => id).toSorted(compareText),
    );

    const allowedById = new Map(allowedEntries.map((entry) => [entry.id, entry]));
    const actualIds = new Set(occurrences.map(({ id }) => id));
    const removedIds = baseline.entries
      .map(({ id }) => id)
      .filter((id) => !actualIds.has(id))
      .toSorted(compareText);
    expect(removedIds).toEqual([...LEGITIMATE_REMOVAL_IDS].toSorted(compareText));
    expect(occurrences.map(({ id }) => id)).toEqual(allowedEntries.map(({ id }) => id));
    for (const actual of occurrences) {
      const entry = allowedById.get(actual.id);
      expect(entry, actual.id).toBeDefined();
      expect(entry?.catalogKeys).toEqual([actual.configKey]);
      expect(entry?.path).toBe(actual.path);
      expect(entry?.kind).toBe(actual.kind);
      expect(entry?.fingerprint).toBe(actual.fingerprint);
      expect(entry?.sourceOwner).toBe(actual.sourceOwner);
      const rule = findProvenanceRule(actual.configKey, actual.path, policy);
      expect(entry?.sourceOwner).toBe(rule.sourceOwner);
      expect(entry?.disposition).toBe(rule.disposition);
      expect(entry?.removalPhase).toBe(rule.removalPhase);
    }

    const actualRuleCounts = new Map<string, number>();
    for (const occurrence of occurrences) {
      const key = ruleKey(findProvenanceRule(occurrence.configKey, occurrence.path, policy));
      actualRuleCounts.set(key, (actualRuleCounts.get(key) ?? 0) + 1);
    }
    for (const rule of policy.rules) {
      const key = ruleKey(rule);
      const expectedCount = allowedEntries.filter((entry) => {
        const configKey = entry.catalogKeys[0] ?? "";
        return ruleKey(findProvenanceRule(configKey, entry.path, policy)) === key;
      }).length;
      expect(actualRuleCounts.get(key) ?? 0, key).toBe(expectedCount);
    }
  });

  test("Task 1 owners have no remaining remove-in-stabilization occurrences", () => {
    const actualIds = generateCatalogOccurrences(GENERATED_UNSAFE_SYNTAX_CATALOG, policy).map(
      ({ id }) => id,
    );
    const removalEntriesById = new Map(
      baseline.entries
        .filter(({ disposition }) => disposition === "remove-in-stabilization")
        .map((entry) => [entry.id, entry]),
    );
    expect(
      actualIds.filter(
        (id) =>
          removalEntriesById.get(id) && TASK1_OWNERS.has(removalEntriesById.get(id)!.sourceOwner),
      ),
    ).toEqual([]);
  });

  test("Task 3 owners have no remaining remove-in-stabilization occurrences", () => {
    const actualIds = generateCatalogOccurrences(GENERATED_UNSAFE_SYNTAX_CATALOG, policy).map(
      ({ id }) => id,
    );
    const removalEntriesById = new Map(
      baseline.entries
        .filter(({ disposition }) => disposition === "remove-in-stabilization")
        .map((entry) => [entry.id, entry]),
    );
    expect(
      actualIds.filter(
        (id) =>
          removalEntriesById.get(id) && TASK3_OWNERS.has(removalEntriesById.get(id)!.sourceOwner),
      ),
    ).toEqual([]);
  });

  test("Task 4 owners have no remaining remove-in-stabilization occurrences", () => {
    const actualIds = generateCatalogOccurrences(GENERATED_UNSAFE_SYNTAX_CATALOG, policy).map(
      ({ id }) => id,
    );
    const removalEntriesById = new Map(
      baseline.entries
        .filter(({ disposition }) => disposition === "remove-in-stabilization")
        .map((entry) => [entry.id, entry]),
    );
    expect(
      actualIds.filter(
        (id) =>
          removalEntriesById.get(id) && TASK4_OWNERS.has(removalEntriesById.get(id)!.sourceOwner),
      ),
    ).toEqual([]);
    expect(actualIds.filter((id) => TASK4_SAFE_REMOVAL_IDS.has(id))).toEqual([]);
  });

  test("Task 5 removes exactly its assigned disposition IDs", () => {
    const actualIds = generateCatalogOccurrences(GENERATED_UNSAFE_SYNTAX_CATALOG, policy).map(
      ({ id }) => id,
    );
    expect(TASK5_REMOVAL_IDS.size).toBe(15);
    expect(actualIds.filter((id) => TASK5_REMOVAL_IDS.has(id))).toEqual([]);
    expect(TASK5_TYPED_REMOVAL_IDS.size).toBe(37);
    expect(actualIds.filter((id) => TASK5_TYPED_REMOVAL_IDS.has(id))).toEqual([]);
    expect(TASK5_AXIS_REMOVAL_IDS.size).toBe(10);
    expect(actualIds.filter((id) => TASK5_AXIS_REMOVAL_IDS.has(id))).toEqual([]);
    expect(TASK5_REVIEW_REMOVAL_IDS.size).toBe(32);
    expect(actualIds.filter((id) => TASK5_REVIEW_REMOVAL_IDS.has(id))).toEqual([]);
  });

  test("projection and default gates retain the factual V1 ceiling", () => {
    const projection = generateCatalogOccurrences(PROJECTION_CONFIGURATIONS, policy);
    expect(PROJECTION_CONFIGURATIONS.map(({ configKey }) => configKey)).toHaveLength(16);
    expect(projection).toHaveLength(534);
    const projectionRules = new Map(
      projection.map((occurrence) => {
        const rule = findProvenanceRule(occurrence.configKey, occurrence.path, policy);
        return [ruleKey(rule), rule];
      }),
    );
    expect(projectionRules.size).toBe(62);
    expect(
      new Set(
        [...projectionRules.values()].map(
          ({ sourceOwner, emittedPathPattern }) => `${sourceOwner}::${emittedPathPattern}`,
        ),
      ).size,
    ).toBe(60);
    expect(new Set([...projectionRules.values()].map(({ sourceOwner }) => sourceOwner)).size).toBe(
      40,
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
    ).toHaveLength(42);
    expect(
      comparableDispositions.filter(({ disposition }) => disposition === "deferred-v1"),
    ).toHaveLength(80);

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
    expect(gate).toHaveLength(137);
    expect(policy.gateEvidence.occurrenceRows).toBe(172);
    const gateRowsByConfigKey = new Map(GATE_CONFIGURATIONS.map(({ configKey }) => [configKey, 0]));
    for (const { configKey } of gate) {
      gateRowsByConfigKey.set(configKey, (gateRowsByConfigKey.get(configKey) ?? 0) + 1);
    }
    expect(Object.fromEntries(gateRowsByConfigKey)).toEqual({
      "gate/next-monorepo": 82,
      "gate/single-next": 55,
    });
    const gateRules = gate.map((occurrence) =>
      findProvenanceRule(occurrence.configKey, occurrence.path, policy),
    );
    const gateDispositionSplit = {
      removeInStabilization: gateRules.filter(
        ({ disposition }) => disposition === "remove-in-stabilization",
      ).length,
      deferredV1: gateRules.filter(({ disposition }) => disposition === "deferred-v1").length,
    };
    expect(gateDispositionSplit).toEqual({ removeInStabilization: 42, deferredV1: 95 });
    expect({
      removeInStabilization: policy.defaultProjection.removeInStabilization,
      deferredV1: policy.defaultProjection.deferredV1,
    }).toEqual({ removeInStabilization: 72, deferredV1: 100 });

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

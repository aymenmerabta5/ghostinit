/**
 * Billing barrel safety net — validates SSOT and no export *.
 *
 * SSOT chain:
 *   src/lib/constants.ts ONLINE_BILLING_PROVIDERS  <- CLI canonical
 *   src/templates/billing/providers/interface/types.ts BILLING_PROVIDER_NAMES <- template mirror
 *   src/templates/billing/index.ts ALL_BILLING_PROVIDERS <- re-export of BILLING_PROVIDER_NAMES
 *
 * Adding 5th provider (e.g. lemonsqueezy):
 *   - create src/templates/billing/providers/<name>/ with core files
 *     (client, checkout, customer, portal?, webhook, subscriptions, mappers?)
 *   - update BILLING_PROVIDER_NAMES in interface/types.ts
 *   - register the factory export in billing-generator.ts
 *   - add webhook fragments in billing/webhooks/providers/<name>.ts
 *   - add env vars in shared/env/billing.ts billingEnvLines() (same loop pattern via
 *     ONLINE_BILLING_PROVIDERS — codegen pattern reused, dogfooding possible)
 *   - turbo.json globalEnv, pgEnum, UI panels etc still need touch — env and provider
 *     registry generation already loop over the canonical provider list.
 */

import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(thisFile), "..", "..");

// Canonical SSOT from CLI
import { ONLINE_BILLING_PROVIDERS } from "../../src/lib/constants.js";
// Template SSOT (mirror)
import { BILLING_PROVIDER_NAMES } from "../../src/templates/billing/providers/interface/types.js";

describe("billing barrel — SSOT and filesystem safety net", () => {
  it("ONLINE_BILLING_PROVIDERS (constants.ts) matches BILLING_PROVIDER_NAMES (interface/types.ts)", () => {
    const cli = [...ONLINE_BILLING_PROVIDERS].sort();
    const tmpl = [...BILLING_PROVIDER_NAMES].sort();
    expect(tmpl).toEqual(cli);
  });

  it("ALL_BILLING_PROVIDERS alias exists via BILLING_PROVIDER_NAMES (billing/index.ts does not hard-code literal separate from SSOT)", async () => {
    const content = readFileSync(join(repoRoot, "src/templates/billing/index.ts"), "utf-8");
    // Should re-export / alias BILLING_PROVIDER_NAMES, not contain hard-coded literal duplicated separately
    expect(content).toContain("BILLING_PROVIDER_NAMES");
    // Should NOT have a second manual array that duplicates list without import (drift risk)
    // The file may still define ALL_BILLING_PROVIDERS but as alias
    expect(content).toMatch(/ALL_BILLING_PROVIDERS/);
    // The source template describes the default all-provider registry with
    // literal lazy imports. billing-generator.ts filters this exact map.
    const explicitImports = (
      content.match(/import\("\.\/providers\/(stripe|chargily|paddle|polar)"\)/g) ?? []
    ).length;
    expect(explicitImports).toBe(ONLINE_BILLING_PROVIDERS.length);
    expect(content).not.toContain("import(`./providers/${provider}.js`)");
    expect(content).not.toMatch(/import\("\.\/providers\/(stripe|chargily|paddle|polar)\.js"\)/);
    expect(content).toContain("billingProviderLoaders");
    expect(content).toContain("for (const provider of BILLING_PROVIDER_NAMES)");
  });

  it("ALL_BILLING_PROVIDERS array matches filesystem folders under src/templates/billing/providers/", () => {
    const providersDir = join(repoRoot, "src/templates/billing/providers");
    const entries = readdirSync(providersDir);
    const dirs = entries.filter((e) => {
      try {
        const full = join(providersDir, e);
        const st = statSync(full);
        if (!st.isDirectory()) return false;
        if (e === "interface") return false;
        return true;
      } catch {
        return false;
      }
    });
    const fsProviders = dirs.sort();
    const ssot = [...ONLINE_BILLING_PROVIDERS].sort();
    expect(fsProviders).toEqual(ssot);

    // Also validate webhooks/providers shared re-exports SSOT
    const sharedPath = join(repoRoot, "src/templates/billing/webhooks/providers/shared.ts");
    const sharedContent = readFileSync(sharedPath, "utf-8");
    expect(sharedContent).toContain("BILLING_PROVIDER_NAMES");
    expect(sharedContent).not.toMatch(/type BillingProviderName = "stripe" \| "chargily"/);
  });

  it("each provider folder has core expected files (client, checkout, customer, webhook, subscriptions)", () => {
    const providersDir = join(repoRoot, "src/templates/billing/providers");
    const coreFiles = ["client.ts", "checkout.ts", "customer.ts", "webhook.ts", "subscriptions.ts"];
    for (const provider of ONLINE_BILLING_PROVIDERS) {
      const folder = join(providersDir, provider);
      const files = readdirSync(folder);
      for (const core of coreFiles) {
        expect(files).toContain(core);
      }
    }
  });

  it("billing/index.ts, providers/interface.ts, providers/*.ts explicit named re-exports — no export *", () => {
    const filesToCheck = [
      "src/templates/billing/index.ts",
      "src/templates/billing/providers/interface.ts",
      "src/templates/billing/providers/interface/types.ts",
      "src/templates/billing/providers/interface/inputs.ts",
      "src/templates/billing/providers/interface/ports.ts",
      "src/templates/billing/providers/stripe.ts",
      "src/templates/billing/providers/chargily.ts",
      "src/templates/billing/providers/paddle.ts",
      "src/templates/billing/providers/polar.ts",
      "src/templates/billing/schema/billing.ts",
      "src/templates/billing/schema/index.ts",
      "src/templates/billing/webhooks/providers/index.ts",
      "src/templates/billing/webhooks/providers/shared.ts",
      "src/templates/billing/webhooks/factory.ts",
    ];
    for (const rel of filesToCheck) {
      const full = join(repoRoot, rel);
      try {
        const content = readFileSync(full, "utf-8");
        // Allow export * inside string literals (template content generators) — check only real export statements at start of line
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          // Skip lines that are inside template string generators? Heuristic: file content generators are inside string arrays
          // Real export * would be at top-level not inside quotes
          if (trimmed.startsWith("export *")) {
            // Check if this line is inside a template string generation file (barrels.ts etc) — those legitimately have export * as data
            // For billing barrels listed above, none should have export *
            throw new Error(`File ${rel} contains forbidden export *: ${trimmed}`);
          }
        }
        // Also ensure no "export * from" pattern at file level
        expect(content).not.toMatch(/^\s*export\s+\*\s+from/m);
        expect(content).not.toMatch(/^\s*export\s+\*\s+as/m);
      } catch (err) {
        if ((err as any).code === "ENOENT") continue;
        throw err;
      }
    }
  });

  it("webhooks/providers/index.ts uses SSOT loop not hard-coded providers array", () => {
    const indexPath = join(repoRoot, "src/templates/billing/webhooks/providers/index.ts");
    const content = readFileSync(indexPath, "utf-8");
    expect(content).toContain("BILLING_PROVIDER_NAMES");
    // Old hard-coded literal in allWebhookFiles
    expect(content).not.toMatch(/const providers: BillingProviderName\[\] = \["stripe"/);
    // Should use spread of SSOT
    expect(content).toMatch(/\[\.\.\.BILLING_PROVIDER_NAMES\]/);
  });

  it("webhook factory contentMap registry is keyed by BillingProviderName (add 5th requires single touch)", () => {
    const content = readFileSync(
      join(repoRoot, "src/templates/billing/webhooks/providers/index.ts"),
      "utf-8",
    );
    expect(content).toContain("providerContentMap");
    expect(content).toContain("Record<BillingProviderName");
  });
});

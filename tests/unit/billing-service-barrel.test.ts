import { describe, expect, it } from "bun:test";
import { billingServiceFiles } from "../../src/templates/services/billing";

function billingIndex(mode: "monorepo" | "single"): string {
  const path =
    mode === "monorepo"
      ? "packages/services/src/billing/index.ts"
      : "src/server/services/billing/index.ts";
  return billingServiceFiles(mode).find((entry) => entry.path === path)?.content ?? "";
}

function billingServer(mode: "monorepo" | "single"): string {
  const path =
    mode === "monorepo"
      ? "packages/services/src/billing/server.ts"
      : "src/server/services/billing/server.ts";
  return billingServiceFiles(mode).find((entry) => entry.path === path)?.content ?? "";
}

describe("generated billing service barrel", () => {
  it("guards every billing service and repository at the server-only boundary", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        for (const generated of billingServiceFiles(mode, database)) {
          expect(generated.content, `${mode}/${database}/${generated.path}`).toStartWith(
            'import "server-only";',
          );
        }
      }
    }
  });

  it("explicitly exports every type consumed by monorepo billing applications", () => {
    const content = billingIndex("monorepo");

    expect(content).toContain("PortalProviderPort");
    expect(content).toContain("BillingCheckoutRepositoryPort");
    expect(content).toContain("BillingCustomerLookupPort");
    expect(content).not.toContain("export { billingCheckoutRepository }");
    expect(content).not.toContain("export { billingCustomerRepository }");
    expect(content).toContain(
      'export type { BillingSnapshot, BillingSnapshotRepositoryPort } from "./list-subscriptions.service";',
    );
    expect(content).toContain('export type { Result } from "@repo/kernel";');
    expect(content).not.toContain("export *");
  });

  it("re-exports the single-project Result type from its local kernel", () => {
    const content = billingIndex("single");

    expect(content).toContain('export type { Result } from "@/server/kernel/result.js";');
    expect(content).toContain("PortalProviderPort");
    expect(content).toContain("BillingSnapshot");
    expect(content).not.toContain("export { billingCheckoutRepository }");
    expect(content).not.toContain("export { billingCustomerRepository }");
    expect(billingServer("single")).toContain("export { billingCheckoutRepository }");
    expect(billingServer("single")).toContain("export { billingCustomerRepository }");
    expect(content).not.toContain("export *");
  });
});

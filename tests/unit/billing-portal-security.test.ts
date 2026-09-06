import { describe, expect, it } from "bun:test";
import { apiPackage } from "../../src/templates/api.js";
import { billingHookContent } from "../../src/templates/billing/ui/components/hook.js";
import { billingActionsContent } from "../../src/templates/billing/ui/components/actions.js";
import { billingFiles as legacyBillingUiFiles } from "../../src/templates/apps/fragments/billing/index.js";
import { singleBillingApiFiles } from "../../src/templates/modes/single/api/billing.js";
import { requestApplicationFiles } from "../../src/templates/services/application.js";
import { billingServiceFiles } from "../../src/templates/services/billing.js";
import type { BillingProvider } from "../../src/domain/project/choices.js";

interface PortalError extends Error {
  code: "NOT_SUPPORTED" | "CUSTOMER_NOT_FOUND" | "PORTAL_FAILED";
}

type PortalService = (
  input: { actorId: string; provider: BillingProvider; returnUrl: string; customerId?: string },
  deps: {
    billingProvider: { createPortalSession?: (input: unknown) => Promise<{ url: string }> };
    customerRepository: {
      findProviderCustomerId: (input: unknown) => Promise<string | null>;
    };
  },
) => Promise<{ ok: true; value: { url: string } } | { ok: false; error: PortalError }>;

function loadPortalService(mode: "monorepo" | "single"): PortalService {
  const content =
    billingServiceFiles(mode).find((entry) =>
      entry.path.endsWith("billing/create-portal-session.service.ts"),
    )?.content ?? "";
  const source = content.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  return new Function(
    `${javascript}
class ServiceError extends Error {
  constructor(code, message, options) { super(message); this.code = code; this.cause = options?.cause; }
}
function ok(value) { return { ok: true, value }; }
function err(error) { return { ok: false, error }; }
return createPortalSessionService;`,
  )() as PortalService;
}

describe("billing portal ownership", () => {
  it("resolves the vendor customer id from authenticated actors in both packaging modes", async () => {
    for (const mode of ["monorepo", "single"] as const) {
      const service = loadPortalService(mode);
      const repositoryCalls: unknown[] = [];
      const providerCalls: unknown[] = [];

      const result = await service(
        {
          actorId: "actor_1",
          provider: "stripe",
          returnUrl: "https://app.example.test/settings/billing",
          customerId: "attacker_customer",
        },
        {
          customerRepository: {
            async findProviderCustomerId(input) {
              repositoryCalls.push(input);
              return "owned_customer";
            },
          },
          billingProvider: {
            async createPortalSession(input) {
              providerCalls.push(input);
              return { url: "https://billing.example.test/session" };
            },
          },
        },
      );

      expect(repositoryCalls).toEqual([{ actorId: "actor_1", provider: "stripe" }]);
      expect(providerCalls).toEqual([
        {
          customerId: "owned_customer",
          returnUrl: "https://app.example.test/settings/billing",
        },
      ]);
      expect(result).toEqual({ ok: true, value: { url: "https://billing.example.test/session" } });
    }
  });

  for (const mode of ["monorepo", "single"] as const) {
    it(`${mode} enforces domain provider support even when an adapter advertises a portal`, async () => {
      const calls: string[] = [];
      const result = await loadPortalService(mode)(
        { actorId: "actor_1", provider: "chargily", returnUrl: "https://app.example.test" },
        {
          billingProvider: {
            async createPortalSession() {
              calls.push("provider");
              return { url: "https://unexpected.example" };
            },
          },
          customerRepository: {
            async findProviderCustomerId() {
              calls.push("customer");
              return "customer";
            },
          },
        },
      );
      expect(calls).toEqual([]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_SUPPORTED");
    });

    it(`${mode} fails closed when no owned customer exists`, async () => {
      const service = loadPortalService(mode);
      let providerCalled = false;
      const result = await service(
        { actorId: "actor_2", provider: "stripe", returnUrl: "https://app.example.test" },
        {
          customerRepository: { findProviderCustomerId: async () => null },
          billingProvider: {
            async createPortalSession() {
              providerCalled = true;
              return { url: "unexpected" };
            },
          },
        },
      );

      expect(providerCalled).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CUSTOMER_NOT_FOUND");
    });

    it(`${mode} returns typed NOT_SUPPORTED without consulting customer storage`, async () => {
      const service = loadPortalService(mode);
      let repositoryCalled = false;
      const result = await service(
        { actorId: "actor_3", provider: "stripe", returnUrl: "https://app.example.test" },
        {
          customerRepository: {
            async findProviderCustomerId() {
              repositoryCalled = true;
              return "customer";
            },
          },
          billingProvider: {},
        },
      );

      expect(repositoryCalled).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_SUPPORTED");
    });
  }

  it("emits customer-id-free oRPC portal inputs in both packaging modes", () => {
    const monorepo = apiPackage(true).find((entry) =>
      entry.path.endsWith("procedures/billing/create-portal-session.ts"),
    )?.content;
    const single = singleBillingApiFiles().find((entry) =>
      entry.path.endsWith("procedures/billing/create-portal-session.ts"),
    )?.content;

    for (const content of [monorepo, single]) {
      expect(content).toContain("context.application.billing.createPortalSession(input)");
      expect(content).not.toContain("customerId: z.string");
      expect(content).not.toContain("input.customerId");
      expect(content).not.toContain("billingCustomerRepository");
    }
  });

  it("rejects suspended actors before every monorepo and single billing operation", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const facade =
        requestApplicationFiles(
          mode,
          { admin: true, billing: true, identity: true, notifications: true },
          "",
        ).find((entry) => entry.path.endsWith("application/facade.ts"))?.content ?? "";
      const activeCheck = facade.indexOf("function requireActivePrincipal");
      const bannedRejection = facade.indexOf("if (principal.banned)", activeCheck);
      const verifiedCheck = facade.indexOf("function requireVerifiedPrincipal", bannedRejection);
      expect(activeCheck, mode).toBeGreaterThanOrEqual(0);
      expect(bannedRejection, mode).toBeGreaterThan(activeCheck);
      expect(verifiedCheck, mode).toBeGreaterThan(bannedRejection);
      for (const operation of ["subscriptions", "createCheckout", "createPortalSession"]) {
        const operationStart = facade.indexOf(`${operation}: async`);
        const authorization = facade.indexOf("requireVerifiedPrincipal", operationStart);
        const sideEffect = facade.indexOf("dependencies.rateLimit", authorization);
        expect(authorization, `${mode}/${operation}`).toBeGreaterThan(operationStart);
        expect(sideEffect, `${mode}/${operation}`).toBeGreaterThan(authorization);
      }
    }
  });

  it("billing UI calls the typed portal procedure without sending customer ids", () => {
    const richHook = `${billingHookContent()}\n${billingActionsContent("monorepo")}`;
    const legacySurface = legacyBillingUiFiles("tanstack")
      .filter(
        (entry) =>
          entry.path.endsWith("use-billing.ts") || entry.path.endsWith("billing/mutations.ts"),
      )
      .map((entry) => entry.content)
      .join("\n");

    for (const content of [richHook, legacySurface]) {
      expect(content).toContain("billing.createPortalSession");
      expect(content).toMatch(/provider(?:,|: parsed\.data\.provider)/);
      expect(content).toContain("returnUrl:");
      expect(content).not.toContain("customerId: sub.customerId");
      expect(content).not.toMatch(/fetch\(["']\/api\/billing\//);
    }
  });
});

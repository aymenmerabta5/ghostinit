import { describe, expect, test } from "bun:test";
import type { ProjectMode } from "../../src/lib/addons.js";
import { billingFiles } from "../../src/templates/billing-generator.js";

type CustomerInput = {
  email?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  name?: string;
  userId?: string;
};

type CustomerOutput = { id: string; providerCustomerId?: string };
type PaddleCustomer = {
  customData?: Record<string, unknown>;
  email?: string;
  id: string;
};
type ChargilyCustomer = {
  email?: string;
  id: string;
  metadata?: Record<string, unknown>;
};

const addons = {
  billing: { inUse: true },
  chargily: { inUse: true },
  nextjs: { inUse: true },
  paddle: { inUse: true },
  postgres: { inUse: true },
};

function customerSource(mode: ProjectMode, provider: "chargily" | "paddle"): string {
  const suffix = `/providers/${provider}/customer.ts`;
  const source = billingFiles(mode, "bun", addons as never).find(({ path }) =>
    path.endsWith(suffix),
  )?.content;
  if (!source) throw new Error(`${mode}: missing generated ${provider} customer adapter`);
  return source;
}

function executableSource(source: string): string {
  return new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, ""),
  );
}

function paddleHarness(mode: ProjectMode, candidates: PaddleCustomer[]) {
  let createdPayload: Record<string, unknown> | undefined;
  let createCalls = 0;
  const client = {
    customers: {
      list: () => ({ next: async () => candidates }),
      create: async (payload: Record<string, unknown>) => {
        createCalls += 1;
        createdPayload = payload;
        return { id: "ctm_created" };
      },
    },
  };
  const javascript = executableSource(customerSource(mode, "paddle"));
  const createCustomer = new Function(
    "getPaddleClient",
    "requirePaddleResponseString",
    `${javascript}; return createPaddleCustomer;`,
  )(
    async () => client,
    (value: unknown) => {
      if (typeof value !== "string" || !value) throw new Error("invalid provider id");
      return value;
    },
  ) as (config: unknown, input: CustomerInput) => Promise<CustomerOutput>;
  return {
    create: (input: CustomerInput) => createCustomer({}, input),
    createCalls: () => createCalls,
    createdPayload: () => createdPayload,
  };
}

function chargilyHarness(mode: ProjectMode, candidates: ChargilyCustomer[]) {
  let createdPayload: Record<string, unknown> | undefined;
  let createCalls = 0;
  const client = {
    listCustomers: async () => ({ data: candidates }),
    createCustomer: async (payload: Record<string, unknown>) => {
      createCalls += 1;
      createdPayload = payload;
      return { id: "customer_created" };
    },
  };
  const javascript = executableSource(customerSource(mode, "chargily"));
  const createCustomer = new Function(
    "ensureServerOnly",
    "getChargilyClient",
    `${javascript}; return createChargilyCustomer;`,
  )(
    () => undefined,
    () => client,
  ) as (input: CustomerInput, config?: unknown) => Promise<CustomerOutput>;
  return {
    create: (input: CustomerInput) => createCustomer(input),
    createCalls: () => createCalls,
    createdPayload: () => createdPayload,
  };
}

describe("billing customer ownership reconciliation", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} Paddle never lets email override a conflicting stable actor`, async () => {
      const harness = paddleHarness(mode, [
        {
          id: "ctm_other",
          email: "shared@example.test",
          customData: { userId: "actor_other" },
        },
      ]);
      await expect(
        harness.create({ email: "shared@example.test", userId: "actor_current" }),
      ).rejects.toThrow("PADDLE_CUSTOMER_OWNER_CONFLICT");
      expect(harness.createCalls()).toBe(0);
    });

    test(`${mode} Chargily never lets email override a conflicting stable actor`, async () => {
      const harness = chargilyHarness(mode, [
        {
          id: "customer_other",
          email: "shared@example.test",
          metadata: { userId: "actor_other" },
        },
      ]);
      await expect(
        harness.create({ email: "shared@example.test", userId: "actor_current" }),
      ).rejects.toThrow("CHARGILY_CUSTOMER_OWNER_CONFLICT");
      expect(harness.createCalls()).toBe(0);
    });

    for (const provider of ["paddle", "chargily"] as const) {
      test(`${mode} ${provider} fails closed for an email-only legacy customer`, async () => {
        const harness =
          provider === "paddle"
            ? paddleHarness(mode, [{ id: "legacy", email: "legacy@example.test" }])
            : chargilyHarness(mode, [{ id: "legacy", email: "legacy@example.test" }]);
        await expect(
          harness.create({ email: "legacy@example.test", userId: "actor_current" }),
        ).rejects.toThrow("CUSTOMER_OWNER_UNVERIFIED");
        expect(harness.createCalls()).toBe(0);
      });
    }

    test(`${mode} Paddle reuses only the exact actor and emits canonical ownership`, async () => {
      const owned = paddleHarness(mode, [
        {
          id: "ctm_owned",
          email: "owner@example.test",
          customData: { userId: "actor_current" },
        },
      ]);
      await expect(
        owned.create({ email: "owner@example.test", userId: "actor_current" }),
      ).resolves.toEqual({ id: "ctm_owned", providerCustomerId: "ctm_owned" });
      expect(owned.createCalls()).toBe(0);

      const fresh = paddleHarness(mode, []);
      await fresh.create({
        email: "new@example.test",
        metadata: { userId: "attacker_value" },
        userId: " actor_current ",
      });
      expect(fresh.createdPayload()?.customData).toMatchObject({ userId: "actor_current" });
    });

    test(`${mode} Chargily reuses only the exact actor and emits canonical ownership`, async () => {
      const owned = chargilyHarness(mode, [
        {
          id: "customer_owned",
          email: "owner@example.test",
          metadata: { userId: "actor_current" },
        },
      ]);
      await expect(
        owned.create({ email: "owner@example.test", userId: "actor_current" }),
      ).resolves.toEqual({ id: "customer_owned", providerCustomerId: "customer_owned" });
      expect(owned.createCalls()).toBe(0);

      const fresh = chargilyHarness(mode, []);
      await fresh.create({
        email: "new@example.test",
        metadata: { userId: "attacker_value" },
        userId: " actor_current ",
      });
      expect(fresh.createdPayload()?.metadata).toMatchObject({ userId: "actor_current" });
    });
  }
});

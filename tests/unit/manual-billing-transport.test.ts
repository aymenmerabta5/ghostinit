import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { oc } from "@orpc/contract";
import { createRouterClient, implement, ORPCError, type AnyRouter } from "@orpc/server";
import { z } from "zod";
import { apiPackage } from "../../src/templates/api.js";
import { manualBillingTransportContent } from "../../src/templates/api/billing-manual.js";
import { requestApplicationFiles } from "../../src/templates/services/application.js";
import {
  singleApiContractContent,
  singleApiRouterContent,
} from "../../src/templates/modes/single/api/routes.js";
import { singleBillingApiFiles } from "../../src/templates/modes/single/api/billing.js";

function runtime(source: string): string {
  return new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/^export\s+/gm, ""),
  );
}

type Operation = (input?: Record<string, unknown>) => Promise<unknown>;
type ManualClient = Record<
  "submit" | "receipt" | "review" | "summary" | "list" | "reviewQueue",
  Operation
>;
const payment = {
  id: "payment-one",
  ownerId: "owner-one",
  amountMinor: 150_000,
  currency: "DZD",
  status: "pending",
  method: "BaridiMob",
  reference: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  reviewedAt: null,
  reviewerId: null,
  reason: null,
};
const receipt = {
  base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
  mimeType: "image/png",
  originalName: "receipt.png",
};
const submission = {
  amountMinor: 150_000,
  requestKey: "8b8fb3e5-070a-4f29-984b-e2da5576ec85",
  receipt,
};

function client(
  manual: Record<string, unknown>,
  principal: { userId: string; banned: boolean } | null = {
    userId: "authenticated",
    banned: false,
  },
): ManualClient {
  const helper = apiPackage(true).find((entry) => entry.path.endsWith("utils/service-error.ts"))!;
  const createServiceORPCError = new Function(
    "ORPCError",
    `${runtime(helper.content)}; return createServiceORPCError;`,
  )(ORPCError);
  const router = new Function(
    "Buffer",
    "oc",
    "implement",
    "ORPCError",
    "z",
    "createServiceORPCError",
    `${runtime(manualBillingTransportContent())}; return manualBillingProcedures;`,
  )(Buffer, oc, implement, ORPCError, z, createServiceORPCError) as AnyRouter;
  return createRouterClient(router, {
    context: { application: { principal, billing: { manual } } },
  }) as ManualClient;
}

function facade(
  principal: { userId: string; role: string; banned: boolean } | null,
  manualBilling: Record<string, unknown>,
  rateLimit = async () => {},
) {
  const files = requestApplicationFiles(
    "monorepo",
    { admin: false, billing: true, manualBilling: true, identity: false, notifications: false },
    "",
  );
  const errors = files.find((entry) => entry.path.endsWith("/errors.ts"))!;
  const content = files.find((entry) => entry.path.endsWith("/facade.ts"))!;
  const RequestApplicationError = new Function(
    `${runtime(errors.content)}; return RequestApplicationError;`,
  )();
  const create = new Function(
    "RequestApplicationError",
    `${runtime(content.content)}; return createRequestApplication;`,
  )(RequestApplicationError) as (dependencies: Record<string, unknown>) => {
    billing: { manual: ManualClient };
  };
  return create({ principal, billing: {}, manualBilling, rateLimit }).billing.manual;
}

describe("manual billing authenticated transport", () => {
  test("only selected manual billing adds the contract and procedures in either package layout", () => {
    expect(apiPackage(true).some((entry) => entry.path.endsWith("billing/manual.ts"))).toBe(false);
    expect(singleBillingApiFiles().some((entry) => entry.path.endsWith("billing/manual.ts"))).toBe(
      false,
    );
    const generated = apiPackage(true, false, true, false, { manualBilling: true });
    expect(
      generated.find((entry) => entry.path === "packages/api/src/contract.ts")?.content,
    ).toContain("manual: manualBillingContract");
    expect(
      generated.find((entry) => entry.path === "packages/api/src/router.ts")?.content,
    ).toContain("manual: manualBillingProcedures");
    expect(
      singleBillingApiFiles(true).some((entry) => entry.path.endsWith("billing/manual.ts")),
    ).toBe(true);
    expect(singleApiContractContent(true, true, { manualBilling: true })).toContain(
      "manual: manualBillingContract",
    );
    expect(singleApiRouterContent(true, true, { manualBilling: true })).toContain(
      "manual: manualBillingProcedures",
    );
  });

  test("oRPC validates bounded integer amounts, rejects identity injection, and decodes a private receipt", async () => {
    let calls = 0;
    const api = client({
      submit: async (input: { receipt: { data: Uint8Array } }) => {
        calls++;
        expect(input.receipt.data).toEqual(Buffer.from(receipt.base64, "base64"));
        return payment;
      },
    });
    expect(await api.submit(submission)).toEqual(payment);
    for (const input of [
      { ...submission, amountMinor: 1.5 },
      { ...submission, amountMinor: 0 },
      { ...submission, amountMinor: 100_000_001 },
      { ...submission, ownerId: "another-user" },
      { ...submission, receipt: { ...receipt, base64: "AB==" } },
      {
        ...submission,
        receipt: { ...receipt, base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64") },
      },
    ])
      await expect(api.submit(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(calls).toBe(1);
  });

  test("receipts are transported as authenticated bytes without a storage URL", async () => {
    const api = client({
      receipt: async ({ id }: { id: string }) => {
        expect(id).toBe(payment.id);
        return { ...receipt, base64: undefined, data: Buffer.from(receipt.base64, "base64") };
      },
    });
    expect(await api.receipt({ id: payment.id })).toEqual(receipt);
    await expect(api.receipt({ id: payment.id, ownerId: "another-user" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("Node validates a full 5 MiB receipt without regex stack overflow and rejects larger or noncanonical data", () => {
    const node = Bun.which("node");
    if (!node)
      throw new Error("Node is required for manual receipt transport runtime verification");
    const helper = apiPackage(true).find((entry) => entry.path.endsWith("utils/service-error.ts"))!;
    const script = `
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { oc } from "@orpc/contract";
import { implement, createRouterClient, ORPCError } from "@orpc/server";
import { z } from "zod";
const createServiceORPCError = new Function("ORPCError", ${JSON.stringify(`${runtime(helper.content)}; return createServiceORPCError;`)})(ORPCError);
const router = new Function("Buffer", "oc", "implement", "ORPCError", "z", "createServiceORPCError", ${JSON.stringify(`${runtime(manualBillingTransportContent())}; return manualBillingProcedures;`)})(Buffer, oc, implement, ORPCError, z, createServiceORPCError);
const payment = ${JSON.stringify(payment)};
let submissions = 0;
const client = createRouterClient(router, { context: { application: {
  principal: { userId: "owner-one", banned: false }, billing: { manual: {
    submit: async (input) => { submissions++; assert.equal(input.receipt.data.byteLength, 5 * 1024 * 1024); return payment; },
    receipt: async () => ({ data: Buffer.alloc(5 * 1024 * 1024), mimeType: "image/png", originalName: "receipt.png" }),
  } },
} } });
const input = ${JSON.stringify(submission)};
input.receipt.base64 = Buffer.alloc(5 * 1024 * 1024).toString("base64");
assert.deepEqual(await client.submit(input), payment);
assert.equal((await client.receipt({ id: payment.id })).base64, input.receipt.base64);
for (const base64 of [Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"), "AB==", "AAAA===", "AAA"]) {
  await assert.rejects(client.submit({ ...input, receipt: { ...input.receipt, base64 } }), error => error.code === "BAD_REQUEST");
}
assert.equal(submissions, 1);
console.log("NODE_MANUAL_RECEIPT_LIMIT_PASS");
`;
    const result = spawnSync(node, ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout).toContain("NODE_MANUAL_RECEIPT_LIMIT_PASS");
  });

  test("upload decoding requires an active principal and concurrent upload admission is released", async () => {
    let calls = 0;
    const service = {
      submit: async () => {
        calls++;
        return payment;
      },
    };
    await expect(client(service, null).submit(submission)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      client(service, { userId: "suspended", banned: true }).submit(submission),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(calls).toBe(0);
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const api = client({
      submit: async () => {
        started.resolve();
        await finish.promise;
        return payment;
      },
    });
    const first = api.submit(submission);
    await started.promise;
    await expect(api.submit(submission)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    finish.resolve();
    await expect(first).resolves.toEqual(payment);
    await expect(api.submit(submission)).resolves.toEqual(payment);
  });

  test("known domain failures retain safe status and unexpected persistence failures stay private", async () => {
    const denied = client({
      review: async () => {
        throw Object.assign(new Error("Administrator required"), { code: "FORBIDDEN" });
      },
    });
    await expect(denied.review({ id: payment.id, decision: "approved" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const failed = client({
      submit: async () => {
        throw new Error("postgres://private:secret@internal/payments");
      },
    });
    await expect(failed.submit(submission)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Manual payment request failed",
    });
    const codedFailure = client({
      submit: async () => {
        throw Object.assign(new Error("private database details"), { code: "23505" });
      },
    });
    await expect(codedFailure.submit(submission)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Manual payment request failed",
    });
  });

  test("application rejects anonymous, suspended, and non-admin reviewer requests before adapters", async () => {
    let calls = 0;
    const service = Object.fromEntries(
      ["summary", "list", "submit", "reviewQueue", "receipt", "review"].map((name) => [
        name,
        async () => {
          calls++;
          return payment;
        },
      ]),
    );
    for (const actor of [null, { userId: "actor", role: "admin", banned: true }]) {
      const application = facade(actor, service);
      for (const name of ["summary", "list", "submit", "reviewQueue", "receipt", "review"] as const)
        await expect(application[name](submission)).rejects.toBeInstanceOf(Error);
    }
    const application = facade({ userId: "actor", role: "user", banned: false }, service);
    await expect(application.reviewQueue()).rejects.toMatchObject({
      code: "APPLICATION_ADMIN_REQUIRED",
    });
    await expect(
      application.review({ id: payment.id, decision: "approved" }),
    ).rejects.toMatchObject({ code: "APPLICATION_ADMIN_REQUIRED" });
    expect(calls).toBe(0);
  });

  test("application binds authenticated actor and stops submissions when its rate limiter denies", async () => {
    let calls = 0;
    const service = {
      submit: async (actor: unknown) => {
        calls++;
        expect(actor).toEqual({ id: "authenticated", role: "user" });
        return payment;
      },
    };
    const actor = { userId: "authenticated", role: "user", banned: false };
    await facade(actor, service).submit(submission);
    await expect(
      facade(actor, service, async () => {
        throw new Error("limited");
      }).submit(submission),
    ).rejects.toThrow("limited");
    expect(calls).toBe(1);
  });
});

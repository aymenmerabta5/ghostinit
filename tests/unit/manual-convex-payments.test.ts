import { describe, expect, it } from "bun:test";
import { manualConvexHarness } from "./manual-convex-harness.js";
import { convexDatabaseFiles } from "../../src/templates/database/convex.js";

async function paymentId(harness: ReturnType<typeof manualConvexHarness>) {
  const response = await harness.upload();
  expect(response.status).toBe(200);
  return ((await response.json()) as { id: string }).id;
}

describe("emitted Convex manual payment handlers", () => {
  it("keeps receipts private and credits the stored amount once under repeated review", async () => {
    const h = manualConvexHarness();
    const id = await paymentId(h);
    const list = (await h.read("list")) as { items: Array<Record<string, unknown>> };
    expect(list.items[0]).not.toHaveProperty("receiptStorageId");
    h.setActor("other");
    await expect(h.read("receipt", { id })).rejects.toThrow("Receipt not found");
    await expect(h.mutation("review", { id, decision: "approved" })).rejects.toThrow("Admin only");
    h.setActor("admin");
    await Promise.all([
      h.mutation("review", { id, decision: "approved" }),
      h.mutation("review", { id, decision: "approved" }),
    ]);
    expect([...h.rows("manual_credit_ledger").values()]).toHaveLength(1);
    expect([...h.rows("manual_wallets").values()][0]?.balanceMinor).toBe(120_000);
    await expect(
      h.mutation("review", { id, decision: "rejected", reason: "Changed decision" }),
    ).rejects.toThrow("already been reviewed");
    h.rows("users").get("admin")!.role = "user";
    await expect(h.read("receipt", { id })).rejects.toThrow("Receipt not found");
  });

  it("rejects self review, stale bans and missing rejection reasons", async () => {
    const h = manualConvexHarness();
    const id = await paymentId(h);
    h.rows("users").get("user")!.role = "admin";
    await expect(h.mutation("review", { id, decision: "approved" })).rejects.toThrow("own payment");
    h.setActor("admin");
    await expect(h.mutation("review", { id, decision: "rejected", reason: "  " })).rejects.toThrow(
      "reason",
    );
    await h.mutation("review", { id, decision: "rejected", reason: "Receipt is unreadable" });
    expect(h.rows("manual_credit_ledger").size).toBe(0);
    h.setActor("user");
    h.rows("users").get("user")!.banned = true;
    await expect(h.read("list")).rejects.toThrow("banned");
  });

  it("accepts exact retries and rejects edited submissions or reuse of another account's receipt", async () => {
    const h = manualConvexHarness();
    const id = await paymentId(h);
    expect(((await (await h.upload()).json()) as { id: string }).id).toBe(id);
    expect(h.rows("_storage").size).toBe(1);
    expect((await h.upload(undefined, "request_key_000001", 120_001)).status).toBe(409);
    h.setActor("other");
    expect((await h.upload(undefined, "request_key_000002")).status).toBe(409);
    expect(h.rows("manual_payments").size).toBe(1);
  });

  it("validates signatures, streamed byte limits and configured instructions before retaining storage", async () => {
    const h = manualConvexHarness();
    expect((await h.upload(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).status).toBe(400);
    expect((await h.upload(new Uint8Array(5 * 1024 * 1024 + 1))).status).toBe(400);
    h.config.enabled = false;
    expect((await h.upload()).status).toBe(400);
    expect(h.rows("_storage").size).toBe(0);
    h.setActor(null);
    expect((await h.upload()).status).toBe(401);
    h.setActor("user");
    h.rows("users").get("user")!.emailVerified = false;
    expect((await h.upload()).status).toBe(403);
  });

  it("bounds concurrent upload admission before storing receipt bytes", async () => {
    const h = manualConvexHarness();
    for (let n = 0; n < 9; n += 1)
      h.seed("manual_payments", { ownerId: "user", status: "pending", createdAt: n });
    const results = await Promise.all([
      h.upload(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])),
      h.upload(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2]), "request_key_000002"),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(h.rows("manual_payments").size).toBe(10);
    expect(h.rows("_storage").size).toBe(1);
  });

  it("preserves a receipt when finalization committed but its action saw a transport failure", async () => {
    const h = manualConvexHarness();
    const original = h.ctx.runMutation;
    h.ctx.runMutation = async (reference, input) => {
      const result = await original(reference, input);
      if ("receiptStorageId" in input) throw new Error("Lost reply after commit");
      return result;
    };
    expect((await h.upload()).status).toBe(500);
    expect(h.rows("manual_payments").size).toBe(1);
    expect(h.rows("_storage").size).toBe(1);
    expect(h.deleted).toEqual([]);
    h.ctx.runMutation = original;
    expect((await h.upload()).status).toBe(200);
  });

  it("sweeps unbound marked storage and rechecks authorization after receipt I/O", async () => {
    const h = manualConvexHarness();
    const token = "11111111-1111-1111-1111-111111111111";
    const reservation = h.seed("manual_receipt_uploads", {
      ownerId: "user",
      token,
      createdAt: Date.now() - 1000,
      expiresAt: Date.now(),
    });
    const orphan = h.seed("_storage", {
      contentType: "image/png;gi-manual-upload=" + token,
      size: 8,
    });
    await h.mutation("expire", { uploadId: reservation._id, token, cursor: null });
    expect(h.deleted).toContain(orphan._id);
    const id = await paymentId(h);
    const originalGet = h.ctx.storage.get;
    h.ctx.storage.get = async (storageId) => {
      const blob = await originalGet(storageId);
      h.rows("users").get("user")!.banned = true;
      return blob;
    };
    const response = await h.http.downloadReceipt!(
      h.ctx,
      new Request(`https://convex.test/api/manual-payments/receipt?id=${id}`),
    );
    expect(response.status).toBe(403);
  });

  it("deletes a late unattached blob after its reservation expired without touching other tokens", async () => {
    const h = manualConvexHarness();
    const token = "11111111-1111-1111-1111-111111111111";
    const late = h.seed("_storage", {
      contentType: "image/png;gi-manual-upload=" + token,
      size: 8,
    });
    await h.mutation("abandon", { uploadId: "expired-reservation", token, storageId: late._id });
    expect(h.deleted).toContain(late._id);
    const foreign = h.seed("_storage", {
      contentType: "image/png;gi-manual-upload=other-token",
      size: 8,
    });
    await h.mutation("abandon", { uploadId: "expired-reservation", token, storageId: foreign._id });
    expect(h.deleted).not.toContain(foreign._id);
  });

  it("selectively emits the manual schema and native HTTP routes", () => {
    const files = convexDatabaseFiles("demo", "bun", "monorepo", {
      auth: true,
      billing: false,
      manualBilling: true,
    });
    expect(files.find((entry) => entry.path === "convex/schema.ts")?.content).toContain(
      "manual_credit_ledger",
    );
    expect(files.find((entry) => entry.path === "convex/http.ts")?.content).toContain(
      'path: "/api/manual-payments"',
    );
    expect(files.some((entry) => entry.path === "convex/manualPaymentUploads.ts")).toBe(true);
    expect(
      convexDatabaseFiles("demo", "bun", "single", { manualBilling: false }).some((entry) =>
        entry.path.includes("manualPayment"),
      ),
    ).toBe(false);
  });

  it("blocks deletion of owners and reviewers while retaining unrelated account deletion", async () => {
    const h = manualConvexHarness();
    const id = await paymentId(h);
    await expect(h.deleteAccount("user")).rejects.toThrow("retained manual payment records");
    expect(h.rows("users").has("user")).toBe(true);
    h.setActor("admin");
    await h.mutation("review", { id, decision: "approved" });
    await expect(h.deleteAccount("admin")).rejects.toThrow("retained manual payment records");
    await h.deleteAccount("other");
    expect(h.rows("users").has("other")).toBe(false);
  });
});

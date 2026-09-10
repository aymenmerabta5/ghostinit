/** Fixture-only initialization: none of these administrative probes ship in generated projects. */
export function convexManualRuntimeProbeSource(): string {
  return `import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { components } from "./_generated/api";
import { assertManualPaymentDeletionAllowed } from "./manualPaymentRetention";

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identities = [];
    const now = Date.now();
    for (const name of ["owner", "other", "admin"] as const) {
      const authUser: { _id: string } = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: { model: "user", data: { name, email: name + "@manual-proof.invalid", emailVerified: true, createdAt: now, updatedAt: now } },
      });
      const session: { _id: string } = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: { model: "session", data: { userId: authUser._id, token: crypto.randomUUID(), expiresAt: now + 3_600_000, createdAt: now, updatedAt: now } },
      });
      const userId = await ctx.db.insert("users", { authId: authUser._id, name, email: name + "@manual-proof.invalid", emailVerified: true, role: name === "admin" ? "admin" : "user", banned: false, createdAt: now, updatedAt: now });
      await ctx.db.insert("identitySessions", { authSessionId: session._id, userId, authenticatedAt: now, expiresAt: now + 3_600_000, createdAt: now, updatedAt: now });
      identities.push({ name, userId, subject: authUser._id, sessionId: session._id });
    }
    return identities;
  },
});

export const actorState = internalMutation({
  args: { id: v.id("users"), role: v.optional(v.union(v.literal("user"), v.literal("admin"))), banned: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (args.role !== undefined) await ctx.db.patch(args.id, { role: args.role });
    if (args.banned !== undefined) await ctx.db.patch(args.id, { banned: args.banned });
  },
});

export const deleteActor = internalMutation({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => {
    await assertManualPaymentDeletionAllowed(ctx, id);
    await ctx.db.delete(id);
  },
});

export const inspect = internalQuery({
  args: {},
  handler: async (ctx) => ({
    ledger: await ctx.db.query("manual_credit_ledger").collect(),
    wallets: await ctx.db.query("manual_wallets").collect(),
    payments: await ctx.db.query("manual_payments").collect(),
    uploads: await ctx.db.query("manual_receipt_uploads").collect(),
  }),
});
`;
}

export function convexManualRuntimeScriptSource(): string {
  return `import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { ConvexHttpClient } from "convex/browser";
import { api, internal } from "./convex/_generated/api.js";

const deployment = JSON.parse(await readFile(".convex/local/default/config.json", "utf8"));
const cloud = "http://127.0.0.1:" + deployment.ports.cloud;
const site = "http://127.0.0.1:" + deployment.ports.site;
const admin = new ConvexHttpClient(cloud, { logger: false });
admin.setAdminAuth(deployment.adminKey);
const actors = await admin.mutation(internal.manualRuntimeProbe.seed, {});
function actor(name: string) { const value = actors.find((entry) => entry.name === name); assert.ok(value); return value; }
function identity(name: string) { const user = actor(name); return { subject: user.subject, sessionId: user.sessionId, issuer: "https://fixture.invalid" }; }
function client(name: string) { const value = new ConvexHttpClient(cloud, { logger: false }); value.setAdminAuth(deployment.adminKey, identity(name)); return value; }
function authorization(name: string) { return "Convex " + deployment.adminKey + ":" + Buffer.from(JSON.stringify(identity(name))).toString("base64"); }
const owner = client("owner");
const reviewer = client("admin");
const receipt = new Uint8Array([137,80,78,71,13,10,26,10,42]);
const key = crypto.randomUUID();
const uploadUrl = new URL("/api/manual-payments", site);
uploadUrl.search = new URLSearchParams({ amountMinor: "125000", requestKey: key, originalName: "proof.png", method: "BaridiMob" }).toString();
async function upload(name = "owner", url = uploadUrl, bytes = receipt) {
  return await fetch(url, { method: "POST", headers: { Authorization: authorization(name), "Content-Type": "image/png" }, body: bytes, signal: AbortSignal.timeout(20_000) });
}
const initial = await upload();
assert.equal(initial.status, 200, "Authenticated native HTTP upload must succeed: " + await initial.clone().text());
const payment = await initial.json();
assert.equal(payment.amountMinor, 125000);
assert.equal(payment.status, "pending");
assert.equal("receiptStorageId" in payment, false);
const replay = await upload();
assert.equal(replay.status, 200);
assert.equal((await replay.json()).id, payment.id);
const alteredUrl = new URL(uploadUrl);
alteredUrl.searchParams.set("amountMinor", "126000");
assert.equal((await upload("owner", alteredUrl)).status, 409);
assert.equal((await upload("other")).status, 409);
const receiptUrl = new URL("/api/manual-payments/receipt", site);
receiptUrl.searchParams.set("id", payment.id);
async function download(name?: string) { return await fetch(receiptUrl, { headers: name ? {Authorization: authorization(name)} : {}, signal: AbortSignal.timeout(20_000) }); }
assert.equal((await download()).status, 401);
assert.equal((await download("other")).status, 404);
const ownReceipt = await download("owner");
assert.equal(ownReceipt.status, 200);
assert.deepEqual(new Uint8Array(await ownReceipt.arrayBuffer()), receipt);
assert.equal(ownReceipt.headers.get("cache-control"), "private, no-store");
assert.match(ownReceipt.headers.get("content-disposition") ?? "", /attachment/);
await assert.rejects(() => owner.mutation(api.manualPayments.review, { id: payment.id, decision: "approved" }));
await admin.mutation(internal.manualRuntimeProbe.actorState, { id: actor("owner").userId, role: "admin" });
await assert.rejects(() => owner.mutation(api.manualPayments.review, { id: payment.id, decision: "approved" }));
await admin.mutation(internal.manualRuntimeProbe.actorState, { id: actor("owner").userId, role: "user" });
const concurrentReviewers = Array.from({ length: 5 }, () => client("admin"));
await Promise.all(concurrentReviewers.map(value => value.mutation(api.manualPayments.review, { id: payment.id, decision: "approved" })));
const state = await admin.query(internal.manualRuntimeProbe.inspect, {});
assert.equal(state.ledger.length, 1);
assert.equal(state.wallets.length, 1);
assert.equal(state.wallets[0].balanceMinor, 125000);
assert.equal(state.payments.length, 1);
assert.equal(state.uploads.length, 0);
assert.equal((await owner.query(api.manualPayments.summary, {})).balanceMinor, 125000);
await assert.rejects(() => reviewer.mutation(api.manualPayments.review, { id: payment.id, decision: "rejected", reason: "Cannot change reviewed payment" }));
await assert.rejects(() => admin.mutation(internal.manualRuntimeProbe.deleteActor, { id: actor("owner").userId }));
await assert.rejects(() => admin.mutation(internal.manualRuntimeProbe.deleteActor, { id: actor("admin").userId }));
await admin.mutation(internal.manualRuntimeProbe.actorState, { id: actor("owner").userId, banned: true });
assert.equal((await download("owner")).status, 403);
await admin.mutation(internal.manualRuntimeProbe.actorState, { id: actor("admin").userId, role: "user" });
assert.equal((await download("admin")).status, 404);
console.log(JSON.stringify({ proof: "convex-manual-native-http-and-atomic-credit", authenticatedFixtureIdentities: true, receiptBytes: receipt.byteLength, concurrentApprovalRequests: 5, ledgerCredits: state.ledger.length, creditedMinor: state.wallets[0].balanceMinor, privateDownload: true, currentRoleAndBan: true, deletionRetention: true }));
`;
}

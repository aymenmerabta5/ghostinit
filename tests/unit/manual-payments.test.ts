import { expect, test } from "bun:test";
import { manualSubmitInput, testManualService } from "../helpers/manual-payments-harness.js";

function fixture() {
  let submissions = 0;
  const roles = new Map([
    ["member", "user"],
    ["admin", "admin"],
    ["super", "superAdmin"],
  ]);
  const repository = {
    async requireActor(id: string) {
      const role = roles.get(id);
      if (!role) throw new Error("missing active identity");
      return { id, role };
    },
    async submit() {
      submissions += 1;
      return { id: "payment" };
    },
    async reviewQueue() {
      return [];
    },
    async review() {
      return { id: "payment" };
    },
    async balance() {
      return 0;
    },
  };
  return {
    service: testManualService(repository),
    repository,
    roles,
    submissions: () => submissions,
  };
}

test("emitted manual service rejects forged roles and rechecks fresh identity", async () => {
  const { service, roles } = fixture();
  await expect(service.reviewQueue({ id: "member", role: "admin" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(service.reviewQueue({ id: "admin" })).resolves.toEqual({ items: [] });
  await expect(service.reviewQueue({ id: "super" })).resolves.toEqual({ items: [] });
  roles.set("admin", "user");
  await expect(
    service.review({ id: "admin", role: "admin" }, { id: "payment", decision: "approved" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(service.summary({ id: "" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});

test("emitted manual service validates money, receipt contents, submission keys and methods before persistence", async () => {
  const { service, submissions } = fixture();
  for (const amountMinor of [
    0,
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    100_000_001,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await expect(
      service.submit({ id: "member" }, { ...manualSubmitInput(), amountMinor }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  }
  for (const change of [
    { requestKey: "short" },
    { method: "arbitrary" },
    { reference: "x".repeat(161) },
    { receipt: { ...manualSubmitInput().receipt, mimeType: "application/pdf" } },
    { receipt: { ...manualSubmitInput().receipt, originalName: "../receipt.png" } },
    { receipt: { ...manualSubmitInput().receipt, data: new Uint8Array(5 * 1024 * 1024 + 1) } },
  ]) {
    await expect(
      service.submit({ id: "member" }, { ...manualSubmitInput(), ...change }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  }
  expect(submissions()).toBe(0);
  await expect(service.submit({ id: "member" }, manualSubmitInput())).resolves.toMatchObject({
    id: "payment",
  });
  expect(submissions()).toBe(1);
});

test("emitted manual service requires setup and an explanation for rejection", async () => {
  const { service, repository } = fixture();
  await expect(
    testManualService(repository, false).submit({ id: "member" }, manualSubmitInput()),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  for (const reason of [undefined, "  ", "x".repeat(501)]) {
    await expect(
      service.review({ id: "admin" }, { id: "payment", decision: "rejected", reason }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  }
});

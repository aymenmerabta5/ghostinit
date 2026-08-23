import { expect, test } from "bun:test";
import { mappedServiceError, suspendedError } from "../src/orpc-error-contract.js";

test("ORPCError 1.14.7 preserves structured code and meta data", () => {
  expect(suspendedError.message).toBe("Forbidden");
  expect(suspendedError.data).toEqual({
    code: "ACCOUNT_SUSPENDED",
    meta: { reason: "banned" },
  });
});

test("service error mapping preserves typed code and meta", () => {
  expect(mappedServiceError.data).toEqual({
    code: "ACCOUNT_SUSPENDED",
    meta: { reason: "policy" },
  });
});

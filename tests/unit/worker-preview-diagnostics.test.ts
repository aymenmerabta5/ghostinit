import { expect, test } from "bun:test";
import { workerPreviewFailureDetail } from "../../scripts/test-generated.js";

test("Worker failure diagnostics retain nested causes and redact streamed private values", () => {
  const secret = "test-preview-secret/a+b=with spaces";
  const nested = new Error(`Discovery failed: ${secret}`);
  const error = new AggregateError(
    [new Error("Unexpected preview exit"), new Error("Cleanup failed", { cause: nested })],
    "Worker preview cleanup was unverified",
  );
  const result = workerPreviewFailureDetail(
    error,
    [
      `\u001b[31mWrangler startup failed\u001b[0m: ${secret}`,
      encodeURIComponent(secret),
      Buffer.from(secret).toString("base64"),
      "https://proxy-user:proxy-password@127.0.0.1:9000?token=private-query-token",
    ].join("\n"),
    [secret],
  );
  for (const privateValue of [
    secret,
    encodeURIComponent(secret),
    Buffer.from(secret).toString("base64"),
    "proxy-user",
    "proxy-password",
    "private-query-token",
  ]) {
    expect(result).not.toContain(privateValue);
  }
  expect(result).toContain("Worker preview cleanup was unverified");
  expect(result).toContain("Unexpected preview exit");
  expect(result).toContain("Discovery failed");
  expect(result).toContain("Wrangler startup failed");
  expect(result).not.toContain("\u001b");
});

test("Worker diagnostic tails stay bounded without losing the primary failure or recursing forever", () => {
  const error = new Error("Primary Worker failure");
  error.cause = error;
  const secret = "boundary-secret-value";
  const result = workerPreviewFailureDetail(
    error,
    `${"output\n".repeat(100_000)}${secret}\nFinal diagnostic`,
    [secret],
  );
  expect(result.length).toBeLessThanOrEqual(16_384);
  expect(result).toStartWith("Primary Worker failure");
  expect(result).toEndWith("Final diagnostic");
  expect(result).not.toContain(secret);
});

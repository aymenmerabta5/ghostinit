import { describe, it, expect } from "bun:test";
import { looksLikeSecret, redact, Logger } from "../../src/lib/logger";

describe("logger redaction", () => {
  it("detects secret-like keys via substring matching", () => {
    expect(looksLikeSecret("secret")).toBe(true);
    expect(looksLikeSecret("authToken")).toBe(true);
    expect(looksLikeSecret("refresh_token")).toBe(true);
    expect(looksLikeSecret("password")).toBe(true);
    expect(looksLikeSecret("apiKey")).toBe(true);
    expect(looksLikeSecret("bearer")).toBe(true);
    expect(looksLikeSecret("cookie")).toBe(true);
    expect(looksLikeSecret("credential")).toBe(true);
    expect(looksLikeSecret("accessKey")).toBe(true);
  });

  it("redacts secret-like values", () => {
    expect(redact("abc123-def456-ghi789", "secret")).toBe("***");
    expect(redact("abc123-def456-ghi789", "password")).toBe("***");
  });

  it("redacts URL query tokens and credentials", () => {
    const url = "https://user:pass@example.com/api?token=abc&secret=def&other=ok";
    const result = redact(url, "url");
    expect(result).not.toContain("abc");
    expect(result).not.toContain("def");
    expect(result).not.toContain("pass");
    expect(result).toContain("other=ok");
  });

  it("does not redact non-secret values", () => {
    expect(redact("hello", "message")).toBe("hello");
    expect(redact("http://example.com?foo=bar", "url")).toBe("http://example.com?foo=bar");
  });

  it("redacts nested objects recursively", () => {
    const result = redact(
      { user: "alice", secret: "shh", nested: { password: "pw" } },
      "root",
    ) as Record<string, unknown>;
    expect(result.user).toBe("alice");
    expect(result.secret).toBe("***");
    expect((result.nested as Record<string, unknown>).password).toBe("***");
  });

  it("Logger output does not leak secret values", () => {
    const lines: string[] = [];
    const logger = new Logger({
      out: (chunk: string) => {
        lines.push(chunk);
        return true;
      },
    });
    logger.info("test", { secret: "leak", url: "https://x:y@host?token=z" });
    const output = lines.join("");
    expect(output).not.toContain("leak");
    expect(output).not.toContain("token=z");
    expect(output).toContain('"secret":"***"');
  });

  // Key-based redaction alone misses a credential carried under a benign key or
  // interpolated into the message — which is how provider error text leaks.
  it("redacts secret-SHAPED values even under a harmless key", () => {
    const result = redact({ note: "using sk_live_abcdef1234567890 now" }) as Record<
      string,
      unknown
    >;
    expect(result.note).not.toContain("sk_live_abcdef1234567890");
    expect(result.note).toContain("***");
  });

  it("redacts credentials embedded in a connection string", () => {
    const result = redact({ dsn: "postgres://admin:hunter2@db.internal:5432/app" }) as Record<
      string,
      unknown
    >;
    expect(result.dsn).not.toContain("hunter2");
  });

  it("redacts secrets interpolated into the log MESSAGE, not just meta", () => {
    const lines: string[] = [];
    const logger = new Logger({
      out: (chunk: string) => {
        lines.push(chunk);
        return true;
      },
    });
    logger.error("stripe rejected key sk_test_9f8e7d6c5b4a3210 during checkout");
    const output = lines.join("");
    expect(output).not.toContain("sk_test_9f8e7d6c5b4a3210");
    expect(output).toContain("***");
  });

  it("does not infinitely recurse on circular structures", () => {
    const circular: Record<string, unknown> = { name: "root" };
    circular.self = circular;
    const result = redact(circular) as Record<string, unknown>;
    expect(result.name).toBe("root");
    expect(result.self).toBe("[Circular]");
  });
});

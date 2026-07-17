import { describe, it, expect } from "bun:test";
import { secret } from "../../src/templates/shared";

describe("shared template helpers", () => {
  it("secret() generates a base64url-safe printable string of at least 32 chars", () => {
    for (let i = 0; i < 10; i++) {
      const value = secret();
      expect(value.length).toBeGreaterThanOrEqual(32);
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

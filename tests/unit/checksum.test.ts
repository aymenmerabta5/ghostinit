import { describe, it, expect } from "bun:test";
import { hashContent, relativeChecksum, checksumRegistry } from "../../src/lib/checksum";

describe("checksum", () => {
  it("hashes content deterministically", () => {
    const a = hashContent("hello");
    const b = hashContent("hello");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("creates relative checksum entries", () => {
    const entry = relativeChecksum("/tmp", "package.json", "{}");
    expect(entry.path).toBe("package.json");
    expect(entry.algorithm).toBe("sha256");
    expect(entry.hash).toBe(hashContent("{}"));
  });

  it("builds a registry keyed by path", () => {
    const entries = [relativeChecksum("/tmp", "a", "a"), relativeChecksum("/tmp", "b", "b")];
    const registry = checksumRegistry(entries);
    expect(Object.keys(registry)).toEqual(["a", "b"]);
  });
});

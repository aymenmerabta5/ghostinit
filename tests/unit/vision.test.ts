import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PACKED_MANIFEST_FILES } from "../../scripts/package-contract.js";

const root = resolve(import.meta.dir, "../..");
const vision = readFileSync(resolve(root, "VISION.md"), "utf8");

test("the published vision keeps GhostInit infrastructure-focused and tool-neutral", () => {
  expect(PACKED_MANIFEST_FILES).toContain("VISION.md");
  expect(vision).toContain("opinionated project infrastructure");
  expect(vision).toContain("internal architecture compiler");
  expect(vision).toMatch(/not an agentic\s+system/);
  expect(vision).toContain("React Server Components are the default");
  expect(vision).toContain("never an oRPC transport caller");
  expect(vision).toContain("Route loaders are treated as isomorphic code");
  expect(vision).toContain("One Logical Application API");
  expect(vision).toContain("minimum release age of seven days");
});

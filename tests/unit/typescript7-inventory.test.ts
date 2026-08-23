import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

test("TypeScript 7.0.2 obligations are enumerated and point to real sources", () => {
  const evidence = JSON.parse(
    readFileSync(resolve(root, "evidence/toolchain/typescript-7.0.2.json"), "utf8"),
  ) as {
    compiler: string;
    entries: Array<{
      id: string;
      sources: string[];
      phase: string;
      disposition: "proven" | "migration-required" | "proof-required";
      replacement: string;
    }>;
  };
  expect(evidence.compiler).toBe("typescript@7.0.2");
  expect(evidence.entries.map(({ id }) => id)).toEqual([
    "host-compiler",
    "automation-scripts",
    "generated-lint-compiler-api",
    "next-typescript-cli",
    "doctor-typescript-version",
    "desktop-base-url",
  ]);
  for (const entry of evidence.entries) {
    expect(entry.sources.length).toBeGreaterThan(0);
    expect(entry.replacement.length).toBeGreaterThan(10);
    for (const source of entry.sources) expect(existsSync(resolve(root, source))).toBe(true);
  }
  const scriptSources = evidence.entries.find(({ id }) => id === "automation-scripts")?.sources;
  const actualScripts = readdirSync(resolve(root, "scripts"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `scripts/${name}`)
    .toSorted();
  expect(scriptSources?.toSorted()).toEqual(actualScripts);

  const reliancePatterns = [
    /require\(["']typescript["']\)/,
    /runCommand\(["']bunx["'],\s*\[["']tsc["']/,
    /cmd:\s*\[["']bunx["'],\s*["']tsc["']/,
    /baseUrl:\s*["']\.["']/,
  ];
  const roots = ["src", "scripts", "tooling", "packages"];
  const matched = new Set<string>();
  const visit = (relative: string): void => {
    const absolute = resolve(root, relative);
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory() && !["node_modules", "dist", ".git"].includes(entry.name))
        visit(child);
      else if (/\.(?:ts|tsx|js|json)$/.test(entry.name)) {
        const content = readFileSync(resolve(root, child), "utf8");
        if (reliancePatterns.some((pattern) => pattern.test(content))) matched.add(child);
      }
    }
  };
  roots.forEach(visit);
  const covered = new Set(evidence.entries.flatMap(({ sources }) => sources));
  expect([...matched].filter((source) => !covered.has(source))).toEqual([]);
});

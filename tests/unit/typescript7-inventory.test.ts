import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

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
  expect(
    evidence.entries.map(({ id, sources, phase, disposition }) => ({
      id,
      sources,
      phase,
      disposition,
    })),
  ).toEqual([
    {
      id: "host-compiler",
      sources: ["package.json", "tooling/typescript-config/base.json"],
      phase: "1A",
      disposition: "proven",
    },
    {
      id: "automation-scripts",
      sources: [
        "scripts/build.ts",
        "scripts/check-capability-evidence.ts",
        "scripts/check-lock-release-age.ts",
        "scripts/check-versions.ts",
        "scripts/embed-template-sources.ts",
        "scripts/external-readiness-harness.ts",
        "scripts/external-readiness-http.ts",
        "scripts/external-readiness.ts",
        "scripts/lock-age-policy.ts",
        "scripts/package-contract.ts",
        "scripts/release-artifact.ts",
        "scripts/sync-turbo-env.ts",
        "scripts/test-fixtures.ts",
        "scripts/test-generated.ts",
        "scripts/verify-generated-env.ts",
        "scripts/worker-preview-readiness.ts",
      ],
      phase: "1A",
      disposition: "proven",
    },
    {
      id: "generated-lint-compiler-api",
      sources: ["src/templates/tooling/lint-scripts.ts"],
      phase: "3",
      disposition: "proven",
    },
    {
      id: "next-typescript-cli",
      sources: [
        "packages/versions/src/index.ts",
        "src/templates/apps/core.ts",
        "src/templates/modes/single/package.ts",
      ],
      phase: "3",
      disposition: "proof-required",
    },
    {
      id: "generated-typescript-cli",
      sources: [
        "packages/versions/src/index.ts",
        "src/templates/root/package.ts",
        "src/templates/apps/tanstack-core.ts",
        "src/templates/apps/expo-core.ts",
        "src/templates/apps/desktop/package.ts",
        "src/templates/eve/package.ts",
        "src/templates/database/convex.ts",
        "src/templates/database/convex/config.ts",
        "tests/integration/convex-codegen-runtime.test.ts",
        "src/templates/modes/single/package.ts",
      ],
      phase: "3",
      disposition: "proof-required",
    },
    {
      id: "doctor-typescript-version",
      sources: [
        "src/commands/doctor/versions.ts",
        "src/templates/modes/monorepo/agents-composer.ts",
      ],
      phase: "2",
      disposition: "proven",
    },
    {
      id: "desktop-base-url",
      sources: [
        "src/templates/apps/desktop/tooling.ts",
        "src/templates/modes/single/composers/desktop.ts",
      ],
      phase: "6",
      disposition: "proof-required",
    },
  ]);
  for (const entry of evidence.entries) {
    expect(entry.sources.length).toBeGreaterThan(0);
    expect(entry.replacement.length).toBeGreaterThan(10);
    for (const source of entry.sources) expect(existsSync(resolve(root, source))).toBe(true);
  }
  const scriptSources = evidence.entries.find(({ id }) => id === "automation-scripts")?.sources;
  const listScriptSources = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) return listScriptSources(absolute);
      return entry.isFile() && entry.name.endsWith(".ts")
        ? [relative(root, absolute).replaceAll("\\", "/")]
        : [];
    });
  const actualScripts = listScriptSources(resolve(root, "scripts")).toSorted();
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

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

test("automation scripts are checked without an invalid project reference", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const rootConfig = JSON.parse(
    readFileSync(resolve(root, "tsconfig.json"), "utf8").replace(/^\uFEFF/, ""),
  ) as {
    references: Array<{ path: string }>;
  };
  const scriptConfig = JSON.parse(readFileSync(resolve(root, "tsconfig.scripts.json"), "utf8")) as {
    include: string[];
    compilerOptions: {
      noEmit: boolean;
      composite: boolean;
      allowImportingTsExtensions: boolean;
    };
  };
  expect(pkg.scripts["typecheck:scripts"]).toBe(
    "bunx --no-install tsc -p tsconfig.scripts.json --noEmit",
  );
  expect(pkg.scripts.typecheck).toBe("bunx --no-install tsc -b && bun run typecheck:scripts");
  expect(rootConfig.references).not.toContainEqual({ path: "./tsconfig.scripts.json" });
  expect(scriptConfig).toMatchObject({
    include: ["scripts/**/*.ts"],
    compilerOptions: { noEmit: true, composite: false, allowImportingTsExtensions: true },
  });

  const buildScript = readFileSync(resolve(root, "scripts/build.ts"), "utf8");
  expect(buildScript).not.toContain("as any");
  expect(buildScript).not.toContain('["bunx", "tsc"');
  expect(buildScript).toContain('join(REPO_ROOT, "node_modules/typescript/bin/tsc")');
});

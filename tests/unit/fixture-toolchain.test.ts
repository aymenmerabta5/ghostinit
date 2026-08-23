import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const fixtures = ["drizzle-betterauth-orpc", "next-tailwind-biome", "expo-uniwind-rnr"] as const;

describe("committed compatibility fixture toolchains", () => {
  for (const fixture of fixtures) {
    test(`${fixture} uses Bun 1.4.0, TypeScript 7.0.2, and a matching lock root`, () => {
      const directory = resolve(root, "tests/fixtures/compatibility", fixture);
      const pkg = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")) as {
        name: string;
        packageManager?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const lock = Bun.JSONC.parse(readFileSync(resolve(directory, "bun.lock"), "utf8")) as {
        workspaces: {
          "": {
            name: string;
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
          };
        };
        packages: Record<string, unknown>;
      };
      expect(pkg.packageManager).toBe("bun@1.4.0");
      expect(pkg.devDependencies?.typescript).toBe("7.0.2");
      expect(pkg.devDependencies?.["@typescript/native-preview"]).toBeUndefined();
      if (fixture === "drizzle-betterauth-orpc") {
        expect(pkg.dependencies?.["bun-types"]).toBe("1.4.0");
        expect(lock.workspaces[""].dependencies?.["bun-types"]).toBe("1.4.0");
      }
      if (fixture === "next-tailwind-biome") {
        const previewPackages = Object.keys(lock.packages).filter(
          (packageName) =>
            packageName === "@typescript/native-preview" ||
            packageName.startsWith("@typescript/native-preview-"),
        );
        expect(previewPackages).toEqual([]);
      }
      expect(lock.workspaces[""].name).toBe(pkg.name);
      expect(lock.workspaces[""].dependencies ?? {}).toEqual(pkg.dependencies ?? {});
      expect(lock.workspaces[""].devDependencies ?? {}).toEqual(pkg.devDependencies ?? {});
    });
  }
});

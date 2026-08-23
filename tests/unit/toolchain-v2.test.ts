import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

describe("exact V2 host toolchain", () => {
  test("pins package manager, compiler, and Bun types", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      packageManager: string;
      engines: { bun: string };
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.packageManager).toBe("bun@1.4.0");
    expect(pkg.engines.bun).toBe("1.4.0");
    expect(pkg.devDependencies.typescript).toBe("7.0.2");
    expect(pkg.devDependencies["@types/bun"]).toBe("1.4.0");
    for (const spec of [
      ...Object.values(pkg.dependencies),
      ...Object.values(pkg.devDependencies),
    ]) {
      expect(spec).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  test("declares the host Chargily Pay import at its exact version", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@chargily/chargily-pay"]).toBe("2.1.0");
  });

  test("uses strict isolated installs and supported lockfile configuration", () => {
    const bunfig = readFileSync(resolve(root, "bunfig.toml"), "utf8");
    const tsconfig = JSON.parse(
      readFileSync(resolve(root, "tooling/typescript-config/base.json"), "utf8"),
    ) as { compilerOptions: { types: string[] } };
    expect(bunfig).toContain('linker = "isolated"');
    expect(bunfig).toContain("hoist = false");
    expect(bunfig).toContain("frozenLockfile = true");
    expect(bunfig).not.toContain("[install.lockfile]");
    expect(tsconfig.compilerOptions.types).toEqual(["bun"]);
  });

  test("corrects the nonexistent Expo updates pin", async () => {
    const versions = await import("../../packages/versions/src/index.js");
    expect(versions.expo["expo-updates"]).toBe("29.0.13");
  });
});

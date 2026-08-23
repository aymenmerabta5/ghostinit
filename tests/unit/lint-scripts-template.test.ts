import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  singlePackageJson,
  singlePackageJsonExpo,
  singlePackageJsonTanstack,
} from "../../src/templates/modes/single/package.js";
import { rootPackageJson } from "../../src/templates/root/package.js";
import { lintScriptFiles } from "../../src/templates/tooling/lint-scripts.js";

const root = resolve(import.meta.dir, "../..");
const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(): { directory: string; scripts: string[] } {
  const directory = mkdtempSync(resolve(root, ".generated-lint-test-"));
  temporary.push(directory);
  const scripts = lintScriptFiles().map((template) => {
    const target = resolve(directory, template.path);
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, template.content);
    return target;
  });
  return { directory, scripts };
}

function runScript(directory: string, name: string): { exitCode: number; output: string } {
  const result = spawnSync("node", [resolve(directory, `scripts/${name}`)], {
    cwd: directory,
    encoding: "utf8",
  });
  return {
    exitCode: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function devDependencies(content: string): Record<string, string> {
  const manifest = JSON.parse(content) as { devDependencies: Record<string, string> };
  return manifest.devDependencies;
}

describe("emitted lint scripts", () => {
  test("emits the existing seven checks and the shared OXC helper", () => {
    expect(lintScriptFiles().map((template) => template.path)).toEqual([
      "scripts/check-feature-folder.cjs",
      "scripts/check-server-only.cjs",
      "scripts/check-import-aliases.cjs",
      "scripts/check-next-parity.cjs",
      "scripts/check-navigation-imports.cjs",
      "scripts/check-rtl-logical.cjs",
      "scripts/check-animation-imports.cjs",
      "scripts/lib/oxc.cjs",
    ]);
  });

  test("all generated roots declare the exact existing OXC parser pin", () => {
    const monorepo = devDependencies(rootPackageJson("demo", "bun").content);
    const singleNext = devDependencies(singlePackageJson("demo", "bun", [], false, false));
    const singleTanstack = devDependencies(
      singlePackageJsonTanstack("demo", "bun", [], false, false),
    );
    const singleExpo = devDependencies(singlePackageJsonExpo("demo", "bun", [], false, false));

    expect(monorepo["oxc-parser"]).toBe("0.139.0");
    expect(singleNext["oxc-parser"]).toBe("0.139.0");
    expect(singleTanstack["oxc-parser"]).toBe("0.139.0");
    expect(singleExpo["oxc-parser"]).toBe("0.139.0");
  });

  test("the emitted CJS is oxlint-clean", () => {
    const { scripts } = fixture();
    const result = Bun.spawnSync(["bunx", "--no-install", "oxlint", "--deny-warnings", ...scripts]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  });

  test("RTL tokens inside template literals are still detected", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/components"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/components/bad.tsx"),
      "export const Bad = () => <div className={`text-left`} />;\n",
    );

    const result = runScript(directory, "check-rtl-logical.cjs");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("RTL violations");
    expect(result.output).toContain("bad.tsx:1");
  });

  test("Next parity still rejects a raw image at its real source position", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/app/page.tsx"),
      "export default function Page(){\n  return (\n    <img src='/avatar.png' alt='Avatar' />\n  );\n}\n",
    );

    const result = runScript(directory, "check-next-parity.cjs");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Next parity violations");
    expect(result.output).toContain("Use next/image <Image> instead of <img>");
    expect(result.output).toContain("src/app/page.tsx:3:5");
  });

  test("framework-native navigation passes when i18n routing is absent", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app/demo"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/app/demo/page.tsx"),
      'import Link from "next/link"; import { useRouter } from "next/navigation"; export default function Page(){ const router=useRouter(); return <Link href="/" onClick={()=>router.refresh()}>Home</Link>; }\n',
    );

    const navigation = runScript(directory, "check-navigation-imports.cjs");
    expect(navigation.exitCode).toBe(0);
  });

  test("i18n routing rejects framework-native imports with the existing remedies", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app/demo"), { recursive: true });
    mkdirSync(resolve(directory, "src/i18n"), { recursive: true });
    mkdirSync(resolve(directory, "src/lib"), { recursive: true });
    writeFileSync(resolve(directory, "src/i18n/routing.ts"), "export const Link = 1;\n");
    writeFileSync(resolve(directory, "src/lib/value.ts"), "export const value = 1;\n");
    writeFileSync(
      resolve(directory, "src/app/demo/page.tsx"),
      'import Link from "next/link"; import { useRouter } from "next/navigation"; import { value } from "../../lib/value"; export default () => <Link href="/">{value}</Link>;\n',
    );

    const navigation = runScript(directory, "check-navigation-imports.cjs");
    expect(navigation.exitCode).toBe(1);
    expect(navigation.output).toContain("Navigation import violations");
    expect(navigation.output).toContain('Import from "next/link". Use "@/i18n/routing" instead');
    expect(navigation.output).toContain(
      'Import "useRouter" from "next/navigation" should come from "@/i18n/routing"',
    );
    const aliases = runScript(directory, "check-import-aliases.cjs");
    expect(aliases.exitCode).toBe(1);
    expect(aliases.output).toContain("Relative imports forbidden");
  });

  test("Next parity chooses its internal-anchor remedy from capability state", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/app/page.tsx"),
      'export default function Page(){ return <a href="/settings">Settings</a>; }\n',
    );

    const native = runScript(directory, "check-next-parity.cjs");
    expect(native.exitCode).toBe(1);
    expect(native.output).toContain('Use next/link instead of <a href="/settings">');
    mkdirSync(resolve(directory, "src/i18n"), { recursive: true });
    writeFileSync(resolve(directory, "src/i18n/routing.ts"), "export const Link = 1;\n");
    const localized = runScript(directory, "check-next-parity.cjs");
    expect(localized.exitCode).toBe(1);
    expect(localized.output).toContain('Use "@/i18n/routing" instead of <a href="/settings">');
  });

  test("Next parity rejects internal anchors expressed as no-substitution templates", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/app/page.tsx"),
      "export default function Page(){ return <a href={`/settings`}>Settings</a>; }\n",
    );

    const result = runScript(directory, "check-next-parity.cjs");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Use next/link instead of <a href="/settings">');
  });

  test("alias checks cover static imports, re-exports, dynamic imports, and require", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/references.ts"),
      [
        'import "./static";',
        'export * from "./all";',
        'export { value } from "./named";',
        'void import("./dynamic");',
        'require("./required");',
      ].join("\n"),
    );

    const result = runScript(directory, "check-import-aliases.cjs");
    expect(result.exitCode).toBe(1);
    for (const [line, column] of [
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 6],
      [5, 1],
    ]) {
      expect(result.output).toContain(`src/references.ts:${line}:${column}`);
    }
  });

  test("parser diagnostics fail closed with the source path for every AST check", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app"), { recursive: true });
    writeFileSync(resolve(directory, "src/app/page.tsx"), "export default function Page( {\n");

    for (const script of [
      "check-import-aliases.cjs",
      "check-next-parity.cjs",
      "check-navigation-imports.cjs",
    ]) {
      const result = runScript(directory, script);
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain("Parser diagnostics in src/app/page.tsx");
      expect(result.output).not.toContain("skipped");
    }
  });
});

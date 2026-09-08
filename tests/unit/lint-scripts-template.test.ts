import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import * as v from "../../packages/versions/src/index.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { generateProjectFiles } from "../../src/templates/default.js";
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
  const directory = mkdtempSync(resolve(tmpdir(), "ghostinit-generated-lint-test-"));
  temporary.push(directory);
  const scripts = lintScriptFiles().map((template) => {
    const target = resolve(directory, template.path);
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, template.content);
    return target;
  });
  return { directory, scripts };
}

function runScript(
  directory: string,
  name: string,
  runtime: "bun" | "node" = "bun",
): { exitCode: number; output: string } {
  const executable = runtime === "bun" ? process.execPath : Bun.which("node");
  if (!executable) throw new Error(`${runtime} executable is required for the lint-script test`);
  const result = spawnSync(executable, [resolve(directory, `scripts/${name}`)], {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, NODE_PATH: resolve(root, "node_modules") },
  });
  return {
    exitCode: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function writeFixtureFile(directory: string, path: string, content: string): void {
  const target = resolve(directory, path);
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, content);
}

function devDependencies(content: string): Record<string, string> {
  const manifest = JSON.parse(content) as { devDependencies: Record<string, string> };
  return manifest.devDependencies;
}

function packageScripts(content: string): Record<string, string> {
  const manifest = JSON.parse(content) as { scripts: Record<string, string> };
  return manifest.scripts;
}

describe("emitted lint scripts", () => {
  test("emits the test preload, seven checks, and shared OXC helper", () => {
    expect(lintScriptFiles().map((template) => template.path)).toEqual([
      "scripts/test-env.ts",
      "scripts/check-feature-folder.cjs",
      "scripts/check-server-only.cjs",
      "scripts/check-import-aliases.cjs",
      "scripts/check-next-parity.cjs",
      "scripts/check-navigation-imports.cjs",
      "scripts/check-rtl-logical.cjs",
      "scripts/check-animation-imports.cjs",
      "scripts/lib/oxc.cjs",
    ]);
    for (const script of lintScriptFiles()) {
      if (script.path === "scripts/test-env.ts" || script.path.endsWith("scripts/lib/oxc.cjs")) {
        continue;
      }
      expect(script.content, script.path).toStartWith("#!/usr/bin/env bun\n");
    }
    const testEnvironment = lintScriptFiles().find(
      (script) => script.path === "scripts/test-env.ts",
    )?.content;
    expect(testEnvironment).toContain('NODE_ENV: "test"');
    expect(testEnvironment).toContain('ANALYTICS_DISABLED: "true"');
    expect(testEnvironment).toContain("delete process.env[name]");
    expect(testEnvironment).toContain("process.env[name] = value");
    const formatted = Bun.spawnSync(
      [process.execPath, "x", "--no-install", "oxfmt", "--stdin-filepath", "scripts/test-env.ts"],
      {
        stdin: new TextEncoder().encode(testEnvironment),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const decoder = new TextDecoder();
    expect(formatted.exitCode, decoder.decode(formatted.stderr)).toBe(0);
    expect(decoder.decode(formatted.stdout)).toBe(testEnvironment);
  });

  test("Bun owns generated quality scripts for both execution runtime selections", () => {
    const manifests = [
      rootPackageJson("demo", "bun").content,
      rootPackageJson("demo", "node").content,
      singlePackageJson("demo", "bun", [], false, false),
      singlePackageJson("demo", "node", [], false, false),
      singlePackageJsonTanstack("demo", "bun", [], false, false),
      singlePackageJsonTanstack("demo", "node", [], false, false),
    ];
    for (const manifest of manifests) {
      const scripts = packageScripts(manifest);
      for (const [name, command] of Object.entries(scripts)) {
        if (!name.startsWith("lint")) continue;
        expect(command, name).not.toContain("node scripts/");
        if (command.includes("scripts/check-")) expect(command, name).toContain("bun scripts/");
      }
    }

    for (const runtime of ["bun", "node"] as const) {
      const scripts = packageScripts(rootPackageJson("demo", runtime).content);
      const pinned = `bunx --bun ghostinit@${v.ghostinitVersion}`;
      expect(scripts.check).toBe(`${pinned} check`);
      expect(scripts["check:fix"]).toBe(`${pinned} check --fix`);
      expect(scripts["doctor:fix"]).toBe(`${pinned} doctor --fix`);
    }
  });

  test("emitted CJS checks run under both Bun and Node", () => {
    const { directory } = fixture();
    writeFixtureFile(directory, "src/index.ts", "export const ready = true;\n");
    for (const runtime of ["bun", "node"] as const) {
      const result = runScript(directory, "check-import-aliases.cjs", runtime);
      expect(result.exitCode, `${runtime}: ${result.output}`).toBe(0);
    }
  });

  test("all generated roots declare the catalog OXC parser and OX tool pins", () => {
    const monorepo = devDependencies(rootPackageJson("demo", "bun").content);
    const singleNext = devDependencies(singlePackageJson("demo", "bun", [], false, false));
    const singleTanstack = devDependencies(
      singlePackageJsonTanstack("demo", "bun", [], false, false),
    );
    const singleExpo = devDependencies(singlePackageJsonExpo("demo", "bun", [], false, false));

    for (const dependencies of [monorepo, singleNext, singleTanstack, singleExpo]) {
      expect(dependencies["oxc-parser"]).toBe(v.tooling["oxc-parser"]);
      expect(dependencies.oxfmt).toBe(v.tooling.oxfmt);
      expect(dependencies.oxlint).toBe(v.tooling.oxlint);
    }
  });

  test("the emitted CJS is oxlint-clean", () => {
    const { scripts } = fixture();
    const result = Bun.spawnSync(["bunx", "--no-install", "oxlint", "--deny-warnings", ...scripts]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  });

  test("feature-folder reports each physical file once across overlapping roots", () => {
    const { directory } = fixture();
    const oversized = Array.from({ length: 151 }, (_, index) => `// line ${index + 1}`).join("\n");
    writeFixtureFile(directory, "apps/web/src/app/billing/polar/provider-panel.tsx", oversized);
    writeFixtureFile(directory, "apps/web/src/app/billing/stripe/provider-panel.tsx", oversized);

    const result = runScript(directory, "check-feature-folder.cjs");
    expect(result.exitCode).toBe(1);
    expect(
      result.output.split(/\r?\n/).filter((line) => line.includes("provider-panel.tsx")),
    ).toEqual([
      "  apps/web/src/app/billing/polar/provider-panel.tsx: 151 lines (limit 150)",
      "  apps/web/src/app/billing/stripe/provider-panel.tsx: 151 lines (limit 150)",
    ]);
  });

  test("server-only graph rejects client reachability through intrinsic server modules", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "src/server/secrets.ts",
      'export const secret = process.env.PRIVATE_TOKEN ?? "";\n',
    );
    writeFixtureFile(
      directory,
      "src/client.ts",
      '"use client";\nimport { secret } from "./server/secrets";\nexport const exposed = secret;\n',
    );

    const result = runScript(directory, "check-server-only.cjs");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Client-reachable server runtime");
    expect(result.output).toContain("src/client.ts -> src/server/secrets.ts");
  });

  test("packages services runtime exports require marker dominance", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "packages/services/package.json",
      JSON.stringify({ exports: { ".": "./src/index.ts" } }),
    );
    writeFixtureFile(
      directory,
      "packages/services/src/runtime.ts",
      'import { readFile } from "node:fs/promises";\nexport const load = readFile;\n',
    );
    writeFixtureFile(
      directory,
      "packages/services/src/guarded.ts",
      'import "server-only";\nexport const guarded = true;\n',
    );
    writeFixtureFile(
      directory,
      "packages/services/src/index.ts",
      'export { guarded } from "./guarded";\nexport { load } from "./runtime";\n',
    );

    const unguarded = runScript(directory, "check-server-only.cjs");
    expect(unguarded.exitCode).toBe(1);
    expect(unguarded.output).toContain("Unprotected packages/services export");
    expect(unguarded.output).toContain('imports server runtime "node:fs/promises"');

    writeFixtureFile(
      directory,
      "packages/services/src/index.ts",
      'import "server-only";\nexport { load } from "./runtime";\n',
    );
    const guarded = runScript(directory, "check-server-only.cjs");
    expect(guarded.exitCode, guarded.output).toBe(0);
  });

  test("type-only and isomorphic schema edges remain client-safe", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "packages/services/package.json",
      JSON.stringify({ exports: { ".": "./src/index.ts" } }),
    );
    writeFixtureFile(
      directory,
      "packages/services/src/runtime.ts",
      "export interface SecretShape { value: string }\nexport const secret = process.env.PRIVATE_TOKEN;\n",
    );
    writeFixtureFile(
      directory,
      "packages/services/src/schema.ts",
      'import { z } from "zod";\nexport const publicSchema = z.object({ id: z.string() });\n',
    );
    writeFixtureFile(
      directory,
      "packages/services/src/index.ts",
      'export type { SecretShape } from "./runtime";\nexport { publicSchema } from "./schema";\n',
    );
    writeFixtureFile(
      directory,
      "src/client.ts",
      '"use client";\nimport type { SecretShape } from "../packages/services/src/runtime";\nexport const publicKey = process.env.NEXT_PUBLIC_KEY;\nexport type ClientShape = SecretShape;\n',
    );

    const result = runScript(directory, "check-server-only.cjs");
    expect(result.exitCode, result.output).toBe(0);
    expect(result.output).toContain("Server-only runtime boundary check passed");
  });

  test("package export conditions resolve declarations only for type-only references", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "packages/contracts/package.json",
      JSON.stringify({
        exports: {
          ".": {
            types: "./types/index.d.ts",
            import: "./runtime/index.js",
          },
        },
      }),
    );
    writeFixtureFile(
      directory,
      "packages/contracts/types/index.d.ts",
      "export interface Shape { id: string }\n",
    );
    writeFixtureFile(
      directory,
      "packages/contracts/runtime/index.js",
      'export const value = "safe";\n',
    );
    writeFixtureFile(
      directory,
      "src/client.ts",
      '"use client";\nimport type { Shape } from "@repo/contracts";\nimport { value } from "@repo/contracts";\nexport type ClientShape = Shape;\nexport { value };\n',
    );

    const result = runScript(directory, "check-server-only.cjs");
    expect(result.exitCode, result.output).toBe(0);
  });

  test("server-only graph resolves TypeScript module source substitutions", () => {
    const { directory } = fixture();
    writeFixtureFile(directory, "src/esm.mts", "export const esm = true;\n");
    writeFixtureFile(directory, "src/common.cts", "export const common = true;\n");
    writeFixtureFile(
      directory,
      "src/index.ts",
      'import { esm } from "./esm.mjs";\nimport { common } from "./common.cjs";\nexport { esm, common };\n',
    );

    const result = runScript(directory, "check-server-only.cjs");
    expect(result.exitCode, result.output).toBe(0);
  });

  test("client environment access allows only public prefixes", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "src/client.ts",
      '"use client";\nexport const leaked = process.env.PRIVATE_TOKEN;\n',
    );
    const privateResult = runScript(directory, "check-server-only.cjs");
    expect(privateResult.exitCode).toBe(1);
    expect(privateResult.output).toContain('accesses server environment key "PRIVATE_TOKEN"');

    writeFixtureFile(
      directory,
      "src/client.ts",
      '"use client";\nexport const published = process.env.NEXT_PUBLIC_TOKEN;\n',
    );
    const publicResult = runScript(directory, "check-server-only.cjs");
    expect(publicResult.exitCode, publicResult.output).toBe(0);

    writeFixtureFile(
      directory,
      "src/client.ts",
      '"use client";\nexport const leaked = import.meta.env.BETTER_AUTH_SECRET;\n',
    );
    const vitePrivate = runScript(directory, "check-server-only.cjs");
    expect(vitePrivate.exitCode).toBe(1);
    expect(vitePrivate.output).toContain('accesses server environment key "BETTER_AUTH_SECRET"');

    writeFixtureFile(
      directory,
      "src/client.ts",
      '"use client";\nexport const publicKey = import.meta.env.VITE_PUBLIC_KEY;\nexport const dev = import.meta.env.DEV;\n',
    );
    const vitePublic = runScript(directory, "check-server-only.cjs");
    expect(vitePublic.exitCode, vitePublic.output).toBe(0);
  });

  test("config server runtime and schema taint direct and transitive client imports", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "packages/config/package.json",
      JSON.stringify({
        name: "@repo/config",
        exports: { "./server": "./src/server.ts" },
      }),
    );
    writeFixtureFile(
      directory,
      "packages/config/src/server.ts",
      'export const secret = process.env.BETTER_AUTH_SECRET ?? "";\n',
    );
    writeFixtureFile(
      directory,
      "src/client.ts",
      '"use client";\nimport { secret } from "@repo/config/server";\nexport { secret };\n',
    );
    const direct = runScript(directory, "check-server-only.cjs");
    expect(direct.exitCode).toBe(1);
    expect(direct.output).toContain("Client-reachable server runtime");
    expect(direct.output).toContain("packages/config/src/server.ts");

    writeFixtureFile(
      directory,
      "src/bridge.ts",
      'import { secret } from "@repo/config/server";\nexport { secret };\n',
    );
    writeFixtureFile(
      directory,
      "src/client.ts",
      '"use client";\nimport { secret } from "./bridge";\nexport { secret };\n',
    );
    const transitive = runScript(directory, "check-server-only.cjs");
    expect(transitive.exitCode).toBe(1);
    expect(transitive.output).toContain("src/client.ts -> src/bridge.ts");

    writeFixtureFile(
      directory,
      "src/lib/env/server-schema.ts",
      "export const serverSchema = { secret: true };\n",
    );
    writeFixtureFile(
      directory,
      "src/client.ts",
      '"use client";\nimport { serverSchema } from "./lib/env/server-schema";\nexport { serverSchema };\n',
    );
    const schema = runScript(directory, "check-server-only.cjs");
    expect(schema.exitCode).toBe(1);
    expect(schema.output).toContain("src/lib/env/server-schema.ts");
  });

  test("server-only graph fails closed on unresolved owned imports", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "src/server/index.ts",
      'export { missing } from "./missing.service";\n',
    );
    writeFixtureFile(
      directory,
      "src/server/type-ref.ts",
      'export type Missing = import("./missing-type").Missing;\n',
    );

    const result = runScript(directory, "check-server-only.cjs");
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("Unresolved local imports in server-only check");
    expect(result.output).toContain('cannot resolve "./missing.service"');
    expect(result.output).toContain('cannot resolve "./missing-type"');
  });

  test("server-only graph resolves Convex declarations only for type-only references", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "convex/_generated/dataModel.d.ts",
      "export interface DataModel { id: string }\n",
    );
    writeFixtureFile(
      directory,
      "convex/schema-types.ts",
      'import type { DataModel } from "./_generated/dataModel";\nexport type Schema = DataModel;\n',
    );

    const result = runScript(directory, "check-server-only.cjs");
    expect(result.exitCode, result.output).toBe(0);
  });

  test("server-only graph treats existing Convex codegen as an opaque generated boundary", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "convex/_generated/api.js",
      'import { anyApi } from "convex/server";\nexport const api = anyApi;\n',
    );
    writeFixtureFile(
      directory,
      "convex/_generated/server.d.ts",
      "export interface QueryCtx { requestId: string }\n",
    );
    writeFixtureFile(
      directory,
      "convex/_generated/server.js",
      'import { queryGeneric } from "convex/server";\nexport const query = queryGeneric;\n',
    );
    writeFixtureFile(
      directory,
      "convex/client.ts",
      '"use client";\nimport { api } from "./_generated/api";\nimport type { QueryCtx } from "./_generated/server";\nexport { api };\nexport type ClientQueryCtx = QueryCtx;\n',
    );

    const result = runScript(directory, "check-server-only.cjs");
    expect(result.exitCode, result.output).toBe(0);
  });

  test("server-only graph keeps the generated Convex server runtime protected", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "convex/_generated/server.js",
      'import { queryGeneric } from "convex/server";\nexport const query = queryGeneric;\n',
    );
    writeFixtureFile(
      directory,
      "convex/client.ts",
      '"use client";\nimport { query } from "./_generated/server";\nexport { query };\n',
    );

    const result = runScript(directory, "check-server-only.cjs");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Client-reachable server runtime");
    expect(result.output).toContain('imports server runtime "./_generated/server"');
  });

  test("server-only graph rejects runtime imports of declaration-only or missing Convex targets", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "convex/_generated/dataModel.d.ts",
      "export interface DataModel { id: string }\n",
    );
    writeFixtureFile(
      directory,
      "packages/service/src/runtime.ts",
      [
        'import { DataModel } from "../../../convex/_generated/dataModel";',
        'import { missing } from "../../../convex/_generated/missing";',
        "export { DataModel, missing };",
      ].join("\n"),
    );

    const result = runScript(directory, "check-server-only.cjs");
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('cannot resolve "../../../convex/_generated/dataModel"');
    expect(result.output).toContain('cannot resolve "../../../convex/_generated/missing"');
  });

  test("server-only graph resolves the generated desktop renderer alias", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "apps/desktop/src/renderer/components/ui/button.tsx",
      "export function Button() { return null; }\n",
    );
    writeFixtureFile(
      directory,
      "apps/desktop/src/renderer/page.tsx",
      '"use client";\nimport { Button } from "@/components/ui/button";\nexport { Button };\n',
    );

    const result = runScript(directory, "check-server-only.cjs");
    expect(result.exitCode, result.output).toBe(0);
  });

  test("generated single and monorepo billing server-only graphs pass", () => {
    for (const mode of ["single", "monorepo"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        const { directory } = fixture();
        const config = {
          name: `server-only-${mode}-${database}`,
          runtime: "bun",
          version: "0.1.0",
          mode,
          framework: "nextjs",
          database,
          apps: ["web"],
          billing: ["stripe"],
          features: [],
          auth: true,
          api: true,
          messaging: true,
        } as ProjectConfig;
        for (const generated of generateProjectFiles(config)) {
          writeFixtureFile(directory, generated.path, generated.content);
        }

        const result = runScript(directory, "check-server-only.cjs");
        expect(result.exitCode, `${mode}/${database}: ${result.output}`).toBe(0);
      }
    }
  });

  test("generated single TanStack server functions are opaque client references", () => {
    const { directory } = fixture();
    const config = {
      name: "server-only-single-tanstack",
      runtime: "bun",
      version: "0.1.0",
      mode: "single",
      framework: "tanstack-start",
      database: "postgres",
      apps: ["web"],
      billing: [],
      features: [],
      messaging: true,
    } as ProjectConfig;
    for (const generated of generateProjectFiles(config)) {
      writeFixtureFile(directory, generated.path, generated.content);
    }

    const result = runScript(directory, "check-server-only.cjs");
    expect(result.exitCode, result.output).toBe(0);
  });

  test("TanStack server-function boundary rejects unexpected server imports", () => {
    const { directory } = fixture();
    writeFixtureFile(
      directory,
      "src/routes/messages.tsx",
      '"use client";\nimport { loadProtectedRoute } from "../lib/protected-route";\nexport { loadProtectedRoute };\n',
    );
    writeFixtureFile(
      directory,
      "src/lib/protected-route.ts",
      'import { unsafeServerFn } from "./server-functions";\nexport { unsafeServerFn };\n',
    );
    writeFixtureFile(
      directory,
      "src/lib/server-functions.ts",
      'import { createServerFn } from "@tanstack/react-start";\nimport { createRouterClient } from "@orpc/server";\nexport const unsafeServerFn = createServerFn({ method: "GET" }).handler(async () => createRouterClient);\n',
    );

    const result = runScript(directory, "check-server-only.cjs");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Client-reachable server runtime");
    expect(result.output).toContain('imports server runtime "@orpc/server"');
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

  test("the exact no-billing Eve+i18n corner validates its reachable split header", () => {
    const { directory } = fixture();
    const resolution = resolveCreateConfig({
      name: "features",
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      billing: [],
      features: ["eve", "i18n"],
      database: "postgres",
      databaseWasExplicit: true,
      apps: ["web"],
      preset: undefined,
      cache: "none",
      deploy: "none",
    });
    if (!resolution.ok) throw new Error(resolution.message);
    const generated = generateProjectFiles(resolution.config);
    for (const file of generated) writeFixtureFile(directory, file.path, file.content);

    const shell = generated.find(
      ({ path }) => path === "apps/web/src/components/app-shell.tsx",
    )?.content;
    const actions = generated.find(
      ({ path }) => path === "apps/web/src/components/header-actions.tsx",
    )?.content;
    const menu = generated.find(
      ({ path }) => path === "apps/web/src/components/header-user-menu.tsx",
    )?.content;
    expect(shell).toContain("<HeaderActions");
    expect(actions).toContain("<LocaleSwitcher");
    expect(actions).toContain("<HeaderUserMenu");
    expect(menu).toContain('t("users")');
    expect(menu).toContain('t("signOut")');

    const navigation = runScript(directory, "check-navigation-imports.cjs");
    expect(navigation.exitCode, navigation.output).toBe(0);
    expect(navigation.output).toContain("I18n runtime check passed");
    const brokenCompositions = [
      {
        path: "apps/web/src/app/layout.tsx",
        mutate: (source: string) =>
          source.replaceAll("<AppShell>", "<>").replaceAll("</AppShell>", "</>"),
        error: "Root layout must mount AppShell exactly once",
      },
      {
        path: "apps/web/src/components/app-shell.tsx",
        mutate: (source: string) =>
          source
            .replace("<Header workspace=", "<section workspace=")
            .replace("</Header>", "</section>"),
        error: "AppShell must mount Header exactly once",
      },
      {
        path: "apps/web/src/components/app-shell.tsx",
        mutate: (source: string) => source.replace("<WorkspaceSidebar ", "<div "),
        error: "AppShell must mount WorkspaceSidebar exactly once",
      },
      {
        path: "apps/web/src/components/workspace-sidebar.tsx",
        mutate: (source: string) =>
          source.replace("<WorkspaceNavigation ", "<div ") + "\n// <WorkspaceNavigation />\n",
        error: "Workspace sidebar must mount WorkspaceNavigation exactly once",
      },
      {
        path: "apps/web/src/components/workspace-navigation-trigger.tsx",
        mutate: (source: string) => source.replace("<WorkspaceNavigation ", "<div "),
        error: "Workspace trigger must mount WorkspaceNavigation exactly once",
      },
      {
        path: "apps/web/src/components/app-shell.tsx",
        mutate: (source: string) =>
          source.replace("canonical.currentRequest?.user", "session.user"),
        error: "Canonical workspace identity is missing canonical.currentRequest?.user",
      },
      {
        path: "apps/web/src/components/workspace-identity.ts",
        mutate: (source: string) => source.replace("if (input.error)", "if (false)"),
        error: "Workspace identity states is missing if(input.error)",
      },
      {
        path: "apps/web/src/components/workspace-sidebar.tsx",
        mutate: (source: string) =>
          source.replace("identity={identity}", 'identity={{ status: "pending" }}'),
        error: "Workspace identity handoff is missing identity={identity}",
      },
      {
        path: "apps/web/src/components/header-actions.tsx",
        mutate: (source: string) =>
          source.replace('<LocaleSwitcher className="', '<LocaleSwitcher className="hidden '),
        error: "Locale switcher must remain reachable on mobile",
      },
      {
        path: "apps/web/src/components/workspace-navigation-trigger.tsx",
        mutate: (source: string) => source.replace('t("openNavigation")', '"Navigation"'),
        error: 'Workspace trigger is missing t("openNavigation")',
      },
      {
        path: "apps/web/src/components/workspace-navigation.tsx",
        mutate: (source: string) =>
          source.replace('label: "dashboard"', 'label: "missingTranslation"'),
        error: "en header catalog is missing missingTranslation",
      },
    ];
    for (const broken of brokenCompositions) {
      const original = generated.find(({ path }) => path === broken.path)!.content;
      const changed = broken.mutate(original);
      expect(changed, broken.path).not.toBe(original);
      try {
        writeFixtureFile(directory, broken.path, changed);
        const result = runScript(directory, "check-navigation-imports.cjs");
        expect(result.exitCode, `${broken.path}\n${result.output}`).toBe(1);
        expect(result.output).toContain(broken.error);
      } finally {
        writeFixtureFile(directory, broken.path, original);
      }
    }
  });

  test("cookie-only i18n requires a mounted provider and complete catalogs", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app/demo"), { recursive: true });
    mkdirSync(resolve(directory, "src/i18n"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/i18n/request.ts"),
      'const cookie = "NEXT_LOCALE"; const language = "accept-language"; cookies(); headers();\n',
    );
    writeFileSync(
      resolve(directory, "src/app/demo/page.tsx"),
      'import Link from "next/link"; import { useRouter } from "next/navigation"; export default function Page(){ const router=useRouter(); return <Link href="/" onClick={()=>router.refresh()}>Home</Link>; }\n',
    );

    const navigation = runScript(directory, "check-navigation-imports.cjs");
    expect(navigation.exitCode).toBe(1);
    expect(navigation.output).toContain("I18n runtime violations");
    expect(navigation.output).toContain("Next root layout is missing NextIntlClientProvider");
    expect(navigation.output).toContain("missing en/fr/ar message catalogs");
    expect(navigation.output).not.toContain("next/link");
  });

  test("disabled i18n rejects runtime import leakage", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/lib"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/lib/leak.ts"),
      'import { useTranslations } from "next-intl"; export { useTranslations };\n',
    );

    const result = runScript(directory, "check-navigation-imports.cjs");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("I18n runtime violations");
    expect(result.output).toContain("leaks an i18n runtime while the capability is disabled");
  });

  test("Next parity keeps standard non-prefixed navigation with i18n", () => {
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
    expect(localized.output).toContain('Use next/link instead of <a href="/settings">');
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

  test("import boundaries allow local modules and root Convex codegen", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/server/db"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/server/db/references.ts"),
      [
        'import "./static";',
        'export * from "./all";',
        'export { value } from "./named";',
        'void import("./dynamic");',
        'require("./required");',
        'import { api } from "../../../convex/_generated/api";',
      ].join("\n"),
    );

    const result = runScript(directory, "check-import-aliases.cjs");
    expect(result.exitCode, result.output).toBe(0);
    expect(result.output).toContain("Import boundary check passed");
  });

  test("import boundaries reject every module-reference form that escapes its source root", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "apps/web/src"), { recursive: true });
    writeFileSync(
      resolve(directory, "apps/web/src/references.ts"),
      [
        'import "../../../outside/static";',
        'export * from "../../../outside/all";',
        'export { value } from "../../../outside/named";',
        'void import("../../../outside/dynamic");',
        'require("../../../outside/required");',
      ].join("\n"),
    );

    const result = runScript(directory, "check-import-aliases.cjs");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Relative imports may not escape their source root");
    for (const [line, column] of [
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 6],
      [5, 1],
    ]) {
      expect(result.output).toContain(`apps/web/src/references.ts:${line}:${column}`);
    }
  });

  test("parser diagnostics fail closed with the source path for every AST check", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app"), { recursive: true });
    writeFileSync(resolve(directory, "src/app/page.tsx"), "export default function Page( {\n");

    for (const script of [
      "check-server-only.cjs",
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

import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

function alternateCase(value: string): string {
  return value.replace(/[a-zA-Z]/, (character) =>
    character === character.toLowerCase() ? character.toUpperCase() : character.toLowerCase(),
  );
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test.skipIf(process.platform !== "win32")(
  "direct native typecheck uses one canonical workspace path under mixed-case TEMP",
  () => {
    const canonicalTemp = realpathSync(tmpdir());
    const createdRoot = mkdtempSync(join(canonicalTemp, "ghostinit-native-case-"));
    const canonicalRoot = realpathSync(createdRoot);
    const root = join(dirname(canonicalRoot), alternateCase(basename(canonicalRoot)));
    try {
      expect(root.toLowerCase()).toBe(canonicalRoot.toLowerCase());
      expect(root).not.toBe(canonicalRoot);

      const app = join(root, "apps/mobile");
      const api = join(canonicalRoot, "packages/api");
      const services = join(canonicalRoot, "packages/services");
      const scope = join(root, "node_modules/@repo");
      for (const directory of [join(app, "src"), join(api, "src"), join(services, "src"), scope]) {
        mkdirSync(directory, { recursive: true });
      }

      writeJson(join(api, "package.json"), {
        name: "@repo/api",
        type: "module",
        exports: { ".": "./src/index.ts" },
      });
      writeJson(join(services, "package.json"), {
        name: "@repo/services",
        type: "module",
        exports: { ".": "./src/index.ts", "./identity": "./src/identity.ts" },
      });
      writeFileSync(
        join(services, "src/index.ts"),
        'import { identity } from "./identity.js";\nexport const serviceRoot = identity;\n',
      );
      writeFileSync(join(services, "src/identity.ts"), 'export const identity = "identity";\n');
      writeFileSync(
        join(api, "src/index.ts"),
        'import { serviceRoot } from "@repo/services";\nimport { identity } from "@repo/services/identity";\nexport const api = serviceRoot + identity;\n',
      );
      writeFileSync(
        join(app, "src/index.ts"),
        'import { api } from "@repo/api";\nexport const client = api;\n',
      );
      symlinkSync(api, join(scope, "api"), "junction");
      symlinkSync(services, join(scope, "services"), "junction");

      const compilerOptions = {
        target: "ES2024",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        types: [],
      } as const;
      writeJson(join(app, "tsconfig.bad.json"), {
        compilerOptions: {
          ...compilerOptions,
          paths: { "@/*": ["./src/*"], "@repo/*": ["../../packages/*/src"] },
        },
        include: ["src/**/*"],
      });
      writeJson(join(app, "tsconfig.json"), {
        compilerOptions: { ...compilerOptions, paths: { "@/*": ["./src/*"] } },
        include: ["src/**/*"],
      });

      const tsc = resolve(import.meta.dir, "../../node_modules/typescript/bin/tsc");
      const run = (project: string) =>
        Bun.spawnSync({
          cmd: [process.execPath, tsc, "--noEmit", "-p", project],
          cwd: app,
          stdout: "pipe",
          stderr: "pipe",
        });
      const mixedResolution = run(join(app, "tsconfig.bad.json"));
      expect(mixedResolution.exitCode).not.toBe(0);
      expect(
        `${mixedResolution.stdout.toString()}\n${mixedResolution.stderr.toString()}`,
      ).toContain("TS1149");

      const packageResolution = run(join(app, "tsconfig.json"));
      expect(packageResolution.exitCode).toBe(0);
    } finally {
      rmSync(canonicalRoot, { recursive: true, force: true });
    }
  },
);

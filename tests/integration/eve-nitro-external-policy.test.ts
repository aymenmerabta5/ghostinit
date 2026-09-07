import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { builtinModules, createRequire, isBuiltin } from "node:module";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FsTransaction } from "../../src/lib/fs.js";
import { eveNitroConfigContent } from "../../src/templates/eve/config.js";
import { singleNitroConfigTanstackContent } from "../../src/templates/modes/single/tanstack/core.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

type ExternalPredicate = (source: string, importer?: string, resolved?: boolean) => boolean | void;
interface BundlerConfig {
  cwd: string;
  input: string;
  platform: "node";
  external: Array<string | RegExp> | ExternalPredicate;
  plugins: Array<{
    name: string;
    resolveId?(source: string): string | null;
    load?(source: string): string | null;
  }>;
}
interface NitroInstance {
  hooks: {
    hook(name: string, handler: (nitro: unknown, config: BundlerConfig) => void): void;
    callHook(name: string, nitro: unknown, config: BundlerConfig): Promise<void>;
  };
  close(): Promise<void>;
}
interface Bundle {
  generate(config: { format: "esm" }): Promise<{ output: Array<{ type: string; code?: string }> }>;
  close(): Promise<void>;
}

const hostRequire = createRequire(import.meta.url);
const eveRequire = createRequire(hostRequire.resolve("eve"));
const nitroPath = eveRequire.resolve("nitro/builder");
const nitroRequire = createRequire(nitroPath);
const nitroBuilder = (await import(pathToFileURL(nitroPath).href)) as {
  createNitro(config: Record<string, unknown>): Promise<NitroInstance>;
};
const { rolldown } = (await import(pathToFileURL(nitroRequire.resolve("rolldown")).href)) as {
  rolldown(config: BundlerConfig): Promise<Bundle>;
};
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("Nitro's loaded config retains externals before Eve's dev hook without losing authored aliases", async () => {
  const root = createTemporaryWorkspace("ghostinit-eve-external-bundle-");
  roots.push(root);
  const tx = new FsTransaction(root);
  await tx.write("package.json", JSON.stringify({ private: true, type: "module" }));
  await tx.write("nitro.config.mjs", eveNitroConfigContent());
  await tx.write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "bundler",
        paths: { "#app/*": ["./lib/*"] },
      },
      include: ["agent/**/*", "lib/**/*"],
    }),
  );
  await tx.write("lib/value.ts", 'export const value: string = "authored-alias-preserved";\n');
  await tx.write(
    "agent/entry.ts",
    'export { value } from "#app/value";\nexport { assets } from "#nitro/virtual/public-assets-node";\nexport { one } from "vendor:one";\nexport { two } from "prefix-vendor:two";\n',
  );
  await tx.commit();
  const nitro = await nitroBuilder.createNitro({
    rootDir: root,
    dev: true,
    serverDir: false,
    logLevel: 0,
  });
  let bundle: Bundle | undefined;
  try {
    let inherited: BundlerConfig["external"] | undefined;
    nitro.hooks.hook("rollup:before", (_nitro, config) => {
      inherited = config.external;
      const previous = config.external;
      config.external = (source, importer, resolved) => {
        if (source === "/.eve/workflows.mjs") return true;
        if (typeof previous === "function") return previous(source, importer, resolved);
      };
    });
    const builtins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];
    const resolutionAttempts: string[] = [];
    const virtual = "#nitro/virtual/public-assets-node";
    const config: BundlerConfig = {
      cwd: root,
      input: join(root, "agent/entry.ts"),
      platform: "node",
      external: [...builtins, /vendor:/g],
      plugins: [
        {
          name: "nitro-virtual-module-probe",
          resolveId(source) {
            resolutionAttempts.push(source);
            return source === virtual ? source : null;
          },
          load(source) {
            return source === virtual
              ? `
import { createRequire } from "node:module";
import { promises } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export const assets = [createRequire, promises, fileURLToPath, resolve];
`
              : null;
          },
        },
      ],
    };
    await nitro.hooks.callHook("rollup:before", nitro, config);
    expect(inherited).toBeFunction();
    bundle = await rolldown(config);
    const { output } = await bundle.generate({ format: "esm" });
    const code = output
      .filter((item) => item.type === "chunk")
      .map((item) => item.code)
      .join("\n");
    expect(code).toContain("authored-alias-preserved");
    for (const source of ["node:module", "node:fs", "node:url", "node:path"])
      expect(code).toContain(source);
    expect(resolutionAttempts.filter(isBuiltin)).toEqual([]);
    expect(resolutionAttempts.filter((source) => source.includes("vendor:"))).toEqual([]);
  } finally {
    await bundle?.close();
    await nitro.close();
  }
});

test("the generated TypeScript hook remains strict with Nitro's Rolldown-only installed graph", async () => {
  const root = createTemporaryWorkspace("ghostinit-eve-external-types-");
  roots.push(root);
  const tx = new FsTransaction(root);
  await tx.write("nitro.config.ts", singleNitroConfigTanstackContent(false, "node-server", true));
  await tx.write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: "ES2024",
        module: "ESNext",
        moduleResolution: "bundler",
        types: ["node"],
        typeRoots: [dirname(dirname(hostRequire.resolve("@types/node/package.json")))],
        paths: { "nitro/config": [eveRequire.resolve("nitro/config").replace(/\.mjs$/, ".d.mts")] },
      },
      files: ["nitro.config.ts"],
    }),
  );
  await tx.commit();
  const compilerManifest = hostRequire.resolve("typescript/package.json");
  const compiler = JSON.parse(readFileSync(compilerManifest, "utf8")) as { bin: { tsc: string } };
  const result = spawnSync(
    process.execPath,
    [
      resolve(dirname(compilerManifest), compiler.bin.tsc),
      "--project",
      join(root, "tsconfig.json"),
    ],
    { encoding: "utf8", timeout: 30_000, windowsHide: true, shell: false },
  );
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
});

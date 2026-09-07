import { afterEach, describe, expect, test } from "bun:test";
import { builtinModules } from "node:module";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { FsTransaction } from "../../src/lib/fs.js";
import { eveNitroConfigContent } from "../../src/templates/eve/config.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

type ExternalPredicate = (source: string, importer?: string, resolved?: boolean) => boolean | void;
type External = string | RegExp | Array<string | RegExp> | ExternalPredicate;
interface BundlerConfig {
  external?: External;
  plugins?: Array<{ name: string }>;
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function loadHook(): Promise<(nitro: unknown, config: BundlerConfig) => void> {
  const root = createTemporaryWorkspace("ghostinit-eve-externals-");
  roots.push(root);
  const tx = new FsTransaction(root);
  await tx.write("nitro.config.mjs", eveNitroConfigContent());
  await tx.commit();
  const config = await import(pathToFileURL(join(root, "nitro.config.mjs")).href);
  return config.default.hooks["rollup:before"];
}

function applyEveDevelopmentWrapper(config: BundlerConfig): ExternalPredicate {
  const previous = config.external;
  const wrapped: ExternalPredicate = (source, importer, resolved) => {
    if (source === "/.eve/workflows.mjs") return true;
    if (typeof previous === "function") return previous(source, importer, resolved);
  };
  config.external = wrapped;
  return wrapped;
}

describe("Eve Nitro development externals", () => {
  test("retains Nitro's built-ins and custom external rules through Eve's dev wrapper", async () => {
    const hook = await loadHook();
    const builtins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];
    const config: BundlerConfig = {
      external: [...builtins, "custom-server-package", /^custom:\//],
    };
    hook({}, config);
    hook({}, config);
    expect(config.plugins).toHaveLength(1);
    const external = applyEveDevelopmentWrapper(config);
    for (const name of builtins) expect(external(name), name).toBe(true);
    expect(external("custom-server-package")).toBe(true);
    expect(external("custom:/runtime")).toBe(true);
    expect(external("/.eve/workflows.mjs")).toBe(true);
    for (const name of [
      "#agent/tool",
      "@repo/database",
      "eve/runtime",
      "./module",
      "custom-server-package/client",
    ]) {
      expect(external(name), name).toBe(false);
    }
  });

  test("preserves individual string and regular-expression rules", async () => {
    const hook = await loadHook();
    for (const rule of ["custom-server-package", /^custom-server-package$/]) {
      const config: BundlerConfig = { external: rule };
      hook({}, config);
      const external = applyEveDevelopmentWrapper(config);
      expect(external("custom-server-package")).toBe(true);
      expect(external("custom-server-package/client")).toBe(false);
    }
  });

  test("keeps an existing predicate and its importer/resolution context", async () => {
    const hook = await loadHook();
    const calls: unknown[][] = [];
    const predicate: ExternalPredicate = (...args) => {
      calls.push(args);
      return args[0] === "custom-server-package";
    };
    const config: BundlerConfig = { external: predicate };
    hook({}, config);
    expect(config.external).toBe(predicate);
    const external = applyEveDevelopmentWrapper(config);
    expect(external("custom-server-package", "/agent/tool.ts", true)).toBe(true);
    expect(external("@repo/database", "/agent/tool.ts", false)).toBe(false);
    expect(calls).toEqual([
      ["custom-server-package", "/agent/tool.ts", true],
      ["@repo/database", "/agent/tool.ts", false],
    ]);
  });

  test("matches regular-expression rules statelessly without changing their lastIndex", async () => {
    const hook = await loadHook();
    for (const flags of ["i", "g", "y", "gi"]) {
      const rule = new RegExp("vendor:", flags);
      rule.lastIndex = 4;
      const config: BundlerConfig = { external: [rule] };
      hook({}, config);
      const external = applyEveDevelopmentWrapper(config);
      for (let index = 0; index < 3; index++) {
        expect(external("prefix-vendor:one")).toBe(true);
        expect(external("vendor:two")).toBe(true);
        expect(external("@repo/database")).toBe(false);
      }
      expect(rule.lastIndex).toBe(4);
    }
  });

  test("leaves omitted external policy to Nitro and Rolldown", async () => {
    const hook = await loadHook();
    const config: BundlerConfig = {};
    hook({}, config);
    expect(config.external).toBeUndefined();
    expect(applyEveDevelopmentWrapper(config)("@repo/database")).toBeUndefined();
  });
});

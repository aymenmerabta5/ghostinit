import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { eveSandboxFile } from "../../src/templates/eve/agent/core.js";
import { eve } from "../../packages/versions/src/index.js";

describe("Eve dependency lifecycle policy", () => {
  test("the authored sandbox preserves Vercel and disables local optional installation", () => {
    const source = new Bun.Transpiler({ loader: "ts" }).transformSync(
      `function createSandbox() {\n${eveSandboxFile()
        .content.replace(/^import[^;]+;\s*/gm, "")
        .replace("export default", "return")}\n}`,
    );
    const create = new Function(
      "defineSandbox",
      "justbash",
      "vercel",
      "process",
      `${source}\nreturn createSandbox();`,
    ) as (
      define: (definition: unknown) => unknown,
      backend: (options: { autoInstall: boolean }) => unknown,
      hosted: () => unknown,
      process: { env: { VERCEL?: string } },
    ) => unknown;
    const calls: unknown[] = [];
    const result = create(
      (value) => value,
      (options) => {
        calls.push(options);
        return { name: "just-bash", options };
      },
      () => {
        throw new Error("Local runs must not create hosted sandboxes");
      },
      { env: {} },
    );
    expect(calls).toEqual([{ autoInstall: false }]);
    expect(result).toEqual({ backend: { name: "just-bash", options: { autoInstall: false } } });
    const hosted = create(
      (value) => value,
      () => {
        throw new Error("Hosted Vercel must not use the local filesystem sandbox");
      },
      () => ({ name: "vercel" }),
      { env: { VERCEL: "1" } },
    );
    expect(hosted).toEqual({ backend: { name: "vercel" } });
  });

  for (const mode of ["single", "monorepo"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const enabled of [false, true]) {
        test(`${mode}/${framework} ${enabled ? "selects" : "omits"} the audited sandbox dependency`, () => {
          const resolution = resolveCreateConfig({
            name: "eve-dependency-policy",
            runtime: "bun",
            mode,
            framework,
            database: "postgres",
            databaseWasExplicit: true,
            apps: ["web"],
            preset: "saas",
            billing: [],
            features: [],
            cache: "none",
            deploy: "none",
            withEve: enabled,
          });
          if (!resolution.ok) throw new Error(resolution.message);
          const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
            desiredConfig: resolution.desiredConfig,
          });
          const files = new Map(plan.files.map((entry) => [entry.physicalPath, entry.content]));
          const base = mode === "single" ? "" : "apps/eve/";
          const manifest = files.get(`${base}package.json`);
          const dependencies = manifest
            ? (JSON.parse(manifest) as { dependencies?: Record<string, string> }).dependencies
            : undefined;
          expect(dependencies?.["just-bash"]).toBe(enabled ? eve["just-bash"] : undefined);
          expect(files.has(`${base}agent/sandbox.ts`)).toBe(enabled);
          expect(files.has(`${base}tests/eve-sandbox.test.ts`)).toBe(enabled);
        });
      }
    }
  }
});

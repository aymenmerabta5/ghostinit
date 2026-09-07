import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import {
  componentRegistry,
  designSystemFiles,
  resolveUiLayout,
  type ResolvedDesignSystemApp,
} from "../../src/templates/ui/index.js";

const root = resolve(import.meta.dir, "../..");

function schemaValidator(path: string) {
  const schema = JSON.parse(readFileSync(resolve(root, path), "utf8"));
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

function byPath(files: ReadonlyArray<{ path: string; content: string }>) {
  return new Map(files.map((template) => [template.path, template.content]));
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function oklchLuminance([lightness, chroma, hue]: readonly number[]): number {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = Math.max(0, Math.min(1, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s));
  const green = Math.max(0, Math.min(1, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s));
  const blue = Math.max(0, Math.min(1, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: readonly number[], second: readonly number[]): number {
  const [lighter, darker] = [oklchLuminance(first), oklchLuminance(second)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

const allApps = [
  { id: "web", target: "next" },
  { id: "start", target: "tanstack" },
  { id: "desktop", target: "electron" },
  { id: "mobile", target: "expo" },
] as const satisfies readonly ResolvedDesignSystemApp[];

describe("machine-defined design-system foundation", () => {
  test("resolves the two closed UI layout rows exactly", () => {
    expect(resolveUiLayout("monorepo")).toEqual({
      mode: "monorepo",
      logicalModule: "@repo/ui",
      moduleRoot: "packages/ui",
      sourceRoot: "packages/ui/src",
      stylesRoot: "packages/ui/src/styles",
      stylesImport: "@repo/ui/styles",
      contractPath: "packages/ui/src/contract.ts",
      contractImport: "@repo/ui/contract",
      componentRegistryPath: "packages/ui/src/component-registry.json",
      componentRegistryImport: "@repo/ui/component-registry.json",
    });
    expect(resolveUiLayout("single")).toEqual({
      mode: "single",
      logicalModule: "@/platform/ui",
      moduleRoot: "src/platform/ui",
      sourceRoot: "src/platform/ui",
      stylesRoot: "src/platform/ui/styles",
      stylesImport: "@/platform/ui/styles",
      contractPath: "src/platform/ui/contract.ts",
      contractImport: "@/platform/ui/contract",
      componentRegistryPath: "src/platform/ui/component-registry.json",
      componentRegistryImport: "@/platform/ui/component-registry.json",
    });
  });

  test("emits deterministic schema-valid contracts and registries in both modes", () => {
    const validateContract = schemaValidator("schemas/design-system-contract.schema.json");
    const validateRegistry = schemaValidator("schemas/component-registry.schema.json");
    const cases = [
      ["monorepo", allApps] as const,
      ["single", [{ id: "web", target: "tanstack" }] as const] as const,
    ];

    for (const [mode, apps] of cases) {
      const first = designSystemFiles(mode, apps);
      const second = designSystemFiles(mode, [...apps].reverse());
      expect(second).toEqual(first);
      const files = byPath(first);
      const contract = JSON.parse(files.get(".ghostinit/design-system-contract.json") ?? "null");
      const registryPath = resolveUiLayout(mode).componentRegistryPath;
      const registry = JSON.parse(files.get(registryPath) ?? "null");
      expect(validateContract(contract), JSON.stringify(validateContract.errors)).toBe(true);
      expect(validateRegistry(registry), JSON.stringify(validateRegistry.errors)).toBe(true);
    }
  });

  test("selects only applicable adapters and records exact source hashes", () => {
    const files = designSystemFiles("monorepo", [
      { id: "web", target: "next" },
      { id: "mobile", target: "expo" },
    ]);
    const map = byPath(files);
    const contract = JSON.parse(map.get(".ghostinit/design-system-contract.json") ?? "null") as {
      adapters: Array<{ id: string; source: string }>;
      fixtures: Array<{ status: string; source?: string; sourceHash?: string }>;
    };
    expect(contract.adapters.map(({ id }) => id)).toEqual(["next", "expo"]);
    expect([...map.keys()].some((path) => path.includes("adapters/tanstack"))).toBe(false);
    expect([...map.keys()].some((path) => path.includes("adapters/electron"))).toBe(false);
    for (const fixture of contract.fixtures) {
      if (fixture.status !== "applicable" || !fixture.source || !fixture.sourceHash) continue;
      expect(hash(map.get(fixture.source) ?? "missing")).toBe(fixture.sourceHash);
    }
  });

  test("rejects ambiguous single-mode and duplicate app selections", () => {
    expect(() =>
      designSystemFiles("single", [
        { id: "web", target: "next" },
        { id: "mobile", target: "expo" },
      ]),
    ).toThrow("exactly one");
    expect(() =>
      designSystemFiles("monorepo", [
        { id: "web", target: "next" },
        { id: "web", target: "tanstack" },
      ]),
    ).toThrow("duplicated");
  });

  test("never leaks the opposite mode's UI alias or physical root", () => {
    const monorepo = designSystemFiles("monorepo", [{ id: "web", target: "next" }]);
    const single = designSystemFiles("single", [{ id: "web", target: "next" }]);
    const monorepoContent = monorepo.map(({ path, content }) => `${path}\n${content}`).join("\n");
    const singleContent = single.map(({ path, content }) => `${path}\n${content}`).join("\n");
    expect(monorepoContent).not.toContain("@/platform/ui");
    expect(monorepoContent).not.toContain("src/platform/ui");
    expect(singleContent).not.toContain("@repo/ui");
    expect(singleContent).not.toContain("packages/ui");
  });

  test("publishes an exact package export for every emitted UI subpath", () => {
    const files = designSystemFiles("monorepo", allApps);
    const map = byPath(files);
    const manifest = JSON.parse(map.get("packages/ui/package.json") ?? "null") as {
      types: string;
      exports: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(manifest.types).toBe("./src/index.ts");
    expect(Object.keys(manifest.exports)).toEqual([
      ".",
      "./component-registry.json",
      "./contract",
      "./lib/utils",
      "./styles/adapters/electron/v1.css",
      "./styles/adapters/expo/v1.css",
      "./styles/adapters/next/v1.css",
      "./styles/adapters/tanstack/v1.css",
      "./styles/base.contract.css",
      "./styles/native-base",
      "./styles/native.css",
      "./styles/theme.css",
      "./styles/utilities.css",
      "./styles/web-base.css",
      "./styles/web.css",
      "./theme.css",
    ]);
    for (const target of Object.values(manifest.exports)) {
      expect(map.has(`packages/ui/${target.replace(/^\.\//, "")}`)).toBe(true);
    }
    expect(manifest.dependencies.tailwindcss).toBeTruthy();
    expect(manifest.dependencies["tw-animate-css"]).toBeTruthy();
    expect(manifest.dependencies.uniwind).toBeUndefined();
  });

  test("keeps portable, DOM and native CSS ownership separate", () => {
    const map = byPath(designSystemFiles("monorepo", allApps));
    const baseContract = map.get("packages/ui/src/styles/base.contract.css") ?? "";
    const webBase = map.get("packages/ui/src/styles/web-base.css") ?? "";
    const native = map.get("packages/ui/src/styles/native.css") ?? "";
    const web = map.get("packages/ui/src/styles/web.css") ?? "";
    expect(baseContract).not.toMatch(/(^|[\s,{])(html|body|\*)(?=[\s,{])/m);
    expect(baseContract).toContain("@custom-variant ui-disabled");
    expect(webBase).toContain("body {");
    expect(native).not.toContain("web-base.css");
    expect(native).not.toContain("tw-animate-css");
    expect(native).not.toContain("uniwind");
    for (const composition of [web, native]) {
      expect(composition).toContain('@import "./theme.css";');
      expect(composition).toContain("@custom-variant dark (&:is(.dark *));");
      expect(composition).toContain("@custom-variant light (&:is(.light *));");
    }
    for (const adapter of ["next", "tanstack", "electron", "expo"] as const) {
      const source = map.get(`packages/ui/src/styles/adapters/${adapter}/v1.css`) ?? "";
      expect(source).not.toContain("{");
      expect(source.match(/@import/g)).toHaveLength(1);
      expect(source).toContain(`@import "../../${adapter === "expo" ? "native" : "web"}.css";`);
    }
  });

  test("emits target-correct components.json data and a typed contract module", () => {
    const map = byPath(designSystemFiles("monorepo", allApps));
    const next = JSON.parse(map.get("apps/web/components.json") ?? "null");
    const expo = JSON.parse(map.get("apps/mobile/components.json") ?? "null");
    expect(next).toMatchObject({
      style: "base-nova",
      rsc: true,
      rtl: true,
      iconLibrary: "lucide",
    });
    expect(next).not.toHaveProperty("base");
    expect(next.tailwind.css).toBe("src/app/globals.css");
    expect(expo).toMatchObject({
      style: "radix-nova",
      rsc: false,
      rtl: true,
      iconLibrary: "lucide",
    });
    expect(expo.registries["@rnr"]).toContain("reactnativereusables.com");
    const contractModule = map.get("packages/ui/src/contract.ts") ?? "";
    expect(contractModule).toContain("Typed mirror of .ghostinit/design-system-contract.json");
    expect(contractModule).toContain("export const designSystemContract = {");
    expect(contractModule).toContain("export type DesignSystemContract");
    expect(contractModule).not.toMatch(/(?:from|import)\s+["']@repo\/ui/);
  });

  test("validates maintained-source, size and real current implementer records", () => {
    const pairs = [
      ["schemas/maintained-source-globs.schema.json", "policy/maintained-source-globs.json"],
      ["schemas/component-size-policy.schema.json", "policy/component-size-policy.json"],
      [
        "schemas/frontend-task-record.schema.json",
        "docs/engineering/frontend-task-records/design-system-contract-v1.json",
      ],
    ] as const;
    for (const [schema, document] of pairs) {
      const validate = schemaValidator(schema);
      const value = JSON.parse(readFileSync(resolve(root, document), "utf8"));
      expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    }

    const record = JSON.parse(
      readFileSync(
        resolve(root, "docs/engineering/frontend-task-records/design-system-contract-v1.json"),
        "utf8",
      ),
    ) as { role: string; selectedComponentIds: string[]; exceptionIds: string[] };
    const registryIds = new Set(
      (componentRegistry().components as Array<{ id: string }>).map(({ id }) => id),
    );
    expect(record.role).toBe("implementer");
    expect(record.exceptionIds).toEqual([]);
    expect(record.selectedComponentIds.every((id) => registryIds.has(id))).toBe(true);
  });

  test("uses a contrast-safe dark primary foreground without changing the accent", () => {
    const map = byPath(designSystemFiles("single", [{ id: "web", target: "next" }]));
    const theme = map.get("src/platform/ui/styles/theme.css") ?? "";
    expect(theme).toContain("--primary: oklch(0.65 0.22 264);");
    expect(theme).toContain("--primary-foreground: oklch(0.12 0.02 264);");
    expect(theme).toContain("--sidebar-primary-foreground: oklch(0.12 0.02 264);");
    expect(contrastRatio([0.65, 0.22, 264], [0.12, 0.02, 264])).toBeGreaterThanOrEqual(4.5);
  });

  test("keeps filled destructive controls readable in both themes", () => {
    const map = byPath(designSystemFiles("single", [{ id: "web", target: "next" }]));
    const theme = map.get("src/platform/ui/styles/theme.css") ?? "";
    expect(theme).toContain("--destructive: oklch(0.63 0.22 27);");
    expect(theme).toContain("--destructive-foreground: oklch(0.12 0.02 264);");
    expect(theme).toContain("--destructive-foreground: oklch(0.99 0.005 264);");
    expect(contrastRatio([0.63, 0.22, 27], [0.12, 0.02, 264])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio([0.55, 0.22, 27], [0.99, 0.005, 264])).toBeGreaterThanOrEqual(4.5);
  });
});

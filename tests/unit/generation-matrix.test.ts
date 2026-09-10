/**
 * Generation-matrix invariants.
 *
 * Every other billing/app test drives the DEFAULT configuration only
 * (`billingFiles({ mode: "monorepo" })` => Next.js + Drizzle). That blind spot let
 * a family of bugs ship in the TanStack and Convex variants while the suite stayed
 * green:
 *
 *   - Convex webhook routes imported `../../../convex/_generated/api` from a file
 *     seven directories deep, so the specifier resolved into the app tree.
 *   - The eve agent page (which imports `eve/react`) shipped into monorepo projects
 *     that never enabled the eve feature.
 *   - The PostHog proxy emitted Next.js route handlers into TanStack Start apps.
 *   - apps/web imported provider SDKs it never declared.
 *
 * These tests assert structural invariants across the whole matrix rather than
 * substring-matching one generated file, so a variant cannot silently diverge.
 */

import { describe, it, expect } from "bun:test";
import { parseSync } from "oxc-parser";
import { parseFile } from "../../src/lib/architecture/parsers/imports";
import { generateProjectFiles } from "../../src/templates/default";
import type { ProjectConfig } from "../../src/lib/config";
import type { TemplateFile } from "../../src/templates/shared";

type Corner = { label: string; config: ProjectConfig };

function cfg(partial: Partial<ProjectConfig>): ProjectConfig {
  return {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    billing: [],
    features: [],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
    ...partial,
  } as ProjectConfig;
}

const CORNER_DEFINITIONS: Corner[] = [
  {
    label: "monorepo/next/postgres/all-billing",
    config: cfg({ billing: ["stripe", "chargily", "paddle", "polar"] }),
  },
  {
    label: "monorepo/next/convex/all-billing",
    config: cfg({ database: "convex", billing: ["stripe", "chargily", "paddle", "polar"] }),
  },
  {
    label: "monorepo/tanstack/postgres/billing",
    config: cfg({ framework: "tanstack-start", billing: ["stripe", "paddle"] }),
  },
  {
    label: "monorepo/tanstack/convex/billing",
    config: cfg({ framework: "tanstack-start", database: "convex", billing: ["stripe"] }),
  },
  { label: "single/next/postgres/billing", config: cfg({ mode: "single", billing: ["stripe"] }) },
  {
    label: "single/next/convex/billing",
    config: cfg({ mode: "single", database: "convex", billing: ["polar"] }),
  },
  {
    label: "monorepo/mobile/convex/billing",
    config: cfg({
      database: "convex",
      apps: ["web", "mobile"],
      billing: ["stripe", "chargily", "paddle", "polar"],
    }),
  },
  {
    label: "monorepo/next/postgres/no-billing+features",
    config: cfg({ features: ["eve", "i18n"] }),
  },
  { label: "monorepo/next/none/no-billing", config: cfg({ database: "none" }) },
  {
    label: "monorepo/next/postgres/frontend+desktop",
    config: cfg({
      preset: "frontend",
      apps: ["desktop"],
      database: "none",
    } as Partial<ProjectConfig>),
  },
  {
    label: "monorepo/next/postgres/web,desktop+billing-all",
    config: cfg({ apps: ["web", "desktop"], billing: ["stripe", "chargily", "paddle", "polar"] }),
  },
  {
    label: "monorepo/tanstack/convex/desktop+billing",
    config: cfg({
      framework: "tanstack-start",
      database: "convex",
      apps: ["web", "desktop"],
      billing: ["stripe"],
    }),
  },
  {
    label: "single/desktop/frontend",
    config: cfg({
      mode: "single",
      apps: ["desktop"],
      preset: "frontend",
      database: "none",
      auth: false,
      api: false,
      email: false,
      analytics: false,
    } as Partial<ProjectConfig>),
  },
];

const GLOBAL_PROVIDERS = ["stripe", "paddle", "polar"] as const;
const CORNERS: Corner[] = [
  ...CORNER_DEFINITIONS.flatMap((corner): Corner[] => {
    const globals = GLOBAL_PROVIDERS.filter((provider) =>
      corner.config.billing?.includes(provider),
    );
    if (globals.length < 2) return [corner];
    return globals.map((provider) => ({
      label: `${corner.label}/${provider}`,
      config: { ...corner.config, billing: [provider, "chargily"] },
    }));
  }),
  ...(["monorepo", "single"] as const).flatMap((mode) =>
    (["nextjs", "tanstack-start"] as const).flatMap((framework) =>
      (["postgres", "convex"] as const).flatMap((database) =>
        (["manual-only", "manual-with-online"] as const).map((variant) => ({
          label: `${mode}/${framework}/${database}/${variant}`,
          config: cfg({
            mode,
            framework,
            database,
            billing: variant === "manual-only" ? ["manual"] : ["manual", "chargily", "stripe"],
          }),
        })),
      ),
    ),
  ),
];

function filesFor(config: ProjectConfig): TemplateFile[] {
  return generateProjectFiles(config, { dryRun: false });
}

function posixNormalize(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") {
      if (parts.length > 0 && parts.at(-1) !== "..") parts.pop();
      else parts.push("..");
    } else parts.push(seg);
  }
  return parts.join("/");
}

function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

const IMPORT_RE = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function importsOf(content: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content)) !== null) out.push(m[1]);
  return out;
}

const CODE_EXT = /\.(ts|tsx)$/;

function parserExtension(path: string): string {
  if (path.endsWith(".d.ts")) return ".d.ts";
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const dot = basename.lastIndexOf(".");
  return dot === -1 ? ".ts" : basename.slice(dot);
}

function emittedModuleCandidates(target: string, typeOnly: boolean): string[] {
  const candidates = [target];
  if (target.endsWith(".js")) {
    const sourceTarget = target.slice(0, -3);
    candidates.push(`${sourceTarget}.ts`, `${sourceTarget}.tsx`);
    if (typeOnly) candidates.push(`${sourceTarget}.d.ts`);
    return candidates;
  }

  if (!/\.(?:d\.ts|[cm]?[jt]sx?|css|json)$/.test(target)) {
    const extensions = typeOnly ? [".ts", ".tsx", ".d.ts", ".js"] : [".ts", ".tsx", ".js"];
    for (const extension of extensions) candidates.push(`${target}${extension}`);
    for (const extension of extensions) candidates.push(`${target}/index${extension}`);
  }
  return candidates;
}

function unresolvedRelativeImports(files: TemplateFile[]): string[] {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const toolGenerated = (specifier: string) => specifier.endsWith("routeTree.gen");
  const unresolved: string[] = [];

  for (const file of files) {
    if (!CODE_EXT.test(file.path)) continue;
    const references = parseFile(file.content, parserExtension(file.path)).importReferences;
    for (const reference of references) {
      const rawSpecifier = reference.specifier;
      if (!rawSpecifier.startsWith(".")) continue;
      const specifier = rawSpecifier.split("?")[0];
      const resolved = posixNormalize(`${dirOf(file.path)}/${specifier}`);
      if (toolGenerated(resolved)) continue;
      const typeOnly = reference.typeOnly || file.path.endsWith(".d.ts");
      const candidates = emittedModuleCandidates(resolved, typeOnly);
      if (!candidates.some((candidate) => byPath.has(candidate))) {
        unresolved.push(`${file.path} -> ${rawSpecifier}`);
      }
    }
  }
  return unresolved;
}

function aliasRootForFile(path: string, config: ProjectConfig): string | undefined {
  if (config.mode === "monorepo") {
    if (path.startsWith("apps/web/")) return "apps/web/src";
    if (path.startsWith("apps/mobile/")) return "apps/mobile/src";
    if (path.startsWith("apps/desktop/src/renderer/")) return "apps/desktop/src/renderer";
    return undefined;
  }
  if (config.apps.includes("mobile")) {
    return path.startsWith("src/") || path.startsWith("app/") ? "src" : undefined;
  }
  return path.startsWith("src/") ? "src" : undefined;
}

describe("generation matrix — structural invariants across every mode/framework/database corner", () => {
  for (const { label, config } of CORNERS) {
    describe(label, () => {
      const files = filesFor(config);
      const byPath = new Map(files.map((f) => [f.path, f.content]));

      it("emits files", () => {
        expect(files.length).toBeGreaterThan(10);
      });

      it("every emitted TS/TSX file parses", () => {
        // Templates are assembled as string arrays, so nothing in the host build
        // typechecks the OUTPUT. Parsing each generated file catches the class of
        // breakage a `toContain` assertion cannot see — unbalanced quotes, stray
        // braces, a botched interpolation.
        const broken: string[] = [];
        for (const f of files) {
          if (!CODE_EXT.test(f.path)) continue;
          const result = parseSync(f.path, f.content);
          if (result.errors.length > 0) {
            broken.push(`${f.path}: ${result.errors[0]?.message ?? "parse error"}`);
          }
        }
        expect(broken).toEqual([]);
      });

      it("every relative import resolves to an emitted file", () => {
        expect(unresolvedRelativeImports(files)).toEqual([]);
      });

      it("every @/ alias import resolves to an emitted file", () => {
        // `@/*` maps to the app's own src. TanStack Start projects imported
        // @/components/ui/* and @/lib/utils that were never generated (webUiFiles()
        // was only wired into the Next.js composer), so the whole app failed with
        // TS2307 — invisible until a real install + typecheck.
        const unresolved: string[] = [];

        for (const f of files) {
          if (!CODE_EXT.test(f.path)) continue;
          const root = aliasRootForFile(f.path, config);
          if (!root) continue;
          for (const spec of importsOf(f.content)) {
            if (!spec.startsWith("@/")) continue;
            // Vite's asset query changes the imported value, not the source file.
            const target = `${root}/${spec.slice(2).replace(/\?(?:url|raw)$/, "")}`;
            const candidates = [
              target,
              `${target}.ts`,
              `${target}.tsx`,
              `${target}.css`,
              `${target}/index.ts`,
              `${target}/index.tsx`,
              // ESM specifiers write `.js` for a `.ts` source.
              target.replace(/\.js$/, ".ts"),
              target.replace(/\.js$/, ".tsx"),
            ];
            if (!candidates.some((c) => byPath.has(c))) {
              unresolved.push(`${f.path} -> ${spec}`);
            }
          }
        }
        expect(unresolved).toEqual([]);
      });

      it("does not import the eve SDK unless the eve feature is enabled", () => {
        const hasEve = config.features.includes("eve");
        const eveImporters = files
          .filter((f) => CODE_EXT.test(f.path))
          .filter((f) => importsOf(f.content).some((s) => s === "eve" || s.startsWith("eve/")))
          .map((f) => f.path);
        if (!hasEve) {
          expect(eveImporters).toEqual([]);
        }
      });

      it("TanStack Start apps contain no Next.js route handlers or next imports", () => {
        if (config.framework !== "tanstack-start") return;
        const nextImporters = files
          .filter((f) => CODE_EXT.test(f.path))
          .filter((f) => importsOf(f.content).some((s) => s === "next" || s.startsWith("next/")))
          .map((f) => f.path);
        expect(nextImporters).toEqual([]);
      });

      it("every ambient type declared in a package tsconfig is an actual dependency", () => {
        // `types: ["node"]` without a matching @types/node dependency fails the
        // generated typecheck with TS2688 — invisible to the host build, and only
        // surfaced by a real `bun install` + `turbo run typecheck`.
        const TYPE_PACKAGE: Record<string, string> = {
          node: "@types/node",
          react: "@types/react",
          "react-dom": "@types/react-dom",
          pg: "@types/pg",
        };
        const problems: string[] = [];

        for (const f of files) {
          if (!f.path.endsWith("/tsconfig.json")) continue;
          const dir = dirOf(f.path);
          const manifest = byPath.get(`${dir}/package.json`);
          if (!manifest) continue;

          let types: unknown;
          let deps: Record<string, string> = {};
          try {
            types = JSON.parse(f.content)?.compilerOptions?.types;
            const pkg = JSON.parse(manifest);
            deps = { ...pkg.dependencies, ...pkg.devDependencies };
          } catch {
            continue;
          }
          if (!Array.isArray(types)) continue;

          for (const t of types as string[]) {
            // bun-types is the package name itself, not an @types/* alias.
            const required = t === "bun-types" ? "bun-types" : TYPE_PACKAGE[t];
            if (!required) continue;
            if (!deps[required]) {
              problems.push(`${dir} declares types:["${t}"] but does not depend on ${required}`);
            }
          }
        }
        expect(problems).toEqual([]);
      });

      it("does not emit billing provider code for providers that were not selected", () => {
        const notSelected = (["stripe", "chargily", "paddle", "polar"] as const).filter(
          (p) => !config.billing.includes(p),
        );
        for (const provider of notSelected) {
          const webhook = files.find((f) => f.path.includes(`webhooks/${provider}`));
          expect(webhook, `unselected ${provider} webhook leaked`).toBeUndefined();
        }
      });
    });
  }

  it("keeps hosted desktop Convex imports behind the application-owned client adapter", () => {
    const files = filesFor(cfg({ database: "convex", apps: ["web", "desktop"], messaging: true }));
    const route = files.find(
      ({ path }) => path === "apps/desktop/src/renderer/routes/messages.tsx",
    );
    const adapter = files.find(
      ({ path }) => path === "apps/desktop/src/renderer/adapters/messaging/convex.ts",
    );
    const queries = files.find(
      ({ path }) => path === "apps/desktop/src/renderer/features/messaging/queries.ts",
    );
    const mutations = files.find(
      ({ path }) => path === "apps/desktop/src/renderer/features/messaging/mutations.ts",
    );

    expect(route, "desktop messages route").toBeDefined();
    expect(adapter, "desktop messaging adapter").toBeDefined();
    expect(queries, "desktop messaging query adapter").toBeDefined();
    expect(mutations, "desktop messaging mutation adapter").toBeDefined();
    expect(route?.content).not.toContain("convex/react");
    expect(route?.content).not.toContain("convex/_generated/api");
    expect(route?.content).not.toMatch(/from ["']\.\.\/\.\.\/\.\.\//);
    expect(route?.content).toContain('from "@/features/messaging/screen"');
    for (const dataAdapter of [queries, mutations]) {
      expect(dataAdapter?.content).toContain('from "convex/react"');
      expect(dataAdapter?.content).toContain("convex/_generated/api");
      expect(dataAdapter?.content).not.toContain("convex/server");
    }
    expect(mutations?.content).toContain('from "@/adapters/messaging/convex"');
    expect(adapter?.content).toContain("desktopBridgeFetch");
    expect(adapter?.content).not.toContain("convex/react");
    expect(adapter?.content).not.toContain("convex/_generated");
    expect(adapter?.content).not.toContain("convex/server");
  });

  it("fails closed when an imported Convex runtime bootstrap is missing", () => {
    const files = filesFor(cfg({ database: "convex", billing: ["stripe"], apps: ["web"] })).filter(
      ({ path }) => path !== "convex/_generated/api.js",
    );
    const unresolved = unresolvedRelativeImports(files);

    expect(unresolved.some((entry) => entry.endsWith(" -> ./_generated/api"))).toBe(true);
  });

  it(".env.local never invents third-party credentials", () => {
    // A generated value would satisfy every webhook's
    // `secret.startsWith("REPLACE_WITH")` guard, so the clear 400 "not configured"
    // path would never fire and the user would debug an opaque 403 instead.
    const vendorKeys = [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "CHARGILY_API_KEY",
      "CHARGILY_SECRET_KEY",
      "PADDLE_API_KEY",
      "PADDLE_WEBHOOK_SECRET",
      "POLAR_ACCESS_TOKEN",
      "POLAR_WEBHOOK_SECRET",
      "RESEND_API_KEY",
    ];

    for (const { label, config } of CORNERS) {
      const envLocal = filesFor(config).find((f) => f.path === ".env.local")?.content ?? "";
      if (!envLocal) continue;
      for (const key of vendorKeys) {
        const match = new RegExp(`^${key}=(.*)$`, "m").exec(envLocal);
        if (!match) continue;
        expect(match[1], `${label}: ${key} must stay a placeholder`).toMatch(
          /^(REPLACE_WITH|pk_test_REPLACE|pdl_ntf_REPLACE|phc_REPLACE)/,
        );
      }
      // Self-issued secrets are still genuinely minted.
      const authSecret = /^BETTER_AUTH_SECRET=(.*)$/m.exec(envLocal)?.[1] ?? "";
      expect(authSecret.length, `${label}: auth secret must be generated`).toBeGreaterThan(20);
      expect(authSecret.startsWith("REPLACE_WITH")).toBe(false);
    }
  });
});

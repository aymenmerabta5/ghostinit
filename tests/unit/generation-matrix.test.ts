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

const CORNERS: Corner[] = [
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
    label: "single/desktop/postgres/no-billing",
    config: cfg({
      mode: "single",
      apps: ["desktop"],
      database: "postgres",
    } as Partial<ProjectConfig>),
  },
];

function filesFor(config: ProjectConfig): TemplateFile[] {
  return generateProjectFiles(config, { dryRun: false });
}

function posixNormalize(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
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
        // Convex generates `convex/_generated/**` at `convex dev` time, so it is a
        // legitimate target that does not exist at generation time.
        const generatedAtRuntime = (spec: string) => spec.includes("convex/_generated");
        // TanStack's router plugin writes routeTree.gen.ts during dev/build.
        const toolGenerated = (spec: string) => spec.endsWith("routeTree.gen");
        const unresolved: string[] = [];

        for (const f of files) {
          if (!CODE_EXT.test(f.path)) continue;
          for (const rawSpec of importsOf(f.content)) {
            if (!rawSpec.startsWith(".")) continue;
            // Vite asset imports carry a query suffix (`../styles/app.css?url`).
            const spec = rawSpec.split("?")[0];
            const resolved = posixNormalize(`${dirOf(f.path)}/${spec}`);
            if (toolGenerated(resolved)) continue;
            if (generatedAtRuntime(resolved)) {
              // `convex codegen` writes api/dataModel/server under the ROOT convex
              // dir. The invariant that matters is the depth: the specifier must
              // land on `convex/_generated/*` at the project root and not resolve
              // into the app tree (e.g. apps/web/src/app/api/convex/_generated).
              expect(resolved, `${f.path} -> ${spec}`).toMatch(/^convex\/_generated\/[A-Za-z]+$/);
              continue;
            }
            const candidates = [
              resolved,
              `${resolved}.ts`,
              `${resolved}.tsx`,
              `${resolved}.css`,
              `${resolved}/index.ts`,
              `${resolved}/index.tsx`,
              resolved.replace(/\.js$/, ".ts"),
              resolved.replace(/\.js$/, ".tsx"),
              resolved.replace(/\.js$/, "") + "/index.ts",
            ];
            if (!candidates.some((c) => byPath.has(c))) {
              unresolved.push(`${f.path} -> ${rawSpec}`);
            }
          }
        }
        expect(unresolved).toEqual([]);
      });

      it("every @/ alias import resolves to an emitted file", () => {
        // `@/*` maps to the app's own src. TanStack Start projects imported
        // @/components/ui/* and @/lib/utils that were never generated (webUiFiles()
        // was only wired into the Next.js composer), so the whole app failed with
        // TS2307 — invisible until a real install + typecheck.
        const appRoots = config.mode === "monorepo" ? ["apps/web/src", "apps/expo/src"] : ["src"];
        const unresolved: string[] = [];

        for (const f of files) {
          if (!CODE_EXT.test(f.path)) continue;
          const root = appRoots.find((r) => f.path.startsWith(`${r}/`));
          if (!root) continue;
          for (const spec of importsOf(f.content)) {
            if (!spec.startsWith("@/")) continue;
            const target = `${root}/${spec.slice(2)}`;
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

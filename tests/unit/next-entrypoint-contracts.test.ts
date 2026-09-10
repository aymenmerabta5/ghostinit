import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { posix } from "node:path";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { singleHealthRouteContent } from "../../src/templates/modes/single/api/routes.js";
import { isExactHealthPayload } from "../integration/e2e-build-process.js";

type Fixture = { path: string; content: string };

/** Supplemental to import closure: catches a .js alias backed only by TS source. */
function mismatchedRuntimeJsAliases(
  file: Fixture,
  aliasRoot: string,
  emittedPaths: ReadonlySet<string>,
): string[] {
  // Declaration files have no runtime, even when the import syntax is value-shaped.
  if (/\.d\.[cm]?ts$/.test(file.path)) return [];
  const parsed = parseFile(file.content, posix.extname(file.path));
  if (parsed.diagnostics.length > 0) throw new Error(JSON.stringify(parsed.diagnostics));
  return parsed.importReferences.flatMap((reference) => {
    if (reference.typeOnly || !reference.specifier.startsWith("@/")) return [];
    const request = reference.specifier.split(/[?#]/, 1)[0]!;
    if (!request.endsWith(".js")) return [];
    const target = posix.normalize(posix.join(aliasRoot, request.slice(2)));
    // Actual JavaScript modules remain valid. Do not strip every .js suffix.
    if (emittedPaths.has(target)) return [];
    const stem = target.slice(0, -3);
    if (!emittedPaths.has(`${stem}.ts`) && !emittedPaths.has(`${stem}.tsx`)) return [];
    return [`${file.path}:${reference.location.line} -> ${reference.specifier}`];
  });
}

describe.each(["stripe", "paddle", "polar"] as const)("%s billing selection", (globalProvider) => {
  const common = [
    "config",
    "dynamic",
    "dynamicParams",
    "revalidate",
    "fetchCache",
    "runtime",
    "preferredRegion",
    "maxDuration",
    "generateStaticParams",
    "instant",
    "prefetch",
    "unstable_dynamicStaleTime",
  ];
  const pageExports = new Set([
    ...common,
    "default",
    "metadata",
    "generateMetadata",
    "viewport",
    "generateViewport",
  ]);
  const routeExports = new Set([
    ...common,
    "GET",
    "HEAD",
    "OPTIONS",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
  ]);

  function valueExports(path: string, content: string): string[] {
    const parsed = parseSync(path, content);
    expect(parsed.errors, path).toEqual([]);
    const names: string[] = [];
    for (const node of parsed.program.body) {
      if (node.type === "ExportDefaultDeclaration") names.push("default");
      if (node.type === "ExportAllDeclaration" && node.exportKind !== "type") {
        throw new Error(`${path}: entrypoints must declare their exports explicitly`);
      }
      if (node.type !== "ExportNamedDeclaration" || node.exportKind === "type") continue;
      const declaration = node.declaration;
      if (declaration?.type === "VariableDeclaration") {
        for (const binding of declaration.declarations) {
          if (binding.id.type !== "Identifier") {
            throw new Error(
              `${path}: destructured entrypoint exports need explicit contract review`,
            );
          }
          names.push(binding.id.name);
        }
      } else if (declaration && "id" in declaration && declaration.id?.type === "Identifier") {
        names.push(declaration.id.name);
      } else if (declaration) {
        throw new Error(`${path}: unsupported entrypoint export ${declaration.type}`);
      }
      for (const specifier of node.specifiers) {
        if (specifier.exportKind === "type") continue;
        names.push(
          specifier.exported.type === "Identifier"
            ? specifier.exported.name
            : String(specifier.exported.value),
        );
      }
    }
    return names;
  }

  for (const mode of ["single", "monorepo"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      for (const i18n of [false, true]) {
        test(`${mode}/${database}/i18n=${i18n} capability-rich Next entrypoints expose only framework-supported values`, () => {
          const result = resolveCreateConfig({
            name: "next-entry-contract",
            mode,
            framework: "nextjs",
            runtime: "bun",
            apps: ["web"],
            preset: "saas",
            database,
            billing: ["chargily", globalProvider],
            features: [],
            withI18n: i18n,
            withMessaging: true,
            withStorage: true,
            withNotifications: true,
            withJobs: true,
            withPdf: true,
            withEve: database === "postgres",
            featureFlags: "posthog",
          });
          if (!result.ok) throw new Error(result.message);
          const plan = buildProjectGenerationPlan(result.resolvedConfig);
          const sourceRoot = mode === "single" ? "src" : "apps/web/src";
          const emittedPaths = new Set(plan.files.map((file) => file.physicalPath));
          expect(
            plan.files
              .filter(
                (file) =>
                  file.physicalPath.startsWith(sourceRoot + "/") &&
                  /\.[cm]?[jt]sx?$/.test(file.physicalPath),
              )
              .flatMap((file) =>
                mismatchedRuntimeJsAliases(
                  { path: file.physicalPath, content: file.content },
                  sourceRoot,
                  emittedPaths,
                ),
              ),
          ).toEqual([]);
          const files = plan.files.filter(({ physicalPath }) =>
            /\/app\/(?:.*\/)?(?:page|layout|route)\.tsx?$/.test(physicalPath),
          );
          expect(files.length).toBeGreaterThan(5);
          expect(
            files.some(({ physicalPath }) =>
              physicalPath.endsWith("/api/messaging/attachments/route.ts"),
            ),
          ).toBe(true);
          for (const entry of files) {
            const allowed = entry.physicalPath.endsWith("/route.ts") ? routeExports : pageExports;
            expect(
              valueExports(entry.physicalPath, entry.content).filter((name) => !allowed.has(name)),
              entry.physicalPath,
            ).toEqual([]);
          }
        });
      }
    }
  }

  test("single Next health route satisfies the shared live health contract", async () => {
    const source = new Bun.Transpiler({ loader: "ts" })
      .transformSync(singleHealthRouteContent().replace(/^import[^\n]*\n/, ""))
      .replace("export async function GET", "return async function GET");
    const factory = new Function("connection", "NextResponse", source) as (
      connection: () => Promise<void>,
      response: { json: (value: unknown) => Response },
    ) => () => Promise<Response>;
    let connected = false;
    const response = await factory(
      async () => {
        connected = true;
      },
      { json: (value) => Response.json(value) },
    )();
    expect(connected).toBe(true);
    expect(response.status).toBe(200);
    expect(isExactHealthPayload(await response.json())).toBe(true);
  });
});

const targets = new Set([
  "src/features/card.tsx",
  "src/features/model.ts",
  "src/features/real.js",
  "src/features/real.tsx",
  "convex/_generated/api.js",
  "convex/_generated/api.d.ts",
]);

const runtimeControls = [
  ["value import", 'import { Card } from "@/features/card.js";'],
  ["default import", 'import Card from "@/features/card.js";'],
  ["namespace import", 'import * as Card from "@/features/card.js";'],
  ["side effect import", 'import "@/features/card.js";'],
  ["empty import", 'import {} from "@/features/card.js";'],
  ["mixed import", 'import { type CardProps, Card } from "@/features/card.js";'],
  ["named reexport", 'export { Card } from "@/features/card.js";'],
  ["star reexport", 'export * from "@/features/card.js";'],
  ["namespace reexport", 'export * as Cards from "@/features/card.js";'],
  ["mixed reexport", 'export { type CardProps, Card } from "@/features/card.js";'],
  ["dynamic import", 'const loader = () => import("@/features/card.js");'],
  ["require", 'const card = require("@/features/card.js");'],
  ["import equals", 'import card = require("@/features/card.js");'],
  ["TS source alias", 'import { value } from "@/features/model.js";'],
] as const;

const ignoredControls = [
  ["declaration type import", 'import type { CardProps } from "@/features/card.js";'],
  ["specifier type import", 'import { type CardProps } from "@/features/card.js";'],
  ["declaration type reexport", 'export type { CardProps } from "@/features/card.js";'],
  ["specifier type reexport", 'export { type CardProps } from "@/features/card.js";'],
  ["star type reexport", 'export type * from "@/features/card.js";'],
  ["namespace type reexport", 'export type * as Cards from "@/features/card.js";'],
  ["type import equals", 'import type card = require("@/features/card.js");'],
  ["type query", 'type CardType = typeof import("@/features/card.js");'],
  ["comment", '// import { Card } from "@/features/card.js";'],
  ["string", "const text = 'export { Card } from \"@/features/card.js\";';"],
  ["extensionless alias", 'import { Card } from "@/features/card";'],
  ["relative source import", 'import { Card } from "../features/card.js";'],
  ["real emitted JS alias", 'import { Card } from "@/features/real.js";'],
  ["Convex real runtime", 'import { api } from "../convex/_generated/api.js";'],
  ["unrelated package", 'import { value } from "vendor/model.js";'],
  // Missing modules are reported by import closure, not this source-backed alias check.
  ["unresolved alias", 'import { value } from "@/features/missing.js";'],
] as const;

describe("Next runtime JS alias regression controls", () => {
  test.each(runtimeControls)("reports %s", (_label, content) => {
    expect(
      mismatchedRuntimeJsAliases({ path: "src/check.ts", content }, "src", targets),
    ).toHaveLength(1);
  });
  test.each(ignoredControls)("preserves %s", (_label, content) => {
    expect(mismatchedRuntimeJsAliases({ path: "src/check.ts", content }, "src", targets)).toEqual(
      [],
    );
  });
  test.each([".d.ts", ".d.mts", ".d.cts"])("preserves declaration source %s", (extension) => {
    expect(
      mismatchedRuntimeJsAliases(
        {
          path: `src/check${extension}`,
          content:
            'import { Card } from "@/features/card.js"; export declare const Render: typeof Card;',
        },
        "src",
        targets,
      ),
    ).toEqual([]);
  });
  test("keeps a runtime use after a type-only use of the same source", () => {
    expect(
      mismatchedRuntimeJsAliases(
        {
          path: "src/check.ts",
          content:
            'import type { CardProps } from "@/features/card.js";\nexport { Card } from "@/features/card.js";',
        },
        "src",
        targets,
      ),
    ).toEqual(["src/check.ts:2 -> @/features/card.js"]);
  });
  test("preserves the exact emitted Convex JS target with an explicit alias root", () => {
    expect(
      mismatchedRuntimeJsAliases(
        {
          path: "src/check.ts",
          content: 'import { api } from "@/api.js";',
        },
        "convex/_generated",
        targets,
      ),
    ).toEqual([]);
  });
});

for (const mode of ["single", "monorepo"] as const) {
  for (const selection of ["frontend", "auth-only", "auth-email", "manual"] as const) {
    test(mode + "/" + selection + " uses exact emitted extensions for runtime aliases", () => {
      const resolution = resolveCreateConfig({
        name: "next-runtime-aliases",
        mode,
        framework: "nextjs",
        runtime: "bun",
        apps: ["web"],
        preset: "custom",
        database: selection === "frontend" ? "none" : "postgres",
        databaseWasExplicit: true,
        billing: selection === "manual" ? ["manual"] : [],
        features: [],
        cache: "none",
        deploy: "none",
        withAuth: selection !== "frontend",
        withApi: selection === "manual",
        withEmail: selection === "auth-email",
        withI18n: true,
      });
      if (!resolution.ok) throw new Error(resolution.message);
      const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
        desiredConfig: resolution.desiredConfig,
      });
      const sourceRoot = mode === "single" ? "src" : "apps/web/src";
      const paths = new Set(plan.files.map((file) => file.physicalPath));
      expect(
        plan.files
          .filter(
            (file) =>
              file.physicalPath.startsWith(sourceRoot + "/") &&
              /\.[cm]?[jt]sx?$/.test(file.physicalPath),
          )
          .flatMap((file) =>
            mismatchedRuntimeJsAliases(
              { path: file.physicalPath, content: file.content },
              sourceRoot,
              paths,
            ),
          ),
      ).toEqual([]);
    });
  }
}
